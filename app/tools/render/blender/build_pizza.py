# Builds art/pizza.blend (Tiệm pizza, Story 3.1) from the vendored island art/src/map-v3.blend.
#
# Run by `npm run art:build -- pizza` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_pizza.py -- \
#     --out <tmp>/pizza.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), art (incl. art.pizza), counterTrayTop,
# draggableMinSize, ovenSize, placedSlicePx, design size, renderScale and the interactive rect.
#
# Steps: prune the reference's Tiệm kem preview and its HintRing; add camera `CamPizza` (lens from
# `CamGame2`) aimed down at a counter in front of the Pizza station; build the counter (butter front,
# white top); import the fox (Quaternius Fox.fbx: recoloured, idle at frame 1, eat 10–13, happy 20–23);
# the bowls with their piles, one sprite per topping (Story 3.2: the game draws only the level's
# bowls); the base (raw/baked), the three topping slices and the oven (rest/ready/baking) as sprites;
# the layout objects in a hidden `layout` collection; render size; save.
# Row in the lower third, left to right: pepper bowl, sausage bowl, base, mushroom bowl, oven.
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
from cute import chibi, chibi_materials, import_joined, key_chibi, soften_scene, tt_model  # noqa: E402
from common import (  # noqa: E402
    add_empty, descendants, eval_world_verts, flat_material, force_opaque, hex_to_linear, hull_object, move_to,
    parse_args, principled, recolor_creature,
)

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
FOX_FBX = os.path.join(ASSETS, 'quaternius', 'animals', 'Fox.fbx')
FOOD_KIT = os.path.join(ASSETS, 'kenney', 'kenney_food-kit', 'Models', 'GLB format')
BOWL_GLB = os.path.join(FOOD_KIT, 'bowl.glb')
MUSHROOM_GLB = os.path.join(FOOD_KIT, 'mushroom-half.glb')
PEPPER_GLB = os.path.join(FOOD_KIT, 'paprika-slice.glb')

PRUNE_COLLECTIONS = ['GameIce', 'Car']  # the reference's Tiệm kem preview (counter, scoops, HintRing) and its parked kid kart
# The pine in front of the counter, and the shop's pizza sign, which would hide the fox from this high camera.
PRUNE_OBJECTS = ['HintRing', 'Pine3.6-5.40', 'Pine3.6-5.41', 'Pine3.6-5.42', 'PTr3.6-5.4', 'Flower10', 'A_PizzaSign']
LENS_FROM = 'CamGame2'
CAMERA = 'CamPizza'

# --- the counter (in front of the Pizza station at (1.9, -1.6)) -----------------------------------
COUNTER_CENTRE = (1.9, -4.6)
COUNTER_BASE_Z = 0.45  # island ground
COUNTER_SIZE = (5.0, 1.5, 0.9)  # width (x), depth (y), height (z) of the butter body
COUNTER_TOP_THICKNESS = 0.08
COUNTER_TOP_OVERHANG = 0.06
ROW_Y = -4.65  # the base row on the counter top
COUNTER_ROUND = 0.1  # the soft toy look: rounded counter edges
COUNTER_TOP_ROUND = 0.035
# The kitchen backdrop: (Tiny Treats model, (dx from the counter centre, y, z), yaw°, scale). The wall
# stands between the fox and the shop, facing the camera.
KITCHEN_WALL_Y = -2.75
KITCHEN_WALL = [
    ('wall_tiles_kitchen_straight', (-3.0, KITCHEN_WALL_Y, 0.45), 0.0, 1.0),
    ('wall_tiles_kitchen_window', (-1.0, KITCHEN_WALL_Y, 0.45), 0.0, 1.0),
    ('wall_tiles_kitchen_straight', (1.0, KITCHEN_WALL_Y, 0.45), 0.0, 1.0),
    ('wall_tiles_kitchen_window', (3.0, KITCHEN_WALL_Y, 0.45), 0.0, 1.0),
    ('wall_shelf_kitchen_hooks_decorated', (-2.2, KITCHEN_WALL_Y - 0.3, 2.3), 0.0, 1.0),
    ('container_kitchen_A_red', (-2.5, KITCHEN_WALL_Y - 0.35, 2.55), 0.0, 1.0),
    ('container_kitchen_B_blue', (-1.9, KITCHEN_WALL_Y - 0.35, 2.55), 0.0, 1.0),
]
BOWL_Y = -5.05  # the bowls stand nearer the front edge, so their slices sit in the lower third

# --- the camera: close to the counter and pitched down, so the 8 base spots stay apart ------------
CAM_LOCATION = (1.9, -7.0, 6.0)
CAM_TARGET = (1.9, -3.6, 1.4)

# --- the row (world x offsets from COUNTER_CENTRE.x) ----------------------------------------------
# Story 3.2: pepper bowl, sausage bowl, base, mushroom bowl, oven (tuned until validatePizza passes).
BASE_DX = -0.352
BOWL_DX = {'pepper': -1.907, 'sausage': -1.332, 'mushroom': 0.718}  # the pepper ring's hint ring stays on the counter
OVEN_DX = 1.84
OVEN_Y = -4.55
FOX_PLATE_DX = 0.0
FOX_PLATE_Y = -4.55

# --- the base --------------------------------------------------------------------------------------
BASE_SIDES = 48
CRUST_TUBE = 0.075  # the puffy crust rim's tube radius
CHEESE_LOBES = 7  # the melted cheese sheet's wavy rim
CHEESE_LOBE_DEPTH = 0.06
CHEESE_BUBBLES = [(0.25, 30, 0.07), (0.42, 150, 0.06), (0.15, 250, 0.08), (0.45, 300, 0.05), (0.05, 90, 0.05)]  # (r, deg, size)
BASE_SPOT_RADIUS = 0.6  # the 8 spots lie on this world circle around the base centre
BASE_RADIUS = 0.78  # dough disc
BASE_THICKNESS = 0.05
SAUCE_RADIUS = 0.7
CHEESE_RADIUS = 0.64
SAUCE_RAISE = 0.006
CHEESE_RAISE = 0.012
BASE_SPOTS = 8
BASE_STATES = {'raw': [1], 'baked': [2]}

# --- toppings and bowls -----------------------------------------------------------------------------
TOPPINGS = ['sausage', 'mushroom', 'pepper']  # content/games/pizza.ts › TOPPINGS
TOPPING_WIDTH_MARGIN = 1.15  # projected width = draggableMinSize × this
PEPPER_HOLE_PROBE = 0.25  # of the ring's outer radius: a ray through this disc must find the hole
PEPPER_RING = {'segments': 48, 'lobes': 3, 'lobe_depth': 0.12, 'outer': 0.5, 'inner': 0.28, 'thickness': 0.12}  # fallback ring
BOWL_STATES = {'idle': [1]}
SAUSAGE_SIDES = 40
MUSHROOM_CAP_W = 1.0  # the toy mushroom slice (unit height): cap width and height above the stem top
MUSHROOM_CAP_H = 0.42
MUSHROOM_STEM_W = 0.36
MUSHROOM_STEM_TOP = 0.05
MUSHROOM_DEPTH = 0.16
MUSHROOM_CAP_SHADE = 0.42  # the cap is the mushroom colour darkened (toasty brown)
BOWL_COLOURS = {'pepper': 'tintMint', 'sausage': 'tintPink', 'mushroom': 'tintSky'}  # ceramic bowls (Tokens colors)
SAUSAGE_RADIUS = 0.5  # local units before the topping scale
SAUSAGE_THICKNESS = 0.12
SAUSAGE_DOT_RADIUS = 0.07
SAUSAGE_DOTS = [(0.0, 0.0), (0.27, 0.12), (-0.25, 0.16), (0.12, -0.27), (-0.17, -0.22)]
BOWL_WIDTH = 0.56  # world width of a bowl (three bowls share the left of the row)
BOWL_HEIGHT_SCALE = 1.4  # the lathed bowl profile is shallow: a little taller reads as a bowl
BOWL_PILE = [(-0.12, 0.05, 25.0), (0.12, 0.04, -20.0), (0.0, -0.08, 5.0)]  # (dx, dy, yaw°) of the static pile
BOWL_PILE_SCALE = 0.45  # of the topping scale
SLICE_ABOVE_BOWL = 0.06  # the slice home sits this far above the bowl rim

# --- the oven ----------------------------------------------------------------------------------------
OVEN_BODY = (1.0, 0.8, 0.62)  # width, depth, height before the size fit
OVEN_DOME_RADIUS = 0.48
OVEN_ROUND = 0.08  # the body's rounded edges
OVEN_CHIMNEY = (0.09, 0.32)  # radius, height
OVEN_ARCH_TUBE = 0.045
OVEN_DOOR = (0.62, 0.05, 0.38)  # width, thickness, height
OVEN_GLASS = (0.42, 0.02, 0.2)
OVEN_DOOR_LIFT = 0.08  # the hinge above the body bottom
OVEN_READY_DEG = 25.0
OVEN_GLASS_DARK = '#3A2A24'
OVEN_GLOW_STRENGTH = 4.0
OVEN_STATES = {'rest': [1], 'ready': [2], 'baking': [3]}

# --- the fox ---------------------------------------------------------------------------------------
FOX_LOCATION = (1.9, -3.55)  # behind the counter, centre-back
FOX_SCALE = 0.45
FOX_YAW_DEG = -45.0  # head towards the camera, a three-quarter view
FOX_FUR = ('Main', 'creatureOrange')
FOX_LIGHT = ('Main_Light', 'creatureLight')  # belly and muzzle stay white
IDLE_ACTION = '|Idle'
EAT_ACTION = '|Eating'
IDLE_FRAME = 1
EAT_FRAMES = [10, 11, 12, 13]
EAT_SOURCE_FRAMES = [3, 6, 8, 6]
HAPPY_FRAMES = [20, 21, 22, 23]
TAIL_WAG_DEG = 20.0
FOX_STATES = {'idle': [IDLE_FRAME], 'eat': EAT_FRAMES, 'happy': HAPPY_FRAMES}
# The chibi fox (cute.py, 2026-10-16) faces the camera, so it needs only a slight turn.
CHIBI_SCALE = 0.62
CHIBI_YAW_DEG = 10.0
CHIBI_LOOK_UP_DEG = -26.0  # the camera is high: the head tips up to face it
CHIBI_EAT_PITCH_DEG = 16.0  # from the look-up pose, down towards the plate
CHIBI_BOB = 0.05

RENDER_SIZE = (2048, 1536)
MAX_HULL_VERTS = 4000


def fail(msg):
    raise RuntimeError(f'build_pizza: {msg}')


WARNED = set()


def warn(msg):
    print(f'build_pizza: WARNING {msg}')


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


def import_new(op, **kw):
    before = set(bpy.data.objects)
    op(**kw)
    return [o for o in bpy.data.objects if o not in before]


def link(o, coll):
    coll.objects.link(o)
    return o


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
    return link(o, coll)


def disc(name, radius, thickness, sides, mat, coll):
    """A flat cylinder standing on z = 0 of its own origin."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=sides, radius1=radius, radius2=radius, depth=thickness)
    for v in bm.verts:
        v.co.z += thickness / 2
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), coll)


def torus_ring(name, major, minor, mat, coll):
    """A smooth torus lying on z = 0 of its own origin (the crust rim, the oven arch)."""
    bm = bmesh.new()
    seg, ring = 64, 16
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        rows.append([bm.verts.new(((major + minor * math.cos(b)) * math.cos(a), (major + minor * math.cos(b)) * math.sin(a), minor * math.sin(b)))
                     for b in (2 * math.pi * j / ring for j in range(ring))])
    for i in range(seg):
        for j in range(ring):
            bm.faces.new((rows[i][j], rows[(i + 1) % seg][j], rows[(i + 1) % seg][(j + 1) % ring], rows[i][(j + 1) % ring]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new(name, me), coll)


def lobed_disc(name, radius, lobes, depth, thickness, mat, coll):
    """A flat sheet whose rim waves `lobes` times (melted cheese), standing on z = 0."""
    bm = bmesh.new()
    n = 96
    rim_lo, rim_hi = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        r = radius * (1.0 - depth * (0.5 + 0.5 * math.sin(lobes * a)) - depth * 0.4 * (0.5 + 0.5 * math.sin(3 * lobes * a + 1.3)))
        rim_lo.append(bm.verts.new((r * math.cos(a), r * math.sin(a), 0.0)))
        rim_hi.append(bm.verts.new((r * math.cos(a), r * math.sin(a), thickness)))
    bm.faces.new(rim_hi)
    bm.faces.new(list(reversed(rim_lo)))
    for i in range(n):
        bm.faces.new((rim_lo[i], rim_lo[(i + 1) % n], rim_hi[(i + 1) % n], rim_hi[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), coll)


def smooth_sphere(name, radius, mat, coll):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=radius)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return link(bpy.data.objects.new(name, me), coll)


def round_edges(obj, width, segments=5):
    """The soft toy look: a bevel modifier on a box or a disc."""
    b = obj.modifiers.new('cute-round', 'BEVEL')
    b.width = width
    b.segments = segments
    b.limit_method = 'ANGLE'
    return obj


def ico(name, radius, mat, coll):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), coll)


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

    def px_per_m(self, p):
        a = self.project(p)
        b = self.project((p[0] + 1.0, p[1], p[2]))
        return abs(b[0] - a[0])


def bounds(pts):
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def key_constant(obj):
    ad = obj.animation_data
    if ad is None or ad.action is None:
        return
    for fc in getattr(ad.action, 'fcurves', []):
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT'


# --- the fox ----------------------------------------------------------------------------------------

def find_action(actions, suffix):
    for a in actions:
        if a.name.endswith(suffix):
            return a
    warn(f'action "*{suffix}" not found in Fox.fbx — frames keep the rest pose')
    return None


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


def pose_fox(scene, arm, actions):
    """Keys frame 1 (Idle), 10–13 (Eating + tail wag) and 20–23 (Idle + tail wag)."""
    idle = find_action(actions, IDLE_ACTION)
    eat = find_action(actions, EAT_ACTION)
    idle_start = int(idle.frame_range[0]) if idle else 1
    plan = [(IDLE_FRAME, idle, idle_start, 0)]
    for i, (tf, sf) in enumerate(zip(EAT_FRAMES, EAT_SOURCE_FRAMES)):
        plan.append((tf, eat if eat else idle, sf if eat else idle_start, 1 if i % 2 == 0 else -1))
    for i, tf in enumerate(HAPPY_FRAMES):
        plan.append((tf, idle, idle_start, 1 if i % 2 == 0 else -1))
    poses = []
    for tf, action, sf, wag in plan:
        assign_action(arm, action)
        scene.frame_set(sf)
        poses.append((tf, wag, {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}))
    assign_action(arm, None)
    tails = [pb for pb in arm.pose.bones if 'Tail' in pb.name and not pb.name.endswith('_end')]
    if not tails:
        warn('no pose bone named *Tail* — the eat and happy frames keep no wag')
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
    key_constant(arm)
    scene.frame_set(IDLE_FRAME)


def build_fox(scene, colours, top_z, coll):
    """The chibi toy fox (cute.py): idle at frame 1; eat 10–13 = head down with the tongue out and the
    tail wagging; happy 20–23 = head up, a bounce and the tail wagging."""
    mats = chibi_materials(colours, colours[FOX_FUR[1]], colours[FOX_LIGHT[1]])
    rig = chibi('fox', 'fox', coll, mats)
    root = rig['root']
    root.location = (FOX_LOCATION[0], FOX_LOCATION[1], top_z)
    root.rotation_euler = (0.0, 0.0, math.radians(CHIBI_YAW_DEG))
    root.scale = (CHIBI_SCALE,) * 3
    key_chibi(rig, IDLE_FRAME, head_pitch=CHIBI_LOOK_UP_DEG)
    for i, tf in enumerate(EAT_FRAMES):
        wag = 1 if i % 2 == 0 else -1
        key_chibi(rig, tf, head_pitch=CHIBI_LOOK_UP_DEG + CHIBI_EAT_PITCH_DEG * (1.0 if i % 2 == 0 else 0.6), tail=TAIL_WAG_DEG * wag, tongue=True)
    for i, tf in enumerate(HAPPY_FRAMES):
        wag = 1 if i % 2 == 0 else -1
        key_chibi(rig, tf, head_pitch=CHIBI_LOOK_UP_DEG - 6.0, head_roll=6.0 * wag, tail=TAIL_WAG_DEG * wag, bob=CHIBI_BOB * (i % 2))
    scene.frame_set(IDLE_FRAME)
    return [root, *descendants(root)[1:]]


def ground_fox(fox_objs, top_z, depsgraph):
    """Moves the fox root so its lowest idle vertex stands on the counter-top height."""
    root = fox_objs[0]
    pts = eval_world_verts([o for o in fox_objs if o.type == 'MESH'], depsgraph)
    _x, _y, (z0, _z1) = bounds(pts)
    root.location.z += top_z - z0


# --- base, toppings, bowls, oven -----------------------------------------------------------------------

def build_base(centre, top_z, art, coll):
    dough = flat_material('pizza-dough', art['dough'])
    bsdf = principled(dough)
    base = disc('base-dough', BASE_RADIUS, BASE_THICKNESS, BASE_SIDES, dough, coll)
    base.location = (centre[0], centre[1], top_z)
    # The soft toy look: a puffy crust rim in the dough material (so it browns with the base on frame 2).
    crust = torus_ring('base-crust', BASE_RADIUS - CRUST_TUBE * 0.9, CRUST_TUBE, dough, coll)
    crust.parent = base
    crust.location = (0.0, 0.0, BASE_THICKNESS + CRUST_TUBE * 0.35)
    sauce = disc('base-sauce', SAUCE_RADIUS, BASE_THICKNESS, BASE_SIDES, flat_material('pizza-sauce', art['sauce']), coll)
    sauce.parent = base
    sauce.location = (0.0, 0.0, SAUCE_RAISE)
    # Baked cheese: a melty lobed sheet with a few soft bubbles (shown by scale on frame 2).
    cheese_mat = flat_material('pizza-cheese', art['cheese'], roughness=0.35)
    cheese = lobed_disc('base-cheese', CHEESE_RADIUS, CHEESE_LOBES, CHEESE_LOBE_DEPTH, BASE_THICKNESS, cheese_mat, coll)
    cheese.parent = base
    cheese.location = (0.0, 0.0, CHEESE_RAISE)
    for i, (r, a, s) in enumerate(CHEESE_BUBBLES):
        bub = smooth_sphere(f'base-cheese-bubble-{i + 1}', s, cheese_mat, coll)
        bub.parent = cheese
        bub.location = (r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), BASE_THICKNESS)
        bub.scale = (1.0, 1.0, 0.45)
    # Frame 1 raw (dough, sauce), frame 2 baked (crust colour, cheese shown by scale — not hide_render,
    # which frame_set would re-apply in the other sprites' passes).
    socket = bsdf.inputs['Base Color']
    socket.default_value = hex_to_linear(art['dough'])
    socket.keyframe_insert('default_value', frame=1)
    socket.default_value = hex_to_linear(art['crust'])
    socket.keyframe_insert('default_value', frame=2)
    cheese.scale = (0.0, 0.0, 0.0)
    cheese.keyframe_insert('scale', frame=1)
    cheese.scale = (1.0, 1.0, 1.0)
    cheese.keyframe_insert('scale', frame=2)
    for owner in (dough.node_tree, cheese):
        ad = owner.animation_data
        if ad and ad.action:
            for fc in getattr(ad.action, 'fcurves', []):
                for kp in fc.keyframe_points:
                    kp.interpolation = 'CONSTANT'
    return base


def sausage_slice(name, art, coll, mats):
    s = round_edges(disc(name, SAUSAGE_RADIUS, SAUSAGE_THICKNESS, SAUSAGE_SIDES, mats['sausage'], coll), SAUSAGE_THICKNESS * 0.4)
    for i, (dx, dy) in enumerate(SAUSAGE_DOTS):
        d = smooth_sphere(f'{name}-dot-{i + 1}', SAUSAGE_DOT_RADIUS, mats['sausageDot'], coll)
        d.scale = (1.0, 1.0, 0.5)
        d.parent = s
        d.location = (dx, dy, SAUSAGE_THICKNESS)
    return s


def extruded_outline(name, outline, depth, mat, coll):
    """A soft slab: the (y, z) `outline` extruded `depth` along x (centred), edges bevelled."""
    bm = bmesh.new()
    front = [bm.verts.new((depth / 2, y, z)) for y, z in outline]
    back = [bm.verts.new((-depth / 2, y, z)) for y, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((back[i], back[(i + 1) % n], front[(i + 1) % n], front[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = link(bpy.data.objects.new(name, me), coll)
    return round_edges(o, depth * 0.35, 4)


def mushroom_slice(name, coll, mats):
    """A cut mushroom slice drawn as a soft toy: a round brown cap over a creamy stem, its cut face
    along local +x (towards the camera after face_camera), unit height centred on its origin."""
    cap_pts = [(MUSHROOM_CAP_W / 2 * math.cos(a), MUSHROOM_STEM_TOP + MUSHROOM_CAP_H * math.sin(a))
               for a in (math.pi * i / 24 for i in range(25))]
    # the arc runs right → over the top → left; the underside closes the loop left → right
    cap_pts += [(-MUSHROOM_CAP_W / 2 * 0.9, MUSHROOM_STEM_TOP - 0.05), (MUSHROOM_CAP_W / 2 * 0.9, MUSHROOM_STEM_TOP - 0.05)]
    stem_pts = [(-MUSHROOM_STEM_W / 2 * 1.15, -0.5), (MUSHROOM_STEM_W / 2 * 1.15, -0.5),
                (MUSHROOM_STEM_W / 2, MUSHROOM_STEM_TOP), (-MUSHROOM_STEM_W / 2, MUSHROOM_STEM_TOP)]
    cap_mat = bpy.data.materials.get('pizza-mushroom-cap')
    if cap_mat is None:
        cream = principled(mats['mushroom']).inputs['Base Color'].default_value
        cap_mat = flat_material('pizza-mushroom-cap', '#000000')
        principled(cap_mat).inputs['Base Color'].default_value = tuple(c * MUSHROOM_CAP_SHADE for c in cream[:3]) + (1.0,)
    holder = bpy.data.objects.new(f'{name}-pose', None)
    link(holder, coll)
    stem = extruded_outline(name, stem_pts, MUSHROOM_DEPTH, mats['mushroom'], coll)
    stem.parent = holder
    cap = extruded_outline(f'{name}-cap', cap_pts, MUSHROOM_DEPTH * 1.1, cap_mat, coll)
    cap.parent = holder
    holder['face'] = 'X'
    holder['up'] = 'Z'
    return holder


def has_centre_hole(mesh):
    """True when rays along the local z axis through the centre disc (PEPPER_HOLE_PROBE of the outer
    radius) all miss the mesh: the ring's hole shows in the silhouette seen face-on."""
    verts = [v.co.copy() for v in mesh.data.vertices]
    polys = [tuple(p.vertices) for p in mesh.data.polygons]
    tree = BVHTree.FromPolygons(verts, polys)
    xs, ys, zs = [v.x for v in verts], [v.y for v in verts], [v.z for v in verts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    r = PEPPER_HOLE_PROBE * max(max(xs) - min(xs), max(ys) - min(ys)) / 2
    top = max(zs) + 1.0
    probes = [(0.0, 0.0)] + [(r * math.cos(a), r * math.sin(a)) for a in (i * math.pi / 4 for i in range(8))]
    return all(tree.ray_cast(Vector((cx + dx, cy + dy, top)), Vector((0.0, 0.0, -1.0)))[0] is None for dx, dy in probes)


def lobed_ring(name, coll, mat):
    """Fallback pepper ring: a flat annulus whose edges bulge into 3 lobes, extruded along z."""
    k = PEPPER_RING
    n, h = k['segments'], k['thickness']
    bm = bmesh.new()
    rings = []
    for radius in (k['outer'], k['inner']):
        for z in (0.0, h):
            rings.append([bm.verts.new((
                radius * (1 + k['lobe_depth'] * math.cos(k['lobes'] * a)) * math.cos(a),
                radius * (1 + k['lobe_depth'] * math.cos(k['lobes'] * a)) * math.sin(a),
                z - h / 2,
            )) for a in (2 * math.pi * i / n for i in range(n))])
    out_lo, out_hi, in_lo, in_hi = rings
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((out_lo[i], out_lo[j], out_hi[j], out_hi[i]))  # outer wall
        bm.faces.new((in_lo[j], in_lo[i], in_hi[i], in_hi[j]))  # inner wall
        bm.faces.new((out_hi[i], out_hi[j], in_hi[j], in_hi[i]))  # top
        bm.faces.new((out_lo[j], out_lo[i], in_lo[i], in_lo[j]))  # bottom
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me), coll)


def pepper_slice(name, coll, mats):
    """Kenney paprika-slice.glb, recoloured: a hollow lobed ring, flat in its local xy, unit-ish size
    centred on its own origin. A GLB whose silhouette has no hole is replaced by `lobed_ring` (warned)."""
    objs = import_new(bpy.ops.import_scene.gltf, filepath=PEPPER_GLB)
    mesh = next((o for o in objs if o.type == 'MESH'), None)
    if mesh is None:
        fail('paprika-slice.glb has no mesh')
    for o in objs:
        if o is not mesh:
            bpy.data.objects.remove(o, do_unlink=True)
    if not has_centre_hole(mesh):
        if 'pepper-ring' not in WARNED:
            WARNED.add('pepper-ring')
            warn('paprika-slice.glb shows no hole face-on — the pepper ring is built by script')
        bpy.data.objects.remove(mesh, do_unlink=True)
        mesh = lobed_ring(name, coll, mats['pepper'])
    else:
        mesh.parent = None
        move_to(mesh, coll)
        mesh.name = name
        mesh.data.materials.clear()
        mesh.data.materials.append(mats['pepper'])
        xs = [v.co.x for v in mesh.data.vertices]
        ys = [v.co.y for v in mesh.data.vertices]
        zs = [v.co.z for v in mesh.data.vertices]
        cx, cy, cz = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2
        size = max(max(xs) - min(xs), max(ys) - min(ys))
        for v in mesh.data.vertices:
            v.co = Vector(((v.co.x - cx) / size, (v.co.y - cy) / size, (v.co.z - cz) / size))
    holder = bpy.data.objects.new(f'{name}-pose', None)
    link(holder, coll)
    mesh.parent = holder
    holder['face'] = 'Z'
    holder['up'] = 'Y'
    return holder


def flat_side(mesh):
    """'X' or '-X': the mushroom half's flat cut face (more vertices on that extreme)."""
    xs = [v.co.x for v in mesh.data.vertices]
    lo, hi = min(xs), max(xs)
    eps = (hi - lo) * 0.05
    n_lo = sum(1 for x in xs if x <= lo + eps)
    n_hi = sum(1 for x in xs if x >= hi - eps)
    return 'X' if n_hi >= n_lo else '-X'


def face_camera(holder, face_axis, up_axis):
    """Turns the holder so its local `face_axis` points at the camera (the slice face reads)."""
    cam = bpy.context.scene.camera.matrix_world.translation
    holder.rotation_mode = 'QUATERNION'
    holder.rotation_quaternion = (cam - holder.location).to_track_quat(face_axis, up_axis)


def topping(t, name, art, coll, mats):
    """A topping slice standing at its own origin (unit size before the topping scale)."""
    if t == 'sausage':
        s = sausage_slice(name, art, coll, mats)
        holder = bpy.data.objects.new(f'{name}-pose', None)
        link(holder, coll)
        s.parent = holder
        s.location = (0.0, 0.0, -SAUSAGE_THICKNESS / 2)
        holder['face'] = 'Z'
        holder['up'] = 'Y'
        return holder
    if t == 'pepper':
        return pepper_slice(name, coll, mats)
    return mushroom_slice(name, coll, mats)


def import_bowl(name, coll, hex_colour):
    """A round ceramic toy bowl (lathed: soft foot, rounded belly, rolled rim), BOWL_WIDTH wide, its
    foot on z = 0 of its own origin."""
    profile = [(0.0, 0.02), (0.30, 0.02), (0.34, 0.0), (0.40, 0.03), (0.47, 0.12), (0.50, 0.24), (0.50, 0.32),
               (0.46, 0.34), (0.44, 0.30), (0.42, 0.20), (0.34, 0.11), (0.0, 0.09)]  # (r, z) outside then inside
    seg = 48
    bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z)) for i in range(seg)]
             for r, z in profile]
    for a, b in zip(rings, rings[1:]):
        for i in range(seg):
            bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(flat_material(f'{name}-glaze', hex_colour, roughness=0.3))
    for p in me.polygons:
        p.use_smooth = True
    mesh = link(bpy.data.objects.new(name, me), coll)
    k = BOWL_WIDTH / 1.0
    mesh.scale = (k, k, k * BOWL_HEIGHT_SCALE)
    return mesh


def kitchen_wall(coll):
    """The cosy pizzeria backdrop behind the fox (Tiny Treats Charming Kitchen, CC0): tiled wall pieces
    with a window, a shelf of mugs and two jars. It hides the shop roof the high camera looked down on."""
    for model, (x, y, z), yaw, s in KITCHEN_WALL:
        o = import_joined(tt_model(model), f'kitchen-{model}')
        move_to(o, coll)
        o.location = (COUNTER_CENTRE[0] + x, y, z)
        o.rotation_euler = (0.0, 0.0, math.radians(yaw))
        o.scale = (s, s, s)


def build_oven(art, colours, coll):
    body_mat = flat_material('oven-body', art['ovenBody'])
    door_mat = flat_material('oven-door', art['ovenBody'], roughness=0.4)
    glass = flat_material('oven-glass', OVEN_GLASS_DARK, roughness=0.2)
    root = bpy.data.objects.new('oven-root', None)
    link(root, coll)
    w, d, h = OVEN_BODY
    body = round_edges(box('oven-body', (0.0, 0.0, h / 2), (w, d, h), body_mat, body_mat, coll), OVEN_ROUND)
    body.parent = root
    # The soft toy brick oven: a smooth dome, a chimney with a dark top, a light arch around the door.
    trim = flat_material('oven-trim', colours['creatureLight'], roughness=0.5)
    soot = flat_material('oven-soot', OVEN_GLASS_DARK, roughness=0.6)
    chimney = round_edges(disc('oven-chimney', OVEN_CHIMNEY[0], OVEN_CHIMNEY[1], 32, body_mat, coll), 0.02)
    chimney.parent = root
    chimney.location = (OVEN_DOME_RADIUS * 0.45, OVEN_DOME_RADIUS * 0.35, h + OVEN_DOME_RADIUS * 0.55)
    cap = disc('oven-chimney-top', OVEN_CHIMNEY[0] * 0.75, 0.02, 32, soot, coll)
    cap.parent = chimney
    cap.location = (0.0, 0.0, OVEN_CHIMNEY[1])
    arch = torus_ring('oven-arch', OVEN_DOOR[0] * 0.58, OVEN_ARCH_TUBE, trim, coll)
    arch.parent = root
    arch.rotation_euler = (math.radians(90), 0.0, 0.0)
    arch.location = (0.0, -d / 2 - 0.01, OVEN_DOOR_LIFT + OVEN_DOOR[2] * 0.5)
    arch.scale = (1.0, 0.8, 1.0)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=OVEN_DOME_RADIUS)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-6], context='VERTS')
    me = bpy.data.meshes.new('oven-dome')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(body_mat)
    for p in me.polygons:
        p.use_smooth = True
    dome = link(bpy.data.objects.new('oven-dome', me), coll)
    dome.parent = root
    dome.location = (0.0, 0.0, h)
    # Door: hinged at the bottom on the front face; its origin is the hinge.
    dw, dt, dh = OVEN_DOOR
    hinge = bpy.data.objects.new('oven-hinge', None)
    link(hinge, coll)
    hinge.parent = root
    hinge.location = (0.0, -d / 2 - dt / 2, OVEN_DOOR_LIFT)
    door = round_edges(box('oven-door', (0.0, 0.0, dh / 2), (dw, dt, dh), door_mat, door_mat, coll), dt * 0.4)
    door.parent = hinge
    gw, gt, gh = OVEN_GLASS
    pane = box('oven-glass', (0.0, -dt / 2 - gt / 2, dh / 2), (gw, gt, gh), glass, glass, coll)
    pane.parent = hinge
    # Frames: 1 rest (closed, dark), 2 ready (open 25°), 3 baking (closed, glow).
    for f, deg in ((1, 0.0), (2, -OVEN_READY_DEG), (3, 0.0)):
        hinge.rotation_euler = (math.radians(deg), 0.0, 0.0)
        hinge.keyframe_insert('rotation_euler', frame=f)
    bsdf = principled(glass)
    emit = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
    strength = bsdf.inputs.get('Emission Strength')
    emit.default_value = hex_to_linear(colours['ovenGlow'])
    for f, k in ((1, 0.0), (2, 0.0), (3, OVEN_GLOW_STRENGTH)):
        strength.default_value = k
        strength.keyframe_insert('default_value', frame=f)
    for owner in (hinge, glass.node_tree):
        ad = owner.animation_data
        if ad and ad.action:
            for fc in getattr(ad.action, 'fcurves', []):
                for kp in fc.keyframe_points:
                    kp.interpolation = 'CONSTANT'
    return root, [body, dome, door, pane]


def clamp_into_frame(screen, pts, y_max):
    """Points projecting below design y `y_max` move up along z until they project at it (the counter
    front runs past the bottom of the frame)."""
    out = []
    for p in pts:
        if screen.project(p)[1] <= y_max:
            out.append(p)
            continue
        lo, hi = p.z, p.z + 10.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if screen.project((p.x, p.y, mid))[1] > y_max:
                lo = mid
            else:
                hi = mid
        out.append(Vector((p.x, p.y, hi)))
    return out


def visible_vertices(scene, depsgraph, objs):
    """World vertices of `objs` that the camera sees (no other object in between)."""
    cam = scene.camera.matrix_world.translation
    own = {o.name for o in objs}
    out = []
    for p in eval_world_verts(objs, depsgraph):
        dvec = p - cam
        hit, _loc, _n, _i, obj, _m = scene.ray_cast(depsgraph, cam, dvec.normalized(), distance=dvec.length - 1e-3)
        if not hit or obj.original.name in own:
            out.append(p)
    return out


def thin(points, limit):
    step = max(1, math.ceil(len(points) / limit))
    return points[::step]


def mesh_children(obj):
    return [o for o in descendants(obj) if o.type == 'MESH']


def projected_width(screen, objs, depsgraph):
    pts = [screen.project(p) for p in eval_world_verts(objs, depsgraph)]
    return max(p[0] for p in pts) - min(p[0] for p in pts)


def main():
    args = parse_args('build_pizza')
    params = args['params']
    art = params['art']
    pz = art['pizza']
    colours = {**params['colours'], 'creatureLight': art['creatureLight']}
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100

    prune()
    make_camera(scene)

    plate = bpy.data.collections.new('PizzaShop')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)

    # Counter: the butter body and the white top slab.
    front = flat_material('counter-butter', colours['tintButter'])
    white = flat_material('counter-top', params['counterTrayTop'])
    cx, cy = COUNTER_CENTRE
    w, d, h = COUNTER_SIZE
    body = box('counter-butter', (cx, cy, COUNTER_BASE_Z + h / 2), (w, d, h), front, front, plate)
    top_z = COUNTER_BASE_Z + h + COUNTER_TOP_THICKNESS
    o2 = 2 * COUNTER_TOP_OVERHANG
    top = box('counter-top', (cx, cy, COUNTER_BASE_Z + h + COUNTER_TOP_THICKNESS / 2), (w + o2, d + o2, COUNTER_TOP_THICKNESS), white, white, plate)
    round_edges(body, COUNTER_ROUND)
    round_edges(top, COUNTER_TOP_ROUND)
    kitchen_wall(plate)

    # Fox (sprite, cut by the counter).
    fox_coll = bpy.data.collections.new('sprite.fox')
    sprites.children.link(fox_coll)
    fox_coll['states'] = json.dumps(FOX_STATES, separators=(',', ':'))
    fox_coll['holdout_occluders'] = 1
    fox_coll['movable'] = 1
    fox = build_fox(scene, colours, top_z, fox_coll)
    bpy.context.view_layer.update()
    ground_fox(fox, top_z, bpy.context.evaluated_depsgraph_get())

    bpy.context.view_layer.update()
    screen = Screen(scene, params)
    mats = {k: flat_material(f'pizza-{k}', pz[k]) for k in ('sausage', 'sausageDot', 'mushroom', 'pepper')}

    # Bowls: one sprite per topping (the bowl and its static pile), and the slice homes above them.
    homes = {}
    bowl_colls = {}
    for t in TOPPINGS:
        bcoll = bpy.data.collections.new(f'sprite.bowl-{t}')
        sprites.children.link(bcoll)
        bcoll['states'] = json.dumps(BOWL_STATES, separators=(',', ':'))
        bcoll['movable'] = 1  # no shadow in the plate: a level without this bowl shows plain counter
        bowl_colls[t] = bcoll
        bx = cx + BOWL_DX[t]
        bowl = import_bowl(f'bowl-{t}', bcoll, colours[BOWL_COLOURS[t]])
        bowl.location = (bx, BOWL_Y, top_z)
        homes[t] = (bx, BOWL_Y, top_z)

    # Toppings: one sprite per topping at its bowl slot, scaled to the trimmed-width floor.
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bowl_tops = {}
    for t in TOPPINGS:
        bowl = bpy.data.objects[f'bowl-{t}']
        _x, _y, (_z0, z1) = bounds(eval_world_verts([bowl], depsgraph))
        bowl_tops[t] = z1
    topping_scale = {}
    slice_objs = {}
    for t in TOPPINGS:
        coll = bpy.data.collections.new(f'sprite.topping-{t}')
        sprites.children.link(coll)
        coll['movable'] = 1
        holder = topping(t, f'topping-{t}', pz, coll, mats)
        holder.location = (homes[t][0], BOWL_Y, bowl_tops[t] + SLICE_ABOVE_BOWL)
        face_camera(holder, holder['face'], holder['up'])
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        unit = projected_width(screen, mesh_children(holder), depsgraph)
        k = params['draggableMinSize'] * TOPPING_WIDTH_MARGIN / unit
        holder.scale = (k, k, k)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        _x, _y, (z0, z1) = bounds(eval_world_verts(mesh_children(holder), depsgraph))
        holder.location.z += bowl_tops[t] + SLICE_ABOVE_BOWL - z0
        topping_scale[t] = k
        slice_objs[t] = holder
        # The static pile in the bowl (part of the bowl's sprite).
        for i, (dx, dy, yaw) in enumerate(BOWL_PILE):
            p = topping(t, f'pile-{t}-{i + 1}', pz, bowl_colls[t], mats)
            for o in descendants(p):
                move_to(o, bowl_colls[t])
            p.scale = (k * BOWL_PILE_SCALE,) * 3
            p.location = (homes[t][0] + dx, BOWL_Y + dy, bowl_tops[t] - SLICE_ABOVE_BOWL)
            # a slice whose face is local x (the mushroom) lies face-up in the pile
            p.rotation_euler = (0.0, math.radians(-90.0) if p['face'] == 'X' else 0.0, math.radians(yaw))

    # Base (sprite).
    base_coll = bpy.data.collections.new('sprite.base')
    sprites.children.link(base_coll)
    base_coll['states'] = json.dumps(BASE_STATES, separators=(',', ':'))
    base_coll['movable'] = 1
    base_centre = (cx + BASE_DX, ROW_Y)
    base = build_base(base_centre, top_z, pz, base_coll)

    # Oven (sprite), sized to components.oven.size design px wide.
    oven_coll = bpy.data.collections.new('sprite.oven')
    sprites.children.link(oven_coll)
    oven_coll['states'] = json.dumps(OVEN_STATES, separators=(',', ':'))
    oven_root, oven_meshes = build_oven(pz, colours, oven_coll)
    oven_root.location = (cx + OVEN_DX, OVEN_Y, top_z)
    bpy.context.view_layer.update()
    unit = projected_width(screen, oven_meshes, bpy.context.evaluated_depsgraph_get())
    k = params['ovenSize'] / unit
    oven_root.scale = (k, k, k)

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True

    # Fox: visible hull and ground pivot.
    fox_meshes = [o for o in fox if o.type == 'MESH']
    seen = visible_vertices(scene, depsgraph, fox_meshes)
    if len(seen) < 3:
        fail('the fox is not visible from the camera')
    hull_object('hit.fox', thin(seen, MAX_HULL_VERTS), layout)
    (x0, x1), (y0, y1), (z0, _z1) = bounds(eval_world_verts(fox_meshes, depsgraph))
    add_empty('anchor.fox', ((x0 + x1) / 2, (y0 + y1) / 2, z0), layout)

    # Base: centre pivot and the 8 spots (from the top, clockwise on screen).
    spot_z = top_z + BASE_THICKNESS + CHEESE_RAISE
    add_empty('anchor.base', (base_centre[0], base_centre[1], top_z), layout)
    for n in range(BASE_SPOTS):
        a = math.radians(90.0 - n * 360.0 / BASE_SPOTS)
        add_empty(f'slot.base-{n + 1}', (base_centre[0] + BASE_SPOT_RADIUS * math.cos(a), base_centre[1] + BASE_SPOT_RADIUS * math.sin(a), spot_z), layout)

    # Bowls: ground pivots and slice homes (the slice's centre).
    for t in TOPPINGS:
        add_empty(f'anchor.bowl-{t}', homes[t], layout)
        (sx0, sx1), (sy0, sy1), (sz0, sz1) = bounds(eval_world_verts(mesh_children(slice_objs[t]), depsgraph))
        add_empty(f'slot.bowl-{t}', ((sx0 + sx1) / 2, (sy0 + sy1) / 2, (sz0 + sz1) / 2), layout)

    # Oven: ground pivot and its hull.
    oven_pts = eval_world_verts(oven_meshes, depsgraph)
    (x0, x1), (y0, y1), (z0, _z1) = bounds(oven_pts)
    add_empty('anchor.oven', ((x0 + x1) / 2, (y0 + y1) / 2, z0), layout)
    hull_object('hit.oven', oven_pts, layout)

    # Counter and the fox's plate.
    frame_bottom = params['design']['height'] - params['hitPad'] - 1
    hull_object('hit.counter', clamp_into_frame(screen, eval_world_verts([body, top], depsgraph), frame_bottom), layout)
    add_empty('slot.fox-plate', (cx + FOX_PLATE_DX, FOX_PLATE_Y, top_z), layout)

    # Diagnostics (design px).
    names = ['anchor.fox', 'anchor.base', 'slot.base-1', 'slot.base-2', 'slot.base-3', 'slot.base-5', 'anchor.oven', 'slot.fox-plate']
    names += [f'slot.bowl-{t}' for t in TOPPINGS]
    for name in names:
        o = bpy.data.objects[name]
        print(f'build_pizza: {name} → {tuple(round(v, 1) for v in screen.project(o.location))}')
    sp = [screen.project(p) for p in seen]
    spots = [screen.project(bpy.data.objects[f'slot.base-{n + 1}'].location) for n in range(BASE_SPOTS)]
    gap = min(math.dist(a, b) for i, a in enumerate(spots) for b in spots[i + 1:])
    print(f'build_pizza: closest base spots {gap:.1f} px')
    print(f'build_pizza: fox visible y {min(p[1] for p in sp):.1f}..{max(p[1] for p in sp):.1f}; topping scales {topping_scale}; oven scale {k:.3f}')
    op = [screen.project(p) for p in oven_pts]
    print(f'build_pizza: oven x {min(p[0] for p in op):.1f}..{max(p[0] for p in op):.1f} y {min(p[1] for p in op):.1f}..{max(p[1] for p in op):.1f}')

    # Fox frame sizes (design px; the atlas must stay one page).
    for f in [IDLE_FRAME, *EAT_FRAMES, *HAPPY_FRAMES]:
        scene.frame_set(f)
        fp = [screen.project(p) for p in eval_world_verts(fox_meshes, bpy.context.evaluated_depsgraph_get())]
        print(f'build_pizza: fox frame {f} box {max(p[0] for p in fp) - min(p[0] for p in fp):.0f}×{max(p[1] for p in fp) - min(p[1] for p in fp):.0f}')

    scene.frame_set(IDLE_FRAME)
    soften_scene(bpy.context.scene)  # the soft toy look (cute.py), last so every builder-made mesh gets it
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_pizza: saved {args["out"]}')


main()
