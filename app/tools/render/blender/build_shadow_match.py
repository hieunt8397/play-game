# Builds art/shadow-match.blend (Hang tìm bóng, Stories 3.5, 3.6) from the vendored island art/src/map-v3.blend.
#
# Run by `npm run art:build -- shadow-match` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_shadow_match.py -- \
#     --out <tmp>/shadow-match.blend --params <tmp>/params.json --items dog,cow,horse,donkey,stag,car,truck,tractor
# params.json (written by build.ts from Tokens and content): colours (hex), art (incl. art.dino and
# art.shadowMatch), shadowMatch {trikeSizePx, itemPx, counts}, design size, renderScale, the interactive rect.
# --items: the content catalogue ids (SHAPE_ITEMS); an id without a row in ITEM_MODELS fails the build.
#
# Steps: prune the reference's Tiệm kem preview, its HintRing, the three station dinos and the `Cave`
# collection; add camera `CamCave` (lens from `CamGame2`) aimed at a script-built cave mouth near the old
# `Cave` spot: a low-poly rock arch (displaced icospheres, flat shading) in colors.caveMouth around a lit
# inner back wall (art.shadowMatch.caveInner, never black) and two flat rock ledges facing the camera,
# left and right of the mouth, lit by emission (LEDGE_EMISSION) so the shadows drawn over them keep
# ≥ 5:1 against colors.shadowTarget on the real render. Story 3.6: each ledge is tall enough for two
# tiers of shadows (LEDGE_SIZE, LEDGE_TIERS), so rows of 3 and 4 shadows stay high and wide of the hand. The gentle Quaternius triceratops (dressed like
# Story 3.3's: common.py › dress_dino; never a meat-eater, never an attack pose) stands centre-back in the
# mouth in a 3/4 front view, head lowered toward the item it holds:
#   1 idle (head offered down) · 10 nod (head a further −12°) · 20–21 happy (head up, tail wag).
# Each catalogue item (Quaternius animals, Kenney vehicles; source colours kept) is posed in side profile
# at one staging spot ITEM_STAGE as its own sprite `item-<id>` (`silhouette`: the render step derives
# `item-<id>/shadow/00` from `item-<id>/color/00`, tools/render/ghost.ts › silhouetteFrame). The layout
# objects go in a hidden `layout` collection; render size; save.
# Every sprite collection here is `movable` (no baked shadow). Every constant is in Blender world units
# (metres) unless its name says otherwise.
import json
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import soften_scene  # noqa: E402
from common import (  # noqa: E402
    add_empty, descendants, dress_dino, eval_world_verts, flat_material, force_opaque, key_constant, move_to, parse_args, principled,
)

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
# The triceratops: the only dinosaur this builder ever imports.
TRIKE_FILE = os.path.join(ASSETS, 'quaternius', 'dinosaurs', 'Triceratops.fbx')
TRIKE_SPECIES = 'triceratops'
TRIKE_PREFIX = 'Triceratops'

PRUNE_COLLECTIONS = ['GameIce', 'Cave']  # the reference's Tiệm kem preview and the island's own cave
PRUNE_OBJECTS = ['HintRing']
STATION_DINOS = ['A_DinoNeck', 'A_DinoTri', 'A_DinoSteg']  # the three station dinos (the fence stays)
LENS_FROM = 'CamGame2'
CAMERA = 'CamCave'

GROUND_Z = 0.45  # the island's grass

# --- the camera: south of the old cave spot (the town is behind it), looking north into the mouth ---
CAM_LOCATION = (6.6, 3.62, 1.32)
CAM_TARGET = (6.6, 6.4, 0.86)

# --- the cave mouth ------------------------------------------------------------------------------------
CAVE_X = 6.52  # the mouth's centre line
ARCH_Y = 6.62  # the arch boulders' centre plane
WALL_Y = 7.15  # the lit inner back wall
HIT_HALF_W = 0.5  # hit.cave: the wall seen through the opening (inside the pillars' inner edges)
HIT_TOP_Z = 1.36  # and below the lintel's lowest stone
WALL_HALF_W = 0.75  # the back wall reaches a little past the opening, hidden behind the pillars
WALL_TOP_Z = 2.0
FLOOR_FRONT_Y = 6.35  # the cave floor (caveMouth) from here to the wall
# Arch boulders: (x offset from CAVE_X, y offset from ARCH_Y, z centre, radius, seed). Displaced
# icospheres around the opening: two pillars and a lintel of stones, a little irregular.
ARCH_STONES = [
    # The left pillar, the lintel and the right pillar (the opening's inner edges ~0.52 from the centre).
    (-0.76, 0.02, 0.62, 0.25, 1), (-0.78, 0.04, 1.02, 0.26, 2), (-0.72, 0.0, 1.42, 0.25, 3),
    (-0.48, 0.02, 1.72, 0.25, 4), (-0.14, 0.0, 1.82, 0.26, 5), (0.2, 0.03, 1.8, 0.26, 6),
    (0.5, 0.0, 1.7, 0.25, 7), (0.73, 0.02, 1.42, 0.25, 8), (0.79, 0.04, 1.02, 0.26, 9),
    (0.76, 0.0, 0.62, 0.25, 10),
    # The rock mass behind and around the arch (the hill the cave is dug into).
    (-1.28, 0.4, 0.8, 0.46, 11), (1.3, 0.4, 0.8, 0.46, 12), (-1.08, 0.45, 1.8, 0.45, 13),
    (1.1, 0.45, 1.85, 0.45, 14), (0.02, 0.5, 2.25, 0.48, 15), (-0.58, 0.5, 2.15, 0.42, 16), (0.62, 0.5, 2.15, 0.42, 17),
]
STONE_SUBDIV = 2
STONE_JITTER = 0.18  # radial displacement ± this fraction of the radius
STONE_SQUASH_Y = 0.75  # stones are a little flatter front to back
ROCK_EMISSION = 0.45  # the rock never reads black, even on its shaded facets
CAVE_INNER_EMISSION = 0.75  # the inner wall is lit (never black, ≥ ui.caveMinLuminance)

# --- the ledges: flat rock slabs facing the camera, left and right of the mouth -------------------------
# name → (foot centre x, foot centre y); every slab stands on the ground and has LEDGE_SIZE.
LEDGES = {
    'left': (5.66, 5.95),
    'right': (7.38, 5.95),
}
LEDGE_SIZE = (0.56, 1.06, 0.18)  # width, height, thickness: room for two tiers of shadows (Story 3.6)
# Stones behind each slab (offsets in the slab's own frame: across, behind, up from its foot; radius,
# seed), so the flat face reads as the cut face of a rock. They never cover the face.
LEDGE_STONES = [(-0.2, 0.2, 0.88, 0.2, 21), (0.2, 0.22, 0.76, 0.22, 22), (0.0, 0.24, 1.06, 0.17, 23)]
LEDGE_EMISSION = 0.9  # tuned until the measured-contrast rule passes (shadowTarget on the ledge ≥ 5:1)
# The heights (world units above the ledge's foot) a shadow centre sits at on a ledge's front face.
# `row2` keeps Story 3.5's row where it was; rows 3 and 4 use two tiers per ledge (and a middle one).
LEDGE_TIERS = {
    'row2': 0.496,
    'upper': 0.81,  # low enough that the shadow clears the Home / Speaker keep-out zones
    'middle': 0.62,
    'lower': 0.34,
}
# Across offsets (world units from the face centre, + = screen right) of the shadow centres.
CENTRE_ACROSS = 0.0
# The lower tier sits a little toward the screen edge, so it stays out of the hand's level-4 snap reach.
LOWER_OUT_ACROSS = 0.04
# The shadow slots per shadow count: (ledge, across, tier). Row 2: one per ledge. Row 3: left upper,
# left lower, right middle. Row 4: two tiers on each ledge.
SHADOW_SPOTS = {
    2: [('left', CENTRE_ACROSS, 'row2'), ('right', CENTRE_ACROSS, 'row2')],
    3: [('left', CENTRE_ACROSS, 'upper'), ('left', -LOWER_OUT_ACROSS, 'lower'), ('right', CENTRE_ACROSS, 'middle')],
    4: [('left', CENTRE_ACROSS, 'upper'), ('left', -LOWER_OUT_ACROSS, 'lower'), ('right', CENTRE_ACROSS, 'upper'), ('right', LOWER_OUT_ACROSS, 'lower')],
}

# --- the triceratops ----------------------------------------------------------------------------------
TRIKE_SPOT = (6.46, 6.62)  # its ground pivot (XY centre of its idle bbox at its lowest z)
TRIKE_FACING_DEG = -78.0  # world heading of the head: towards the camera (−90°), turned a little right (3/4 front)
HAND_AHEAD_M = 0.62  # anchor.triceratops-hand: this far ahead of the ground pivot along the facing
FIT_PASSES = 6
IDLE_FRAME = 1
NOD_FRAME = 10
HAPPY_FRAMES = [20, 21]
TRIKE_FRAMES = [IDLE_FRAME, NOD_FRAME, *HAPPY_FRAMES]
TRIKE_STATES = {'idle': [IDLE_FRAME], 'nod': [NOD_FRAME], 'happy': HAPPY_FRAMES}
HEAD_OFFER_DEG = 14.0  # idle: the head is lowered toward the held item
NOD_EXTRA_DEG = 12.0  # nod: a further 12° down
HEAD_HAPPY_DEG = 10.0  # happy: the head up from the idle pose
TAIL_YAW_DEG = 15.0  # happy: the tail wags ± this
IDLE_SUFFIX = '_Idle'

# --- the items ------------------------------------------------------------------------------------------
# id → (model under assets/, yaw in degrees (world heading of the model's front: 0 = +x = screen right),
# action name suffix for the pose, or None). Every id of the content catalogue must have a row.
ANIMALS = os.path.join('quaternius', 'animals')
CARS = os.path.join('kenney', 'kenney_car-kit', 'Models', 'GLB format')
ITEM_MODELS = {
    'dog': (os.path.join(ANIMALS, 'ShibaInu.fbx'), 0.0, '|Idle'),
    'cow': (os.path.join(ANIMALS, 'Cow.fbx'), 0.0, '|Idle'),
    'horse': (os.path.join(ANIMALS, 'Horse.fbx'), 0.0, '|Idle'),
    # Story 3.6: two more quadrupeds for the same-group level (both files have `AnimalArmature|Idle`).
    'donkey': (os.path.join(ANIMALS, 'Donkey.fbx'), 0.0, '|Idle'),
    'stag': (os.path.join(ANIMALS, 'Stag.fbx'), 0.0, '|Idle'),
    'car': (os.path.join(CARS, 'sedan.glb'), 0.0, None),
    'truck': (os.path.join(CARS, 'truck.glb'), 0.0, None),
    'tractor': (os.path.join(CARS, 'tractor.glb'), 0.0, None),
}
# Models whose front is not their own −y (glTF vehicles face +z → −y after import; the Quaternius animals
# face +y): the extra turn (degrees) that makes `yaw` the heading of the front.
MODEL_FRONT_DEG = {'.fbx': 90.0, '.glb': -90.0}
ITEM_STAGE = (6.6, 5.8)  # every item is rendered here, alone, standing on the ground

RENDER_SIZE = (2048, 1536)


def fail(msg):
    raise RuntimeError(f'build_shadow_match: {msg}')


def warn(msg):
    print(f'build_shadow_match: WARNING {msg}')


def remove_tree(obj):
    for o in reversed(descendants(obj)):
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
        if o is not None:  # HintRing may already be gone with GameIce
            remove_tree(o)
    for name in STATION_DINOS:
        o = bpy.data.objects.get(name)
        if o is None:
            fail(f'station dino "{name}" to prune not found')
        remove_tree(o)


def import_new(op, **kw):
    before = set(bpy.data.objects)
    op(**kw)
    return [o for o in bpy.data.objects if o not in before]


def make_camera(scene):
    src = bpy.data.objects.get(LENS_FROM)
    if src is None:
        fail(f'camera "{LENS_FROM}" not found')
    data = bpy.data.cameras.new(CAMERA)
    data.lens = src.data.lens
    data.sensor_width = src.data.sensor_width
    cam = bpy.data.objects.new(CAMERA, data)
    scene.collection.objects.link(cam)
    cam.location = CAM_LOCATION
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (Vector(CAM_TARGET) - Vector(CAM_LOCATION)).to_track_quat('-Z', 'Y').to_euler()
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


def bounds(pts):
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def emissive(name, hex_colour, strength, roughness=0.9):
    """A flat material whose colour also glows at `strength` (lit, never black)."""
    m = flat_material(name, hex_colour, roughness=roughness)
    bsdf = principled(m)
    bsdf.inputs['Emission Color'].default_value = bsdf.inputs['Base Color'].default_value
    bsdf.inputs['Emission Strength'].default_value = strength
    return m


def link_mesh(name, bm, mat, coll, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


# --- the cave mouth --------------------------------------------------------------------------------------

def stone(name, centre, radius, seed, mat, coll):
    """A low-poly rock: an icosphere with every vertex pushed in or out by a seeded jitter, flat shaded."""
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=STONE_SUBDIV, radius=radius)
    for v in bm.verts:
        v.co *= 1.0 + STONE_JITTER * (2.0 * rng.random() - 1.0)
        v.co.y *= STONE_SQUASH_Y
    o = link_mesh(name, bm, mat, coll)
    o.location = centre
    return o


def quad(name, corners, mat, coll):
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in corners]
    bm.faces.new(vs)
    return link_mesh(name, bm, mat, coll)


def build_cave(params, coll):
    colours = params['colours']
    rock = emissive('cave-rock', colours['caveMouth'], ROCK_EMISSION)
    inner = emissive('cave-inner', params['art']['shadowMatch']['caveInner'], CAVE_INNER_EMISSION)
    floor = emissive('cave-floor', colours['caveMouth'], ROCK_EMISSION)
    stones = [stone(f'CaveStone{i + 1}', (CAVE_X + dx, ARCH_Y + dy, z), r, seed, rock, coll) for i, (dx, dy, z, r, seed) in enumerate(ARCH_STONES)]
    wall = quad('CaveWall', [
        (CAVE_X - WALL_HALF_W, WALL_Y, GROUND_Z), (CAVE_X + WALL_HALF_W, WALL_Y, GROUND_Z),
        (CAVE_X + WALL_HALF_W, WALL_Y, WALL_TOP_Z), (CAVE_X - WALL_HALF_W, WALL_Y, WALL_TOP_Z),
    ], inner, coll)
    cave_floor = quad('CaveFloor', [
        (CAVE_X - WALL_HALF_W, FLOOR_FRONT_Y, GROUND_Z + 0.004), (CAVE_X + WALL_HALF_W, FLOOR_FRONT_Y, GROUND_Z + 0.004),
        (CAVE_X + WALL_HALF_W, WALL_Y, GROUND_Z + 0.004), (CAVE_X - WALL_HALF_W, WALL_Y, GROUND_Z + 0.004),
    ], floor, coll)
    return {'stones': stones, 'wall': wall, 'floor': cave_floor}


def build_ledges(params, coll):
    """The flat rock slabs: a box per ledge, its front face square to the camera's view in XY."""
    mat = emissive('cave-ledge', params['colours']['caveMouth'], LEDGE_EMISSION)
    rock = emissive('cave-ledge-rock', params['colours']['caveMouth'], ROCK_EMISSION)
    cam = Vector(CAM_LOCATION)
    out = {}
    w, h, t = LEDGE_SIZE
    for name, (x, y) in LEDGES.items():
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, t, h), verts=bm.verts)
        bmesh.ops.translate(bm, vec=(0.0, 0.0, h / 2), verts=bm.verts)
        o = link_mesh(f'CaveLedge-{name}', bm, mat, coll)
        o.location = (x, y, GROUND_Z)
        # The front face (−y) turned toward the camera.
        to_cam = Vector((cam.x - x, cam.y - y))
        o.rotation_euler = (0.0, 0.0, math.atan2(to_cam.y, to_cam.x) + math.pi / 2)
        bpy.context.view_layer.update()
        for i, (du, dv, dz, r, seed) in enumerate(LEDGE_STONES):
            stone(f'CaveLedge-{name}-stone{i + 1}', o.matrix_world @ Vector((du, dv, dz)), r, seed, rock, coll)
        out[name] = o
    bpy.context.view_layer.update()
    return out


def ledge_point(ledge, across, tier):
    """A world point on the ledge's front face: `across` from its centre line, at LEDGE_TIERS[tier] above its foot."""
    w, h, t = LEDGE_SIZE
    z = LEDGE_TIERS[tier]
    if abs(across) > w / 2 or not 0.0 <= z <= h:
        fail(f'shadow spot ({ledge.name}, {across}, {tier}) is off the ledge face')
    # The front face is the slab's −y; seen from the camera its local +x is screen right.
    local = Vector((across, -t / 2 - 0.001, z))
    return ledge.matrix_world @ local


# --- the triceratops ---------------------------------------------------------------------------------------

def find_action(actions, suffix):
    for a in actions:
        # A re-import of a file the island already holds names its actions `….001`.
        name = a.name.rsplit('.', 1)[0] if a.name.rsplit('.', 1)[-1].isdigit() else a.name
        if name.endswith(suffix) and '_Attack' not in name and 'Attack' not in name.rsplit('|', 1)[-1]:
            return a
    warn(f'action "*{suffix}" not found — the pose stays at rest')
    return None


def assign_action(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    if action is not None and hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots) > 0:
        ad.action_slot = action.slots[0]


def capture_pose(scene, arm, action):
    """The pose bones' matrix_basis at the action's first frame (rest pose without an action)."""
    rest_basis = arm.matrix_basis.copy()
    assign_action(arm, action)
    scene.frame_set(int(action.frame_range[0]) if action else 1)
    pose = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    assign_action(arm, None)
    # The FBX actions may key the armature object itself: back to its imported transform.
    arm.matrix_basis = rest_basis
    if arm.animation_data:
        arm.animation_data.action = None
    return pose


def axis_closest_to(arm, pb, world_dir):
    """The bone's local axis ('X' or 'Z') closest to `world_dir`."""
    m = arm.matrix_world.to_3x3() @ pb.bone.matrix_local.to_3x3()
    x, z = m.col[0].normalized(), m.col[2].normalized()
    return 'X' if abs(x.dot(world_dir)) >= abs(z.dot(world_dir)) else 'Z'


def head_tip_z(arm):
    bpy.context.view_layer.update()
    return (arm.matrix_world @ arm.pose.bones['Head'].tail).z


def pose_trike(scene, arm, actions, lateral):
    """Keys 1 (Idle, head offered down), 10 (nod: a further 12° down), 20–21 (head up, tail wag ±)."""
    idle = find_action(actions, f'{TRIKE_PREFIX}{IDLE_SUFFIX}')
    base = capture_pose(scene, arm, idle)
    head = arm.pose.bones.get('Head')
    tail = arm.pose.bones.get('Tail1')
    if head is None or tail is None:
        warn('no Head/Tail1 bone — every frame keeps the idle pose')
    # The sign of a head pitch that lifts the snout.
    pitch_sign = 1.0
    if head is not None:
        for pb in arm.pose.bones:
            pb.matrix_basis = base[pb.name]
        axis = axis_closest_to(arm, head, lateral)
        z0 = head_tip_z(arm)
        head.matrix_basis = base['Head'] @ Matrix.Rotation(math.radians(HEAD_HAPPY_DEG), 4, axis)
        pitch_sign = 1.0 if head_tip_z(arm) >= z0 else -1.0
    up = Vector((0.0, 0.0, 1.0))
    plan = [
        (IDLE_FRAME, -HEAD_OFFER_DEG, 0),
        (NOD_FRAME, -HEAD_OFFER_DEG - NOD_EXTRA_DEG, 0),
        (HAPPY_FRAMES[0], -HEAD_OFFER_DEG + HEAD_HAPPY_DEG, 1),
        (HAPPY_FRAMES[1], -HEAD_OFFER_DEG + HEAD_HAPPY_DEG, -1),
    ]
    for frame, pitch, wag in plan:
        for pb in arm.pose.bones:
            pb.matrix_basis = base[pb.name]
        if head is not None:
            head.matrix_basis = base['Head'] @ Matrix.Rotation(math.radians(pitch * pitch_sign), 4, axis_closest_to(arm, head, lateral))
        if wag and tail is not None:
            tail.matrix_basis = base['Tail1'] @ Matrix.Rotation(math.radians(TAIL_YAW_DEG * wag), 4, axis_closest_to(arm, tail, up))
        for pb in arm.pose.bones:
            pb.keyframe_insert('location', frame=frame)
            pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=frame)
            pb.keyframe_insert('scale', frame=frame)
    key_constant(arm)
    scene.frame_set(IDLE_FRAME)


def import_trike(params, coll):
    if not os.path.isfile(TRIKE_FILE):
        fail(f'{TRIKE_FILE} is missing')
    before_actions = set(bpy.data.actions)
    new = import_new(bpy.ops.import_scene.fbx, filepath=TRIKE_FILE)
    actions = [a for a in bpy.data.actions if a not in before_actions]
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    meshes = [o for o in new if o.type == 'MESH']
    if arm is None or not meshes:
        fail('Triceratops.fbx has no armature or mesh')
    for o in new:
        move_to(o, coll)
    force_opaque(new)
    # The importer may leave an action active: the eyes are placed on the rest pose.
    assign_action(arm, None)
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    root = add_empty('triceratops-root', (0.0, 0.0, 0.0), coll)
    arm.parent = root
    bpy.context.view_layer.update()
    bones = arm.data.bones
    if 'Head' not in bones or 'Tail1' not in bones:
        fail('Triceratops.fbx: no Head / Tail1 bone')
    hv = arm.matrix_world @ bones['Head'].head_local
    tv = arm.matrix_world @ bones['Tail1'].head_local
    own = math.atan2(hv.y - tv.y, hv.x - tv.x)
    root.rotation_euler = (0.0, 0.0, math.radians(TRIKE_FACING_DEG) - own)
    bpy.context.view_layer.update()
    forward = Vector((math.cos(math.radians(TRIKE_FACING_DEG)), math.sin(math.radians(TRIKE_FACING_DEG)), 0.0))
    lateral = forward.cross(Vector((0.0, 0.0, 1.0))).normalized()
    colours = {'colours': params['colours'], 'dino': params['art']['dino']}
    dressed = dress_dino(arm, meshes, TRIKE_SPECIES, colours, forward, lateral, coll, TRIKE_FRAMES, None, warn)
    pose_trike(bpy.context.scene, arm, actions, lateral)
    return {'root': root, 'arm': arm, 'meshes': meshes, 'visible_eyes': dressed['visible_eyes'], 'forward': forward}


def fit(screen, root, objs, size_px, spot, frame):
    """Scales `root` so the objects' projected longest side at `frame` is size_px (design px), stands
    them on the ground and moves their ground pivot (XY bbox centre) onto `spot`."""
    scene = bpy.context.scene
    for _ in range(FIT_PASSES):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
        x0, y0, x1, y1 = screen.rect(pts)
        k = size_px / max(x1 - x0, y1 - y0)
        root.scale = root.scale * k
        bpy.context.view_layer.update()
        pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
        (bx0, bx1), (by0, by1), (bz0, _bz1) = bounds(pts)
        root.location += Vector((spot[0] - (bx0 + bx1) / 2, spot[1] - (by0 + by1) / 2, GROUND_Z - bz0))
    bpy.context.view_layer.update()


# --- the items ------------------------------------------------------------------------------------------------

def import_item(item_id, coll):
    path, yaw, action_suffix = ITEM_MODELS[item_id]
    full = os.path.join(ASSETS, path)
    if not os.path.isfile(full):
        fail(f'item "{item_id}": {full} is missing')
    ext = os.path.splitext(full)[1].lower()
    before_actions = set(bpy.data.actions)
    if ext == '.fbx':
        new = import_new(bpy.ops.import_scene.fbx, filepath=full)
        force_opaque(new)
    else:
        new = import_new(bpy.ops.import_scene.gltf, filepath=full)
    actions = [a for a in bpy.data.actions if a not in before_actions]
    if not any(o.type == 'MESH' for o in new):
        fail(f'item "{item_id}": {path} has no mesh')
    for o in new:
        move_to(o, coll)
    root = add_empty(f'item-{item_id}-root', (0.0, 0.0, 0.0), coll)
    for o in new:
        if o.parent is None:
            o.parent = root
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    if arm is not None:
        action = find_action(actions, action_suffix) if action_suffix else None
        pose = capture_pose(bpy.context.scene, arm, action)
        assign_action(arm, None)
        for pb in arm.pose.bones:
            pb.matrix_basis = pose[pb.name]
            pb.keyframe_insert('location', frame=IDLE_FRAME)
            pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=IDLE_FRAME)
            pb.keyframe_insert('scale', frame=IDLE_FRAME)
        key_constant(arm)
    root.rotation_euler = (0.0, 0.0, math.radians(yaw + MODEL_FRONT_DEG.get(ext, 0.0)))
    bpy.context.view_layer.update()
    return {'root': root, 'objs': [o for o in new if o.type == 'MESH']}


def main():
    args = parse_args('build_shadow_match', required=('out', 'params', 'items'))
    params = args['params']
    content = params['shadowMatch']
    items = [i for i in args['items'].split(',') if i]
    if not items:
        fail('--items is empty')
    for i in items:
        if i not in ITEM_MODELS:
            fail(f'unknown item id "{i}" (ITEM_MODELS has {", ".join(ITEM_MODELS)})')
    counts = [int(n) for n in content['counts']]
    for n in counts:
        if n not in SHADOW_SPOTS or len(SHADOW_SPOTS[n]) != n:
            fail(f'no SHADOW_SPOTS row of {n} shadows')
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100

    prune()
    make_camera(scene)
    bpy.context.view_layer.update()
    screen = Screen(scene, params)

    plate = bpy.data.collections.new('cave')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True

    cave = build_cave(params, plate)
    ledges = build_ledges(params, plate)

    tcoll = bpy.data.collections.new(f'sprite.{TRIKE_SPECIES}')
    sprites.children.link(tcoll)
    tcoll['states'] = json.dumps(TRIKE_STATES, separators=(',', ':'))
    tcoll['movable'] = 1
    trike = import_trike(params, tcoll)
    fit(screen, trike['root'], trike['meshes'] + trike['visible_eyes'], content['trikeSizePx'], TRIKE_SPOT, IDLE_FRAME)

    built = {}
    for i in items:
        coll = bpy.data.collections.new(f'sprite.item-{i}')
        sprites.children.link(coll)
        coll['states'] = json.dumps({'color': [IDLE_FRAME]}, separators=(',', ':'))
        coll['movable'] = 1
        coll['silhouette'] = 1
        it = import_item(i, coll)
        fit(screen, it['root'], it['objs'], content['itemPx'], ITEM_STAGE, IDLE_FRAME)
        built[i] = it

    bpy.context.view_layer.update()
    scene.frame_set(IDLE_FRAME)
    dg = bpy.context.evaluated_depsgraph_get()
    pts = eval_world_verts(trike['meshes'] + trike['visible_eyes'], dg)
    (x0, x1), (y0, y1), (z0, _z1) = bounds(pts)
    pivot = Vector(((x0 + x1) / 2, (y0 + y1) / 2, z0))
    add_empty('anchor.triceratops', pivot, layout)
    hand = pivot + trike['forward'] * HAND_AHEAD_M
    add_empty('anchor.triceratops-hand', (hand.x, hand.y, GROUND_Z), layout)
    for n in counts:
        for k, (ledge, across, tier) in enumerate(SHADOW_SPOTS[n]):
            add_empty(f'slot.shadow-{n}-{k + 1}', ledge_point(ledges[ledge], across, tier), layout)
    # hit.cave: the opening on the inner wall (the bright area seen through the mouth).
    quad('hit.cave', [
        (CAVE_X - HIT_HALF_W, WALL_Y - 0.002, GROUND_Z), (CAVE_X + HIT_HALF_W, WALL_Y - 0.002, GROUND_Z),
        (CAVE_X + HIT_HALF_W, WALL_Y - 0.002, HIT_TOP_Z), (CAVE_X - HIT_HALF_W, WALL_Y - 0.002, HIT_TOP_Z),
    ], cave['wall'].data.materials[0], layout)

    report(screen, trike, built, ledges, counts, params)
    scene.frame_set(IDLE_FRAME)
    soften_scene(bpy.context.scene)  # the soft toy look (cute.py), last so every builder-made mesh gets it
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_shadow_match: saved {args["out"]}')


def report(screen, trike, built, ledges, counts, params):
    """Diagnostics in design px (the rules themselves run in TypeScript on the render)."""
    scene = bpy.context.scene
    fmt = lambda r: f'({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}×{r[3] - r[1]:.0f}'  # noqa: E731
    for f in TRIKE_FRAMES:
        scene.frame_set(f)
        pts = eval_world_verts(trike['meshes'] + trike['visible_eyes'], bpy.context.evaluated_depsgraph_get())
        print(f'build_shadow_match: triceratops frame {f} {fmt(screen.rect(pts))}')
    scene.frame_set(IDLE_FRAME)
    dg = bpy.context.evaluated_depsgraph_get()
    a = screen.project(bpy.data.objects['anchor.triceratops'].location)
    h = screen.project(bpy.data.objects['anchor.triceratops-hand'].location)
    print(f'build_shadow_match: anchor {a[0]:.0f},{a[1]:.0f} hand {h[0]:.0f},{h[1]:.0f}')
    for i, it in built.items():
        print(f'build_shadow_match: item-{i} {fmt(screen.rect(eval_world_verts(it["objs"], dg)))}')
    for name, o in ledges.items():
        print(f'build_shadow_match: ledge {name} {fmt(screen.rect([o.matrix_world @ v.co for v in o.data.vertices]))}')
    for n in counts:
        for k in range(n):
            s = screen.project(bpy.data.objects[f'slot.shadow-{n}-{k + 1}'].location)
            print(f'build_shadow_match: slot shadow-{n}-{k + 1} {s[0]:.0f},{s[1]:.0f} ({math.dist(s, h):.0f} px from the hand)')
    cave = bpy.data.objects['hit.cave']
    print(f'build_shadow_match: cave {fmt(screen.rect([cave.matrix_world @ v.co for v in cave.data.vertices]))}')


main()
