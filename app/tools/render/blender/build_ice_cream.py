# Builds art/ice-cream.blend (Tiệm kem, Story 1.8) from the vendored island art/src/map-v3.blend.
#
# Run by `npm run art:build -- ice-cream` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_ice_cream.py -- \
#     --out <tmp>/ice-cream.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), art (flavour colours, chip, creature
# light), draggableMinSize, rowGap, design size and renderScale.
#
# Steps: prune the reference's Tiệm kem preview and the island's own Shiba; re-aim `CamGame2` at eye
# level close to the counter; build the counter (pink front, white top);
# build the chibi Shiba (cute.py: idle at frame 1, lick + tail wag at 10–13; Story 6.1: shiver 20–21,
# sneeze 30–32, grimace 40, nose cream 50, and hit.shiba-nose around the nose);
# the soft procedural cone (plate) and four soft flavour scoops (2026-10-21; sprites, all posed at
# `slot.scoop-2`); the layout
# objects (`hit.*`, `anchor.*`, `slot.*`; hit.counter-top = the white top face) in a hidden `layout`
# collection; render size; save. Story 8.2: the outfit overlays (outfit.py › dress: sprite.shiba-<item> per item).
# Every constant is in Blender world units (metres) unless its name says otherwise.
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import chibi, chibi_materials, key_chibi, soften_scene  # noqa: E402
from outfit import dress  # noqa: E402
from common import (  # noqa: E402
    add_empty, descendants, eval_world_verts, flat_material, hex_to_linear, hull_object, move_to, parse_args,
)


PRUNE_COLLECTIONS = ['GameIce']  # the reference's Tiệm kem preview (counter, scoops, HintRing)
PRUNE_OBJECTS = ['HintRing', 'A_Shiba']  # A_Shiba: the island's own dog (this screen imports its own)
# The round tree behind the counter's right end: its soft shadow edge sat at 3:1 next to slot.scoop-4's
# hint ring (validate:content hint contrast), so it casts none on this screen.
NO_SHADOW_OBJECTS = ['RTr-1.0-1.5']
CAMERA = 'CamGame2'

# --- the counter ---------------------------------------------------------------------------------
COUNTER_CENTRE = (-5.4, -4.38)  # where the reference preview stood, on the road in front of the truck
COUNTER_BASE_Z = 0.45  # island ground
COUNTER_SIZE = (4.6, 0.9, 1.0)  # width (x), depth (y), height (z) of the pink body
COUNTER_TOP_THICKNESS = 0.08
COUNTER_TOP_OVERHANG = 0.06
ROW_Y = -4.40  # the scoop/cone row on the counter top
COUNTER_BEVEL = 0.12  # the soft toy look: rounded body edges
COUNTER_TOP_BEVEL = 0.035
FROST_DRIPS = 14  # white frosting drips under the top's front edge
FROST_DRIP_WIDTH = 0.17
FROST_DRIP_LENGTHS = (0.13, 0.165, 0.2)
FROST_HANG = 0.85  # drip centres this × length below the top: they hang under the lip, clear of the hint rings on the top

# --- the camera (re-aimed CamGame2: eye level, close to the counter) ------------------------------
CAM_LOCATION = (-5.4, -9.6, 3.3)
CAM_TARGET = (-5.4, -3.6, 2.21)  # the row at the top of the lower third: more of the counter front shows
CAM_LENS = 32.0

# --- Shiba -----------------------------------------------------------------------------------------
SHIBA_LOCATION = (-5.4, -2.8, 1.25)  # paws at the counter's back edge on screen (it stands behind the counter)
SHIBA_SCALE = 0.62
SHIBA_YAW_DEG = 25.0  # head towards the camera, a three-quarter view
SHIBA_FUR = ('Main', 'creatureOrange')
SHIBA_LIGHT = ('Main_Light', 'creatureLight')  # face and belly
IDLE_ACTION = '|Idle'
EAT_ACTION = '|Eating'
IDLE_FRAME = 1
HAPPY_FRAMES = [10, 11, 12, 13]
EAT_SOURCE_FRAMES = [3, 6, 8, 6]  # the start of the Eating dip: the head leans to the cone and stays above the counter (later frames hide it)
TAIL_WAG_DEG = 20.0
# Story 6.1: the comic reactions (frames on their own timeline stretch; every frame keys eyes and cream).
SHIVER_FRAMES = [20, 21]  # brr: eyes squeezed, head and tail shaking side to side
SNEEZE_FRAMES = [30, 31, 32]  # wind-up (head back, squint), eyes shut and head further back, the burst forward
GRIMACE_FRAMES = [40]  # a taste of the other flavour: eyes squeezed shut, tongue out, head turned away
NOSE_FRAMES = [50]  # idle with the ice cream left on the nose
SHIBA_STATES = {'idle': [IDLE_FRAME], 'happy': HAPPY_FRAMES, 'shiver': SHIVER_FRAMES, 'sneeze': SNEEZE_FRAMES,
                'grimace': GRIMACE_FRAMES, 'nose': NOSE_FRAMES}
SHIVER_ROLL_DEG = 7.0
SHIVER_TAIL_DEG = 8.0
SHIVER_BOB = 0.02
SNEEZE_PITCHES_DEG = [-12.0, -22.0, 18.0]  # negative: head back (the lick pitch is positive, down to the cone)
SNEEZE_EYES = ['squint', 'shut', 'shut']
SNEEZE_BOB = 0.04
GRIMACE_PITCH_DEG = -4.0
GRIMACE_ROLL_DEG = -12.0
GRIMACE_YAW_DEG = 14.0
NOSE_HIT_RADIUS_PX = 30.0  # design px: hit.shiba-nose is a circle this big around the projected nose (to-layout pads it by spacing.hitPad)
NOSE_HIT_POINTS = 24
NOSE_HIT_DEPTH = 0.05  # of the radius, alternately towards and away from the camera
NOSE_CREAM_FLAVOUR = 'strawberry'  # the blob's colour (art.flavour)
# The chibi shiba (cute.py, 2026-10-16) faces the camera, so it needs only a slight turn.
CHIBI_SCALE = 1.0
CHIBI_YAW_DEG = -12.0
CHIBI_LICK_PITCH_DEG = 14.0  # head down towards the cone on the happy frames
CHIBI_BOB = 0.04  # every other happy frame lifts the body this much (unit size)

# --- cone and scoops -------------------------------------------------------------------------------
FLAVOURS = ['strawberry', 'chocolate', 'vanilla', 'mint']
SCOOP_WIDTH_MARGIN = 1.15  # projected width = draggableMinSize × this (the trimmed frame is a bit narrower)
SCOOP_SEAT = 0.25  # cone-1 centre = cone top + this × scoop height
SCOOP_STACK = 0.75  # each further cone slot is this × scoop height higher
CONE_SLOTS = 3
# 2026-10-21: the soft procedural scoop (scoop-local units: a unit sphere deformed, base at z 0).
# A rounded dome with a glossy, wavy "melted" rim that droops a little between its bumps.
SCOOP_SEGMENTS = (64, 32)  # UV sphere (around, rings): enough for a smooth rim, no subdivision modifier
SCOOP_GLOSS = 0.28  # roughness: a glossy cream
SCOOP_RIM_Z = -0.32  # the rim's height on the unit sphere
SCOOP_RIM_WIDTH = 0.2  # its vertical spread (gaussian)
SCOOP_RIM_WAVES = 7  # bumps around the rim
SCOOP_RIM_BULGE = (0.05, 0.11)  # outward push: everywhere on the rim, plus this at a bump's crest
SCOOP_RIM_DROOP = 0.1  # a crest hangs this much lower (the melted drip)
SCOOP_BASE_Z = -0.6  # below this the sphere is pressed flat (it sits on the table or the cone)
SCOOP_SQUASH = 0.88  # the dome's height scale
SCOOP_RIM_PHASE_DEG = -90.0  # a rim crest faces the camera (-y)
CHIP_SIZE = (0.11, 0.08, 0.05)  # the chocolate chips: soft flattened drops
CHIPS = [(28, 300), (40, 200), (45, 255), (52, 330), (60, 220), (34, 20), (62, 275), (70, 310)]  # (polar° from up, azimuth°; -y faces the camera)
CHIP_RAISE = 0.4  # of the chip's thickness above the surface
BERRY_SIZE = (0.36, 0.33, 0.4)  # the strawberry on top (scoop-local)
BERRY_TAPER = 0.5  # its tip narrows this much
BERRY_SINK = 0.18  # of its height, into the scoop
BERRY_SEEDS = [(60, 250), (80, 290), (95, 245), (75, 205), (110, 275), (115, 220), (55, 310), (100, 320)]  # (polar° from up, azimuth°) on the berry
BERRY_SEED_SIZE = (0.035, 0.02, 0.05)
BERRY_LEAVES = 5
BERRY_LEAF_SIZE = (0.2, 0.085, 0.035)
MINT_LEAF_SIZE = (0.4, 0.2, 0.05)
MINT_LEAVES = [(-30.0, 0.12, -40.0), (35.0, -0.12, 40.0)]  # (yaw°, x offset, tilt°) of the two leaves on top, raised to show from the front
# The soft cone: a lathed body with a rounded tip, a rolled rim and light waffle lines (material).
CONE_TOP_OF_SCOOP = 0.8  # the rim's outer width = this × the scoop's width
CONE_HEIGHT_OF_WIDTH = 1.3  # the cone is this × its top width tall
CONE_TIP_ROUND = 0.12  # the rounded tip's radius, of the top radius
CONE_RIM_THICK = 0.13  # the rolled rim's minor radius, of the top radius
CONE_SEGMENTS = 48
CONE_RINGS = 24
CONE_GLOSS = 0.5
WAFFLE_AROUND = 5  # waffle diamonds around the cone (each way)
WAFFLE_LINE = (0.12, 0.3)  # |sin| below the first is a full line, above the second plain cone

RENDER_SIZE = (2048, 1536)
MAX_SHIBA_HULL_VERTS = 4000


def fail(msg):
    raise RuntimeError(f'build_ice_cream: {msg}')


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
        if o is not None:
            remove_tree(o)
    for name in NO_SHADOW_OBJECTS:
        o = bpy.data.objects.get(name)
        if o is None:
            fail(f'object "{name}" (no shadow) not found')
        o.visible_shadow = False


def box(name, centre, size, mat_side, mat_top, coll):
    """An axis-aligned box; the +z face gets `mat_top`, every other face `mat_side`."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat_side)
    me.materials.append(mat_top)
    for poly in me.polygons:
        poly.material_index = 1 if poly.normal.z > 0.5 else 0
    o = bpy.data.objects.new(name, me)
    o.location = centre
    coll.objects.link(o)
    return o


def aim_camera(scene):
    cam = bpy.data.objects.get(CAMERA)
    if cam is None:
        fail(f'camera "{CAMERA}" not found')
    cam.location = CAM_LOCATION
    direction = Vector(CAM_TARGET) - Vector(CAM_LOCATION)
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = CAM_LENS
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


def bounds(pts):
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def find_action(suffix):
    for a in bpy.data.actions:
        if a.name.endswith(suffix):
            return a
    fail(f'action "*{suffix}" not found in ShibaInu.fbx')


def assign_action(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    if action is not None and hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots) > 0:
        ad.action_slot = action.slots[0]


def lateral_axis(arm, pb):
    """The bone's local axis (x or z) closest to world up: rotating about it swings the bone sideways."""
    m = arm.matrix_world.to_3x3() @ pb.bone.matrix_local.to_3x3()
    x, z = m.col[0], m.col[2]
    return 'X' if abs(x.z) >= abs(z.z) else 'Z'


def pose_shiba(scene, arm):
    """Keys frame 1 (Idle) and 10–13 (Eating: the lick, tail bones wagging ±20° alternately)."""
    idle = find_action(IDLE_ACTION)
    eat = find_action(EAT_ACTION)
    plan = [(IDLE_FRAME, idle, int(idle.frame_range[0]), 0)]
    for i, (tf, sf) in enumerate(zip(HAPPY_FRAMES, EAT_SOURCE_FRAMES)):
        plan.append((tf, eat, sf, 1 if i % 2 == 0 else -1))
    poses = []
    for tf, action, sf, wag in plan:
        assign_action(arm, action)
        scene.frame_set(sf)
        poses.append((tf, wag, {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}))
    assign_action(arm, None)
    tails = [pb for pb in arm.pose.bones if 'Tail' in pb.name]
    if not tails:
        print('build_ice_cream: WARNING no pose bone named *Tail* — the happy frames keep no wag')
    for tf, wag, pose in poses:
        for pb in arm.pose.bones:
            pb.matrix_basis = pose[pb.name]
        if wag:
            for pb in tails:
                rot = Matrix.Rotation(math.radians(TAIL_WAG_DEG * wag), 4, lateral_axis(arm, pb))
                pb.matrix_basis = pb.matrix_basis @ rot
        for pb in arm.pose.bones:
            pb.keyframe_insert('location', frame=tf)
            pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=tf)
            pb.keyframe_insert('scale', frame=tf)
    scene.frame_set(IDLE_FRAME)


def round_counter(body, top, white, coll):
    """The soft toy counter: rounded edges and a row of white frosting drips under the top's front edge."""
    for o, width in ((body, COUNTER_BEVEL), (top, COUNTER_TOP_BEVEL)):
        b = o.modifiers.new('cute-round', 'BEVEL')
        b.width = width
        b.segments = 6
    cx, cy = COUNTER_CENTRE
    w, d, h = COUNTER_SIZE
    front_y = cy - d / 2 - COUNTER_TOP_OVERHANG
    under_z = COUNTER_BASE_Z + h
    for i in range(FROST_DRIPS):
        x = cx - w / 2 + 0.1 + (w - 0.2) * i / (FROST_DRIPS - 1)
        r = FROST_DRIP_LENGTHS[i % len(FROST_DRIP_LENGTHS)]
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1.0, location=(x, front_y, under_z - r * FROST_HANG))
        drip = bpy.context.object
        drip.name = f'counter-frost-{i}'
        drip.scale = (FROST_DRIP_WIDTH, 0.08, r)
        drip.data.materials.append(white)
        drip.data.shade_smooth()
        move_to(drip, coll)


def build_shiba(scene, params, coll):
    """The chibi toy shiba (cute.py): idle at frame 1; happy 10–13 = head down to the cone with the
    tongue out, tail wagging ±TAIL_WAG_DEG and a small bounce."""
    colours = {**params['colours'], 'creatureLight': params['art']['creatureLight']}
    mats = chibi_materials(colours, colours[SHIBA_FUR[1]], colours[SHIBA_LIGHT[1]])
    mats['cream'] = flat_material('shiba-nose-cream', params['art']['flavour'][NOSE_CREAM_FLAVOUR], 0.35)
    rig = chibi('dog', 'shiba', coll, mats, nose_cream=True)
    root = rig['root']
    root.location = SHIBA_LOCATION
    root.rotation_euler = (0.0, 0.0, math.radians(CHIBI_YAW_DEG))
    root.scale = (CHIBI_SCALE,) * 3
    plain = {'eyes': 'open', 'nose_cream': False}
    key_chibi(rig, IDLE_FRAME, **plain)
    for i, tf in enumerate(HAPPY_FRAMES):
        wag = 1 if i % 2 == 0 else -1
        key_chibi(rig, tf, head_pitch=CHIBI_LICK_PITCH_DEG, head_roll=4.0 * wag, tail=TAIL_WAG_DEG * wag,
                  tongue=True, bob=CHIBI_BOB * (i % 2), **plain)
    # Story 6.1: shiver, sneeze, grimace and the nose cream (the chibi rig's pivots + eye/cream scales only).
    for i, tf in enumerate(SHIVER_FRAMES):
        side = 1 if i % 2 == 0 else -1
        key_chibi(rig, tf, head_roll=SHIVER_ROLL_DEG * side, tail=SHIVER_TAIL_DEG * side, bob=SHIVER_BOB * (i % 2),
                  eyes='squint', nose_cream=False)
    for i, tf in enumerate(SNEEZE_FRAMES):
        key_chibi(rig, tf, head_pitch=SNEEZE_PITCHES_DEG[i], bob=SNEEZE_BOB if i == len(SNEEZE_FRAMES) - 1 else 0.0,
                  eyes=SNEEZE_EYES[i], nose_cream=False)
    for tf in GRIMACE_FRAMES:
        key_chibi(rig, tf, head_pitch=GRIMACE_PITCH_DEG, head_roll=GRIMACE_ROLL_DEG, head_yaw=GRIMACE_YAW_DEG,
                  tongue=True, eyes='shut', nose_cream=False)
    for tf in NOSE_FRAMES:
        key_chibi(rig, tf, eyes='open', nose_cream=True)
    scene.frame_set(IDLE_FRAME)
    return rig, [root, *descendants(root)[1:]]


def nose_hit_points(screen, cam, nose_world):
    """Story 6.1: a ring of NOSE_HIT_POINTS world points around the nose in the camera's view plane,
    NOSE_HIT_RADIUS_PX design px in radius (hit.shiba-nose is their hull)."""
    right = cam.matrix_world.to_3x3().col[0].normalized()
    up = cam.matrix_world.to_3x3().col[1].normalized()
    back = cam.matrix_world.to_3x3().col[2].normalized()  # a little depth, so the convex hull is not flat
    centre = screen.project(nose_world)

    def ring(r):
        pts = []
        for k in range(NOSE_HIT_POINTS):
            t = 2 * math.pi * k / NOSE_HIT_POINTS
            depth = back * (r * NOSE_HIT_DEPTH * (1 if k % 2 == 0 else -1))
            pts.append(nose_world + right * (r * math.cos(t)) + up * (r * math.sin(t)) + depth)
        return pts

    def mean_px(pts):
        return sum(math.hypot(q[0] - centre[0], q[1] - centre[1]) for q in map(screen.project, pts)) / len(pts)

    # Fit the world radius to the projected one (a couple of rescales absorb the perspective).
    r = 0.1
    for _ in range(4):
        r *= NOSE_HIT_RADIUS_PX / mean_px(ring(r))
    pts = ring(r)
    print(f'build_ice_cream: hit.shiba-nose radius {mean_px(pts):.1f} design px')
    return pts


# --- 2026-10-21: the soft procedural scoops and cone (no Kenney models, no subdivision modifiers) ----

def _sphere_bm(segments):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments[0], v_segments=segments[1], radius=1.0)
    return bm


def _smooth_object(name, bm, mat, coll, parent=None):
    """A smooth-shaded mesh object from `bm` (freed), marked `cute` so soften_scene keeps it smooth."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    o.parent = parent
    o['cute'] = 1
    return o


def scoop_shape(d):
    """A unit-sphere direction → the soft scoop's surface point (scoop-local, base at z 0): a rounded dome
    with a glossy wavy rim (bulged, its crests drooping like melted cream) and a flat base."""
    x, y, z = d
    phi = math.atan2(y, x)
    rim = math.exp(-((z - SCOOP_RIM_Z) / SCOOP_RIM_WIDTH) ** 2)
    wave = 0.5 + 0.5 * math.cos(SCOOP_RIM_WAVES * (phi - math.radians(SCOOP_RIM_PHASE_DEG)))
    s = 1.0 + rim * (SCOOP_RIM_BULGE[0] + SCOOP_RIM_BULGE[1] * wave)
    z2 = max(SCOOP_BASE_Z, z - rim * SCOOP_RIM_DROOP * wave)
    return Vector((x * s, y * s, (z2 - SCOOP_BASE_Z) * SCOOP_SQUASH))


def berry_shape(d):
    """A unit-sphere direction → the strawberry's surface (berry-local, centred): wide at the bottom, its
    tip narrowing upwards."""
    x, y, z = d
    t = (z + 1.0) / 2.0
    k = 1.0 - BERRY_TAPER * t * t
    return Vector((x * k * BERRY_SIZE[0], y * k * BERRY_SIZE[1], z * BERRY_SIZE[2]))


def _direction(polar_deg, azimuth_deg):
    t, a = math.radians(polar_deg), math.radians(azimuth_deg)
    return Vector((math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t)))


def shape_point(shape, polar_deg, azimuth_deg):
    """The point of `shape` in a direction and its outward normal (finite differences)."""
    eps = 0.5
    p = shape(_direction(polar_deg, azimuth_deg))
    du = shape(_direction(polar_deg + eps, azimuth_deg)) - shape(_direction(polar_deg - eps, azimuth_deg))
    dv = shape(_direction(polar_deg, azimuth_deg + eps)) - shape(_direction(polar_deg, azimuth_deg - eps))
    n = du.cross(dv)
    if n.dot(_direction(polar_deg, azimuth_deg)) < 0:
        n = -n
    return p, n.normalized()


def _stud(name, size, mat, coll, parent, loc, normal):
    """A soft flattened drop (chip, seed) on a surface: its thin axis along `normal`."""
    o = _smooth_object(name, _sphere_bm((16, 8)), mat, coll, parent)
    o.scale = size
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = normal.to_track_quat('Z', 'Y')
    o.location = loc + normal * size[2] * CHIP_RAISE
    return o


def make_scoop(name, scale, mat, location, coll):
    """The soft scoop (scoop_shape) as one smooth mesh, scaled and placed."""
    bm = _sphere_bm(SCOOP_SEGMENTS)
    for v in bm.verts:
        v.co = scoop_shape(v.co.normalized())
    o = _smooth_object(name, bm, mat, coll)
    o.location = location
    o.scale = (scale,) * 3
    return o


def scoop_top():
    return scoop_shape(Vector((0.0, 0.0, 1.0))).z


def add_chips(mesh, chip_mat, coll):
    return [_stud(f'{mesh.name}-chip-{i + 1}', CHIP_SIZE, chip_mat, coll, mesh, *shape_point(scoop_shape, polar, azimuth))
            for i, (polar, azimuth) in enumerate(CHIPS)]


def add_strawberry(mesh, mats, coll):
    """A soft strawberry on top: a red berry (tip up) with yellow seeds and a ring of green leaves."""
    bm = _sphere_bm((32, 16))
    for v in bm.verts:
        v.co = berry_shape(v.co.normalized())
    berry = _smooth_object(f'{mesh.name}-strawberry', bm, mats['berry'], coll, mesh)
    berry.location = (0.0, 0.0, scoop_top() + BERRY_SIZE[2] * (1.0 - 2.0 * BERRY_SINK))
    out = [berry]
    for i, (polar, azimuth) in enumerate(BERRY_SEEDS):
        p, n = shape_point(berry_shape, polar, azimuth)
        out.append(_stud(f'{mesh.name}-seed-{i + 1}', BERRY_SEED_SIZE, mats['seed'], coll, berry, p, n))
    base_z = -BERRY_SIZE[2] * (1.0 - BERRY_SINK * 1.6)
    for i in range(BERRY_LEAVES):
        a = 2 * math.pi * (i + 0.5) / BERRY_LEAVES
        leaf = _smooth_object(f'{mesh.name}-berry-leaf-{i + 1}', _sphere_bm((20, 10)), mats['berryLeaf'], coll, berry)
        leaf.scale = BERRY_LEAF_SIZE
        r = BERRY_SIZE[0] * 0.95
        leaf.location = (r * math.cos(a), r * math.sin(a), base_z)
        leaf.rotation_euler = (0.0, math.radians(-15.0), a)
        out.append(leaf)
    return out


def _leaf_bm():
    """A pointed, slightly curled leaf (unit length 2 along x)."""
    bm = _sphere_bm((24, 12))
    for v in bm.verts:
        x, y, z = v.co
        v.co = Vector((x, y * math.sqrt(max(0.0, 1.0 - x * x)), z + 0.25 * x * x))
    return bm


def add_leaves(mesh, leaf_mat, coll):
    out = []
    for i, (yaw, dx, tilt) in enumerate(MINT_LEAVES):
        leaf = _smooth_object(f'{mesh.name}-leaf-{i + 1}', _leaf_bm(), leaf_mat, coll, mesh)
        leaf.scale = MINT_LEAF_SIZE
        leaf.location = (dx + math.copysign(MINT_LEAF_SIZE[0] * 0.55, dx), -0.15, scoop_top() - 0.06)
        leaf.rotation_euler = (0.0, math.radians(tilt), math.radians(yaw))
        out.append(leaf)
    return out


def waffle_material(name, base_hex, line_hex, top_radius):
    """The cone's colour with light waffle lines: two families of helices (object space) crossing in
    diamonds, |sin| near zero drawn in the line colour."""
    m = flat_material(name, base_hex, CONE_GLOSS)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sep.inputs[0])

    def math_node(op, a, b=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    phi = math_node('ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    k = float(WAFFLE_AROUND)
    m_z = 2.0 * k / top_radius  # square diamonds half way up
    around = math_node('MULTIPLY', phi, k)
    up = math_node('MULTIPLY', sep.outputs['Z'], m_z)
    s1 = math_node('ABSOLUTE', math_node('SINE', math_node('ADD', around, up)))
    s2 = math_node('ABSOLUTE', math_node('SINE', math_node('SUBTRACT', around, up)))
    near = math_node('MINIMUM', s1, s2)
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.interpolation_type = 'SMOOTHSTEP'
    ramp.inputs['From Min'].default_value = WAFFLE_LINE[0]
    ramp.inputs['From Max'].default_value = WAFFLE_LINE[1]
    ramp.inputs['To Min'].default_value = 1.0
    ramp.inputs['To Max'].default_value = 0.0
    nt.links.new(near, ramp.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = hex_to_linear(base_hex)
    mix.inputs['B'].default_value = hex_to_linear(line_hex)
    nt.links.new(ramp.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    return m


def make_cone(mat, coll):
    """The soft cone (cone-local, unit top radius, tip at z 0): a lathed body with a rounded tip, a rolled
    rim and a shallow top. Returns the objects and the rim's outer width."""
    r_top = 1.0
    width = 2.0 * r_top * (1.0 + CONE_RIM_THICK)
    height = CONE_HEIGHT_OF_WIDTH * width
    beta = math.atan(r_top / height)
    a = CONE_TIP_ROUND * r_top
    zc = a / math.sin(beta)
    shift = zc - a
    profile = []  # (r, z) from the tip up
    cap_rings = 6
    for i in range(1, cap_rings + 1):
        al = (math.pi / 2 - beta) * i / cap_rings
        profile.append((a * math.sin(al), zc - a * math.cos(al) - shift))
    r0, z0 = profile[-1]
    for i in range(1, CONE_RINGS + 1):
        t = i / CONE_RINGS
        profile.append((r0 + (r_top - r0) * t, z0 + (height - shift - z0) * t))
    top_z = profile[-1][1]
    bm = bmesh.new()
    tip = bm.verts.new((0.0, 0.0, 0.0))
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / CONE_SEGMENTS), r * math.sin(2 * math.pi * j / CONE_SEGMENTS), z))
                      for j in range(CONE_SEGMENTS)])
    centre = bm.verts.new((0.0, 0.0, top_z - CONE_RIM_THICK * r_top))
    n = CONE_SEGMENTS
    for j in range(n):
        bm.faces.new((tip, rings[0][(j + 1) % n], rings[0][j]))
        for k in range(len(rings) - 1):
            bm.faces.new((rings[k][j], rings[k][(j + 1) % n], rings[k + 1][(j + 1) % n], rings[k + 1][j]))
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % n], centre))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = _smooth_object('cone-body', bm, mat, coll)
    bpy.ops.mesh.primitive_torus_add(major_radius=r_top, minor_radius=CONE_RIM_THICK * r_top, major_segments=CONE_SEGMENTS,
                                     minor_segments=16, location=(0.0, 0.0, top_z))
    rim = bpy.context.object
    rim.name = 'cone-rim'
    rim.data.materials.append(mat)
    rim.data.shade_smooth()
    rim['cute'] = 1
    move_to(rim, coll)
    rim.parent = body
    return body, width


def visible_bottom_z(screen, x, y, z0, z1, y_max):
    """Lowest z of the vertical segment (x, y, z0..z1) that projects at or above design y `y_max`."""
    if screen.project((x, y, z0))[1] <= y_max:
        return z0
    lo, hi = z0, z1
    for _ in range(40):
        mid = (lo + hi) / 2
        if screen.project((x, y, mid))[1] > y_max:
            lo = mid
        else:
            hi = mid
    return hi


def counter_upper_points(body, top, screen, y_max):
    """Top slab vertices plus the upper half of the body's front face as seen on screen: the front
    face runs past the bottom of the frame, so its half is taken down to design y `y_max` (the
    interactive rect's bottom)."""
    (x0, x1), (y0, _y1), (z0, z1) = bounds([body.matrix_world @ v.co for v in body.data.vertices])
    zm = (visible_bottom_z(screen, (x0 + x1) / 2, y0, z0, z1, y_max) + z1) / 2
    front = [Vector((x, y0, z)) for x in (x0, x1) for z in (zm, z1)]
    return [top.matrix_world @ v.co for v in top.data.vertices] + front


def counter_top_points(top):
    """The top slab's upper face (world): its vertices at the slab's highest z."""
    pts = [top.matrix_world @ v.co for v in top.data.vertices]
    z1 = max(p.z for p in pts)
    return [p for p in pts if p.z > z1 - 1e-6]


def visible_vertices(scene, depsgraph, objs):
    """World vertices of `objs` that the camera sees (no other object in between)."""
    cam = scene.camera.matrix_world.translation
    own = {o.name for o in objs}
    out = []
    for p in eval_world_verts(objs, depsgraph):
        d = p - cam
        dist = d.length
        hit, _loc, _n, _i, obj, _m = scene.ray_cast(depsgraph, cam, d.normalized(), distance=dist - 1e-3)
        if not hit or obj.original.name in own:
            out.append(p)
    return out


def thin(points, limit):
    step = max(1, math.ceil(len(points) / limit))
    return points[::step]


def main():
    args = parse_args('build_ice_cream')
    params = args['params']
    colours, art = params['colours'], params['art']
    colours = {**colours, 'creatureLight': art['creatureLight']}
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100

    prune()
    aim_camera(scene)

    plate = bpy.data.collections.new('IceCreamShop')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)

    # Counter: the pink body and the white top slab.
    pink = flat_material('counter-pink', colours['counterPink'])
    white = flat_material('counter-top', colours['counterTop'])
    cx, cy = COUNTER_CENTRE
    w, d, h = COUNTER_SIZE
    body = box('counter-pink', (cx, cy, COUNTER_BASE_Z + h / 2), (w, d, h), pink, pink, plate)
    top_z = COUNTER_BASE_Z + h + COUNTER_TOP_THICKNESS
    o2 = 2 * COUNTER_TOP_OVERHANG
    top = box('counter-top', (cx, cy, COUNTER_BASE_Z + h + COUNTER_TOP_THICKNESS / 2), (w + o2, d + o2, COUNTER_TOP_THICKNESS), white, white, plate)
    round_counter(body, top, white, plate)

    # Shiba.
    shiba_coll = bpy.data.collections.new('sprite.shiba')
    sprites.children.link(shiba_coll)
    shiba_coll['states'] = json.dumps(SHIBA_STATES, separators=(',', ':'))
    shiba_coll['holdout_occluders'] = 1
    # It bounces and breathes at runtime and stands on nothing the camera sees: no shadow in the plate.
    shiba_coll['movable'] = 1
    shiba_rig, shiba = build_shiba(scene, params, shiba_coll)

    bpy.context.view_layer.update()
    screen = Screen(scene, params)

    # Scoop scale: the projected width at the row is at least draggableMinSize × margin.
    probe = make_scoop('scoop-probe', 1.0, white, (cx, ROW_Y, top_z), plate)
    bpy.context.view_layer.update()
    (px0, px1), _y, _z = bounds([probe.matrix_world @ v.co for v in probe.data.vertices])
    unit_px = abs(screen.project((px1, ROW_Y, top_z))[0] - screen.project((px0, ROW_Y, top_z))[0])
    bpy.data.objects.remove(probe, do_unlink=True)
    scoop_scale = params['draggableMinSize'] * SCOOP_WIDTH_MARGIN / unit_px
    scoop_width = (px1 - px0) * scoop_scale

    # Row x positions: rowGap design px apart at the row depth.
    px_per_m = abs(screen.project((cx + 1.0, ROW_Y, top_z))[0] - screen.project((cx, ROW_Y, top_z))[0])
    gap = params['rowGap'] / px_per_m
    row = {'scoop-1': cx - 2 * gap, 'scoop-2': cx - gap, 'cone': cx, 'scoop-3': cx + gap, 'scoop-4': cx + 2 * gap}

    # Cone (plate): the soft lathed cone, its rim CONE_TOP_OF_SCOOP × the scoop's width.
    detail = art['flavourDetail']
    cone_mat = waffle_material('cone-waffle', detail['cone'], detail['coneLine'], 1.0)
    cone, cone_unit_width = make_cone(cone_mat, plate)
    cone.location = (row['cone'], ROW_Y, top_z)
    cone.scale = (CONE_TOP_OF_SCOOP * scoop_width / cone_unit_width,) * 3

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True

    # Shiba: visible hull and ground pivot.
    shiba_meshes = [o for o in shiba if o.type == 'MESH']
    seen = visible_vertices(scene, depsgraph, shiba_meshes)
    if len(seen) < 3:
        fail('Shiba is not visible from the camera')
    hull_object('hit.shiba', thin(seen, MAX_SHIBA_HULL_VERTS), layout)
    all_shiba = eval_world_verts(shiba_meshes, depsgraph)
    (x0, x1), (y0, y1), (z0, _z1) = bounds(all_shiba)
    add_empty('anchor.shiba', ((x0 + x1) / 2, (y0 + y1) / 2, z0), layout)
    # Story 6.1: the nose tap area (idle pose = the nose-cream pose), a circle around the projected nose.
    nose_world = shiba_rig['nose'].evaluated_get(depsgraph).matrix_world.translation.copy()
    hull_object('hit.shiba-nose', nose_hit_points(screen, scene.camera, nose_world), layout)

    # Scoops: one sprite per flavour, all posed at slot.scoop-2.
    chip_mat = flat_material('scoop-chip', detail['chip'], SCOOP_GLOSS)
    leaf_mat = flat_material('scoop-leaf', detail['mintLeaf'], 0.45)
    berry_mats = {
        'berry': flat_material('scoop-berry', detail['berry'], SCOOP_GLOSS),
        'seed': flat_material('scoop-berry-seed', detail['berrySeed'], 0.5),
        'berryLeaf': flat_material('scoop-berry-leaf', detail['berryLeaf'], 0.45),
    }
    scoop_meshes = {}
    for f in FLAVOURS:
        coll = bpy.data.collections.new(f'sprite.scoop-{f}')
        sprites.children.link(coll)
        coll['movable'] = 1
        mesh = make_scoop(f'scoop-{f}', scoop_scale, flat_material(f'scoop-{f}', art['flavour'][f], SCOOP_GLOSS),
                          (row['scoop-2'], ROW_Y, top_z), coll)
        if f == 'strawberry':
            add_strawberry(mesh, berry_mats, coll)
        elif f == 'chocolate':
            add_chips(mesh, chip_mat, coll)
        elif f == 'mint':
            add_leaves(mesh, leaf_mat, coll)
        scoop_meshes[f] = mesh

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    # Cone: ground pivot and the stacked scoop centres.
    cone_pts = eval_world_verts(descendants(cone), depsgraph)
    (x0, x1), (y0, y1), (z0, z1) = bounds(cone_pts)
    add_empty('anchor.cone', ((x0 + x1) / 2, (y0 + y1) / 2, z0), layout)
    scoop_pts = eval_world_verts(descendants(scoop_meshes['vanilla']), depsgraph)
    _x, _y, (sz0, sz1) = bounds(scoop_pts)
    scoop_h = sz1 - sz0
    for n in range(1, CONE_SLOTS + 1):
        z = z1 + scoop_h * (SCOOP_SEAT + SCOOP_STACK * (n - 1))
        add_empty(f'slot.cone-{n}', ((x0 + x1) / 2, (y0 + y1) / 2, z), layout)

    # Scoop homes on the counter top.
    for k in range(1, 5):
        add_empty(f'slot.scoop-{k}', (row[f'scoop-{k}'], ROW_Y, top_z), layout)

    # Counter areas.
    hull_object('hit.counter', eval_world_verts([body, top], depsgraph), layout)
    hull_object('hit.counter-upper', counter_upper_points(body, top, screen, params['rect']['y1']), layout)
    # 2026-10-21: the white top face (resting scoops lie on its row; to-layout keeps it unpadded).
    hull_object('hit.counter-top', counter_top_points(top), layout)

    # Diagnostics (design px).
    print(f'build_ice_cream: nose → {tuple(round(v, 1) for v in screen.project(nose_world))}')
    for name in ['anchor.shiba', 'anchor.cone', 'slot.scoop-1', 'slot.scoop-2', 'slot.cone-1', 'slot.scoop-4']:
        o = bpy.data.objects[name]
        print(f'build_ice_cream: {name} → {tuple(round(v, 1) for v in screen.project(o.location))}')
    sp = [screen.project(p) for p in seen]
    print(f'build_ice_cream: Shiba visible y {min(p[1] for p in sp):.1f}..{max(p[1] for p in sp):.1f}, scoop scale {scoop_scale:.3f}, gap {gap:.3f} m')

    # Story 8.2: the outfit overlays (one sprite.shiba-<item> per item over every Shiba state; the counter and the cone cut them too).
    dress(shiba_rig, shiba_coll, art['dressUp'], params['outfit'])

    scene.frame_set(IDLE_FRAME)
    soften_scene(bpy.context.scene)  # the soft toy look (cute.py), last so every builder-made mesh gets it
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_ice_cream: saved {args["out"]}')


main()
