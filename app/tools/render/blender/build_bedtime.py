# Builds art/bedtime.blend (Giờ đi ngủ, Story 7.4) from the vendored island art/src/map-v3.blend (only its render
# settings, world and Sun are kept).
#
# Run by `npm run art:build -- bedtime` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_bedtime.py -- \
#     --out <tmp>/bedtime.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), art (art.bedtime for the room, the quilt and the
# particles), design size, renderScale.
#
# One plate, 2048×1536: a cosy bedroom seen from the front. A peach wall with soft dots, a wooden floor with a
# skirting board, a window with an evening sky and a moon between two blue curtains, two framed paintings and a
# wall shelf with books; KayKit Furniture: the bed (bed_single_A, side on, its headboard to the right), the
# nightstand (cabinet_small), an oval rug, the stool by the bed's foot (table_small); Tiny Treats Bubbly Bathroom:
# the toothbrush cup with a pink brush in it. Sprites (`sprite.<id>`; none casts a shadow into the plate):
#   - shiba: the friend — the chibi toy Shiba (cute.chibi('dog'), the same dog as on the map, in Tiệm kem and in
#     Tủ đồ; 2026-10-29, replacing the Quaternius ShibaInu.fbx). One independent rig `shiba-<pose>` per
#     `state.<pose>` child, posed in this builder only (key_chibi for the head, tail, tongue and eyes; the parts moved
#     for lying; a `<rig>-mouth` part for an open mouth): sit, brush (sitting, giggling: eyes shut, mouth open), lie
#     (lying like a sphinx, head up, turned to the camera), lie-brush (lying, giggling), yawn (lying, head up, mouth
#     wide, eyes shut), sleep (lying, chin down toward the pillow, eyes shut) and roll (asleep, turned onto its side
#     about its long axis, its head on its cheek facing the camera). No outfit here (spec-bedtime-shiba-chibi);
#   - blanket: `off` (a folded quilt at the bed's foot) and `on` (spread over the bed and over Shiba's body up to
#     its shoulders, so its head peeks out on the pillow);
#   - lamp: KayKit lamp_table on the nightstand, `on` (its shade glows) and `off`;
#   - brush: the Bubbly Bathroom blue toothbrush standing in the cup (the runtime moves it to Shiba's mouth);
#   - bubble, star, z: detached particles (never in the plate), placed at runtime.
# The hidden `layout` collection holds hit.<brush|lamp|blanket|shiba> (convex hulls: the brush with its cup and
# stool, the lamp with the nightstand, the folded quilt with the bed's foot below it, Shiba in every pose) and the
# anchors the runtime needs: mouth-sit, mouth-lie (the brush's target), brush-head (the bristles at rest), head-sleep
# (where the "z" rise from), lamp (the shade's centre: its glow) and star-1…5 (inside the window).
# Every constant is in Blender world units (metres) unless its name says otherwise.
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, chibi, chibi_materials, import_joined, key_chibi, mat, mesh_obj, rbox, rod, soften_scene, tt_model  # noqa: E402
from common import add_empty, eval_world_verts, hex_to_linear, hull_object, move_to, parse_args, principled  # noqa: E402

RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main
IDLE_FRAME = 1

# --- the camera: a child's eye, a little above the bed, looking at the wall ------------------------------------
CAM_LOC = (0.28, -8.0, 2.6)
CAM_TARGET = (0.28, 0.4, 1.45)
CAM_LENS = 35.0

# --- the room -------------------------------------------------------------------------------------------------
WALL_Y = 1.45  # the back wall's face
ROOM_HALF = 9.0  # the floor and the wall reach this far left and right
WALL_H = 7.0
BOARD_W = 0.42  # floor boards (along x, darker every third)
SKIRT_H = 0.18
DOTS = 45
DOT_R = 0.07
SEED = 74

# The bed (KayKit bed_single_A): side on, its headboard to the right, against the wall.
BED_SCALE = 1.4
BED_X = 0.45
# The nightstand right of the headboard, the stool left of the foot (each a KayKit piece, scaled).
STAND_X = 3.6
STAND_SCALE = 1.0
STOOL_X = -2.8
STOOL_Y = 0.05
STOOL_SCALE = 0.95
LAMP_SCALE = 0.78
# The toothbrush cup (Bubbly Bathroom) on the stool, a pink brush in it; the blue brush is the sprite.
CUP_SCALE = 1.8
BRUSH_SCALE = 1.75
BRUSH_TILT = 14.0  # degrees: the blue brush leans out of the cup to the right
# The rug in front of the bed.
RUG = ('rug_oval_A', (0.4, -1.35, 0.0), 1.25)
# The window above the bed (centre x, centre z, width, height) and its curtains.
WINDOW = (0.45, 3.35, 2.1, 1.6)
FRAME_BAR = 0.09
MOON = (0.95, 3.75, 0.26)  # x, z, radius (a crescent: a sky disc covers part of it)
DAY_CLOUDS = [(-0.22, 0.2, 0.22), (0.25, -0.15, 0.18)]  # (u, v, size): soft clouds in the day window (fractions of its size)
SKY_EMISSION = 1.0
# The paintings (KayKit picture frames) and the wall shelf with books.
FRAMES = [('pictureframe_medium', (-2.55, 3.05), 1.05, 'sun'), ('pictureframe_small_A', (-1.45, 3.45), 1.0, 'heart')]
SHELF = ('shelf_A_small', (3.3, 3.35), 1.1)

# --- Shiba ------------------------------------------------------------------------------------------------------
SHIBA = 'shiba'  # the chibi rigs are `shiba-<pose>` (cute.chibi('dog'), as in Tiệm kem and Tủ đồ)
SHIBA_K = 0.95  # the chibi sits ~2.0 tall at scale 1
SIT_X = 0.85  # where it sits on the bed (its body's centre)
SIT_YAW = -18.0  # facing the camera, turned a little toward the brush
HEADBOARD_GAP = 0.75  # lying along the bed, its nose (or ears) this far from the bed's right end (the pillow)
FACE_TURN = -70.0  # degrees (head yaw): a lying Shiba's face turns this much from along the bed toward the camera
ROLL_DEG = 70.0  # the rolled Shiba turns this much about its long axis (onto its side, belly and paws toward the camera)
ROLL_SLIDE = 0.35  # … and lies this much nearer the pillow (rolled, it is longer: its hull keeps clear of the folded quilt's)
POSES = ('sit', 'brush', 'lie', 'lie-brush', 'yawn', 'sleep', 'roll')
LYING = ('lie', 'lie-brush', 'yawn', 'sleep', 'roll')
# Per pose: key_chibi's head pitch / roll / yaw (degrees; + pitch = chin down), tail swing, tongue and eyes, and
# the open mouth part (`<rig>-mouth`: a small giggle or a wide yawn) or None.
POSE_KEYS = {
    'sit': dict(head_pitch=4.0, head_roll=0.0, head_yaw=0.0, tail=0.0, tongue=False, eyes='open', mouth=None),
    'brush': dict(head_pitch=-8.0, head_roll=8.0, head_yaw=0.0, tail=15.0, tongue=True, eyes='shut', mouth='smile'),
    'lie': dict(head_pitch=-2.0, head_roll=0.0, head_yaw=FACE_TURN, tail=0.0, tongue=False, eyes='open', mouth=None),
    'lie-brush': dict(head_pitch=-8.0, head_roll=8.0, head_yaw=FACE_TURN, tail=15.0, tongue=True, eyes='shut', mouth='smile'),
    'yawn': dict(head_pitch=-24.0, head_roll=0.0, head_yaw=FACE_TURN + 10.0, tail=0.0, tongue=True, eyes='shut', mouth='yawn'),
    'sleep': dict(head_pitch=14.0, head_roll=-14.0, head_yaw=FACE_TURN - 10.0, tail=0.0, tongue=False, eyes='shut', mouth=None),
    'roll': dict(head_pitch=70.0, head_roll=0.0, head_yaw=-35.0, tail=0.0, tongue=False, eyes='shut', mouth=None),
}
# The open mouth (head space of cute.chibi: the snout is at y −0.55, z 0.24 over the head pivot): centre, radii.
MOUTH_PART = {'smile': ((0.0, -0.6, 0.1), (0.1, 0.06, 0.06)), 'yawn': ((0.0, -0.6, 0.06), (0.14, 0.07, 0.12))}
# Lying down (body space of cute.chibi, which sits facing −y): each part's new centre (and euler, degrees); the root
# then turns +90° about z so the nose points along the bed (+x), the dog's left side (−x) toward the camera.
LIE_PARTS = {
    'torso': ((0.0, 0.2, 0.4), None),
    'belly': ((0.0, -0.08, 0.36), None),
    'legL': ((-0.2, -0.36, 0.12), (90.0, 0.0, 0.0)),
    'legR': ((0.2, -0.36, 0.12), (90.0, 0.0, 0.0)),
    'pawL': ((-0.2, -0.55, 0.07), None),
    'pawR': ((0.2, -0.55, 0.07), None),
    'hindL': ((-0.33, 0.44, 0.14), None),
    'hindR': ((0.33, 0.44, 0.14), None),
}
LIE_HEAD = (0.0, -0.22, 0.48)  # the head pivot (was (0, −0.02, 0.95) sitting): the chin rests on the front paws
LIE_TAIL = (0.0, 0.55, 0.3)  # the tail pivot (was (0, 0.42, 0.62)): the curl lies low on the back, under the quilt
HEAD_PARTS = ('skull', 'face', 'snout', 'nose', 'earL', 'earR', 'ear-inL', 'ear-inR', 'eyeL', 'eyeR')
BODY_PARTS = ('torso', 'belly', 'hindL', 'hindR', 'curl')  # the quilt covers these (lying)
STAR_ANCHORS = 5
# The spread quilt (review): it lies DRAPE_LIFT over the mattress and rises to DRAPE_RISE × Shiba's back height over its
# body, sloping over DRAPE_SLOPE_X toward the foot and rounding down over DRAPE_EDGE at the shoulders.
DRAPE_LIFT = 0.08
DRAPE_RISE = 0.6
DRAPE_SLOPE_X = 0.9
DRAPE_EDGE = 0.12
DRAPE_SHOULDER = 0.45  # the quilt's height at the shoulders, as a share of its top
DRAPE_NECK = -0.3  # the quilt reaches this far (m) past the body parts' front (BODY_PARTS) toward the head
LIE_SINK = 0.14  # lying Shibas sink this much into the soft bed (the quilt over them stays low)
# The detached particles stand here (any visible spot; the runtime places them by their frame's centre).
PARTICLE_AT = {'bubble': (-1.2, -4.0, 1.4), 'star': (0.0, -4.0, 1.4), 'z': (1.2, -4.0, 1.4)}


def fail(msg):
    raise RuntimeError(f'build_bedtime: {msg}')


# --- scene helpers (as build_band.py) -----------------------------------------------------------------------

def clear_island(scene):
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


def make_camera(scene):
    data = bpy.data.cameras.new('CamBedtime')
    data.lens = CAM_LENS
    cam = bpy.data.objects.new('CamBedtime', data)
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


def report(screen, name, pts):
    r = screen.rect(pts)
    print(f'build_bedtime: {name} ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')
    return r


def _socket(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def emissive(name, hex_colour, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_to_linear(hex_colour)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def sky_material(c, low='skyLow', top='skyTop', name='bedtime-sky'):
    """A sky in the window: `low` at the window's bottom to `top` at its top (unlit)."""

    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = -WINDOW[3] / 2
    mr.inputs['From Max'].default_value = WINDOW[3] / 2
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(mr.outputs['Result'], _socket(mix.inputs, 'Factor_Float'))
    _socket(mix.inputs, 'A_Color').default_value = hex_to_linear(c[low])
    _socket(mix.inputs, 'B_Color').default_value = hex_to_linear(c[top])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(_socket(mix.outputs, 'Result_Color'), em.inputs['Color'])
    em.inputs['Strength'].default_value = SKY_EMISSION
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def kit(stem, pack, name, coll, loc, scale=1.0, yaw=0.0):
    """One Tiny Treats / KayKit model as a single mesh (origin at its bottom centre)."""
    o = import_joined(tt_model(stem, pack), name)
    move_to(o, coll)
    o.location = loc
    o.scale = (scale,) * 3
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0.0, 0.0, math.radians(yaw))
    return o


def world_pts(objs):
    bpy.context.view_layer.update()
    return eval_world_verts([o for o in objs if o.type == 'MESH'], bpy.context.evaluated_depsgraph_get())


def state_coll(parent, group, state):
    """A `state.<group>-<state>` child of a sprite group (collection names are global), its `bhc_state` = `state`."""
    sc = bpy.data.collections.new(f'state.{group}-{state}')
    sc['bhc_state'] = state
    parent.children.link(sc)
    return sc


def no_shadow(objs):
    for o in objs:
        o.visible_shadow = False


# --- the room (plate) -----------------------------------------------------------------------------------------

def build_room(c, plate):
    floor_a, floor_b = mat(c['floor'], 0.7), mat(c['floorDark'], 0.7)
    n = int((WALL_Y + 7.0) / BOARD_W) + 1
    for k in range(n):
        y1 = WALL_Y - k * BOARD_W
        rbox(f'floor-board-{k}', (2 * ROOM_HALF, BOARD_W - 0.025, 0.1), 0.02, floor_b if k % 3 == 2 else floor_a, plate, None, (0.0, y1 - BOARD_W / 2, -0.05))
    wall = mat(c['wall'], 0.85)
    rbox('wall', (2 * ROOM_HALF, 0.2, WALL_H), 0.02, wall, plate, None, (0.0, WALL_Y + 0.1, WALL_H / 2))
    rbox('wall-skirting', (2 * ROOM_HALF, 0.08, SKIRT_H), 0.03, mat(c['skirting'], 0.5), plate, None, (0.0, WALL_Y - 0.03, SKIRT_H / 2))
    build_window(c, plate)
    # Soft wallpaper dots, clear of the window, the paintings and the shelf.
    keep = [(WINDOW[0], WINDOW[1], WINDOW[2] / 2 + 0.75, WINDOW[3] / 2 + 0.3)]
    keep += [(x, z, 0.75, 0.85) for (_s, (x, z), _k, _p) in FRAMES]
    keep.append((SHELF[1][0], SHELF[1][1], 0.9, 0.6))
    dot = mat(c['wallDot'], 0.85)
    rnd = random.Random(SEED)
    placed = 0
    for _ in range(DOTS * 6):
        if placed >= DOTS:
            break
        x, z = rnd.uniform(-ROOM_HALF + 0.5, ROOM_HALF - 0.5), rnd.uniform(1.2, WALL_H - 0.4)
        if any(abs(x - kx) < hx and abs(z - kz) < hz for (kx, kz, hx, hz) in keep):
            continue
        blob(f'wall-dot-{placed}', dot, plate, None, (x, WALL_Y - 0.005, z), (DOT_R, 0.012, DOT_R), seg=(16, 8))
        placed += 1


def build_window(c, plate):
    cx, cz, w, h = WINDOW
    y = WALL_Y - 0.01
    # By day the window shows a light blue sky with two soft clouds; the night sky and the moon are the `window`
    # sprite (build_night_window), crossfaded in with the night tint at runtime.
    pane = sky_pane('window-sky', sky_material(c, 'daySkyLow', 'daySkyTop', 'bedtime-day-sky'), plate, cx, y, cz, w, h)
    pane.visible_shadow = False
    cloud = emissive('bedtime-cloud', c['cloud'], 1.0)
    for i, (u, v, k) in enumerate(DAY_CLOUDS):
        for j, (dx, dz, r) in enumerate(((-0.9, 0.0, 0.55), (0.0, 0.25, 0.8), (0.9, 0.0, 0.6))):
            blob(f'window-cloud-{i}-{j}', cloud, plate, None, (cx + u * w + dx * k, y - 0.01 - 0.001 * j, cz + v * h + dz * k), (r * k, 0.005, r * k * 0.7), seg=(24, 8))
    frame = mat(c['windowFrame'], 0.45)
    t = FRAME_BAR
    rbox('window-frame-top', (w + 2 * t, 0.14, t), 0.03, frame, plate, None, (cx, y - 0.05, cz + h / 2 + t / 2))
    rbox('window-frame-bottom', (w + 2 * t, 0.14, t), 0.03, frame, plate, None, (cx, y - 0.05, cz - h / 2 - t / 2))
    for side in (-1, 1):
        rbox(f'window-frame-{side}', (t, 0.14, h + 2 * t), 0.03, frame, plate, None, (cx + side * (w / 2 + t / 2), y - 0.05, cz))
    rbox('window-mullion-v', (t * 0.7, 0.1, h), 0.02, frame, plate, None, (cx, y - 0.04, cz))
    rbox('window-mullion-h', (w, 0.1, t * 0.7), 0.02, frame, plate, None, (cx, y - 0.04, cz))
    rbox('window-sill', (w + 0.5, 0.32, 0.1), 0.04, frame, plate, None, (cx, y - 0.14, cz - h / 2 - t - 0.04))
    # Two gathered curtains and their rod.
    cur, deep = mat(c['curtain'], 0.75), mat(c['curtainDark'], 0.8)
    top = cz + h / 2 + 0.35
    rod('curtain-rod', (cx - w / 2 - 0.9, y - 0.25, top), (cx + w / 2 + 0.9, y - 0.25, top), 0.05, mat(c['skirting'], 0.4), plate, None)
    for side in (-1, 1):
        x0 = cx + side * (w / 2 + 0.25)
        for k in range(3):
            xx = x0 + side * (k - 1) * 0.22
            blob(f'curtain-{side}-{k}', cur if k % 2 == 0 else deep, plate, None, (xx, y - 0.18, cz + 0.05), (0.17, 0.1, h / 2 + 0.38), seg=(24, 16))
        blob(f'curtain-tie-{side}', mat(c['quiltTrim'], 0.6), plate, None, (x0, y - 0.3, cz - 0.15), (0.32, 0.06, 0.06))
    no_shadow([o for o in plate.objects if o.name.startswith(('window-', 'curtain-'))])


def sky_pane(name, material, coll, cx, y, cz, w, h):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in ((-w / 2, 0.0, -h / 2), (w / 2, 0.0, -h / 2), (w / 2, 0.0, h / 2), (-w / 2, 0.0, h / 2))])
    pane = mesh_obj(name, bm, material, coll, smooth=False)
    pane.location = (cx, y, cz)
    return pane


def build_night_window(c, sprites):
    """The `window` sprite: the evening sky and a crescent moon over the day pane. The window frame, its bars and the
    curtains (plate objects in front of it) cut it (holdout), so at runtime it fades in behind them with the night."""
    coll = bpy.data.collections.new('sprite.window')
    sprites.children.link(coll)
    coll['holdout_occluders'] = 1
    coll['movable'] = 1
    coll['states'] = '{"night": [1]}'
    cx, cz, w, h = WINDOW
    y = WALL_Y - 0.04  # in front of the day pane and its clouds (they are cut away), behind the frame bars
    sky = sky_material(c)
    sky_pane('window-night-sky', sky, coll, cx, y, cz, w, h)
    moon = emissive('bedtime-moon', c['moon'], 1.6)
    mx, mz, mr = MOON
    blob('window-moon', moon, coll, None, (mx, y - 0.01, mz), (mr, 0.01, mr), seg=(32, 12))
    blob('window-moon-shade', sky, coll, None, (mx + mr * 0.45, y - 0.02, mz + mr * 0.3), (mr * 0.85, 0.01, mr * 0.85), seg=(32, 12))
    no_shadow(list(coll.objects))
    return coll


def painting(kind, c, plate, cx, cz, w, h, y):
    """A cute painting in a frame's opening: a sunny hill or a pink heart."""
    rbox(f'paint-{kind}-canvas', (w, 0.02, h), 0.01, mat(c['paintSky'], 0.8), plate, None, (cx, y, cz))
    if kind == 'sun':
        blob(f'paint-{kind}-sun', mat(c['paintSun'], 0.6), plate, None, (cx + w * 0.18, y - 0.02, cz + h * 0.18), (w * 0.18, 0.01, w * 0.18), seg=(24, 8))
        blob(f'paint-{kind}-hill', mat(c['paintHill'], 0.7), plate, None, (cx - w * 0.1, y - 0.015, cz - h * 0.42), (w * 0.62, 0.01, h * 0.32), seg=(24, 8))
    else:
        heart = mat(c['paintHeart'], 0.6)
        r = w * 0.2
        for side in (-1, 1):
            blob(f'paint-{kind}-lobe-{side}', heart, plate, None, (cx + side * r * 0.75, y - 0.02, cz + r * 0.35), (r, 0.01, r), seg=(24, 8))
        bm = bmesh.new()
        bm.faces.new([bm.verts.new(p) for p in ((-r * 1.62, 0.0, r * 0.25), (r * 1.62, 0.0, r * 0.25), (0.0, 0.0, -r * 1.9))])
        tip = mesh_obj(f'paint-{kind}-tip', bm, heart, plate, smooth=False)
        tip.location = (cx, y - 0.02, cz)


def build_plate(scene, screen, params, plate):
    c = params['art']['bedtime']
    build_room(c, plate)
    # The bed: side on, the headboard to the right (+x), its back against the wall.
    bed = kit('bed_single_A', 'Furniture', 'bed', plate, (0.0, 0.0, 0.0), BED_SCALE)
    bpy.context.view_layer.update()
    pts = world_pts([bed])
    z_hi = max(p.z for p in pts)
    top = [p for p in pts if p.z > z_hi - 0.08]
    head_y = sum(p.y for p in top) / len(top)
    bed.rotation_euler = (0.0, 0.0, math.radians(-90.0 if head_y > 0 else 90.0))
    bpy.context.view_layer.update()
    pts = world_pts([bed])
    y_back = max(p.y for p in pts)
    bed.location = (BED_X, WALL_Y - 0.05 - y_back, 0.0)
    pts = world_pts([bed])
    box = (min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts), max(p.z for p in pts))
    # The mattress top: the highest point over the bed's foot half (no pillow, no headboard).
    mid = [p for p in pts if box[0] + 0.3 < p.x < (box[0] + box[1]) / 2]
    mattress = max(p.z for p in mid)
    report(screen, 'bed', pts)
    stand = kit('cabinet_small', 'Furniture', 'nightstand', plate, (STAND_X, 0.0, 0.0), STAND_SCALE)
    sp = world_pts([stand])
    stand.location.y = WALL_Y - 0.05 - max(p.y for p in sp)
    sp = world_pts([stand])
    stool = kit('table_small', 'Furniture', 'stool', plate, (STOOL_X, STOOL_Y, 0.0), STOOL_SCALE)
    tp = world_pts([stool])
    cup = kit('toothbrush_cup', 'Bubbly', 'brush-cup', plate, (STOOL_X - 0.08, STOOL_Y, max(p.z for p in tp)), CUP_SCALE)
    cp = world_pts([cup])
    pink = toothbrush('toothbrush_pink', 'brush-pink', plate, BRUSH_SCALE * 0.95)
    put_brush(pink, cp, -BRUSH_TILT * 0.8)
    kit(RUG[0], 'Furniture', 'rug', plate, RUG[1], RUG[2])
    for stem, (x, z), k, kind in FRAMES:
        fr = kit(stem, 'Furniture', f'frame-{kind}', plate, (x, 0.0, 0.0), k)
        fp = world_pts([fr])
        fr.location = (x, WALL_Y - 0.02 - max(p.y for p in fp), z - (max(p.z for p in fp) - min(p.z for p in fp)) / 2)
        fp = world_pts([fr])
        w = max(p.x for p in fp) - min(p.x for p in fp)
        h = max(p.z for p in fp) - min(p.z for p in fp)
        painting(kind, c, plate, x, (min(p.z for p in fp) + max(p.z for p in fp)) / 2, w * 0.66, h * 0.7, min(p.y for p in fp) + 0.06)
    stem, (x, z), k = SHELF
    shelf = kit(stem, 'Furniture', 'shelf', plate, (x, 0.0, z), k)
    shp = world_pts([shelf])
    shelf.location.y = WALL_Y - 0.02 - max(p.y for p in shp)
    shp = world_pts([shelf])
    kit('book_set', 'Furniture', 'shelf-books', plate, (x - 0.1, (min(p.y for p in shp) + max(p.y for p in shp)) / 2, max(p.z for p in shp)), k)
    no_shadow([o for o in plate.objects if o.name.startswith(('frame-', 'paint-', 'shelf', 'wall-dot'))])
    return {'bed': box, 'mattress': mattress, 'stand': sp, 'stool': tp, 'cup': cp}


# --- the toothbrush -----------------------------------------------------------------------------------------

def toothbrush(stem, name, coll, scale):
    """A Bubbly Bathroom toothbrush standing up, its bristles on top facing the camera (origin at its foot)."""
    o = import_joined(tt_model(stem, 'Bubbly'), name)
    move_to(o, coll)
    pts = [v.co for v in o.data.vertices]
    z_hi = max(p.z for p in pts)
    bristles = [p for p in pts if p.z > z_hi - 0.03]
    head_y = sum(p.y for p in bristles) / len(bristles)
    # Stand it up: the bristle end goes to +z, the bristles then face −y (the camera).
    bm = bmesh.new()
    bm.from_mesh(o.data)
    R = Matrix.Rotation(math.radians(90.0 if head_y > 0 else -90.0), 4, 'X')
    bmesh.ops.transform(bm, matrix=R, verts=bm.verts)
    zmin = min(v.co.z for v in bm.verts)
    cx = sum(v.co.x for v in bm.verts) / len(bm.verts)
    cy = sum(v.co.y for v in bm.verts) / len(bm.verts)
    bmesh.ops.translate(bm, vec=(-cx, -cy, -zmin), verts=bm.verts)
    if head_y < 0:  # the bristles must face the camera (−y)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi, 3, 'Z'), verts=bm.verts)
    bm.to_mesh(o.data)
    bm.free()
    o.scale = (scale,) * 3
    return o


def put_brush(o, cup_pts, tilt):
    """Stands a brush in the cup, leaning `tilt` degrees about y (positive: its top to the right)."""
    cx = (min(p.x for p in cup_pts) + max(p.x for p in cup_pts)) / 2
    cy = (min(p.y for p in cup_pts) + max(p.y for p in cup_pts)) / 2
    z0 = min(p.z for p in cup_pts) + 0.06
    o.location = (cx, cy, z0)
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0.0, math.radians(tilt), 0.0)


# --- Shiba: the chibi toy, posed by moving its parts ---------------------------------------------------------------

def part(name, suffix):
    o = bpy.data.objects.get(f'{name}-{suffix}')
    if o is None:
        fail(f'chibi part "{name}-{suffix}" is missing (cute.chibi names changed?)')
    return o


def lie_down(name):
    """Lying like a sphinx (the chibi has no skeleton): the torso lowered and moved back, the hind spheres tucked
    beside it, the front legs and paws slid forward on the bed, the head lowered onto the paws, the tail on the back."""
    for suffix, (loc, rot) in LIE_PARTS.items():
        o = part(name, suffix)
        o.location = loc
        if rot is not None:
            o.rotation_euler = tuple(math.radians(a) for a in rot)
    part(name, 'head').location = LIE_HEAD
    part(name, 'tail').location = LIE_TAIL


def open_mouth(rig, name, kind, c):
    """A small open mouth (a giggle) or a wide one (a yawn) under the snout (head space; the tongue shows in it)."""
    at, size = MOUTH_PART[kind]
    o = blob(f'{name}-mouth', mat(c['mouth'], 0.6), rig['head'].users_collection[0], rig['head'], at, size, seg=(24, 12))
    o['cute'] = 1
    return o


def build_pose(pose, coll, mats, c):
    """One posed chibi Shiba `shiba-<pose>` in `coll` (unit size, at the origin); returns (rig, name)."""
    name = f'{SHIBA}-{pose}'
    rig = chibi('dog', name, coll, mats)
    k = dict(POSE_KEYS[pose])
    mouth = k.pop('mouth')
    if pose in LYING:
        lie_down(name)
    if mouth:
        open_mouth(rig, name, mouth, c)
    key_chibi(rig, IDLE_FRAME, **k)
    rig['root'].scale = (SHIBA_K,) * 3
    return rig, name


def rig_pts(name, suffixes=None):
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(f'{name}-')]
    if suffixes is not None:
        objs = [o for o in objs if o.name[len(name) + 1:] in suffixes]
    return world_pts(objs)


def mouth_point(name):
    """The current world position of the open mouth part `<rig>-mouth`."""
    o = bpy.data.objects.get(f'{name}-mouth')
    return o.matrix_world.translation.copy() if o else None


def build_shiba(c, params, sprites, room):
    coll = bpy.data.collections.new('sprite.shiba')
    sprites.children.link(coll)
    colours = {**params['colours'], 'creatureLight': params['art']['creatureLight']}
    mats = chibi_materials(colours, colours['creatureOrange'], colours['creatureLight'])
    _x0, x1, y0, y1, _zt = room['bed']
    bed_y = (y0 + y1) / 2 - 0.1
    z = room['mattress']
    out = {}
    bpy.context.scene.frame_set(IDLE_FRAME)
    for pose in POSES:
        sc = state_coll(coll, 'shiba', pose)
        rig, name = build_pose(pose, sc, mats, c)
        root = rig['root']
        if pose in ('sit', 'brush'):
            root.rotation_euler = (0.0, 0.0, math.radians(SIT_YAW))
            bpy.context.view_layer.update()
            pts = rig_pts(name)
            root.location = (SIT_X - (min(p.x for p in pts) + max(p.x for p in pts)) / 2, bed_y - (min(p.y for p in pts) + max(p.y for p in pts)) / 2, z - 0.04)
        else:
            # Along the bed, the nose to the pillow (+x); the roll first turns it about its long axis onto its side.
            root.rotation_euler = (0.0, math.radians(ROLL_DEG if pose == 'roll' else 0.0), math.radians(90.0))
            bpy.context.view_layer.update()
            pts = rig_pts(name)
            gap = HEADBOARD_GAP - (ROLL_SLIDE if pose == 'roll' else 0.0)
            root.location = (x1 - gap - max(p.x for p in pts), bed_y - (min(p.y for p in pts) + max(p.y for p in pts)) / 2, z - 0.06 - LIE_SINK - min(p.z for p in pts))
        bpy.context.view_layer.update()
        out[pose] = {'pts': rig_pts(name), 'name': name, 'head': rig_pts(name, HEAD_PARTS), 'body': rig_pts(name, BODY_PARTS), 'all': world_pts(list(sc.all_objects))}
    return coll, out


# --- the blanket, the lamp, the brush, the particles ------------------------------------------------------------

def quilt_slab(name, size, at, c, coll, rot=(0.0, 0.0, 0.0)):
    o = rbox(name, size, min(size) * 0.45, mat(c['quilt'], 0.8), coll, None, at, rot)
    return o


def quilt_dots(prefix, c, coll, x0, x1, y0, y1, z, rows=2):
    patch = mat(c['quiltPatch'], 0.8)
    n = max(2, int((x1 - x0) / 0.42))
    for i in range(n):
        for j in range(rows):
            x = x0 + (i + 0.5) * (x1 - x0) / n
            y = y0 + (j + 0.5) * (y1 - y0) / rows
            blob(f'{prefix}-dot-{i}-{j}', patch, coll, None, (x, y, z), (0.07, 0.07, 0.012), seg=(16, 8))


def smooth(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3.0 - 2.0 * t)


def drape(coll, c, x0, x1, y0, y1, z, body, rise):
    """The spread quilt: a soft surface over the mattress (x0…x1, y0 front…y1 back) at `z` + DRAPE_LIFT, lifted by
    `rise` over the body box (bx0, bx1, by0, by1) with gentle slopes, thickened, and a rolled white hem along its
    shoulder edge (x1)."""
    bx0, _bx1, by0, by1 = body
    nx, ny = 64, 24
    height = {}
    bm = bmesh.new()
    grid = []
    for i in range(nx + 1):
        x = x0 + (x1 - x0) * i / nx
        # A soft bump: up from the foot side, and half way down again toward the shoulders (no ridge, no cliff).
        fx = smooth((x - (bx0 - DRAPE_SLOPE_X)) / DRAPE_SLOPE_X) * (DRAPE_SHOULDER + (1 - DRAPE_SHOULDER) * smooth((x1 - x) / DRAPE_SLOPE_X)) * smooth((x1 - x) / DRAPE_EDGE)
        row = []
        for j in range(ny + 1):
            y = y0 + (y1 - y0) * j / ny
            fy = smooth((y - y0) / max(by0 - y0, 0.05)) * smooth((y1 - y) / max(y1 - by1, 0.05))
            h = z + DRAPE_LIFT + rise * fx * fy
            height[(i, j)] = h
            row.append(bm.verts.new((x, y, h)))
        grid.append(row)
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    top = mesh_obj('quilt-top', bm, mat(c['quilt'], 0.8), coll)
    sol = top.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.06
    # The rolled hem across the shoulders, following the surface.
    hem = mat(c['quiltPatch'], 0.7)
    i = nx - 2
    pts = [Vector((x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny, height[(i, j)] + 0.03)) for j in range(0, ny + 1, 2)]
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        rod(f'quilt-hem-roll-{k}', a, b, 0.07, hem, coll, None, seg=12)
    # A few white dots on the quilt.
    patch = mat(c['quiltPatch'], 0.8)
    for i in range(4, nx - 4, 8):
        for j in (ny // 3, 2 * ny // 3):
            x = x0 + (x1 - x0) * i / nx
            y = y0 + (y1 - y0) * j / ny
            blob(f'quilt-dot-{i}-{j}', patch, coll, None, (x, y, height[(i, j)] + 0.008), (0.07, 0.07, 0.012), seg=(16, 8))
    return top


def build_blanket(c, sprites, room, shiba):
    coll = bpy.data.collections.new('sprite.blanket')
    sprites.children.link(coll)
    x0, x1, y0, y1, _zt = room['bed']
    z = room['mattress']
    trim = mat(c['quiltTrim'], 0.6)
    # Off: the quilt folded in three at the bed's foot.
    off = state_coll(coll, 'blanket', 'off')
    fx0, fx1 = x0 + 0.3, x0 + 0.95
    for k in range(3):
        quilt_slab(f'quilt-fold-{k}', (fx1 - fx0 - k * 0.04, (y1 - y0) * 0.86, 0.13), ((fx0 + fx1) / 2, (y0 + y1) / 2, z + 0.06 + k * 0.12), c, off)
    rod('quilt-fold-trim', (fx0 + 0.05, y0 + 0.12, z + 0.33), (fx1 - 0.05, y0 + 0.12, z + 0.33), 0.035, trim, off, None)
    quilt_dots('quilt-fold', c, off, fx0 + 0.05, fx1 - 0.05, y0 + 0.25, y1 - 0.2, z + 0.37)
    # On: spread from the foot to Shiba's shoulders (every lying pose), over a hump for its body, hanging down the front.
    # The chibi's body parts (torso, belly, hind legs, tail; not the head or the front paws under it).
    body = [p for pose in ('lie', 'lie-brush', 'sleep') for p in shiba[pose]['body']]
    bx0, bx1 = min(p.x for p in body), max(p.x for p in body)
    by0, by1 = min(p.y for p in body), max(p.y for p in body)
    bz1 = max(p.z for p in body)
    on = state_coll(coll, 'blanket', 'on')
    sx0, sx1 = x0 + 0.12, bx1 + DRAPE_NECK
    quilt_slab('quilt-front', (sx1 - sx0, 0.1, 0.3), ((sx0 + sx1) / 2, y0 - 0.06, z - 0.1), c, on)
    # Review: a gently draped quilt (no dome): a heightfield over the mattress, flat at the foot, rising softly over
    # Shiba's body, with a rolled white hem across its shoulders; Shiba lies a little sunk into the soft bed.
    drape(on, c, sx0, sx1, y0 - 0.06, y1 + 0.02, z, (bx0, bx1, by0, by1), max(bz1 - z, 0.12) * DRAPE_RISE)
    rod('quilt-trim', (sx0, y0 - 0.12, z + 0.1), (sx1, y0 - 0.12, z + 0.1), 0.04, trim, on, None)
    rod('quilt-hem', (sx0, y0 - 0.12, z - 0.24), (sx1, y0 - 0.12, z - 0.24), 0.035, trim, on, None)
    quilt_dots('quilt-front', c, on, sx0 + 0.05, sx1 - 0.05, y0 - 0.115, y0 - 0.115, z - 0.1, rows=1)
    for o in on.objects:
        if o.name.startswith('quilt-front-dot'):
            o.scale = (1.0, 0.2, 5.0)
    return coll, {'off': [o for o in off.objects], 'on': [o for o in on.objects], 'fold': (fx0, fx1)}


def build_lamp(c, sprites, room):
    coll = bpy.data.collections.new('sprite.lamp')
    sprites.children.link(coll)
    sp = room['stand']
    top = max(p.z for p in sp)
    cx = (min(p.x for p in sp) + max(p.x for p in sp)) / 2
    cy = (min(p.y for p in sp) + max(p.y for p in sp)) / 2
    lit = {}
    for state in ('on', 'off'):
        sc = state_coll(coll, 'lamp', state)
        o = kit('lamp_table', 'Furniture', f'lamp-{state}', sc, (cx, cy, top), LAMP_SCALE)
        if state == 'on':
            # The shade glows warm (its texture plus an emission of the glow colour), a bulb shines under it.
            m = o.data.materials[0].copy()
            m.name = 'bedtime-lamp-lit'
            b = principled(m)
            b.inputs['Emission Color'].default_value = hex_to_linear(c['glow'])
            b.inputs['Emission Strength'].default_value = 0.9
            o.data = o.data.copy()
            o.data.materials[0] = m
        lit[state] = o
    lp = world_pts([lit['on']])
    shade = (cx, cy - 0.05, min(p.z for p in lp) + (max(p.z for p in lp) - min(p.z for p in lp)) * 0.62)
    return coll, lit, shade


def build_brush(c, sprites, room):
    coll = bpy.data.collections.new('sprite.brush')
    sprites.children.link(coll)
    o = toothbrush('toothbrush_blue', 'brush', coll, BRUSH_SCALE)
    put_brush(o, room['cup'], BRUSH_TILT)
    bpy.context.view_layer.update()
    pts = world_pts([o])
    z_hi = max(p.z for p in pts)
    head = [p for p in pts if p.z > z_hi - 0.16]
    tip = Vector((sum(p.x for p in head) / len(head), sum(p.y for p in head) / len(head), sum(p.z for p in head) / len(head)))
    return coll, o, tip


def star_mesh(name, r_out, r_in, depth, material, coll):
    bm = bmesh.new()
    front, back = [], []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        r = r_out if k % 2 == 0 else r_in
        front.append(bm.verts.new((r * math.cos(a), -depth / 2, r * math.sin(a))))
        back.append(bm.verts.new((r * math.cos(a), depth / 2, r * math.sin(a))))
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for k in range(10):
        j = (k + 1) % 10
        bm.faces.new((front[k], front[j], back[j], back[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=depth * 0.35, segments=3, affect='EDGES', clamp_overlap=True)
    return mesh_obj(name, bm, material, coll, smooth=True)


def build_particles(c, sprites):
    made = {}
    for pid in ('bubble', 'star', 'z'):
        coll = bpy.data.collections.new(f'sprite.{pid}')
        sprites.children.link(coll)
        coll['bhc_detached'] = 1
        at = PARTICLE_AT[pid]
        if pid == 'bubble':
            o = blob('bubble', mat(c['foam'], 0.15), coll, None, at, (0.13, 0.13, 0.13), seg=(32, 16))
            blob('bubble-shine', emissive('bedtime-shine', '#FFFFFF', 1.2), coll, None, (at[0] - 0.045, at[1] - 0.11, at[2] + 0.05), (0.03, 0.01, 0.03), seg=(16, 8))
        elif pid == 'star':
            m = mat(c['star'], 0.35)
            b = principled(m)
            b.inputs['Emission Color'].default_value = hex_to_linear(c['star'])
            b.inputs['Emission Strength'].default_value = 0.6
            o = star_mesh('star', 0.16, 0.075, 0.05, m, coll)
            o.location = at
        else:
            cu = bpy.data.curves.new('z-text', 'FONT')
            cu.body = 'z'
            cu.size = 0.42
            cu.extrude = 0.03
            cu.bevel_depth = 0.012
            cu.align_x = 'CENTER'
            cu.align_y = 'CENTER'
            t = bpy.data.objects.new('z-text', cu)
            coll.objects.link(t)
            t.data.materials.append(mat(c['z'], 0.4))
            t.location = at
            t.rotation_euler = (math.radians(90.0), 0.0, 0.0)
            o = t
        made[pid] = o
    return made


# --- the layout ---------------------------------------------------------------------------------------------------

def build_layout(screen, room, shiba, blanket, lamp, brush, layout):
    _lc, lit, shade = lamp
    _bc, brush_obj, tip = brush
    _kc, blanket_parts = blanket[0], blanket[1]
    x0, x1, y0, y1, _zt = room['bed']
    z = room['mattress']
    # Brush: the brush with its cup and the stool.
    pts = world_pts([brush_obj]) + room['stool'] + room['cup']
    hull_object('hit.brush', [tuple(p) for p in pts], layout)
    report(screen, 'hit.brush', pts)
    # Lamp: the lamp (on) with the nightstand.
    pts = world_pts([lit['on']]) + room['stand']
    hull_object('hit.lamp', [tuple(p) for p in pts], layout)
    report(screen, 'hit.lamp', pts)
    # Blanket: the folded quilt and the bed's foot under it, down to the floor.
    fold = world_pts(blanket_parts['off'])
    fx0, fx1 = blanket_parts['fold']
    pts = fold + [Vector((x, y0, 0.05)) for x in (fx0, fx1)] + [Vector((x, y0, z)) for x in (fx0, fx1)]
    hull_object('hit.blanket', [tuple(p) for p in pts], layout)
    report(screen, 'hit.blanket', pts)
    # Shiba: every pose (its head, its body, wherever it is), clipped to the bed's right part.
    pts = [p for pose in POSES for p in shiba[pose]['pts']]
    hull_object('hit.shiba', [tuple(p) for p in pts], layout)
    report(screen, 'hit.shiba', pts)
    # Anchors.
    for pose, aid in (('brush', 'mouth-sit'), ('lie-brush', 'mouth-lie')):
        at = mouth_point(shiba[pose]['name'])
        add_empty(f'anchor.{aid}', tuple(at), layout)
        print(f'build_bedtime: anchor.{aid} {screen.project(at)}')
    add_empty('anchor.brush-head', tuple(tip), layout)
    # The sleeping head (skull, face, ears): the "z" rise from the middle of its top.
    hp = shiba['sleep']['head']
    add_empty('anchor.head-sleep', ((min(p.x for p in hp) + max(p.x for p in hp)) / 2, (min(p.y for p in hp) + max(p.y for p in hp)) / 2, max(p.z for p in hp)), layout)
    add_empty('anchor.lamp', shade, layout)
    cx, cz, w, h = WINDOW
    spots = [(-0.32, 0.28), (0.12, 0.36), (0.36, -0.05), (-0.2, -0.22), (0.05, 0.02)]
    for i, (u, v) in enumerate(spots[:STAR_ANCHORS]):
        add_empty(f'anchor.star-{i + 1}', (cx + u * w, WALL_Y - 0.05, cz + v * h), layout)


def main():
    global DESIGN
    args = parse_args('build_bedtime', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    c = params['art']['bedtime']
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(IDLE_FRAME)
    make_camera(scene)
    bpy.context.view_layer.update()
    screen = Screen(scene)
    plate = bpy.data.collections.new('bedtime-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    room = build_plate(scene, screen, params, plate)
    _sc, shiba = build_shiba(c, params, sprites, room)
    for pose in POSES:
        report(screen, f'shiba/{pose}', shiba[pose]['all'])
    blanket = build_blanket(c, sprites, room, shiba)
    report(screen, 'blanket/on', world_pts(blanket[1]['on']))
    lamp = build_lamp(c, sprites, room)
    brush = build_brush(c, sprites, room)
    build_particles(c, sprites)
    build_night_window(c, sprites)
    scene.frame_set(IDLE_FRAME)
    bpy.context.view_layer.update()
    build_layout(screen, room, shiba, blanket, lamp, brush, layout)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_bedtime: saved {args["out"]}')


if __name__ == '__main__':
    main()
