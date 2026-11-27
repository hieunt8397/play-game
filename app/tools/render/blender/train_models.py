# The toy train's models (Tàu hỏa chở bạn, spec-tau-hoa, 2026-11-12). Imported, never run.
#
# 2026-11-13 (spec-tau-quanh-dao): the train game moved onto the island (build_train.py now builds it from the map).
# This file is the old side-view builder, kept as the source of the engine and the three cars: `build_library(params)`
# builds `sprite.engine` and `sprite.car-<colour>` in a scratch scene with the old orthographic camera, then keeps them
# as library collections (no scene, a fake user, `bhc_library`: render_screen.py never renders them), so map_rides.py
# goes on appending the same engine and cars from art/train.blend. The old game's other art (the platform, the
# countryside, the tunnel, the surprises) is gone: see git history (spec-tau-hoa) for it.
# The models (built in metres; the old camera's design px along x only place them):
#   - engine: a round toy steam engine facing screen right (green boiler with yellow bands, a red cab roof, a dark
#     chimney, a lamp, a cowcatcher, three red wheels with yellow hubs and a rod), driven by the chibi Shiba
#     (cute.chibi('dog')) in a blue conductor's cap. States: idle [1], run [10, 11] (the wheels a quarter turn apart,
#     the rod up / forward), toot [20] (a puff over the chimney, the Shiba's head up), happy [30] (eyes shut, tongue);
#   - car-<colour>: three open wagons (red, yellow, blue), each where it stands behind the engine (states idle: the
#     whole wagon; front: its front wall alone).
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, chibi, chibi_materials, key_chibi, lathe, mat, rbox, rod, rounded_profile, torus  # noqa: E402
from common import add_empty, hull_object  # noqa: E402
import build_plane as bp  # noqa: E402  (the camera, fit and shapes; its main() only runs as a script)

RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in build_library

# --- the world (design px) ------------------------------------------------------------------------------------------
REF_PX = (512.0, 600.0)  # world (0, 0, 0): the middle of the track
RAIL_TOP = 0.1

# --- the train (design px along x; built in metres, 1 m = ORTHO_PX_PER_M px) ----------------------------------------
ENGINE_X = 610.0  # the engine's middle
CAR_X = [418.0, 270.0, 122.0]  # car 0 (behind the engine) … car 2 (the tail): ≥ targetGap between their raw hulls
CAR_LEN = 1.15
CAR_W = 0.86
ENGINE_LEN = 1.9
WHEEL_R = 0.25
CAR_WHEEL_R = 0.19
SHIBA_SCALE = 0.46
E_IDLE, E_RUN, E_TOOT, E_HAPPY = [1], [10, 11], [20], [30]
ENGINE_STATES = {'idle': E_IDLE, 'run': E_RUN, 'toot': E_TOOT, 'happy': E_HAPPY}
ENGINE_FRAMES = E_IDLE + E_RUN + E_TOOT + E_HAPPY
SEAT_Z = 0.6  # the seated friend's ground: the car's floor
SEAT_Y = 0.12
SEAT_HEIGHT_PX = 116.0
CAR_COLOUR_KEYS = {'red': 'carRed', 'yellow': 'carYellow', 'blue': 'carBlue'}


HIDDEN = (0.0001, 0.0001, 0.0001)


def fail(msg):
    raise RuntimeError(f'build_train: {msg}')


def log(msg):
    print(f'build_train: {msg}')


# --- small helpers over build_plane's camera --------------------------------------------------------------------------

def wx(sx):
    return bp.wx(sx)


def pt(sx, sy, y):
    return bp.pt(sx, sy, y)


def gy(sy, z=0.0):
    return bp.gy(sy, z)


def screen_y(y, z):
    """Design px y of a world point at depth y, height z."""
    return bp.SCREEN.project((0.0, y, z))[1]


def project(p):
    return bp.SCREEN.project(p)


def mesh_rect(objs):
    return bp.SCREEN.rect(bp.world_pts(objs))


def rect_of(root):
    return bp.rect_of(root)


def fmt_rect(r):
    return bp.fmt_rect(r)


def fmt_px(p):
    return f'({p[0]:.0f}, {p[1]:.0f})'


def empty(name, coll, parent=None, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)):
    return bp.empty(name, coll, parent, loc, rot)


def sprite(sprites, name, **props):
    return bp.sprite(sprites, name, **props)


def show_on(obj, on, frames, scale=(1.0, 1.0, 1.0)):
    bp.show_on(obj, on, frames, scale)


def key_rot(obj, by_frame):
    bp.key_rot(obj, by_frame)


def key_loc(obj, by_frame):
    """Keys location per frame, constant."""
    from common import key_constant
    for f, loc in by_frame.items():
        obj.location = loc
        obj.keyframe_insert('location', frame=f)
    key_constant(obj)


def ground_root(name, coll, sx, depth, yaw=0.0):
    """An empty on the ground at design x `sx`, world depth `depth` (its local front −y faces the camera)."""
    return empty(name, coll, None, (wx(sx), depth, 0.0), (0.0, 0.0, yaw))


def cyl_x(name, r, x0, x1, material, coll, parent, y=0.0, z=0.0, round_=0.25):
    """A cylinder along x from x0 to x1 (radius r) with rounded rims."""
    o = lathe(name, rounded_profile(r, 0.0, x1 - x0, round_), material, coll, parent, (x0, y, z), (0.0, 90.0, 0.0), seg=40)
    return o


# --- the engine -----------------------------------------------------------------------------------------------------

def wheel_set(name, c, coll, parent, x, r, near_y, run_frames, all_frames, tyre_key='wheel'):
    """A toy wheel on the near side (a fat disc, a darker rim, a yellow hub and four spoke dots that turn a quarter
    between the two run frames) and a plain one on the far side."""
    tyre, rim, hub = mat(c[tyre_key], 0.4), mat(bp.mix_hex(c[tyre_key], c['ink'], 0.35), 0.45), mat(c['wheelHub'], 0.35)
    z = RAIL_TOP + r
    for side, y in (('near', near_y), ('far', -near_y)):
        blob(f'{name}-{side}', tyre, coll, parent, (x, y, z), (r, 0.07, r), seg=(40, 12))
        torus(f'{name}-{side}-rim', r * 0.92, r * 0.1, rim, coll, parent, (x, y - 0.06 * (1 if side == 'near' else -1), z), (90.0, 0.0, 0.0))
    blob(f'{name}-hub', hub, coll, parent, (x, near_y - 0.07, z), (r * 0.3, 0.04, r * 0.3), seg=(24, 10))
    spokes = empty(f'{name}-spokes', coll, parent, (x, near_y - 0.075, z))
    for k in range(4):
        a = math.radians(90.0 * k + 45.0)
        blob(f'{name}-spoke-{k}', hub, coll, spokes, (math.cos(a) * r * 0.62, 0.0, math.sin(a) * r * 0.62), (r * 0.12, 0.03, r * 0.12), seg=(16, 8))
    key_rot(spokes, {f: (0.0, (45.0 if f == run_frames[-1] else 0.0), 0.0) for f in all_frames})
    return z


def build_driver(params, c, coll, parent, at):
    colours = {**params['colours'], 'creatureLight': params['art']['creatureLight']}
    mats = chibi_materials(colours, colours['creatureOrange'], colours['creatureLight'])
    rig = chibi('dog', 'driver', coll, mats)
    root = rig['root']
    root.parent = parent
    root.location = at
    root.rotation_euler = (0.0, 0.0, math.radians(90.0 - 38.0))  # its front (−y) toward the nose (+x), turned to the camera
    root.scale = (SHIBA_SCALE, SHIBA_SCALE, SHIBA_SCALE)
    rig['tail'].scale = HIDDEN
    head = rig['head']
    # The conductor's cap: a round blue crown, a yellow band and a short peak over the eyes.
    cap, band = mat(c['cap'], 0.45), mat(c['capBand'], 0.4)
    skull_c, skull_r = (0.0, -0.03, 0.38), (0.62, 0.55, 0.55)
    top = Vector(skull_c) + Vector((0.0, 0.02, skull_r[2] * 0.82))
    lathe('driver-cap', [(0.0, 0.0), (0.5, 0.0), (0.52, 0.06), (0.5, 0.2), (0.44, 0.28), (0.0, 0.3)], cap, coll, head, top, (-8.0, 0.0, 0.0), seg=40)['cute'] = 1
    torus('driver-cap-band', 0.5, 0.05, band, coll, head, top + Vector((0.0, 0.0, 0.06)), (-8.0, 0.0, 0.0))['cute'] = 1
    peak = blob('driver-cap-peak', cap, coll, head, top + Vector((0.0, -0.46, 0.0)), (0.36, 0.2, 0.04), (-14.0, 0.0, 0.0), seg=(24, 10))
    peak['cute'] = 1
    blob('driver-cap-badge', band, coll, head, top + Vector((0.0, -0.49, 0.14)), (0.07, 0.03, 0.07), (-8.0, 0.0, 0.0), seg=(16, 8))['cute'] = 1
    turn = -10.0
    key_chibi(rig, E_IDLE[0], head_pitch=-4.0, head_yaw=turn, eyes='open')
    for f in E_RUN:
        key_chibi(rig, f, head_pitch=-4.0, head_yaw=turn, eyes='open')
    key_chibi(rig, E_TOOT[0], head_pitch=-14.0, head_yaw=turn - 6.0, head_roll=5.0, eyes='squint', tongue=False)
    key_chibi(rig, E_HAPPY[0], head_pitch=-16.0, head_yaw=turn - 8.0, head_roll=7.0, tongue=True, eyes='shut', bob=0.06)
    return rig


def build_engine(params, c, sprites, layout):
    coll = sprite(sprites, 'engine', states=json.dumps(ENGINE_STATES, separators=(',', ':')))
    root = ground_root('engine-root', coll, ENGINE_X, 0.0)
    body, dark = mat(c['engine'], 0.32), mat(c['engineDark'], 0.4)
    band, roof = mat(c['boilerBand'], 0.35), mat(c['cabRoof'], 0.35)
    ink = mat(c['chimney'], 0.5)
    half = ENGINE_LEN / 2
    # The footplate and the buffer beam.
    rbox('engine-footplate', (ENGINE_LEN, CAR_W + 0.06, 0.12), 0.05, dark, coll, root, (0.0, 0.0, 0.66))
    # The boiler: a fat cylinder from the cab to the front, a dark smokebox face, three yellow bands.
    cyl_x('engine-boiler', 0.36, -0.2, half - 0.05, body, coll, root, z=1.02)
    blob('engine-smokebox', ink, coll, root, (half - 0.06, 0.0, 1.02), (0.06, 0.33, 0.33), seg=(32, 12))
    for k, x in enumerate((0.05, 0.38, 0.72)):
        torus(f'engine-band-{k}', 0.365, 0.035, band, coll, root, (x, 0.0, 1.02), (0.0, 90.0, 0.0))
    # The chimney (flared), the yellow dome, the lamp.
    lathe('engine-chimney', [(0.0, 0.0), (0.13, 0.0), (0.12, 0.28), (0.17, 0.38), (0.22, 0.46), (0.22, 0.5), (0.0, 0.5)], ink, coll, root, (0.62, 0.0, 1.28), seg=32)
    torus('engine-chimney-rim', 0.21, 0.035, band, coll, root, (0.62, 0.0, 1.78))
    blob('engine-dome', band, coll, root, (0.25, 0.0, 1.36), (0.17, 0.17, 0.16), seg=(32, 16))
    blob('engine-lamp', mat(c['lamp'], 0.2), coll, root, (half - 0.02, -0.12, 1.36), (0.1, 0.1, 0.1), seg=(24, 12))
    torus('engine-lamp-rim', 0.1, 0.025, ink, coll, root, (half + 0.02, -0.12, 1.36), (0.0, 90.0, 0.0))
    # The cowcatcher and the buffers.
    bp.prism('engine-cowcatcher', [(0.0, 0.0), (0.0, 0.42), (0.3, 0.0)], 0.8, roof, coll, root, (half - 0.04, 0.0, RAIL_TOP + 0.02), bevel=0.03)
    for s in (-1, 1):
        blob(f'engine-buffer-{s}', ink, coll, root, (half + 0.04, 0.3 * s, 0.66), (0.06, 0.07, 0.07), seg=(16, 8))
    # The cab at the back: low walls, a window frame, a red roof on four posts; the Shiba driver sits inside.
    cab_x = -half + 0.36
    rbox('engine-cab', (0.72, CAR_W + 0.04, 0.46), 0.08, body, coll, root, (cab_x, 0.0, 0.92))
    rbox('engine-cab-trim', (0.76, CAR_W + 0.08, 0.08), 0.035, band, coll, root, (cab_x, 0.0, 1.16))
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(f'engine-post-{sx}-{sy}', (cab_x + 0.3 * sx, 0.4 * sy, 1.15), (cab_x + 0.3 * sx, 0.4 * sy, 1.98), 0.04, dark, coll, root, seg=12)
    rbox('engine-roof', (0.92, CAR_W + 0.24, 0.12), 0.06, roof, coll, root, (cab_x, 0.0, 2.02))
    build_driver(params, c, coll, root, (cab_x - 0.02, 0.1, 0.86))
    # The wheels: three big driving wheels on each side (the near ones turn) and the rod joining the near ones.
    xs = (-0.52, 0.02, 0.56)
    near = -(CAR_W / 2 + 0.02)
    for k, x in enumerate(xs):
        z = wheel_set(f'engine-wheel-{k}', c, coll, root, x, WHEEL_R, near, E_RUN, ENGINE_FRAMES)
    rodroot = empty('engine-rod', coll, root, (0.0, near - 0.12, RAIL_TOP + WHEEL_R))
    rbox('engine-rod-bar', (xs[-1] - xs[0] + 0.12, 0.04, 0.06), 0.02, mat(c['rod'], 0.3), coll, rodroot, (0.0, 0.0, 0.0))
    for k, x in enumerate(xs):
        blob(f'engine-rod-pin-{k}', mat(c['rod'], 0.3), coll, rodroot, (x, -0.02, 0.0), (0.045, 0.03, 0.045), seg=(12, 8))
    crank = WHEEL_R * 0.55
    key_loc(rodroot, {f: (0.0, near - 0.12, RAIL_TOP + WHEEL_R + (-crank if f == E_RUN[-1] else crank)) for f in ENGINE_FRAMES})
    # The toot: a soft puff over the chimney.
    puff = empty('engine-puff', coll, root, (0.62, 0.0, 2.02))
    bp.puffs('engine-puff', [(-0.12, 0.0, 0.17), (0.08, 0.1, 0.21), (0.26, 0.2, 0.16), (0.05, -0.08, 0.15)], mat(c['smoke'], 0.7), mat(c['smokeShade'], 0.7), coll, puff, depth=0.16, drop=0.05)
    show_on(puff, E_TOOT, ENGINE_FRAMES)
    scene = bpy.context.scene
    scene.frame_set(E_IDLE[0])
    meshes = bp.meshes_of(root)
    r = mesh_rect(meshes)
    log(f'engine idle {fmt_rect(r)}')
    for f in ENGINE_FRAMES[1:]:
        scene.frame_set(f)
        log(f'engine frame {f} {fmt_rect(mesh_rect(bp.meshes_of(root)))}')
    scene.frame_set(E_IDLE[0])
    bpy.context.view_layer.update()
    hull_object('hit.engine', [p for p in bp.world_pts([o for o in meshes if not o.name.startswith('engine-puff')])], layout)
    add_empty('anchor.engine', (wx(ENGINE_X), 0.0, 0.0), layout)
    add_empty('anchor.chimney', root.matrix_world @ Vector((0.62, 0.0, 1.8)), layout)
    return r


def build_car(n, colour, params, c, sprites, layout):
    key = CAR_COLOUR_KEYS[colour]
    if key not in c or f'{key}Dark' not in c:
        fail(f'Tokens.art.train.{key}(Dark) is missing')
    group = sprite(sprites, f'car-{colour}')
    main, dark = mat(c[key], 0.32), mat(c[f'{key}Dark'], 0.4)
    trim = mat(c['trim'], 0.4)
    ink = mat(c['chimney'], 0.5)
    wall, half_w, z0, z1 = 0.08, CAR_W / 2, 0.56, 1.0

    def front_wall(tag, coll, root):
        """The near wall, its rim and its dots: drawn over the friend sitting inside (and part of the whole car)."""
        rbox(f'car-{colour}-{tag}-front', (CAR_LEN, wall, z1 - z0), 0.04, main, coll, root, (0.0, -(half_w - wall / 2), (z0 + z1) / 2))
        rbox(f'car-{colour}-{tag}-rim-front', (CAR_LEN + 0.02, 0.1, 0.07), 0.03, trim, coll, root, (0.0, -(half_w - 0.03), z1))
        face_y = -half_w - 0.005
        blob(f'car-{colour}-{tag}-dot', trim, coll, root, (0.0, face_y, 0.76), (0.13, 0.02, 0.13), seg=(28, 8))
        for sx in (-1, 1):
            blob(f'car-{colour}-{tag}-dot-{sx}', trim, coll, root, (0.33 * sx, face_y, 0.76), (0.06, 0.02, 0.06), seg=(20, 8))

    # idle: the whole open wagon (a floor, the back and end walls, their rims, the front wall, wheels and hooks); the
    # friend sits on its floor, drawn over it. front: the front wall alone, drawn over the friend.
    idle = bp.state_child(group, f'car-{colour}', 'idle')
    root = ground_root(f'car-{colour}-root', idle, CAR_X[n], 0.0)
    rbox(f'car-{colour}-chassis', (CAR_LEN - 0.06, CAR_W, 0.1), 0.04, ink, idle, root, (0.0, 0.0, 0.5))
    rbox(f'car-{colour}-floor', (CAR_LEN, CAR_W, 0.08), 0.03, dark, idle, root, (0.0, 0.0, z0 + 0.04))
    rbox(f'car-{colour}-back', (CAR_LEN, wall, z1 - z0), 0.04, main, idle, root, (0.0, half_w - wall / 2, (z0 + z1) / 2))
    rbox(f'car-{colour}-back-in', (CAR_LEN - 2 * wall, 0.01, z1 - z0 - 0.06), 0.004, dark, idle, root, (0.0, half_w - wall - 0.006, (z0 + z1) / 2))
    rbox(f'car-{colour}-rim-back', (CAR_LEN + 0.02, 0.1, 0.07), 0.03, trim, idle, root, (0.0, half_w - 0.03, z1))
    for sx in (-1, 1):
        rbox(f'car-{colour}-end-{sx}', (wall, CAR_W, z1 - z0), 0.04, main, idle, root, (sx * (CAR_LEN / 2 - wall / 2), 0.0, (z0 + z1) / 2))
        rbox(f'car-{colour}-rim-end-{sx}', (0.1, CAR_W + 0.02, 0.07), 0.03, trim, idle, root, (sx * (CAR_LEN / 2 - 0.03), 0.0, z1))
    front_wall('idle', idle, root)
    # Two wheels a side and short hooks at the ends (kept inside the car's own length).
    near = -(CAR_W / 2 + 0.02)
    for k, x in enumerate((-0.33, 0.33)):
        wheel_set(f'car-{colour}-wheel-{k}', c, idle, root, x, CAR_WHEEL_R, near, E_RUN, [1], tyre_key='carWheel')
    for sx in (-1, 1):
        blob(f'car-{colour}-hook-{sx}', ink, idle, root, (sx * (CAR_LEN / 2 - 0.02), 0.0, 0.52), (0.05, 0.06, 0.05), seg=(12, 8))
    front = bp.state_child(group, f'car-{colour}', 'front')
    froot = ground_root(f'car-{colour}-front-root', front, CAR_X[n], 0.0)
    front_wall('front', front, froot)
    bpy.context.view_layer.update()
    meshes = bp.meshes_of(root)
    r = mesh_rect(meshes)
    log(f'car-{colour} {fmt_rect(r)}')
    hull_object(f'hit.car-{n}', bp.world_pts(meshes), layout)
    add_empty(f'anchor.car-{n}', (wx(CAR_X[n]), 0.0, 0.0), layout)
    add_empty(f'anchor.seat-{n}', (wx(CAR_X[n]), SEAT_Y, SEAT_Z), layout)
    return r


# --- the library (2026-11-13) ---------------------------------------------------------------------------------------

LIBRARY_PROP = 'bhc_library'


def build_library(params):
    """Builds the engine and the three cars in a scratch scene (the old orthographic camera places them) and keeps
    them as library collections: unlinked from every scene, with a fake user (saved) and `bhc_library` = 1
    (render_screen.py skips them). Returns their names. The current scene stays the active one."""
    global DESIGN
    DESIGN = (params['design']['width'], params['design']['height'])
    bp.DESIGN = DESIGN
    c = params['art']['train']
    window = bpy.context.window_manager.windows[0]
    home = window.scene
    scene = bpy.data.scenes.new('train-models')
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    window.scene = scene
    scene.frame_set(1)
    bp.FRIEND_PX = REF_PX
    cam = bp.setup_camera(scene)
    bpy.context.view_layer.update()
    bp.SCREEN = bp.Screen(scene)
    sprites = bpy.data.collections.new('train-models-sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('train-models-layout')
    scene.collection.children.link(layout)
    build_engine(params, c, sprites, layout)
    for n, colour in enumerate(CAR_COLOUR_KEYS):
        build_car(n, colour, params, c, sprites, layout)
    names = []
    for coll in list(sprites.children):
        sprites.children.unlink(coll)
        coll.use_fake_user = True
        coll[LIBRARY_PROP] = 1
        names.append(coll.name)
    for o in list(layout.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(layout)
    bpy.data.collections.remove(sprites)
    window.scene = home
    bpy.data.scenes.remove(scene)
    bpy.data.objects.remove(cam, do_unlink=True)
    bpy.context.view_layer.update()
    log(f'library: {names}')
    return names

