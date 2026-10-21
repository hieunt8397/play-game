# Builds art/fishing.blend (Câu cá, Story 4.3) from the vendored island art/src/map-v3.blend.
#
# Run by `npm run art:build -- fishing` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_fishing.py -- \
#     --out <tmp>/fishing.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), art (incl. art.fishing), fishing {minSize,
# slackPx, sizeRatio}, design size, renderScale.
#
# Steps: prune the Tiệm kem preview, its HintRing, CamGame2, every station collection (incl. the kid kart
# `Car` and the arch `Race`), the island road and its dashes, and the race flags; keep the world (sea,
# sand), nature and sky. Add camera `CamFish` (a high 3/4 view from the north beach over open sea: water
# fills most of the frame, a sand strip at the bottom). The plate gets a Quaternius dock entering from the
# bottom-left and a fishing rod on its tip. Three Quaternius cutefish, recoloured from Tokens.art.fishing
# (yellow Clownfish with white stripes, orange Koi with white dots, blue Betta with its long fins; eyes
# kept; no red mark left), each in two sizes, posed side-on to the camera facing screen-right at FISH_POSE:
# `sprite.fish-<colour>-<size>` with swim 1–4 (sampled from the Swimming_Normal action), dive 10 (nose down)
# and caught 20–21 (a wriggle). The layout objects (`hit.pond-swim`, `anchor.dock`, `anchor.rod-tip`,
# `anchor.catch`) go in a hidden `layout` collection; render size; save.
# Every constant is in Blender world units (metres) unless its name says otherwise.
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import soften_scene  # noqa: E402
from common import add_empty, eval_world_verts, flat_material, force_opaque, hex_to_linear, key_constant, move_to, parse_args, principled  # noqa: E402

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
CUTEFISH = os.path.join(ASSETS, 'quaternius', 'cutefish')

PRUNE_COLLECTIONS = ['GameIce', 'IceCream', 'Pizza', 'Town', 'Cave', 'Dino', 'Fish', 'RaceCars', 'Car', 'Race']
PRUNE_OBJECTS = ['HintRing', 'CamGame2', 'Road', 'RoadEdge']
PRUNE_PREFIXES = ['Dash', 'FlagPole', 'Flag']

RENDER_SIZE = (2048, 1536)
SEA_Z = -0.15  # the sea surface

# --- the camera: from the north beach, high, looking out over the open sea ------------------------------
CAM_FISH_LOC = (1.0, 4.5, 7.5)
CAM_FISH_TARGET = (1.0, 12.5, SEA_Z)
CAM_FISH_ROT = None  # derived: the camera looks at CAM_FISH_TARGET (up = +z)
CAM_FISH_LENS = 30.0

# --- the plate: a dock entering from the bottom-left, a rod on its tip ----------------------------------
DOCK_FILE = 'Dock_Long.fbx'
ROD_FILE = 'FishingRod_Lvl1.fbx'
DOCK_FOOT = (-2.8, 8.2)  # the dock's shore end (world XY); it runs out to sea along +y
DOCK_SCALE = 0.16
DOCK_TOP_Z = SEA_Z + 1.35  # the dock's post tops stand this high (its deck sits above the water)
ROD_SCALE = 0.42
ROD_LEAN_DEG = 35.0  # the rod leans out over the water (toward +x)
ROD_INSET = 0.6  # the rod stands this far back from the dock's sea end, on its deck
DECK_BELOW_TOP = 0.45  # the deck lies this far below the dock's post tops
CATCH_DROP = 0.9  # anchor.catch hangs this far below the rod tip (still above the water)

# --- the swim region (hit.pond-swim, unpadded): world XY on the sea, convex ---------------------------------
POND = [(-3.47, 18.12), (5.15, 18.66), (5.92, 12.96), (5.35, 9.78), (1.49, 9.18), (-1.8, 9.78)]

# --- the fish ------------------------------------------------------------------------------------------------
# colour → (model, materials kept as the white pattern). Every other material becomes the body colour,
# except the eyes (the darkest material). The orange koi gets KOI_DOTS script dots instead.
FISH_MODELS = {
    'yellow': ('Clownfish.fbx', ['Clownfish_Light']),
    'orange': ('Koi.fbx', []),
    'blue': ('Betta.fbx', []),
}
PATTERN_COLOUR = {'yellow': 'stripe', 'orange': 'dot', 'blue': None}
FISH_SIZES = ['small', 'big']
FISH_POSE = (2.15, 12.58)  # every fish is rendered here (on the water at the pond centre), alone
FISH_LIFT = 0.05  # the fish's lowest point stands this far above the sea
SWIM_ACTION = 'Swimming_Normal'
SWIM_FRAMES = [1, 2, 3, 4]
DIVE_FRAME = 10
CAUGHT_FRAMES = [20, 21]
FISH_STATES = {'swim': SWIM_FRAMES, 'dive': [DIVE_FRAME], 'caught': CAUGHT_FRAMES}
SWIM_YAW_DEG = 8.0  # the fallback swim (no Swim action): yaw ± this
DIVE_PITCH_DEG = 30.0
CAUGHT_DEG = 20.0
FIT_PASSES = 5
KOI_DOTS = 5
KOI_DOT_RADIUS = 0.07  # × the fish length
KOI_DOT_SPOTS = [(0.32, 0.15), (0.45, -0.05), (0.55, 0.2), (0.62, -0.08), (0.42, 0.32)]  # (along length from the head, up from mid height) × length
RED_R = 0.5  # a material whose base colour has r > RED_R and g < RED_G is red-dominant: it becomes the body
RED_G = 0.35

# --- the soft toy pond (2026-10-16): dressing outside the swim region ------------------------------------
ROD_COLOUR = 'creaturePink'  # the rod's lighter parts take this Tokens colour (its darkest stay)
ROD_KEEP_DARK = 0.15  # a rod material whose base colour sums below this (linear) keeps its colour
LILY_NOTCH_DEG = 40.0
LILY_THICKNESS = 0.03
LOTUS_SIZE = 0.55
LILY_SCALE = 1.4  # pads and flowers read at this size from the high camera
REED_SCALE = 1.6
WATER_NOISE_SCALE = 1.6  # the sea gets a soft two-tone wash (noise) so the open water is not one flat colour
WATER_NOISE_MIX = 0.18
LOTUS_RINGS = [(6, 55.0, 0.16), (5, 30.0, 0.07)]  # (petals, outward tilt°, radius) per ring
LILY_PADS = [  # (x, y, radius, with a flower) on the water left, right and beyond the swim region
    (-4.5, 12.4, 0.55, True), (-4.0, 13.6, 0.4, False), (-4.7, 16.6, 0.5, False), (-4.2, 17.6, 0.38, True),
    (6.9, 11.2, 0.5, True), (7.3, 12.6, 0.38, False), (6.8, 16.0, 0.55, True), (1.5, 19.9, 0.5, False), (2.4, 20.3, 0.36, True),
]
REEDS = [(-3.6, 8.6, 0.9), (-3.85, 8.8, 1.1), (-3.4, 8.95, 0.75), (-1.9, 8.55, 0.8), (-1.7, 8.75, 1.0)]  # (x, y, height) by the dock foot
RIPPLES = []  # (x, y, radius) pale rings — none: white rings on the water read as hint rings
RIPPLE_TUBE = 0.035
RIPPLE_SQUASH = 1.0


def fail(msg):
    raise RuntimeError(f'build_fishing: {msg}')


def remove_tree(o):
    for c in list(o.children_recursive):
        bpy.data.objects.remove(c, do_unlink=True)
    bpy.data.objects.remove(o, do_unlink=True)


def prune():
    for name in PRUNE_COLLECTIONS:
        coll = bpy.data.collections.get(name)
        if coll is None:
            fail(f'collection "{name}" to prune not found')
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
    for name in PRUNE_OBJECTS:
        o = bpy.data.objects.get(name)
        if o is not None:
            remove_tree(o)
    for o in list(bpy.data.objects):
        if o.name in bpy.data.objects and any(o.name.startswith(p) for p in PRUNE_PREFIXES):
            bpy.data.objects.remove(o, do_unlink=True)


def make_camera(scene):
    data = bpy.data.cameras.new('CamFish')
    data.lens = CAM_FISH_LENS
    cam = bpy.data.objects.new('CamFish', data)
    scene.collection.objects.link(cam)
    cam.location = CAM_FISH_LOC
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (Vector(CAM_FISH_TARGET) - Vector(CAM_FISH_LOC)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


class Screen:
    """World → design px through the scene camera (same projection as render_screen.py)."""

    def __init__(self, scene, params):
        self.scene = scene
        self.w, self.h = params['design']['width'], params['design']['height']

    def project(self, p):
        v = world_to_camera_view(self.scene, self.scene.camera, Vector(p))
        return (v.x * self.w, (1 - v.y) * self.h)

    def rect(self, pts):
        sp = [self.project(p) for p in pts]
        xs, ys = [p[0] for p in sp], [p[1] for p in sp]
        return (min(xs), min(ys), max(xs), max(ys))


def import_fbx(name, coll):
    path = os.path.join(CUTEFISH, name)
    if not os.path.isfile(path):
        fail(f'{path} is missing')
    before = set(bpy.data.objects)
    actions = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    force_opaque(new)
    for o in new:
        move_to(o, coll)
    root = add_empty(f'{os.path.splitext(name)[0]}-root-{len(bpy.data.objects)}', (0.0, 0.0, 0.0), coll)
    for o in new:
        if o.parent is None:
            o.parent = root
    return root, new, [a for a in bpy.data.actions if a not in actions]


# --- the plate --------------------------------------------------------------------------------------------

def build_plate(plate):
    dock, dock_objs, _ = import_fbx(DOCK_FILE, plate)
    dock.scale = (DOCK_SCALE,) * 3
    bpy.context.view_layer.update()
    pts = eval_world_verts([o for o in dock_objs if o.type == 'MESH'], bpy.context.evaluated_depsgraph_get())
    (x0, x1), (y0, _y1), z1 = (min(p.x for p in pts), max(p.x for p in pts)), (min(p.y for p in pts), max(p.y for p in pts)), max(p.z for p in pts)
    dock.location = (DOCK_FOOT[0] - (x0 + x1) / 2, DOCK_FOOT[1] - y0, DOCK_TOP_Z - z1)
    bpy.context.view_layer.update()
    pts = eval_world_verts([o for o in dock_objs if o.type == 'MESH'], bpy.context.evaluated_depsgraph_get())
    top = max(p.z for p in pts)
    tip_y = max(p.y for p in pts)
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    deck_z = top - DECK_BELOW_TOP
    rod, rod_objs, _ = import_fbx(ROD_FILE, plate)
    rod.scale = (ROD_SCALE,) * 3
    rod.rotation_euler = (0.0, math.radians(ROD_LEAN_DEG), 0.0)
    bpy.context.view_layer.update()
    rpts = eval_world_verts([o for o in rod_objs if o.type == 'MESH'], bpy.context.evaluated_depsgraph_get())
    foot = min(rpts, key=lambda p: p.z)
    rod.location += Vector((cx - foot.x, tip_y - ROD_INSET - foot.y, deck_z - foot.z))
    bpy.context.view_layer.update()
    rpts = eval_world_verts([o for o in rod_objs if o.type == 'MESH'], bpy.context.evaluated_depsgraph_get())
    tip = max(rpts, key=lambda p: p.z + p.x)
    return {'dock_top': Vector((cx, (DOCK_FOOT[1] + tip_y) / 2, top)), 'rod_tip': tip}


def soft_mesh(name, bm, mat, coll):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def lily_pad(name, mat, coll):
    """A round pad with its notch, lying flat (unit radius)."""
    bm = bmesh.new()
    n = 40
    notch = math.radians(LILY_NOTCH_DEG)
    ring = [bm.verts.new((math.cos(a), math.sin(a), 0.0)) for a in (notch / 2 + (2 * math.pi - notch) * i / n for i in range(n + 1))]
    centre = bm.verts.new((0.0, 0.0, 0.0))
    for a, b in zip(ring, ring[1:]):
        bm.faces.new((centre, a, b))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=LILY_THICKNESS)
    return soft_mesh(name, bm, mat, coll)


def petal_flower(name, petal_mat, heart_mat, coll):
    """A toy lotus: a ring of rounded petals around a butter heart (unit size)."""
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    for ring, (count, tilt, r) in enumerate(LOTUS_RINGS):
        for i in range(count):
            a = 2 * math.pi * (i + 0.5 * ring) / count
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
            p = soft_mesh(f'{name}-petal-{ring}-{i}', bm, petal_mat, coll)
            p.parent = root
            p.scale = (0.18, 0.09, 0.36)
            p.location = (r * math.cos(a), r * math.sin(a), 0.22)
            p.rotation_euler = (math.radians(tilt), 0.0, a + math.pi / 2)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.12)
    heart = soft_mesh(f'{name}-heart', bm, heart_mat, coll)
    heart.parent = root
    heart.location = (0.0, 0.0, 0.25)
    return root


def reed(name, stem_mat, tip_mat, coll, height):
    """A reed: a slim stem with a soft rounded head."""
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.035, radius2=0.02, depth=height)
    stem = soft_mesh(f'{name}-stem', bm, stem_mat, coll)
    stem.parent = root
    stem.location = (0.0, 0.0, height / 2)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    tip = soft_mesh(f'{name}-tip', bm, tip_mat, coll)
    tip.parent = root
    tip.scale = (0.06, 0.06, 0.16)
    tip.location = (0.0, 0.0, height * 0.82)
    return root


def dress_pond(plate, params):
    """The soft toy pond (2026-10-16): no clouds (their undersides and shadows read as dark blobs from this
    high camera), a pink rod, lily pads with lotus flowers along the pond's sides, reeds by the dock and a
    few pale ripple rings on the open water (under the fish sprites, outside their tap logic)."""
    colours = params['colours']
    for o in list(bpy.data.objects):
        if o.name.startswith('Cl') and any(c.name == 'Sky' for c in o.users_collection):
            o.hide_render = True
            o.hide_viewport = True
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith('FishingRod'):
            for slot in o.material_slots:
                bsdf = principled(slot.material)
                if bsdf is not None and sum(bsdf.inputs['Base Color'].default_value[:3]) > ROD_KEEP_DARK:
                    bsdf.inputs['Base Color'].default_value = hex_to_linear(colours[ROD_COLOUR])
    sea = bpy.data.materials.get('Sea')
    bsdf = principled(sea)
    if bsdf is not None and not bsdf.inputs['Base Color'].is_linked:
        nt = sea.node_tree
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = WATER_NOISE_SCALE
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.inputs['Factor'].default_value = WATER_NOISE_MIX
        mix.inputs['A'].default_value = bsdf.inputs['Base Color'].default_value
        mix.inputs['B'].default_value = hex_to_linear(colours['seaShallow'])
        ramp = nt.nodes.new('ShaderNodeMath')
        ramp.operation = 'MULTIPLY'
        ramp.inputs[1].default_value = WATER_NOISE_MIX * 2
        nt.links.new(noise.outputs['Fac'], ramp.inputs[0])
        nt.links.new(ramp.outputs[0], mix.inputs['Factor'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    pad = flat_material('pond-lily-pad', colours['creatureGreen'], 0.5)
    petal = flat_material('pond-lotus', colours['tintPink'], 0.45)
    heart = flat_material('pond-lotus-heart', colours['tintButter'], 0.5)
    stem = flat_material('pond-reed', colours['grass'], 0.6)
    tip = flat_material('pond-reed-tip', colours['creatureGreen'], 0.6)
    ripple = flat_material('pond-ripple', colours['seaShallow'], 0.3)
    for i, (x, y, r, flower) in enumerate(LILY_PADS):
        p = lily_pad(f'pond-lily-{i}', pad, plate)
        p.location = (x, y, SEA_Z + 0.01)
        p.scale = (r * LILY_SCALE, r * LILY_SCALE, 1.0)
        p.rotation_euler = (0.0, 0.0, math.radians(37.0 * i))
        if flower:
            f = petal_flower(f'pond-lotus-{i}', petal, heart, plate)
            f.location = (x + r * 0.15, y, SEA_Z + 0.02)
            f.scale = (LOTUS_SIZE * LILY_SCALE,) * 3
    for i, (x, y, h) in enumerate(REEDS):
        rd = reed(f'pond-reed-{i}', stem, tip, plate, h * REED_SCALE)
        rd.location = (x, y, SEA_Z)
        rd.rotation_euler = (math.radians(6.0 * ((i % 3) - 1)), math.radians(5.0 * ((i % 2) * 2 - 1)), 0.0)
    for i, (x, y, r) in enumerate(RIPPLES):
        bm = bmesh.new()
        seg, ring_n, minor = 48, 8, RIPPLE_TUBE
        rows = [[bm.verts.new(((1 + minor * math.cos(b)) * math.cos(a), (1 + minor * math.cos(b)) * math.sin(a), minor * 0.3 * math.sin(b)))
                 for b in (2 * math.pi * j / ring_n for j in range(ring_n))] for a in (2 * math.pi * k / seg for k in range(seg))]
        for k in range(seg):
            for j in range(ring_n):
                bm.faces.new((rows[k][j], rows[(k + 1) % seg][j], rows[(k + 1) % seg][(j + 1) % ring_n], rows[k][(j + 1) % ring_n]))
        rp = soft_mesh(f'pond-ripple-{i}', bm, ripple, plate)
        rp.location = (x, y, SEA_Z + 0.005)
        rp.scale = (r, r * RIPPLE_SQUASH, 1.0)


# --- the fish ---------------------------------------------------------------------------------------------

def recolour(objs, colour, params):
    """Every material → the body colour, except the eyes (darkest) and the kept pattern parts (white)."""
    model, pattern_mats = FISH_MODELS[colour]
    art = params['art']['fishing']
    body = hex_to_linear(art[colour])
    pattern = PATTERN_COLOUR[colour]
    white = hex_to_linear(art[pattern]) if pattern else None
    mats = {m for o in objs if o.type == 'MESH' for m in o.data.materials if m}
    def lum(m):
        b = principled(m)
        c = b.inputs['Base Color'].default_value if b else (1, 1, 1, 1)
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    eyes = min(mats, key=lum)
    for m in mats:
        b = principled(m)
        if b is None or m is eyes:
            continue
        base = m.name.rsplit('.', 1)[0]
        new = white if (white is not None and base in pattern_mats) else body
        b.inputs['Base Color'].default_value = (*new[:3], 1.0)
        for link in list(b.inputs['Base Color'].links):
            m.node_tree.links.remove(link)


def find_swim(actions):
    for a in actions:
        if SWIM_ACTION in a.name:
            return a
    return None


def assign_action(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    if action is not None and hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots) > 0:
        ad.action_slot = action.slots[0]


def pose_fish(scene, root, objs, actions):
    """swim 1–4 (sampled from Swimming_Normal, else a yaw ±), dive 10 (nose down), caught 20–21 (wriggle)."""
    arm = next((o for o in objs if o.type == 'ARMATURE'), None)
    swim = find_swim(actions) if arm else None
    poses = []
    if swim is not None:
        f0, f1 = swim.frame_range
        for k in range(len(SWIM_FRAMES)):
            assign_action(arm, swim)
            scene.frame_set(int(round(f0 + (f1 - f0) * k / len(SWIM_FRAMES))))
            poses.append({pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones})
        assign_action(arm, None)
        if arm.animation_data:
            arm.animation_data.action = None
    base_rot = root.rotation_euler.copy()
    plan = []
    for k, f in enumerate(SWIM_FRAMES):
        yaw = 0.0 if swim is not None else (SWIM_YAW_DEG if k % 2 == 0 else -SWIM_YAW_DEG)
        plan.append((f, poses[k] if poses else None, (0.0, 0.0, yaw)))
    plan.append((DIVE_FRAME, poses[0] if poses else None, (0.0, -DIVE_PITCH_DEG, 0.0)))
    for k, f in enumerate(CAUGHT_FRAMES):
        s = 1 if k % 2 == 0 else -1
        plan.append((f, poses[0] if poses else None, (s * CAUGHT_DEG, 0.0, s * CAUGHT_DEG)))
    for f, pose, (roll, pitch, yaw) in plan:
        if arm is not None and pose is not None:
            for pb in arm.pose.bones:
                pb.matrix_basis = pose[pb.name]
                pb.keyframe_insert('location', frame=f)
                pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=f)
                pb.keyframe_insert('scale', frame=f)
        # Euler XYZ applies x and y in the model's own frame (length along its y, lateral along its x) before
        # the z turn that faces it right: pitch is about x, roll about y, yaw about z.
        root.rotation_euler = (base_rot.x + math.radians(pitch), base_rot.y + math.radians(roll), base_rot.z + math.radians(yaw))
        root.keyframe_insert('rotation_euler', frame=f)
    if arm is not None:
        key_constant(arm)
    key_constant(root)
    scene.frame_set(SWIM_FRAMES[0])


def face_right(root, objs):
    """Turns the model so its body runs along world +x with the head (the eyes' side) at +x."""
    bpy.context.view_layer.update()
    meshes = [o for o in objs if o.type == 'MESH']
    dg = bpy.context.evaluated_depsgraph_get()
    pts = eval_world_verts(meshes, dg)
    eyes = []
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        idx = {i for i, m in enumerate(o.data.materials) if m and m.name.startswith('Eyes')}
        for poly in me.polygons:
            if poly.material_index in idx:
                eyes.append(ev.matrix_world @ poly.center)
        ev.to_mesh_clear()
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    ey = sum(p.y for p in eyes) / len(eyes) if eyes else cy + 1
    # Length along y: +y head → turn −90° about z (head to +x); −y head → +90°.
    root.rotation_euler = (0.0, 0.0, math.radians(-90.0 if ey > cy else 90.0))
    bpy.context.view_layer.update()


def fit_fish(screen, root, objs, size_px):
    """Scales the fish so its projected longest side is size_px at its swim pose, standing on the water at FISH_POSE."""
    scene = bpy.context.scene
    meshes = [o for o in objs if o.type == 'MESH']
    for _ in range(FIT_PASSES):
        scene.frame_set(SWIM_FRAMES[0])
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        x0, y0, x1, y1 = screen.rect(pts)
        root.scale = root.scale * (size_px / max(x1 - x0, y1 - y0))
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        bx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
        by = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
        root.location += Vector((FISH_POSE[0] - bx, FISH_POSE[1] - by, SEA_Z + FISH_LIFT - min(p.z for p in pts)))
    bpy.context.view_layer.update()


def add_koi_dots(root, objs, colour, params, coll):
    """KOI_DOTS white icospheres on the camera-side flank (ray cast onto the body)."""
    dg = bpy.context.evaluated_depsgraph_get()
    meshes = [o for o in objs if o.type == 'MESH']
    pts = eval_world_verts(meshes, dg)
    x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
    z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
    ymin = min(p.y for p in pts)
    length = x1 - x0
    bvhs = [BVHTree.FromObject(o, dg) for o in meshes]
    mat = bpy.data.materials.new('fish-dot')
    mat.use_nodes = True
    principled(mat).inputs['Base Color'].default_value = (*hex_to_linear(params['art']['fishing'][PATTERN_COLOUR[colour]])[:3], 1.0)
    made = 0
    for along, up in KOI_DOT_SPOTS[:KOI_DOTS]:
        # The head is at +x: `along` runs from the head backward.
        x = x1 - along * length
        z = (z0 + z1) / 2 + up * length * 0.5
        origin_world = Vector((x, ymin - 1.0, z))
        hit = None
        for o, bvh in zip(meshes, bvhs):
            inv = o.matrix_world.inverted()
            loc, _n, _i, d = bvh.ray_cast(inv @ origin_world, (inv.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized())
            if loc is not None:
                w = o.matrix_world @ loc
                if hit is None or w.y < hit.y:
                    hit = w
        if hit is None:
            continue
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=1, radius=KOI_DOT_RADIUS * length)
        me = bpy.data.meshes.new(f'fish-dot-{made}')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat)
        dot = bpy.data.objects.new(f'fish-dot-{colour}-{made}', me)
        coll.objects.link(dot)
        dot.location = hit
        bpy.context.view_layer.update()
        mw = dot.matrix_world.copy()
        dot.parent = root
        dot.matrix_parent_inverse = root.matrix_world.inverted()
        dot.matrix_world = mw
        made += 1
    if made < 3:
        fail(f'only {made} koi dots landed on the body')


def build_fish(scene, screen, params, sprites):
    fp = params['fishing']
    small_px = fp['minSize'] + fp['slackPx'] / 2
    built = {}
    for colour, (model, _pattern) in FISH_MODELS.items():
        for size in FISH_SIZES:
            coll = bpy.data.collections.new(f'sprite.fish-{colour}-{size}')
            sprites.children.link(coll)
            coll['states'] = json.dumps(FISH_STATES, separators=(',', ':'))
            coll['movable'] = 1
            root, objs, actions = import_fbx(model, coll)
            recolour(objs, colour, params)
            face_right(root, objs)
            px = small_px * (fp['sizeRatio'] if size == 'big' else 1.0)
            fit_fish(screen, root, objs, px)
            if colour == 'orange':
                add_koi_dots(root, objs, colour, params, coll)
            pose_fish(scene, root, objs, actions)
            built[(colour, size)] = coll
    return built


def main():
    args = parse_args('build_fishing', required=('out', 'params'))
    params = args['params']
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100

    prune()
    make_camera(scene)
    bpy.context.view_layer.update()
    screen = Screen(scene, params)

    plate = bpy.data.collections.new('pond-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True

    marks = build_plate(plate)
    dress_pond(plate, params)
    fish = build_fish(scene, screen, params, sprites)
    scene.frame_set(SWIM_FRAMES[0])
    bpy.context.view_layer.update()

    bm = bmesh.new()
    vs = [bm.verts.new((x, y, SEA_Z + 0.002)) for x, y in POND]
    bm.faces.new(vs)
    me = bpy.data.meshes.new('hit.pond-swim')
    bm.to_mesh(me)
    bm.free()
    layout.objects.link(bpy.data.objects.new('hit.pond-swim', me))
    add_empty('anchor.dock', marks['dock_top'], layout)
    add_empty('anchor.rod-tip', marks['rod_tip'], layout)
    tip = marks['rod_tip']
    add_empty('anchor.catch', (tip.x, tip.y, max(SEA_Z + 0.3, tip.z - CATCH_DROP)), layout)

    report(screen, fish)
    scene.frame_set(SWIM_FRAMES[0])
    soften_scene(bpy.context.scene)  # the soft toy look (cute.py), last so every builder-made mesh gets it
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_fishing: saved {args["out"]}')


def report(screen, fish):
    """Diagnostics in design px (the rules themselves run in TypeScript on the render)."""
    dg = bpy.context.evaluated_depsgraph_get()
    fmt = lambda r: f'({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}×{r[3] - r[1]:.0f}'  # noqa: E731
    for (colour, size), coll in fish.items():
        pts = eval_world_verts([o for o in coll.all_objects if o.type == 'MESH'], dg)
        print(f'build_fishing: fish-{colour}-{size} {fmt(screen.rect(pts))}')
    for o in sorted(bpy.data.collections['layout'].objects, key=lambda o: o.name):
        if o.type == 'MESH':
            print(f'build_fishing: {o.name} ' + ' '.join(f'({x:.0f},{y:.0f})' for x, y in (screen.project(o.matrix_world @ v.co) for v in o.data.vertices)))
        else:
            x, y = screen.project(o.matrix_world.translation)
            print(f'build_fishing: {o.name} {x:.0f},{y:.0f}')


main()
