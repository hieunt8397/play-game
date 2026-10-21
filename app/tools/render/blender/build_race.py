# Builds art/race.blend (Đường đua, Stories 4.1, 4.2) from the vendored island art/src/map-v3.blend.
#
# Run by `npm run art:build -- race` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_race.py -- \
#     --out <tmp>/race.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), design size, renderScale.
#
# Steps: prune the Tiệm kem preview, its HintRing and CamGame2, every station collection but the kid kart
# (`Car`) and the checkered arch (`Race`), the island road and its dashes, and the race flags; keep the
# world (sea, sand, grass), nature and sky. Add camera `CamRace` (a high 3/4 view onto open grass) and
# (Story 4.2) one swaying `sprite.cone` (Kenney car-kit cone.glb) and one swaying `sprite.flag` (the first
# race flag of the island), drawn at every `anchor.cone-*` / `anchor.flag-*`. The kid kart becomes
# `sprite.kart`: its driver
# gets a pink cap, two big eyes and a waving arm (hidden at frame 1, waving ±25° on frames 10–13); it is
# yawed to drive toward screen-right with the driver's face toward the camera and scaled to the kart
# size. The arch becomes `sprite.gate`. The layout objects (`path.<shape>-1..3` for the straight, curve,
# zigzag and loop roads, `anchor.kart`, `anchor.gate`, `anchor.cone-1..4`, `anchor.flag-1..2`) go in a
# hidden `layout` collection; render size; save.
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
from cute import soften_scene  # noqa: E402
from common import add_empty, eval_world_verts, flat_material, key_constant, move_to, parse_args, sphere  # noqa: E402

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
CONE_GLB = os.path.join(ASSETS, 'kenney', 'kenney_car-kit', 'Models', 'GLB format', 'cone.glb')

PRUNE_COLLECTIONS = ['GameIce', 'IceCream', 'Pizza', 'Town', 'Cave', 'Dino', 'Fish', 'RaceCars']
PRUNE_OBJECTS = ['HintRing', 'CamGame2', 'Road', 'RoadEdge']
PRUNE_PREFIXES = ['Dash', 'FlagPole', 'Flag']
# Story 4.2: the first flag pair by name sort is kept as `sprite.flag` (the others are pruned).
FLAG_KEEP = ('Flag-1', 'FlagPole-1')
FLAG_POLE = 'FlagPole-1'
KART_COLLECTION = 'Car'
KART_ROOT = 'A_KidKart'
CHARACTER = 'character'
GATE_COLLECTION = 'Race'
GATE_PREFIXES = ['ArchPost', 'ArchBall', 'Chk']

RENDER_SIZE = (2048, 1536)
GROUND_PROBE_Z = 20.0
GROUND_FALLBACK_Z = 0.45  # the grass top

# --- the camera: a high 3/4 view onto the open grass between the old stations ---------------------------
CAM_RACE_TARGET = (2.5, 0.5, 0.45)
CAM_RACE_LOC = (2.5, -4.5, 8.0)
CAM_RACE_ROT = None  # derived: the camera looks at CAM_RACE_TARGET (up = +z)
CAM_RACE_LENS = 36.0

# --- the roads: world XY points on the grass, left to right ----------------------------------------------
ROADS = {
    'straight-1': [(-0.67, 0.33), (1.52, 0.38), (3.70, 0.28), (5.72, 0.33)],  # horizontal
    'straight-2': [(-0.51, -0.46), (2.48, 0.38), (5.80, 1.21)],  # gently rising
    'straight-3': [(-0.89, 1.44), (2.48, 0.44), (5.56, -0.46)],  # gently falling
}
ROAD_LIFT = 0.01  # path points sit this far above the ground

# --- Story 4.2: the shaped roads, generated from parametric tables (world units) -------------------------
ROAD_STEP_WU = 0.15  # every shape is sampled this far apart in arc (≈ 17 design px ≤ ui.racePathPointGapPx)
ZIG_FILLET_WU = 0.8  # a zigzag corner is a circular fillet of this radius (projected ≥ 70 design px)
LOOP_MOUTH_WU = 1.1  # the chord between a loop's two lips (projected 130–150 design px)
ROAD_SHAPES = [
    # curve: one gentle arc (half a sine) bulging toward the back, an S, an arc bulging toward the camera.
    {'id': 'curve-1', 'kind': 'arc', 'params': {'x0': -0.7, 'x1': 5.7, 'y0': 0.0, 'amp': 1.3}},
    {'id': 'curve-2', 'kind': 'sine', 'params': {'x0': -0.7, 'x1': 5.7, 'y0': 0.45, 'amp': 0.95}},
    {'id': 'curve-3', 'kind': 'arc', 'params': {'x0': -0.7, 'x1': 5.7, 'y0': 1.1, 'amp': -1.3}},
    # zigzag: 3–4 straight legs (each turn ≤ 90°) joined by ZIG_FILLET_WU fillets.
    {'id': 'zigzag-1', 'kind': 'zigzag', 'params': {'corners': [(-0.7, 1.2), (1.4, -0.4), (3.5, 1.2), (5.7, -0.4)]}},
    {'id': 'zigzag-2', 'kind': 'zigzag', 'params': {'corners': [(-0.7, -0.3), (1.4, 1.2), (3.5, -0.3), (5.6, 1.15)]}},
    {'id': 'zigzag-3', 'kind': 'zigzag', 'params': {'corners': [(-0.8, 0.4), (1.0, 1.3), (2.6, 0.0), (4.2, 1.3), (5.8, 0.4)]}},
    # loop: an open circle whose mouth faces the camera; its lips are the start and the end.
    # loop-1 / loop-3 run counter-clockwise on screen (start on the right lip), loop-2 clockwise.
    {'id': 'loop-1', 'kind': 'loop', 'params': {'centre': (2.5, 0.5), 'r': 1.9, 'ccw': True}},
    {'id': 'loop-2', 'kind': 'loop', 'params': {'centre': (2.2, 0.55), 'r': 1.85, 'ccw': False}},
    {'id': 'loop-3', 'kind': 'loop', 'params': {'centre': (2.8, 0.45), 'r': 1.95, 'ccw': True}},
]
DENSE_STEPS = 400  # a shape is first sampled this finely, then resampled every ROAD_STEP_WU

# --- the plate cones (Kenney car-kit cone.glb), clear of every road band --------------------------------
# Story 4.2: the swaying cones along the front grass (one `sprite.cone`, rendered at CONES[0]).
CONES = [(0.18, -2.14), (1.82, -2.14), (3.30, -2.14), (4.79, -2.14)]
CONE_SCALE = 1.4
# Story 4.2: the swaying flags on the back grass (one `sprite.flag` rendered at FLAGS[0], pivot at the pole foot).
FLAGS = [(2.16, 3.85), (5.13, 3.85)]
FLAG_SCALE = 0.7

# --- the kart (sprite.kart) ----------------------------------------------------------------------------------
KART_AT = (-0.67, 0.33)  # its render pose: the start of straight-1 (the scene moves it at runtime)
# The kart's own front is its local +y (FRONT_Y); yaw so it heads 30° below screen-right (toward the
# camera), which turns the driver's face to the camera: world heading −30° = local +y turned by −120°.
FRONT_Y = 1.0
KART_YAW = -120.0
KART_SCALE = 0.75  # × its scale in the island scene (0.805): trimmed longest side ≈ 1.25 × kart.size
CAP_COLOUR = 'creaturePink'
HEAD_SHARE = 0.38  # the top this share of the driver's height is the head
CAP_RADIUS = 0.9  # × the head radius
CAP_LIFT = 0.32  # the cap's centre sits this × head radius above the head centre
BRIM_RADIUS = 0.62  # × head radius
BRIM_FORWARD = 0.78  # × head radius, toward the face
BRIM_THICK = 0.08  # × head radius
EYE_RADIUS = 0.26  # × head radius
EYE_SPREAD = 0.36  # × head radius, either side of the face centre
EYE_DROP = 0.08  # × head radius below the head centre
EYE_OUT = 0.9  # × head radius, toward the face
PUPIL_RADIUS = 0.5  # × the eye radius
EYE_THICK = 0.12  # × head radius
SLEEVE_RADIUS = 0.17  # × head radius
SLEEVE_LENGTH = 1.7  # × head radius, from the shoulder up
MITTEN_RADIUS = 0.3  # × head radius
SHOULDER_SIDE = 0.85  # × head radius, to the driver's right (the side facing the camera)
SHOULDER_DROP = 0.95  # × head radius below the head centre
WAVE_DEG = 25.0
WAVE_BASE_DEG = 32.0  # the raised arm leans this far out, so both wave phases clear the head
IDLE_FRAME = 1
WAVE_FRAMES = [10, 11, 12, 13]
KART_STATES = {'idle': [IDLE_FRAME], 'wave': WAVE_FRAMES}

# --- the gate (sprite.gate) ----------------------------------------------------------------------------------
GATE_AT = (5.72, 0.33)  # its render pose: the end of straight-1
GATE_SCALE = 0.55


def fail(msg):
    raise RuntimeError(f'build_race: {msg}')


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
        if o.name in bpy.data.objects and o.name not in FLAG_KEEP and any(o.name.startswith(p) for p in PRUNE_PREFIXES):
            bpy.data.objects.remove(o, do_unlink=True)


def make_camera(scene):
    data = bpy.data.cameras.new('CamRace')
    data.lens = CAM_RACE_LENS
    cam = bpy.data.objects.new('CamRace', data)
    scene.collection.objects.link(cam)
    cam.location = CAM_RACE_LOC
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (Vector(CAM_RACE_TARGET) - Vector(CAM_RACE_LOC)).to_track_quat('-Z', 'Y').to_euler()
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


def ground_z(scene, x, y, ignore=()):
    """The top of the plate under (x, y) (ray cast down; sprites ignored)."""
    dg = bpy.context.evaluated_depsgraph_get()
    origin = Vector((x, y, GROUND_PROBE_Z))
    for _ in range(8):
        hit, loc, _n, _i, obj, _m = scene.ray_cast(dg, origin, Vector((0.0, 0.0, -1.0)))
        if not hit:
            return GROUND_FALLBACK_Z
        if obj is None or obj.name not in ignore:
            return loc.z
        origin = loc - Vector((0.0, 0.0, 0.001))
    return GROUND_FALLBACK_Z


def disc(name, radius, depth, mat, coll):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=radius, radius2=radius, depth=depth)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def hemisphere(name, radius, mat, coll):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=radius)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-6], context='VERTS')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    for poly in me.polygons:
        poly.use_smooth = True
    return o


def parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = mw


def key_hidden(objs, hidden_frames, shown_frames):
    for o in objs:
        for f in hidden_frames:
            o.hide_render = True
            o.keyframe_insert('hide_render', frame=f)
        for f in shown_frames:
            o.hide_render = False
            o.keyframe_insert('hide_render', frame=f)
        key_constant(o)


def dress_driver(kart_root, colours, coll):
    """Cap, eyes and a waving arm on the driver, built in the kart's local frame (front = local +y)."""
    ch = bpy.data.objects.get(CHARACTER)
    if ch is None:
        fail(f'no "{CHARACTER}" object in the kart')
    bpy.context.view_layer.update()
    inv = kart_root.matrix_world.inverted()
    verts = [inv @ (ch.matrix_world @ v.co) for v in ch.data.vertices]
    z0, z1 = min(v.z for v in verts), max(v.z for v in verts)
    head = [v for v in verts if v.z >= z1 - HEAD_SHARE * (z1 - z0)]
    lo = Vector([min(v[i] for v in head) for i in range(3)])
    hi = Vector([max(v[i] for v in head) for i in range(3)])
    c = (lo + hi) / 2
    r = max(hi.x - lo.x, hi.y - lo.y) / 2
    pink = flat_material('race-cap', colours[CAP_COLOUR], roughness=0.7)
    white = flat_material('race-eye-white', colours['white'] if 'white' in colours else '#FFFFFF', roughness=0.5)
    ink = flat_material('race-eye-ink', colours['iconInk'], roughness=0.5)
    parts = []

    def local(o, at, rot=(0.0, 0.0, 0.0)):
        o.parent = kart_root
        o.matrix_parent_inverse = Matrix.Identity(4)
        o.location = at
        o.rotation_euler = rot
        parts.append(o)
        return o

    local(hemisphere('race-cap', CAP_RADIUS * r, pink, coll), c + Vector((0.0, 0.0, CAP_LIFT * r)))
    local(disc('race-cap-brim', BRIM_RADIUS * r, BRIM_THICK * r, pink, coll), c + Vector((0.0, FRONT_Y * BRIM_FORWARD * r, CAP_LIFT * r)))
    # Eyes: discs facing the front (local ±y), so their axis is turned from z onto y.
    face = (math.pi / 2, 0.0, 0.0)
    for side in (-1.0, 1.0):
        at = c + Vector((side * EYE_SPREAD * r, FRONT_Y * EYE_OUT * r, -EYE_DROP * r))
        local(disc(f'race-eye-{int(side)}', EYE_RADIUS * r, EYE_THICK * r, white, coll), at, face)
        local(disc(f'race-pupil-{int(side)}', PUPIL_RADIUS * EYE_RADIUS * r, EYE_THICK * r, ink, coll), at + Vector((0.0, FRONT_Y * EYE_THICK * r * 0.6, 0.0)), face)
    # The waving arm: a pivot at the shoulder on the driver's right (forward × up = local +x for a +y
    # front: the side facing the camera), the sleeve and mitten above it.
    shoulder = c + Vector((FRONT_Y * SHOULDER_SIDE * r, 0.0, -SHOULDER_DROP * r))
    pivot = add_empty('race-arm-pivot', (0.0, 0.0, 0.0), coll)
    local(pivot, shoulder)
    sleeve = disc('race-arm-sleeve', SLEEVE_RADIUS * r, SLEEVE_LENGTH * r, pink, coll)
    sleeve.parent = pivot
    sleeve.location = (0.0, 0.0, SLEEVE_LENGTH * r / 2)
    mitten = sphere('race-arm-mitten', MITTEN_RADIUS * r, white, coll)
    mitten.parent = pivot
    mitten.location = (0.0, 0.0, SLEEVE_LENGTH * r)
    pivot.rotation_mode = 'XYZ'
    pivot.rotation_euler = (0.0, 0.0, 0.0)
    pivot.keyframe_insert('rotation_euler', frame=IDLE_FRAME)
    for i, f in enumerate(WAVE_FRAMES):
        pivot.rotation_euler = (0.0, math.radians(WAVE_BASE_DEG + (WAVE_DEG if i % 2 == 0 else -WAVE_DEG)), 0.0)
        pivot.keyframe_insert('rotation_euler', frame=f)
    key_constant(pivot)
    key_hidden([sleeve, mitten], [IDLE_FRAME], WAVE_FRAMES)
    return parts + [sleeve, mitten]


def build_kart(scene, colours, sprites):
    src = bpy.data.collections.get(KART_COLLECTION)
    root = bpy.data.objects.get(KART_ROOT)
    if src is None or root is None:
        fail(f'kart collection "{KART_COLLECTION}" / "{KART_ROOT}" not found')
    coll = bpy.data.collections.new('sprite.kart')
    sprites.children.link(coll)
    coll['states'] = json.dumps(KART_STATES, separators=(',', ':'))
    coll['movable'] = 1
    for o in list(src.all_objects):
        move_to(o, coll)
    bpy.data.collections.remove(src)
    root.rotation_euler = (0.0, 0.0, math.radians(KART_YAW))
    root.scale = root.scale * KART_SCALE
    dress_driver(root, colours, coll)
    bpy.context.view_layer.update()
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    gz = ground_z(scene, KART_AT[0], KART_AT[1], {o.name for o in coll.all_objects})
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    root.location += Vector((KART_AT[0] - cx, KART_AT[1] - cy, gz - min(p.z for p in pts)))
    bpy.context.view_layer.update()
    return coll, gz


def build_gate(scene, sprites):
    src = bpy.data.collections.get(GATE_COLLECTION)
    if src is None:
        fail(f'gate collection "{GATE_COLLECTION}" not found')
    objs = [o for o in src.all_objects if any(o.name.startswith(p) for p in GATE_PREFIXES)]
    if not objs:
        fail('no arch objects in the Race collection')
    coll = bpy.data.collections.new('sprite.gate')
    sprites.children.link(coll)
    coll['states'] = json.dumps({'idle': [IDLE_FRAME]}, separators=(',', ':'))
    coll['movable'] = 1
    for o in objs:
        move_to(o, coll)
    for o in list(src.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(src)
    bpy.context.view_layer.update()
    posts = [o for o in objs if o.name.startswith('ArchPost')]
    feet = [eval_world_verts([p], bpy.context.evaluated_depsgraph_get()) for p in posts]
    foot = [Vector(((min(v.x for v in f) + max(v.x for v in f)) / 2, (min(v.y for v in f) + max(v.y for v in f)) / 2, min(v.z for v in f))) for f in feet]
    mid = (foot[0] + foot[1]) / 2
    root = add_empty('gate-root', mid, coll)
    bpy.context.view_layer.update()  # the root's matrix_world must be current before parenting
    for o in objs:
        parent_keep(o, root)
    gz = ground_z(scene, GATE_AT[0], GATE_AT[1], {o.name for o in coll.all_objects})
    root.scale = (GATE_SCALE, GATE_SCALE, GATE_SCALE)
    root.location = (GATE_AT[0], GATE_AT[1], gz)
    bpy.context.view_layer.update()
    return coll, root


def build_cone(scene, sprites):
    """sprite.cone: one Kenney cone at CONES[0] (the scene draws it at every anchor.cone-*)."""
    if not os.path.isfile(CONE_GLB):
        fail(f'{CONE_GLB} is missing')
    coll = bpy.data.collections.new('sprite.cone')
    sprites.children.link(coll)
    coll['states'] = json.dumps({'idle': [IDLE_FRAME]}, separators=(',', ':'))
    coll['movable'] = 1
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=CONE_GLB)
    new = [o for o in bpy.data.objects if o not in before]
    root = add_empty('cone-root', (0.0, 0.0, 0.0), coll)
    for o in new:
        move_to(o, coll)
        if o.parent is None:
            o.parent = root
    x, y = CONES[0]
    root.scale = (CONE_SCALE, CONE_SCALE, CONE_SCALE)
    root.location = (x, y, ground_z(scene, x, y, {o.name for o in new}))
    bpy.context.view_layer.update()
    return coll


def build_flag(scene, sprites):
    """sprite.flag: the kept race flag (pole + cloth) at FLAGS[0], pivot at its pole foot."""
    objs = [bpy.data.objects.get(n) for n in FLAG_KEEP]
    if any(o is None for o in objs):
        fail(f'flag objects {FLAG_KEEP} not found')
    coll = bpy.data.collections.new('sprite.flag')
    sprites.children.link(coll)
    coll['states'] = json.dumps({'idle': [IDLE_FRAME]}, separators=(',', ':'))
    coll['movable'] = 1
    for o in objs:
        move_to(o, coll)
    bpy.context.view_layer.update()
    pole = eval_world_verts([bpy.data.objects[FLAG_POLE]], bpy.context.evaluated_depsgraph_get())
    foot = Vector(((min(v.x for v in pole) + max(v.x for v in pole)) / 2, (min(v.y for v in pole) + max(v.y for v in pole)) / 2, min(v.z for v in pole)))
    root = add_empty('flag-root', foot, coll)
    bpy.context.view_layer.update()
    for o in objs:
        parent_keep(o, root)
    x, y = FLAGS[0]
    root.scale = (FLAG_SCALE, FLAG_SCALE, FLAG_SCALE)
    root.location = (x, y, ground_z(scene, x, y, {o.name for o in coll.all_objects}))
    bpy.context.view_layer.update()
    return coll


# --- Story 4.2: road shape generators (world XY polylines, then resampled every ROAD_STEP_WU) ------------

def resample_xy(pts, step):
    """The polyline resampled every `step` of arc length (both ends kept)."""
    out = [pts[0]]
    carry = 0.0
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        seg = math.hypot(bx - ax, by - ay)
        if seg == 0:
            continue
        d = step - carry
        while d <= seg:
            t = d / seg
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
            d += step
        carry = seg - (d - step)
    if math.hypot(out[-1][0] - pts[-1][0], out[-1][1] - pts[-1][1]) > 1e-9:
        out.append(pts[-1])
    return out


def shape_arc(p, sine=False):
    """A half sine (one arc) or a full sine (an S) of amplitude `amp` from x0 to x1 around y0."""
    k = 2.0 if sine else 1.0
    ts = [i / DENSE_STEPS for i in range(DENSE_STEPS + 1)]
    return [(p['x0'] + (p['x1'] - p['x0']) * t, p['y0'] + p['amp'] * math.sin(k * math.pi * t)) for t in ts]


def shape_zigzag(p):
    """Straight legs through `corners`, each inner corner replaced by a ZIG_FILLET_WU circular fillet."""
    c = [Vector(q) for q in p['corners']]
    out = [tuple(c[0])]
    for i in range(1, len(c) - 1):
        a, v, b = c[i - 1], c[i], c[i + 1]
        u1 = (a - v).normalized()
        u2 = (b - v).normalized()
        half = math.acos(max(-1.0, min(1.0, u1.dot(u2)))) / 2  # half the interior angle
        if math.pi - 2 * half > math.radians(90.0) + 1e-6:
            fail(f'zigzag corner {i} turns more than 90°')
        t = ZIG_FILLET_WU / math.tan(half)
        if t > min((a - v).length, (b - v).length) / 2:
            fail(f'zigzag corner {i}: the fillet does not fit its legs')
        t1, t2 = v + u1 * t, v + u2 * t
        centre = v + (u1 + u2).normalized() * (ZIG_FILLET_WU / math.sin(half))
        a1 = math.atan2(t1.y - centre.y, t1.x - centre.x)
        a2 = math.atan2(t2.y - centre.y, t2.x - centre.x)
        da = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        n = max(4, int(DENSE_STEPS * abs(da) / (2 * math.pi)))
        out += [(centre.x + ZIG_FILLET_WU * math.cos(a1 + da * j / n), centre.y + ZIG_FILLET_WU * math.sin(a1 + da * j / n)) for j in range(n + 1)]
    out.append(tuple(c[-1]))
    return out


def shape_loop(p):
    """An open circle with its mouth (chord LOOP_MOUTH_WU) toward the camera (−y); lips = start and end."""
    cx, cy = p['centre']
    r = p['r']
    phi = math.degrees(math.asin(LOOP_MOUTH_WU / (2 * r)))
    a0, a1 = (-90.0 + phi, 270.0 - phi) if p['ccw'] else (270.0 - phi, -90.0 + phi)
    ts = [i / DENSE_STEPS for i in range(DENSE_STEPS + 1)]
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * t)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * t))) for t in ts]


def road_points():
    """Every road id → its world XY points: the straight roads as given, the shapes generated."""
    roads = {rid: list(pts) for rid, pts in ROADS.items()}
    for s in ROAD_SHAPES:
        kind, p = s['kind'], s['params']
        if kind == 'arc':
            raw = shape_arc(p)
        elif kind == 'sine':
            raw = shape_arc(p, sine=True)
        elif kind == 'zigzag':
            raw = shape_zigzag(p)
        elif kind == 'loop':
            raw = shape_loop(p)
        else:
            fail(f'road "{s["id"]}": unknown shape kind "{kind}"')
        roads[s['id']] = resample_xy(raw, ROAD_STEP_WU)
    return roads


def main():
    args = parse_args('build_race', required=('out', 'params'))
    params = args['params']
    colours = params['colours']
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100

    prune()
    make_camera(scene)
    bpy.context.view_layer.update()
    screen = Screen(scene, params)

    plate = bpy.data.collections.new('race-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True

    cone = build_cone(scene, sprites)
    flag = build_flag(scene, sprites)
    kart, _kgz = build_kart(scene, colours, sprites)
    gate, gate_root = build_gate(scene, sprites)
    scene.frame_set(IDLE_FRAME)
    bpy.context.view_layer.update()

    sprite_names = {o.name for c in (kart, gate, cone, flag) for o in c.all_objects}
    for rid, pts in road_points().items():
        if rid in ROADS and not 3 <= len(pts) <= 7:
            fail(f'road "{rid}" needs 3–7 points')
        curve = bpy.data.curves.new(f'path.{rid}', 'CURVE')
        curve.dimensions = '3D'
        spline = curve.splines.new('POLY')
        spline.points.add(len(pts) - 1)
        for pt, (x, y) in zip(spline.points, pts):
            pt.co = (x, y, ground_z(scene, x, y, sprite_names) + ROAD_LIFT, 1.0)
        layout.objects.link(bpy.data.objects.new(f'path.{rid}', curve))

    dg = bpy.context.evaluated_depsgraph_get()
    kpts = eval_world_verts([o for o in kart.all_objects if o.type == 'MESH' and not o.hide_render], dg)
    wheels = [o for o in kart.all_objects if o.name.startswith('wheel-')]
    wpts = eval_world_verts(wheels, dg) if wheels else kpts
    kx = (min(p.x for p in wpts) + max(p.x for p in wpts)) / 2
    ky = (min(p.y for p in wpts) + max(p.y for p in wpts)) / 2
    add_empty('anchor.kart', (kx, ky, min(p.z for p in kpts)), layout)
    add_empty('anchor.gate', gate_root.matrix_world.translation.copy(), layout)
    for i, (x, y) in enumerate(CONES, 1):
        add_empty(f'anchor.cone-{i}', (x, y, ground_z(scene, x, y, sprite_names)), layout)
    for i, (x, y) in enumerate(FLAGS, 1):
        add_empty(f'anchor.flag-{i}', (x, y, ground_z(scene, x, y, sprite_names)), layout)

    report(screen, kart, gate)
    scene.frame_set(IDLE_FRAME)
    soften_scene(bpy.context.scene)  # the soft toy look (cute.py), last so every builder-made mesh gets it
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_race: saved {args["out"]}')


def report(screen, kart, gate):
    """Diagnostics in design px (the rules themselves run in TypeScript on the render)."""
    scene = bpy.context.scene
    fmt = lambda r: f'({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}×{r[3] - r[1]:.0f}'  # noqa: E731
    for f in [IDLE_FRAME, WAVE_FRAMES[0]]:
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        objs = [o for o in kart.all_objects if o.type == 'MESH' and not o.evaluated_get(dg).hide_render]
        print(f'build_race: kart frame {f} {fmt(screen.rect(eval_world_verts(objs, dg)))}')
    scene.frame_set(IDLE_FRAME)
    dg = bpy.context.evaluated_depsgraph_get()
    print(f'build_race: gate {fmt(screen.rect(eval_world_verts([o for o in gate.all_objects if o.type == "MESH"], dg)))}')
    for o in sorted(bpy.data.collections['layout'].objects, key=lambda o: o.name):
        if o.type == 'CURVE':
            pts = [screen.project(o.matrix_world @ p.co.xyz) for p in o.data.splines[0].points]
            if len(pts) <= 7:
                print(f'build_race: {o.name} ' + ' '.join(f'({x:.0f},{y:.0f})' for x, y in pts))
            else:
                xs, ys = [p[0] for p in pts], [p[1] for p in pts]
                print(f'build_race: {o.name} {len(pts)} points, start ({pts[0][0]:.0f},{pts[0][1]:.0f}) end ({pts[-1][0]:.0f},{pts[-1][1]:.0f}) '
                      f'bbox ({min(xs):.0f},{min(ys):.0f})-({max(xs):.0f},{max(ys):.0f})')
        else:
            x, y = screen.project(o.matrix_world.translation)
            print(f'build_race: {o.name} {x:.0f},{y:.0f}')


main()
