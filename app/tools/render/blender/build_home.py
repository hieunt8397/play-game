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
# so the corners pop. Nine big corner props (2026-11-12: the train up by the fence at the top left, four in the back row, four in the front row), each its own `sprite.<corner>` (idle at frame 1; the runtime bounce
# is a scale motion around the ground pivot), with `hit.<corner>` (convex hull of its meshes) and
# `anchor.<corner>` (its ground pivot) in the hidden `layout` collection:
#   - pen (back row, far left): a Homely House fence pen with a real Quaternius cow (Cow.fbx, its Idle pose) peeking over the front;
#   - stage (back row, in front of the door): a round wooden stage with a pink curtain arch and a big drum with sticks (script-built, cute.py);
#   - bed: the KayKit Furniture single bed with an extra pillow (front row);
#   - clinic: a big white vet box with a red cross and a handle (script-built, front row);
#   - wardrobe (back row, third): a lilac wardrobe with two doors, knobs, a crown top and a shirt on its side hook (script-built);
#   - garden (Trồng cây, 2026-10-30; front row, between clinic and bed): a wooden raised bed of dark soil with a strawberry
#     plant, a staked tomato plant and a seedling, a sign stake with a strawberry, and a light-blue watering can beside it
#     (script-built; colours from art.garden);
#   - car-wash (Rửa xe, 2026-10-30; front row, far right): a pink arch with a bubble sign and a blue roller brush over the
#     Kenney Car Kit taxi (CC0), foam on its roof and side (colours from art.carWash);
#   - plane (Phi công nhí, 2026-11-11; back row, far right, a step nearer and under the Speaker zone): a round yellow toy
#     propeller plane parked on the grass, nose up — cream belly, pink wings and tail, a blue nose with brown blades, a
#     glass canopy, small wheels — with a red and a purple balloon tied to its tail (script-built; colours from art.plane);
#   - train (Tàu hỏa chở bạn, 2026-11-12; top left, up by the fence): a toy steam engine with a puff of smoke and one red
#     car on a stub of track (script-built; colours from art.train).
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
# Back row (2026-11-11: four corners, each a little smaller): pen, stage, wardrobe (tall and narrow), plane (far right: its
# whole box lies below the Speaker zone, y ≥ 257 + hitPad, and its ground line a step nearer than the others'); front row
# (2026-10-30: four corners): clinic, garden, bed, car-wash. Padded by hitPad (24) each hull stays inside the
# interactive rect (x 24…1000, y 66…694), off the Home/Speaker zones (top corners) and ≥ targetGap (24) apart.
# 2026-11-12 (Tàu hỏa chở bạn): a ninth corner, the train, stands on the lawn in front of the fence at the top left (right of the Home zone:
# x ≥ 124 + hitPad); the pen steps down under it and the stage, wardrobe and plane step right, each box ≥ 72 px
# (2 × hitPad + targetGap) from its neighbours.
CORNER_BOXES = {
    'train': (156, 150, 330, 255),  # a long low prop on the lawn in front of the fence: ≥ 150 px wide, right of the Home zone
    'pen': (50, 327, 270, 432),
    'stage': (412, 200, 560, 395),
    'wardrobe': (636, 195, 746, 395),
    'plane': (818, 284, 974, 432),  # under the Speaker zone (y ≤ 257): top ≥ 257 + hitPad; ≥ 72 px from the bed and the car-wash
    'clinic': (50, 496, 222, 664),
    'garden': (296, 490, 500, 664),
    'bed': (574, 476, 740, 664),
    'car-wash': (814, 480, 972, 664),
}
PLACE_PASSES = 6
# Yaw (degrees) of each prop's root (0 = its front toward the camera).
CORNER_YAW = {'pen': 0.0, 'stage': 0.0, 'bed': -28.0, 'clinic': 18.0, 'wardrobe': -12.0, 'garden': 8.0, 'car-wash': -10.0, 'plane': -152.0, 'train': -16.0}
# Rửa xe corner: the Kenney Car Kit taxi (CC0) under the arch.
CAR_WASH_CAR = os.path.join('kenney', 'kenney_car-kit', 'Models', 'GLB format', 'taxi.glb')

# Phi công nhí corner: the parked plane's nose-up tilt (degrees).
PLANE_TILT = 13.0

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


def build_garden(root, coll, c):
    """A wooden raised bed of dark soil: a strawberry plant (berries over the front rim), a staked tomato plant, a
    seedling, a sign stake with a strawberry on it, and a light-blue watering can on the ground beside the bed."""
    g = c['garden']
    wood, plank = mat(g['bed'], 0.6), mat(g['bedDark'], 0.6)
    soil, lump = mat(g['soil'], 0.95), mat(g['soilDark'], 0.95)
    leaf, leaf2, stem = mat(g['leaf'], 0.5), mat(g['leafDark'], 0.5), mat(g['stem'], 0.5)
    berry, seed, tomato = mat(g['strawberry'], 0.3), mat(g['strawberrySeed'], 0.4), mat(g['tomato'], 0.3)
    w, d, h = 2.1, 1.05, 0.5
    # the bed: a wooden box, darker plank lines on the front, corner posts a little proud, the soil inside
    rbox('garden-bed', (w, d, h), 0.1, wood, coll, root, (0.0, 0.0, h / 2))
    fy = -d / 2 - 0.015
    for k, z in enumerate((h * 0.36, h * 0.7)):
        rbox(f'garden-plank-{k}', (w - 0.3, 0.04, 0.035), 0.015, plank, coll, root, (0.0, fy, z))
    for sx in (-1, 1):
        for sy in (-1, 1):
            rbox(f'garden-post-{sx}-{sy}', (0.17, 0.17, h + 0.1), 0.06, plank, coll, root, (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), (h + 0.1) / 2))
    rbox('garden-soil', (w - 0.2, d - 0.2, 0.12), 0.05, soil, coll, root, (0.0, 0.0, h - 0.02))
    rnd = random.Random(5)
    for k in range(9):
        x, y = rnd.uniform(-w / 2 + 0.2, w / 2 - 0.2), rnd.uniform(-d / 2 + 0.18, d / 2 - 0.18)
        r = rnd.uniform(0.05, 0.08)
        blob(f'garden-lump-{k}', lump, coll, root, (x, y, h + 0.04), (r, r, r * 0.6), seg=(16, 8))
    top = h + 0.04

    def berry_shape(v):  # narrower toward the tip (−z)
        k = 0.62 + 0.38 * (v.z + 1) / 2
        return Vector((v.x * k, v.y * k, v.z))

    # the strawberry plant (left): a rosette of round leaves, berries hanging over the front rim
    sx0 = -0.6
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        tilt = 25.0
        blob(f'straw-leaf-{k}', leaf if k % 2 else leaf2, coll, root, (sx0 + math.cos(a) * 0.2, math.sin(a) * 0.17 + 0.05, top + 0.2), (0.2, 0.15, 0.07), (tilt * math.sin(a), -tilt * math.cos(a), math.degrees(a)), seg=(24, 12))
    blob('straw-leaf-top', leaf, coll, root, (sx0, 0.08, top + 0.34), (0.17, 0.14, 0.09), seg=(24, 12))
    for k, (x, y, z) in enumerate([(sx0 - 0.3, -0.5, top + 0.02), (sx0 + 0.02, -0.56, top - 0.04), (sx0 + 0.32, -0.48, top + 0.05)]):
        rod(f'straw-runner-{k}', (sx0 + (x - sx0) * 0.3, 0.0, top + 0.15), (x, y + 0.05, z + 0.17), 0.022, stem, coll, root)
        blob(f'straw-berry-{k}', berry, coll, root, (x, y, z), (0.16, 0.14, 0.18), shape=berry_shape)
        blob(f'straw-cap-{k}', leaf2, coll, root, (x, y, z + 0.17), (0.12, 0.12, 0.04), seg=(16, 8))
        for j, (dx, dz) in enumerate([(-0.05, 0.04), (0.05, 0.03), (0.0, -0.05), (-0.04, -0.02), (0.045, -0.025)]):
            blob(f'straw-seed-{k}-{j}', seed, coll, root, (x + dx, y - 0.135 + abs(dx) * 0.6, z + dz), (0.018, 0.012, 0.024), seg=(8, 6))
    # the tomato plant (centre right): a stake, a stem, leaf clusters, three red tomatoes with green star caps
    tx = 0.35
    rod('tomato-stake', (tx + 0.12, 0.12, top - 0.05), (tx + 0.12, 0.12, top + 1.15), 0.035, plank, coll, root)
    rod('tomato-stem', (tx, 0.05, top), (tx + 0.04, 0.08, top + 1.0), 0.04, stem, coll, root)
    for k, (dx, dz, sz) in enumerate([(-0.22, 0.35, 0.2), (0.24, 0.5, 0.2), (-0.18, 0.72, 0.18), (0.2, 0.88, 0.17), (0.02, 1.06, 0.2)]):
        blob(f'tomato-leaf-{k}', leaf if k % 2 else leaf2, coll, root, (tx + dx, 0.06, top + dz), (sz, sz * 0.8, sz * 0.6), (0.0, 0.0, 20.0 * k), seg=(24, 12))
    for k, (dx, dz) in enumerate([(-0.1, 0.42), (0.18, 0.66), (-0.12, 0.84)]):
        x, y, z = tx + dx, -0.14, top + dz
        blob(f'tomato-{k}', tomato, coll, root, (x, y, z), (0.18, 0.17, 0.16))
        for j in range(5):
            a = 2 * math.pi * j / 5
            blob(f'tomato-cap-{k}-{j}', leaf2, coll, root, (x + math.cos(a) * 0.05, y + math.sin(a) * 0.05, z + 0.155), (0.05, 0.018, 0.012), (0.0, 0.0, math.degrees(a)), seg=(10, 6))
    # a seedling (right): two round leaves on a short stem
    px = 0.82
    rod('sprout-stem', (px, -0.1, top), (px, -0.1, top + 0.2), 0.025, stem, coll, root)
    for side in (-1, 1):
        blob(f'sprout-leaf-{side}', leaf, coll, root, (px + side * 0.09, -0.1, top + 0.23), (0.1, 0.06, 0.035), (0.0, -side * 20.0, 0.0), seg=(20, 10))
    # the sign stake at the front left: a post, a round-cornered board, a strawberry painted on it
    gx = -w / 2 + 0.05
    rod('sign-post', (gx, -d / 2 - 0.2, 0.0), (gx, -d / 2 - 0.2, 0.95), 0.04, plank, coll, root)
    rbox('sign-board', (0.42, 0.06, 0.32), 0.06, mat(g['packet'], 0.5), coll, root, (gx, -d / 2 - 0.25, 0.85))
    blob('sign-berry', berry, coll, root, (gx, -d / 2 - 0.29, 0.83), (0.08, 0.02, 0.09), shape=berry_shape)
    blob('sign-berry-cap', leaf2, coll, root, (gx, -d / 2 - 0.3, 0.92), (0.06, 0.015, 0.025), seg=(12, 6))
    # the watering can on the ground to the right of the bed, tipped a little toward it
    can_root = add_empty('garden-can', (w / 2 + 0.5, -0.2, 0.0), coll)
    can_root.parent = root
    can_root.rotation_euler = (0.0, math.radians(-10.0), math.radians(-25.0))
    can, can_dark = mat(g['can'], 0.3), mat(g['canDark'], 0.3)
    cr, ch = 0.3, 0.46
    lathe('can-body', rounded_profile(cr, 0.0, ch, 0.25), can, coll, can_root)
    torus('can-rim', cr * 0.82, 0.035, can_dark, coll, can_root, (0.0, 0.0, ch + 0.005))
    torus('can-handle', 0.2, 0.04, can_dark, coll, can_root, (0.1, 0.0, ch), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    rod('can-spout', (-cr * 0.7, 0.0, ch * 0.3), (-cr - 0.32, 0.0, ch + 0.2), 0.045, can, coll, can_root)
    blob('can-rose', can_dark, coll, can_root, (-cr - 0.36, 0.0, ch + 0.23), (0.07, 0.09, 0.09))


def build_car_wash(root, coll, c):
    """A pink car-wash arch (two posts, a beam, a white sign with blue bubbles) with a blue roller brush at the back, over
    the Kenney taxi (turned to show its side), foam blobs on its roof and side and a few on the ground."""
    w = c['carWash']
    car = import_joined(os.path.join(ASSETS, CAR_WASH_CAR), 'car-wash-taxi')
    move_to(car, coll)
    car.parent = root
    car.rotation_mode = 'XYZ'  # the glTF import leaves a quaternion mode
    car.rotation_euler = (0.0, 0.0, math.radians(90.0))  # its front (−y) to +x
    del car['cute']  # Kenney's flat facets get the soft shading like the script-built props
    bevel = car.modifiers.new('soft-edge', 'BEVEL')
    bevel.width = 0.025
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(40.0)
    for m in car.data.materials:
        if m is not None and m.use_nodes:
            principled(m).inputs['Roughness'].default_value = 0.55
    vs = [v.co for v in car.data.vertices]
    length = max(v.y for v in vs) - min(v.y for v in vs)  # along x once turned
    height = max(v.z for v in vs)
    arch, arch_dark = mat(w['arch'], 0.45), mat(w['archDark'], 0.45)
    brush, brush_dark = mat(w['brush'], 0.7), mat(w['brushDark'], 0.7)
    post_x = length / 2 + 0.3
    top = height + 0.75
    for sx in (-1, 1):
        rbox(f'cw-post-{sx}', (0.32, 0.32, top), 0.1, arch, coll, root, (sx * post_x, 0.25, top / 2))
        rbox(f'cw-foot-{sx}', (0.46, 0.46, 0.14), 0.06, arch_dark, coll, root, (sx * post_x, 0.25, 0.07))
    rbox('cw-beam', (2 * post_x + 0.4, 0.38, 0.36), 0.12, arch, coll, root, (0.0, 0.25, top + 0.1))
    rbox('cw-sign', (1.5, 0.1, 0.56), 0.2, mat(w['sign'], 0.8), coll, root, (0.0, 0.02, top + 0.5))
    for j, (dx, dz, r) in enumerate([(-0.42, -0.02, 0.15), (-0.12, 0.06, 0.19), (0.2, -0.01, 0.16), (0.47, 0.07, 0.11)]):
        blob(f'cw-sign-bubble-{j}', mat(w['wallStripe'], 0.25), coll, root, (dx, -0.04, top + 0.5 + dz), (r, 0.04, r), seg=(24, 10))
    # The roller brush behind the car, hanging from the beam.
    lathe('cw-brush', rounded_profile(0.3, 0.3, top - 0.1, 0.4), brush, coll, root, (post_x - 0.6, 0.75, 0.0))
    for j in range(5):
        torus(f'cw-brush-ring-{j}', 0.31, 0.03, brush_dark, coll, root, (post_x - 0.6, 0.75, 0.5 + 0.38 * j))
    # Foam on the car (roof and side) and a little on the ground.
    foam, shade = mat(w['foam'], 0.55), mat(w['foamShade'], 0.55)
    for j, (x, y, z, r) in enumerate([(-0.5, 0.0, height + 0.05, 0.26), (-0.15, 0.1, height + 0.12, 0.3), (0.25, -0.05, height + 0.04, 0.24),
                                       (-0.9, -0.78, 0.75, 0.2), (-0.6, -0.8, 0.95, 0.17), (0.35, -0.8, 0.7, 0.18), (0.65, -0.78, 0.9, 0.14),
                                       (-1.3, -0.9, 0.12, 0.16), (1.35, -0.8, 0.1, 0.13)]):
        blob(f'cw-foam-{j}', foam if j % 3 else shade, coll, root, (x, y, z), (r, r * 0.9, r * 0.85), seg=(24, 12))


def build_plane(root, coll, c):
    """A round toy propeller plane parked on the grass (its nose along +x, tilted up; the corner's yaw turns it to a
    three-quarter view): yellow body, cream belly, pink wings and tail, a blue nose with brown blades, a glass canopy,
    two main wheels and a tail wheel, and a red and a purple balloon tied to its tail."""
    p = c['plane']
    body, body_dark, belly = mat(p['body'], 0.3), mat(p['bodyDark'], 0.35), mat(p['belly'], 0.4)
    wing, wing_dark = mat(p['wing'], 0.35), mat(p['wingDark'], 0.35)
    nose, prop, tyre = mat(p['nose'], 0.3), mat(p['prop'], 0.45), mat(p['wheel'], 0.55)
    hull = add_empty('plane-hull', (0.0, 0.0, 1.0), coll)
    hull.parent = root
    hull.rotation_euler = (0.0, math.radians(-PLANE_TILT), 0.0)

    def fuselage(d):  # slimmer toward the tail (−x)
        t = max(0.0, -d.x)
        k = 1.0 - 0.55 * t * t
        return Vector((d.x, d.y * k, d.z * k + 0.1 * t * t))

    blob('plane-body', body, coll, hull, (0.0, 0.0, 0.0), (1.35, 0.72, 0.7), shape=fuselage)
    blob('plane-belly', belly, coll, hull, (0.12, 0.0, -0.2), (1.02, 0.63, 0.52))
    blob('plane-nose', nose, coll, hull, (1.08, 0.0, 0.0), (0.4, 0.5, 0.5))
    blob('plane-spinner', prop, coll, hull, (1.5, 0.0, 0.0), (0.17, 0.15, 0.15), seg=(24, 12))
    for k, a in enumerate((25.0, 205.0)):
        r = math.radians(a)
        blob(f'plane-blade-{k}', prop, coll, hull, (1.52, -math.sin(r) * 0.36, math.cos(r) * 0.36), (0.045, 0.13, 0.4), (a, 0.0, 0.0), seg=(24, 12))
    blob('plane-wing', wing, coll, hull, (0.22, 0.0, -0.2), (0.46, 1.62, 0.1))
    for sy in (-1, 1):
        blob(f'plane-wing-tip-{sy}', wing_dark, coll, hull, (0.22, sy * 1.42, -0.2), (0.34, 0.24, 0.115), seg=(24, 12))
    blob('plane-tailplane', wing, coll, hull, (-1.14, 0.0, 0.12), (0.25, 0.62, 0.07), seg=(24, 12))
    blob('plane-fin', wing_dark, coll, hull, (-1.16, 0.0, 0.42), (0.3, 0.07, 0.36), (0.0, 18.0, 0.0), seg=(24, 12))
    blob('plane-canopy', mat(p['gogglesGlass'], 0.12), coll, hull, (0.3, 0.0, 0.56), (0.42, 0.4, 0.3))
    torus('plane-canopy-rim', 0.36, 0.045, body_dark, coll, hull, (0.3, 0.0, 0.52), (0.0, 0.0, 0.0))
    # the wheels stand on the ground (the root's frame): two under the wing, one under the tail
    for sy in (-1, 1):
        rod(f'plane-strut-{sy}', (0.45, sy * 0.48, 0.8), (0.52, sy * 0.62, 0.26), 0.055, body_dark, coll, root)
        torus(f'plane-wheel-{sy}', 0.15, 0.1, tyre, coll, root, (0.52, sy * 0.66, 0.25), (90.0, 0.0, 0.0))
        blob(f'plane-hub-{sy}', belly, coll, root, (0.52, sy * 0.72, 0.25), (0.1, 0.07, 0.1), seg=(16, 8))
    tail = Vector((-1.15 * math.cos(math.radians(PLANE_TILT)), 0.0, 1.0 - 1.15 * math.sin(math.radians(PLANE_TILT))))
    rod('plane-tail-strut', (tail.x, 0.0, tail.z - 0.05), (tail.x - 0.05, 0.0, 0.14), 0.045, body_dark, coll, root)
    blob('plane-tail-wheel', tyre, coll, root, (tail.x - 0.05, 0.0, 0.11), (0.11, 0.08, 0.11), seg=(16, 8))

    def balloon(d):  # a little narrower toward the knot (−z)
        k = 0.8 + 0.2 * (d.z + 1) / 2
        return Vector((d.x * k, d.y * k, d.z))

    string, shine = mat(p['string'], 0.6), mat(p['cloud'], 0.2)
    knot = (tail.x - 0.1, 0.0, tail.z + 0.5)
    for name, colour, (x, y, z), r in (('red', p['balloonRed'], (-1.9, 0.12, 2.15), 0.4), ('purple', p['balloonPurple'], (-1.15, -0.12, 2.38), 0.36)):
        rod(f'plane-string-{name}', knot, (x, y, z - r * 1.2), 0.02, string, coll, root, seg=8)
        blob(f'plane-balloon-{name}', mat(colour, 0.22), coll, root, (x, y, z), (r, r, r * 1.18), shape=balloon)
        blob(f'plane-balloon-knot-{name}', mat(colour, 0.22), coll, root, (x, y, z - r * 1.2), (0.07, 0.07, 0.06), seg=(12, 6))
        blob(f'plane-balloon-shine-{name}', shine, coll, root, (x + r * 0.42, y + r * 0.62, z + r * 0.45), (r * 0.12, r * 0.14, r * 0.24), (0.0, 0.0, 0.0), seg=(12, 6))


def build_train(root, coll, c):
    """A toy steam engine and one car on a short stub of track (the engine's nose along +x; the corner's yaw turns it
    to a three-quarter view): a green boiler with yellow bands, a red cab roof, a dark chimney with a puff of smoke,
    red wheels with yellow hubs; a red wagon with a white dot; rails on wooden sleepers."""
    t = c['train']
    body, dark, band = mat(t['engine'], 0.32), mat(t['engineDark'], 0.4), mat(t['boilerBand'], 0.35)
    roof, ink, hub = mat(t['cabRoof'], 0.35), mat(t['chimney'], 0.5), mat(t['wheelHub'], 0.35)
    wheel_m, rail = mat(t['wheel'], 0.4), mat(t['rail'], 0.3)
    # The track: two rails on six sleepers.
    for k in range(6):
        rbox(f'train-sleeper-{k}', (0.22, 1.1, 0.07), 0.02, mat(t['sleeper'], 0.7), coll, root, (-1.75 + 0.62 * k, 0.0, 0.035))
    for s in (-1, 1):
        rbox(f'train-rail-{s}', (3.7, 0.08, 0.08), 0.02, rail, coll, root, (-0.2, 0.36 * s, 0.11))
    # The engine (x 0 … 1.9) and the car behind it (x −1.9 … −0.75).
    z0 = 0.15
    rbox('train-footplate', (1.9, 0.92, 0.12), 0.05, dark, coll, root, (0.95, 0.0, z0 + 0.5))
    lathe('train-boiler', rounded_profile(0.36, 0.0, 1.15, 0.25), body, coll, root, (0.75, 0.0, z0 + 0.9), (0.0, 90.0, 0.0))
    blob('train-smokebox', ink, coll, root, (1.88, 0.0, z0 + 0.9), (0.06, 0.33, 0.33), seg=(32, 12))
    for k, x in enumerate((1.0, 1.35, 1.7)):
        torus(f'train-band-{k}', 0.365, 0.035, band, coll, root, (x, 0.0, z0 + 0.9), (0.0, 90.0, 0.0))
    lathe('train-chimney', [(0.0, 0.0), (0.13, 0.0), (0.12, 0.28), (0.17, 0.38), (0.22, 0.46), (0.22, 0.5), (0.0, 0.5)], ink, coll, root, (1.58, 0.0, z0 + 1.16), seg=32)
    blob('train-dome', band, coll, root, (1.2, 0.0, z0 + 1.24), (0.17, 0.17, 0.16), seg=(32, 16))
    smoke = mat(t['smoke'], 0.7)
    for k, (dx, dz, r) in enumerate(((-0.08, 1.8, 0.18), (-0.42, 1.92, 0.22), (-0.86, 1.98, 0.24))):
        blob(f'train-smoke-{k}', smoke, coll, root, (1.58 + dx, 0.0, z0 + dz), (r, r * 0.9, r * 0.85), seg=(24, 12))
    rbox('train-cab', (0.72, 0.96, 0.5), 0.08, body, coll, root, (0.36, 0.0, z0 + 0.83))
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(f'train-post-{sx}-{sy}', (0.36 + 0.3 * sx, 0.4 * sy, z0 + 1.05), (0.36 + 0.3 * sx, 0.4 * sy, z0 + 1.82), 0.04, dark, coll, root, seg=12)
    rbox('train-roof', (0.92, 1.18, 0.12), 0.06, roof, coll, root, (0.36, 0.0, z0 + 1.86))
    rbox('train-cowcatcher', (0.3, 0.8, 0.3), 0.08, roof, coll, root, (1.98, 0.0, z0 + 0.15))
    for k, x in enumerate((0.4, 0.95, 1.5)):
        for sy in (-1, 1):
            blob(f'train-wheel-{k}-{sy}', wheel_m, coll, root, (x, 0.47 * sy, z0 + 0.25), (0.25, 0.07, 0.25), seg=(32, 12))
            blob(f'train-hub-{k}-{sy}', hub, coll, root, (x, 0.53 * sy, z0 + 0.25), (0.08, 0.03, 0.08), seg=(16, 8))
    red, red_dark = mat(t['carRed'], 0.32), mat(t['carRedDark'], 0.4)
    rbox('train-car', (1.15, 0.86, 0.44), 0.1, red, coll, root, (-1.3, 0.0, z0 + 0.62))
    rbox('train-car-inside', (1.0, 0.72, 0.05), 0.03, red_dark, coll, root, (-1.3, 0.0, z0 + 0.83))
    for sy in (-1, 1):
        blob(f'train-car-dot-{sy}', mat(t['trim'], 0.4), coll, root, (-1.3, 0.44 * sy, z0 + 0.6), (0.13, 0.02, 0.13), seg=(24, 8))
        for k, x in enumerate((-1.62, -0.98)):
            blob(f'train-car-wheel-{k}-{sy}', mat(t['carWheel'], 0.5), coll, root, (x, 0.45 * sy, z0 + 0.19), (0.19, 0.06, 0.19), seg=(28, 10))
            blob(f'train-car-hub-{k}-{sy}', hub, coll, root, (x, 0.5 * sy, z0 + 0.19), (0.06, 0.03, 0.06), seg=(12, 8))
    rod('train-coupler', (-0.72, 0.0, z0 + 0.42), (0.02, 0.0, z0 + 0.42), 0.04, ink, coll, root, seg=8)


BUILDERS = {'pen': build_pen, 'stage': build_stage, 'bed': build_bed, 'clinic': build_clinic, 'wardrobe': build_wardrobe, 'garden': build_garden, 'car-wash': build_car_wash, 'plane': build_plane, 'train': build_train}


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
    c = {**params['colours'], **params['art']['home'], 'garden': params['art']['garden'], 'carWash': params['art']['carWash'], 'plane': params['art']['plane'], 'train': params['art']['train']}
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
