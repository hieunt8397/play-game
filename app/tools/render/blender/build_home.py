# Builds art/home.blend (the yard — sân nhà, Story 7.1) from the vendored island art/src/map-v3.blend (only
# its render settings, world and Sun are kept).
#
# Run by `npm run art:build -- home` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_home.py -- \
#     --out <tmp>/home.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), art (art.home for the props, art.touchTalk for
# the lawn, sky and haze), design size, renderScale.
#
# One plate, 2048×1536: a soft lawn (the picnic lawn's palette), Xoài's house front (Tiny Treats Homely House
# `house`) at the back centre with its doormat and a picket fence (Homely House fences) to both
# sides, trees and bushes behind the fence, a gradient sky with clouds. The backdrop is hazed (as in Chạm là nói)
# so the corners pop. Five big corner props, each its own `sprite.<corner>` (idle at frame 1; the runtime bounce
# is a scale motion around the ground pivot), with `hit.<corner>` (convex hull of its meshes) and
# `anchor.<corner>` (its ground pivot) in the hidden `layout` collection:
#   - pen: a Homely House fence pen with a real Quaternius cow (Cow.fbx, its Idle pose) peeking over the front;
#   - stage: a round wooden stage with a pink curtain arch and a big drum with sticks (script-built, cute.py);
#   - bed: the KayKit Furniture single bed with an extra pillow (front row);
#   - clinic: a big white vet box with a red cross and a handle (script-built, front row);
#   - wardrobe (back row, right): a lilac wardrobe with two doors, knobs, a crown top and a shirt on its side hook (script-built).
# Each prop is fitted into its CORNER_BOXES box (design px; bottom edge = its ground line) by unprojecting
# through the camera, so the layout is exactly what tools/layout/rules.ts › validateHome checks (hulls inside
# the interactive rect, clear of the Home/Speaker zones, ≥ targetGap apart, each frame ≥ 150 px).
# Every constant is in Blender world units (metres) unless its name says otherwise.
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, import_joined, lathe, mat, mesh_obj, rbox, rod, rounded_profile, soften_scene, torus, tt_model  # noqa: E402
from common import add_empty, eval_world_verts, flat_material, force_opaque, hex_to_linear, hull_object, key_constant, move_to, parse_args, principled  # noqa: E402

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main
IDLE_FRAME = 1

# --- the camera: a little above a child's eye, looking across the lawn at the house ---------------------------
CAM_LOC = (0.0, -9.0, 4.2)
CAM_TARGET = (0.0, 2.0, -0.4)
CAM_LENS = 30.0

# --- the backdrop -------------------------------------------------------------------------------------------
GROUND_HALF = 80.0
GRASS_Y = (-8.0, 22.0)  # grassNear → verge (art.touchTalk)
HOUSE_Y = 9.0  # the house's front plane (world y of its centre)
HOUSE_WIDTH_PX = 330.0  # its projected width (design px): the whole roof under the sky
DEPTH = HOUSE_Y - 6.2  # the trees and bushes were placed for a house at y 6.2
FENCE_Y = HOUSE_Y - 0.6
FENCE_SCALE = 1.6
FENCE_MODEL = 'fence_straight'
FENCE_STEP = 2.0  # module width × FENCE_SCALE (measured: Homely House fence modules are 1.25 wide)
FENCE_X = [(-15.5, -3.8), (3.8, 15.5)]  # spans left and right of the house
TREES = [(x, y + DEPTH, stem, k) for x, y, stem, k in [(-9.0, 9.0, 'tree_large', 1.6), (-5.6, 10.5, 'tree', 1.4), (6.0, 10.0, 'tree', 1.5), (9.5, 8.6, 'tree_large', 1.7), (-13.0, 12.0, 'tree', 1.6), (13.5, 12.0, 'tree_large', 1.4)]]
BUSHES = [(x, y + DEPTH, k) for x, y, k in [(-7.4, 7.0, 1.2), (-4.6, 7.2, 1.0), (4.8, 7.1, 1.0), (7.6, 7.0, 1.3), (-11.0, 7.3, 1.1), (11.0, 7.2, 1.1)]]
TUFTS = 40
FLOWERS = 30
SEED = 11
HAZE = (0.28, 0.6)  # (fac, saturation) of the far backdrop (house, trees, fence)
NEAR_HAZE = (0.08, 0.92)
SKY_GRADIENT_Z = (0.0, 26.0)
SKY_EMISSION = 1.1
CLOUDS = [(-30.0, 120.0, 20.0, 5.0), (-4.0, 130.0, 25.0, 4.2), (28.0, 120.0, 21.0, 5.5)]

# --- the corners: design-px boxes (x0, y0, x1, y1), y1 = the ground line; the prop fills the box ---------------
# Back row: pen, stage, wardrobe (tall and narrow, left of the Speaker zone); front row: clinic, bed. Padded by hitPad (24) each hull stays inside the
# interactive rect (x 24…1000, y 66…694), off the Home/Speaker zones (top corners) and ≥ targetGap (24) apart.
CORNER_BOXES = {
    'pen': (60, 225, 320, 395),
    'stage': (388, 190, 640, 395),
    'wardrobe': (712, 180, 870, 395),  # its hull stays left of the Speaker zone (x ≥ 900)
    'clinic': (150, 480, 400, 664),
    'bed': (600, 470, 900, 664),
}
PLACE_PASSES = 6
# Yaw (degrees) of each prop's root (0 = its front toward the camera).
CORNER_YAW = {'pen': 0.0, 'stage': 0.0, 'bed': -28.0, 'clinic': 18.0, 'wardrobe': -12.0}

# The pen: a fence rectangle (modules) and the cow inside, its head over the front rail.
PEN_W = 3.0  # x extent (m)
PEN_D = 2.0  # y extent
PEN_FENCE = 'fence_straight'
COW = os.path.join('quaternius', 'animals', 'Cow.fbx')
COW_LENGTH = 2.9  # nose to tail (m): big enough that its head and back show over the low rails
PEN_RAIL_Z = 0.6  # the pen's fence modules are squashed to this height factor (the cow peeks over)
COW_YAW = -55.0  # its head toward the camera, three-quarter view
COW_AT = (0.15, -0.1)  # in the pen (pen-local)
FBX_FRONT_DEG = 90.0  # Quaternius FBX: the model's front is +y after import → +x with this extra yaw (as build_shadow_match)


def fail(msg):
    raise RuntimeError(f'build_home: {msg}')


# --- scene helpers (as build_touch_talk.py) -----------------------------------------------------------------

def clear_island(scene):
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


def make_camera(scene):
    data = bpy.data.cameras.new('CamYard')
    data.lens = CAM_LENS
    cam = bpy.data.objects.new('CamYard', data)
    scene.collection.objects.link(cam)
    cam.location = CAM_LOC
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (Vector(CAM_TARGET) - Vector(CAM_LOC)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


class Screen:
    def __init__(self, scene):
        self.scene = scene

    def project(self, p):
        v = world_to_camera_view(self.scene, self.scene.camera, Vector(p))
        return (v.x * DESIGN[0], (1 - v.y) * DESIGN[1])

    def rect(self, pts):
        sp = [self.project(p) for p in pts]
        xs, ys = [p[0] for p in sp], [p[1] for p in sp]
        return (min(xs), min(ys), max(xs), max(ys))


def unproject(scene, px, py, z):
    cam = scene.camera
    tr, br, bl, tl = [cam.matrix_world @ v for v in cam.data.view_frame(scene=scene)]
    u, v = px / DESIGN[0], py / DESIGN[1]
    top = tl + (tr - tl) * u
    bot = bl + (br - bl) * u
    d = (top + (bot - top) * v - cam.location).normalized()
    t = (z - cam.location.z) / d.z
    return cam.location + d * t


def _socket(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def gradient_material(name, axis, v0, v1, hex0, hex1, rough=0.6, emit=False, noise=None):
    """hex0 at object `axis` = v0 blending to hex1 at v1 (smoothstep); `emit`: unlit (the sky)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = principled(m)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = v0
    mr.inputs['From Max'].default_value = v1
    nt.links.new(sep.outputs[axis.upper()], mr.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(mr.outputs['Result'], _socket(mix.inputs, 'Factor_Float'))
    _socket(mix.inputs, 'A_Color').default_value = hex_to_linear(hex0)
    _socket(mix.inputs, 'B_Color').default_value = hex_to_linear(hex1)
    colour = _socket(mix.outputs, 'Result_Color')
    if noise is not None:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = noise[0]
        fac = nt.nodes.new('ShaderNodeMath')
        fac.operation = 'MULTIPLY'
        nt.links.new(tex.outputs['Fac'], fac.inputs[0])
        fac.inputs[1].default_value = noise[1]
        mix2 = nt.nodes.new('ShaderNodeMix')
        mix2.data_type = 'RGBA'
        nt.links.new(fac.outputs[0], _socket(mix2.inputs, 'Factor_Float'))
        nt.links.new(colour, _socket(mix2.inputs, 'A_Color'))
        _socket(mix2.inputs, 'B_Color').default_value = hex_to_linear(hex0)
        colour = _socket(mix2.outputs, 'Result_Color')
    if emit:
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(colour, em.inputs['Color'])
        em.inputs['Strength'].default_value = SKY_EMISSION
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    else:
        nt.links.new(colour, bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = rough
    return m


def haze(objs, hex_haze, fac, sat):
    """Desaturates the objects' materials (copied) to `sat` and blends them `fac` towards the haze colour."""
    done = {}
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.name.endswith('-haze'):
                continue
            if m.name not in done:
                c = m.copy()
                c.name = f'{m.name}-haze'
                b = principled(c)
                if b is not None:
                    nt = c.node_tree
                    inp = b.inputs['Base Color']
                    h = hex_to_linear(hex_haze)
                    if inp.links:
                        src = inp.links[0].from_socket
                        hs = nt.nodes.new('ShaderNodeHueSaturation')
                        hs.inputs['Saturation'].default_value = sat
                        nt.links.new(src, hs.inputs['Color'])
                        mix = nt.nodes.new('ShaderNodeMix')
                        mix.data_type = 'RGBA'
                        _socket(mix.inputs, 'Factor_Float').default_value = fac
                        nt.links.new(hs.outputs['Color'], _socket(mix.inputs, 'A_Color'))
                        _socket(mix.inputs, 'B_Color').default_value = h
                        nt.links.new(_socket(mix.outputs, 'Result_Color'), inp)
                    else:
                        base = inp.default_value
                        grey = sum(base[:3]) / 3
                        inp.default_value = tuple((grey + (base[i] - grey) * sat) * (1 - fac) + h[i] * fac for i in range(3)) + (1.0,)
                done[m.name] = c
            slot.material = done[m.name]


class Kit:
    """Imports each Tiny Treats / KayKit model once and places linked copies of it."""

    def __init__(self, coll):
        self.coll = coll
        self.src = {}

    def put(self, stem, pack, name, loc, scale=1.0, yaw=0.0):
        key = (stem, pack)
        if key not in self.src:
            o = import_joined(tt_model(stem, pack), name)
            move_to(o, self.coll)
            self.src[key] = o
        else:
            o = self.src[key].copy()
            o.name = name
            self.coll.objects.link(o)
        o.location = loc
        o.scale = (scale,) * 3 if isinstance(scale, (int, float)) else scale
        o.rotation_mode = 'XYZ'
        o.rotation_euler = (0.0, 0.0, math.radians(yaw))
        return o


def model(stem, pack, coll, name, parent=None, loc=(0.0, 0.0, 0.0), scale=1.0, yaw=0.0):
    """One joined Tiny Treats / KayKit model (its own mesh) under `parent`."""
    o = import_joined(tt_model(stem, pack), name)
    move_to(o, coll)
    o.parent = parent
    o.location = loc
    o.scale = (scale,) * 3
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0.0, 0.0, math.radians(yaw))
    return o


def flat_quad(name, corners, material, coll):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(c) for c in corners])
    return mesh_obj(name, bm, material, coll, smooth=False)


# --- the plate ----------------------------------------------------------------------------------------------

def build_plate(scene, screen, params, plate):
    tt = params['art']['touchTalk']
    grass = gradient_material('yard-grass', 'y', GRASS_Y[0], GRASS_Y[1], tt['grassNear'], tt['verge'], 0.85, noise=(2.0, 0.2))
    flat_quad('yard-grass', [(-GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, GROUND_HALF, 0.0), (-GROUND_HALF, GROUND_HALF, 0.0)], grass, plate)
    kit = Kit(plate)
    far = []
    # Xoài's house: fitted to HOUSE_WIDTH_PX, centred on the screen, its front toward the camera.
    house = kit.put('house', 'Homely-House', 'yard-house', (0.0, HOUSE_Y, 0.0), 1.0, 0.0)
    for _ in range(4):
        bpy.context.view_layer.update()
        x0, _y0, x1, _y1 = screen.rect(eval_world_verts([house], bpy.context.evaluated_depsgraph_get()))
        house.scale = house.scale * (HOUSE_WIDTH_PX / max(x1 - x0, 1e-6))
    bpy.context.view_layer.update()
    hs = house.scale.x
    pts = eval_world_verts([house], bpy.context.evaluated_depsgraph_get())
    front = min(p.y for p in pts)
    far.append(house)
    far.append(kit.put('doormat', 'Homely-House', 'yard-doormat', (0.0, front - 0.45 * hs, 0.003), hs * 1.2))
    for side, (a, b) in enumerate(FENCE_X):
        n = int((b - a) / FENCE_STEP)
        for i in range(n + 1):
            x = a + i * FENCE_STEP
            far.append(kit.put(FENCE_MODEL, 'Homely-House', f'yard-fence-{side}-{i}', (x, FENCE_Y, 0.0), FENCE_SCALE))
    for i, (x, y, stem, k) in enumerate(TREES):
        far.append(kit.put(stem, 'Homely-House', f'yard-tree-{i}', (x, y, 0.0), k))
    for i, (x, y, k) in enumerate(BUSHES):
        far.append(kit.put('foliage_A' if i % 2 else 'foliage_B', 'Homely-House', f'yard-bush-{i}', (x, y, 0.0), k))
    haze(far, tt['haze'], *HAZE)
    rnd = random.Random(SEED)
    near = []
    for i in range(TUFTS):
        x, y = rnd.uniform(-10.0, 10.0), rnd.uniform(-5.0, 5.0)
        near.append(kit.put('grass_A' if i % 2 else 'grass_B', 'Pretty-Park', f'yard-tuft-{i}', (x, y, 0.0), 0.9, rnd.uniform(0.0, 360.0)))
    for i in range(FLOWERS):
        x, y = rnd.uniform(-12.0, 12.0), rnd.uniform(-4.0, 5.2)
        near.append(kit.put('flower_A' if i % 2 else 'flower_B', 'Pretty-Park', f'yard-flower-{i}', (x, y, 0.0), 1.3, rnd.uniform(0.0, 360.0)))
    haze(near, tt['haze'], *NEAR_HAZE)
    sky(params, plate)
    return near


def sky(params, plate):
    tt = params['art']['touchTalk']
    distance = 140.0
    y = CAM_LOC[1] + distance
    m = gradient_material('yard-sky', 'z', SKY_GRADIENT_Z[0], SKY_GRADIENT_Z[1], tt['skyHorizon'], tt['skyTop'], emit=True)
    bm = bmesh.new()
    w = distance * 2.0
    bm.faces.new([bm.verts.new(p) for p in ((-w, y, -40.0), (w, y, -40.0), (w, y, 120.0), (-w, y, 120.0))])
    s = mesh_obj('yard-sky', bm, m, plate)
    s.visible_shadow = False
    cloud = flat_material('yard-cloud', tt['white'], 0.9)
    b = principled(cloud)
    b.inputs['Emission Color'].default_value = hex_to_linear(tt['white'])
    b.inputs['Emission Strength'].default_value = 0.35
    puffs = [(-0.9, 0.0, -0.15, 0.55), (-0.35, 0.0, 0.2, 0.75), (0.35, 0.0, 0.15, 0.7), (0.9, 0.0, -0.1, 0.5), (0.0, -0.1, -0.25, 0.6)]
    for i, (x, cy, z, sz) in enumerate(CLOUDS):
        for k, (dx, dy, dz, r) in enumerate(puffs):
            o = blob(f'yard-cloud-{i}-{k}', cloud, plate, None, (x + dx * sz, cy + dy * sz, z + dz * sz), (r * sz, r * sz * 0.6, r * sz * 0.8), seg=(24, 12))
            o.visible_shadow = False


# --- the corner props ---------------------------------------------------------------------------------------

def import_fbx(path, coll):
    full = os.path.join(ASSETS, path)
    if not os.path.isfile(full):
        fail(f'{full} is missing')
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=full)
    new = [o for o in bpy.data.objects if o not in before]
    force_opaque(new)
    for o in new:
        move_to(o, coll)
    actions = [a for a in bpy.data.actions if a not in before_actions]
    return new, actions


def pose_idle(arm, actions):
    """The armature held in the first frame of its `…|Idle` action (keyed at IDLE_FRAME, constant)."""
    action = next((a for a in actions if a.name.rsplit('|', 1)[-1].split('.')[0] == 'Idle'), None)
    if action is None:
        print('build_home: WARNING no Idle action — the rest pose stays')
        return
    ad = arm.animation_data or arm.animation_data_create()
    rest = arm.matrix_basis.copy()
    ad.action = action
    if hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots) > 0:
        ad.action_slot = action.slots[0]
    bpy.context.scene.frame_set(int(action.frame_range[0]))
    pose = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    ad.action = None
    arm.matrix_basis = rest
    for pb in arm.pose.bones:
        pb.matrix_basis = pose[pb.name]
        pb.keyframe_insert('location', frame=IDLE_FRAME)
        pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=IDLE_FRAME)
        pb.keyframe_insert('scale', frame=IDLE_FRAME)
    key_constant(arm)
    bpy.context.scene.frame_set(IDLE_FRAME)


def build_pen(root, coll, c):
    """A fence pen (front rail low enough for the head) with the real cow inside."""
    probe = model(PEN_FENCE, 'Homely-House', coll, 'pen-probe')
    bpy.context.view_layer.update()
    pts = eval_world_verts([probe], bpy.context.evaluated_depsgraph_get())
    mod = max(p.x for p in pts) - min(p.x for p in pts)
    bpy.data.objects.remove(probe, do_unlink=True)
    nx = max(1, round(PEN_W / mod))
    ny = max(1, round(PEN_D / mod))
    w, d = nx * mod, ny * mod
    i = 0
    for k in range(nx):
        x = -w / 2 + (k + 0.5) * mod
        model(PEN_FENCE, 'Homely-House', coll, f'pen-fence-{i}', root, (x, -d / 2, 0.0)); i += 1  # noqa: E702
        model(PEN_FENCE, 'Homely-House', coll, f'pen-fence-{i}', root, (x, d / 2, 0.0)); i += 1  # noqa: E702
    for k in range(ny):
        y = -d / 2 + (k + 0.5) * mod
        model(PEN_FENCE, 'Homely-House', coll, f'pen-fence-{i}', root, (-w / 2, y, 0.0), yaw=90.0); i += 1  # noqa: E702
        model(PEN_FENCE, 'Homely-House', coll, f'pen-fence-{i}', root, (w / 2, y, 0.0), yaw=90.0); i += 1  # noqa: E702
    for o in root.children:
        if o.name.startswith('pen-fence-'):
            o.scale = (o.scale.x, o.scale.y, o.scale.z * PEN_RAIL_Z)
    # straw on the pen floor
    rbox('pen-straw', (w * 0.92, d * 0.92, 0.04), 0.02, mat(c['tintButter'], 0.9), coll, root, (0.0, 0.0, 0.02))
    new, actions = import_fbx(COW, coll)
    cow_root = add_empty('pen-cow', (0.0, 0.0, 0.0), coll)
    for o in new:
        if o.parent is None:
            o.parent = cow_root
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    if arm is not None:
        pose_idle(arm, actions)
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    length = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
    k = COW_LENGTH / max(length, 1e-6)
    cow_root.scale = (k, k, k)
    cow_root.rotation_euler = (0.0, 0.0, math.radians(COW_YAW + FBX_FRONT_DEG))
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    cow_root.location = (COW_AT[0] - cx, COW_AT[1] - cy, -min(p.z for p in pts))
    cow_root.parent = root


def build_stage(root, coll, c):
    """A round wooden stage with a curtain arch behind and a big drum with two sticks on it."""
    wood, dark = mat(c['wood'], 0.6), mat(c['woodDark'], 0.6)
    lathe('stage-floor', rounded_profile(1.7, 0.0, 0.32, 0.12), wood, coll, root)
    lathe('stage-rim', rounded_profile(1.76, 0.0, 0.12, 0.3), dark, coll, root)
    curtain = mat(c['curtain'], 0.7)
    # the arch: two posts and a scalloped top behind the drum
    for side in (-1, 1):
        rod(f'stage-post-{side}', (side * 1.35, 0.9, 0.3), (side * 1.35, 0.9, 2.5), 0.12, dark, coll, root)
        blob(f'stage-drape-{side}', curtain, coll, root, (side * 1.1, 0.95, 1.45), (0.32, 0.12, 1.1))
    for k in range(5):
        x = -1.2 + k * 0.6
        blob(f'stage-valance-{k}', curtain, coll, root, (x, 0.92, 2.45), (0.34, 0.14, 0.22))
    rbox('stage-bar', (2.9, 0.16, 0.16), 0.06, dark, coll, root, (0.0, 0.92, 2.62))
    # the drum: red shell, white rims, cream head, gold lugs, on the stage floor
    drum_r, drum_h, z0 = 0.62, 0.7, 0.32
    lathe('drum-shell', rounded_profile(drum_r, z0, z0 + drum_h, 0.08), mat(c['drum'], 0.35), coll, root)
    rim = mat(c['drumRim'], 0.35)
    torus('drum-rim-top', drum_r, 0.06, rim, coll, root, (0.0, 0.0, z0 + drum_h))
    torus('drum-rim-bottom', drum_r, 0.06, rim, coll, root, (0.0, 0.0, z0 + 0.04))
    lathe('drum-head', [(0.0, z0 + drum_h + 0.01), (drum_r * 0.97, z0 + drum_h + 0.01), (0.0, z0 + drum_h + 0.012)], mat(c['drumHead'], 0.5), coll, root)
    lug = mat(c['knob'], 0.3)
    for k in range(8):
        a = 2 * math.pi * k / 8
        rbox(f'drum-lug-{k}', (0.07, 0.07, 0.22), 0.03, lug, coll, root, (math.cos(a) * (drum_r + 0.02), math.sin(a) * (drum_r + 0.02), z0 + drum_h / 2), (0.0, 0.0, math.degrees(a)))
    stick = mat(c['stick'], 0.5)
    top = z0 + drum_h + 0.05
    rod('drum-stick-l', (-0.2, -0.1, top), (-0.75, -0.55, top + 0.55), 0.045, stick, coll, root)
    rod('drum-stick-r', (0.2, -0.1, top), (0.75, -0.5, top + 0.6), 0.045, stick, coll, root)
    blob('drum-stick-tip-l', stick, coll, root, (-0.75, -0.55, top + 0.55), (0.08, 0.08, 0.08))
    blob('drum-stick-tip-r', stick, coll, root, (0.75, -0.5, top + 0.6), (0.08, 0.08, 0.08))


def build_bed(root, coll, c):
    bed = model('bed_single_A', 'Furniture', coll, 'bed-model', root)
    bpy.context.view_layer.update()
    pts = eval_world_verts([bed], bpy.context.evaluated_depsgraph_get())
    top = max(p.z for p in pts)
    y_head = max(p.y for p in pts)
    model('pillow_A', 'Furniture', coll, 'bed-pillow', root, (0.0, y_head - 0.45, top - 0.05), 1.0, 0.0)


def build_clinic(root, coll, c):
    """The vet box: a big white rounded case, a red cross on its front and top, a handle."""
    kit = mat(c['kit'], 0.4)
    cross = mat(c['cross'], 0.35)
    w, d, h = 1.9, 1.0, 1.35
    rbox('clinic-box', (w, d, h), 0.16, kit, coll, root, (0.0, 0.0, h / 2))
    rbox('clinic-lid-line', (w + 0.02, d + 0.02, 0.06), 0.03, cross, coll, root, (0.0, 0.0, h * 0.78))
    fy = -d / 2 - 0.02
    rbox('clinic-cross-v', (0.3, 0.08, 0.86), 0.06, cross, coll, root, (0.0, fy, h * 0.42))
    rbox('clinic-cross-h', (0.86, 0.08, 0.3), 0.06, cross, coll, root, (0.0, fy, h * 0.42))
    torus('clinic-handle', 0.3, 0.07, cross, coll, root, (0.0, 0.0, h + 0.02), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    for sx in (-1, 1):
        rbox(f'clinic-clasp-{sx}', (0.16, 0.06, 0.2), 0.03, mat(c['knob'], 0.3), coll, root, (sx * 0.62, fy, h * 0.8))


def build_wardrobe(root, coll, c):
    """A lilac wardrobe: body, two doors, knobs, little feet, a crown top and a shirt on a side hook."""
    body, door, knob = mat(c['wardrobe'], 0.45), mat(c['wardrobeDoor'], 0.45), mat(c['knob'], 0.3)
    w, d, h, foot = 1.5, 0.8, 2.4, 0.14
    rbox('wardrobe-body', (w, d, h), 0.1, body, coll, root, (0.0, 0.0, foot + h / 2))
    fy = -d / 2 - 0.03
    for sx in (-1, 1):
        rbox(f'wardrobe-door-{sx}', (w / 2 - 0.12, 0.06, h - 0.3), 0.06, door, coll, root, (sx * w / 4, fy, foot + h / 2))
        blob(f'wardrobe-knob-{sx}', knob, coll, root, (sx * 0.1, fy - 0.06, foot + h / 2), (0.07, 0.07, 0.07))
        rbox(f'wardrobe-foot-{sx}', (0.16, 0.16, foot), 0.04, mat(c['woodDark'], 0.6), coll, root, (sx * (w / 2 - 0.15), 0.0, foot / 2))
    rbox('wardrobe-crown', (w + 0.16, d + 0.12, 0.16), 0.06, body, coll, root, (0.0, 0.0, foot + h + 0.08))
    blob('wardrobe-crest', body, coll, root, (0.0, 0.0, foot + h + 0.2), (0.32, 0.16, 0.2))
    # the shirt on a hook on the right side
    shirt = mat(c['shirt'], 0.6)
    sx = w / 2 + 0.06
    rod('wardrobe-hook', (w / 2, -0.05, foot + h - 0.35), (sx + 0.04, -0.05, foot + h - 0.3), 0.025, knob, coll, root)
    rbox('shirt-body', (0.06, 0.62, 0.72), 0.05, shirt, coll, root, (sx + 0.03, -0.05, foot + h - 0.82))
    for side in (-1, 1):
        rbox(f'shirt-sleeve-{side}', (0.05, 0.3, 0.22), 0.05, shirt, coll, root, (sx + 0.03, -0.05 + side * 0.4, foot + h - 0.6), (side * 30.0, 0.0, 0.0))


BUILDERS = {'pen': build_pen, 'stage': build_stage, 'bed': build_bed, 'clinic': build_clinic, 'wardrobe': build_wardrobe}


def place_in_box(scene, screen, root, meshes, box):
    """Scales the prop to fit `box` (design px) and stands it on the ground (z 0) at the box's bottom centre."""
    x0, y0, x1, y1 = box
    target = unproject(scene, (x0 + x1) / 2, y1, 0.0)
    root.location = (target.x, target.y, 0.0)
    for _ in range(PLACE_PASSES):
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        rx0, ry0, rx1, ry1 = screen.rect(pts)
        root.scale = root.scale * min((x1 - x0) / max(rx1 - rx0, 1e-6), (y1 - y0) / max(ry1 - ry0, 1e-6))
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        rx0, ry0, rx1, ry1 = screen.rect(pts)
        now = unproject(scene, (rx0 + rx1) / 2, ry1, 0.0)
        root.location += Vector((target.x - now.x, target.y - now.y, -min(p.z for p in pts)))
    bpy.context.view_layer.update()


def build_corner(scene, screen, cid, params, sprites, layout):
    c = {**params['colours'], **params['art']['home']}
    coll = bpy.data.collections.new(f'sprite.{cid}')
    sprites.children.link(coll)
    root = add_empty(f'{cid}-root', (0.0, 0.0, 0.0), coll)
    inner = add_empty(f'{cid}-model', (0.0, 0.0, 0.0), coll)
    inner.parent = root
    BUILDERS[cid](inner, coll, c)
    root.rotation_euler = (0.0, 0.0, math.radians(CORNER_YAW[cid]))
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    place_in_box(scene, screen, root, meshes, CORNER_BOXES[cid])
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    hull_object(f'hit.{cid}', [tuple(p) for p in pts], layout)
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    add_empty(f'anchor.{cid}', (cx, cy, 0.0), layout)
    r = screen.rect(pts)
    print(f'build_home: corner {cid} ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')
    return coll


def clear_tufts_under(near, screen):
    """Removes lawn tufts and flowers inside a corner box (they would show through the sprite's edges)."""
    for o in near:
        p = screen.project(tuple(o.location))
        for (x0, y0, x1, y1) in CORNER_BOXES.values():
            if x0 - 20 <= p[0] <= x1 + 20 and y0 <= p[1] <= y1 + 20:
                bpy.data.objects.remove(o, do_unlink=True)
                break


def main():
    global DESIGN
    args = parse_args('build_home', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(IDLE_FRAME)
    make_camera(scene)
    bpy.context.view_layer.update()
    screen = Screen(scene)
    plate = bpy.data.collections.new('yard-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    near = build_plate(scene, screen, params, plate)
    clear_tufts_under(near, screen)
    for cid in BUILDERS:
        build_corner(scene, screen, cid, params, sprites, layout)
    scene.frame_set(IDLE_FRAME)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_home: saved {args["out"]}')


main()
