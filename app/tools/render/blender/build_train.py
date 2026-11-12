# Builds art/train.blend (Tàu hỏa chở bạn, spec-tau-hoa, 2026-11-12) from the vendored island art/src/map-v3.blend
# (only its render settings, world and Sun are kept).
#
# Run by `npm run art:build -- train` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_train.py -- \
#     --out <tmp>/train.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens and content): colours, art.train, art.animalPens (the friends),
# art.creatureLight, train (friends, cars, destinations, surprises, the sizes, the scroll speed), design size, the
# interactive rect.
#
# The camera, the fitting and the shared shapes are Phi công nhí's (build_plane.py: an ORTHOGRAPHIC camera tilted
# CAM_PITCH degrees down, so a shift along world x is a shift in design px); world (0, 0, 0) — the middle of the track —
# projects to REF_PX. The track runs along world x at depth 0; the far side is +y, the near side −y.
# One plate, 2048×1536: ONLY a still sky (a soft gradient, a soft sun, faint far clouds). Everything else is a sprite
# (script-built from cute.py shapes; every sprite renders alone):
#   - engine: a round toy steam engine facing screen right (green boiler with yellow bands, a red cab roof, a dark
#     chimney, a lamp, a cowcatcher, three red wheels with yellow hubs and a rod), driven by the chibi Shiba
#     (cute.chibi('dog')) in a blue conductor's cap. States: idle [1], run [10, 11] (the wheels a quarter turn apart,
#     the rod up / forward), toot [20] (a puff over the chimney, the Shiba's head up), happy [30] (eyes shut, tongue);
#   - car-<colour>: three open wagons (red, yellow, blue), each where it stands behind the engine;
#   - seat-<friend>: the friend sitting in car 0 (drawn behind the car: only its head and shoulders show);
#   - friend-<friend> (idle [1], wave [10], happy [20]) on the platform's ground pivot anchor.friend;
#   - platform (a wooden platform with a little blue roof and a round sign), dest-<id> (the beach, a playground, a
#     fair), tunnel (states back: the hill behind the train; front: its lower slope with the two stone portals, drawn
#     over the train): drawn where they stop (the scene scrolls them);
#   - ground (a strip as wide as the frame with the track on it; it tiles), hill (a, b), tree (a, b), fence: their
#     rendered y kept;
#   - cloud (a, b), bird (a, b), cow (idle, happy), puff, pop, crossing (idle, wave: a level crossing, its sign and a
#     little pink car whose fox driver waves), bridge (a river under the track and its stone bridge), fish,
#     hot-air, rainbow.
# Layout: hit.engine, hit.car-<n> (raw hulls: render.ts keeps them unpadded), hit.platform, hit.friend-<id>,
# hit.dest-<id>; anchors engine, chimney, nose, tail, car-<n>, seat-<n>, platform, friend, dest, drop-<n>, tunnel,
# tunnel-end, surprise, cow.
import json
import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, chibi, chibi_materials, key_chibi, lathe, mat, on_body, rbox, rod, rounded_profile, soften_scene, torus, torus_bm, mesh_obj  # noqa: E402
from common import add_empty, hull_object, parse_args  # noqa: E402
from build_animal_pens import PEN_CHIBIS, chibi_mats  # noqa: E402  (its main() only runs as a script)
import build_plane as bp  # noqa: E402  (the camera, fit and shapes; its main() only runs as a script)

RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main

# --- the world (design px) ------------------------------------------------------------------------------------------
REF_PX = (512.0, 600.0)  # world (0, 0, 0): the middle of the track
RAIL_GAUGE = 0.36  # each rail this far from the track's middle (m)
RAIL_TOP = 0.1

# --- the sky plate --------------------------------------------------------------------------------------------------
SUN_PX = (812.0, 128.0)

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

# --- the station, the friends, the destinations (design px) ---------------------------------------------------------
PLATFORM_X = 878.0  # padded by hitPad its deck stays inside x ≤ 1000 and ≥ targetGap from the engine
PLATFORM_DEPTH = (0.62, 1.7)  # its front and back edges (world y)
PLATFORM_Z = 0.24
PLATFORM_LEN = 1.86
FRIEND_X = 868.0
FRIEND_DEPTH = 1.08
F_IDLE, F_WAVE, F_HAPPY = [1], [10], [20]
FRIEND_STATES = {'idle': F_IDLE, 'wave': F_WAVE, 'happy': F_HAPPY}
FRIEND_YAW = -36.0  # three-quarter: toward the camera and the train (screen left)
FRIEND_HEIGHT_PX = {'cat': 132.0, 'pig': 126.0, 'sheep': 132.0, 'cow': 140.0, 'horse': 146.0, 'rooster': 132.0}
DEST_X = 878.0
DEST_DEPTH = 1.5
DEST_BOX_PX = (192.0, 250.0)  # padded by hitPad its hull stays ≥ targetGap from the engine and inside x ≤ 1000
DROP_X = [800.0, 878.0, 956.0]
DROP_DEPTH = 0.5  # the dropped friends stand in front of the destination (the scene draws them a little smaller)
HIT_PAD_PX = 24.0  # Tokens.spacing.hitPad (the pipeline pads the platform, friend and destination hulls)

# --- the tunnel (design px) -----------------------------------------------------------------------------------------
TUNNEL_MARGIN_PX = 20.0  # each portal this far outside the train's tail and nose
TUNNEL_SHIFT_PX = 66.0
TUNNEL_FRONT_TOP_PX = 372.0  # the mound's front edge: over the engine's roof and the seated friends' heads
TUNNEL_BACK_TOP_PX = 262.0

# --- the ground, hills, trees, fences (design px) -------------------------------------------------------------------
GROUND_TOP_DEPTH = 7.0
GROUND_FRONT_DEPTH = -9.0
GROUND_W_PX = 1021.0
GROUND_OVER_PX = 30.0
GROUND_EDGE_PX = 48.0
SLEEPERS = 23  # over the strip's width: they tile
HILL_BOTTOM_PX = 500.0
HILL_BOX_PX = {'a': (560.0, 200.0), 'b': (470.0, 160.0)}
HILL_Y = 12.0
TREE_DEPTH = 3.4
TREE_HEIGHT_PX = {'a': 150.0, 'b': 120.0}
FENCE_DEPTH = 2.3
FENCE_W_PX = 300.0
COW_DEPTH = -4.0  # on the near grass, in front of the track (the train never hides it)
COW_HEIGHT_PX = 88.0
SEED = 43

# --- the surprises and the free sprites ------------------------------------------------------------------------------
SURPRISE_X = 512.0
CROSSING_CAR_DEPTH = -3.3  # the little car waits well in front of the track (the train passes behind it)
FREE = {
    'puff': ((300.0, 200.0), 70.0), 'pop': ((420.0, 200.0), 80.0),
    'cloud-a': ((512.0, 150.0), 210.0), 'cloud-b': ((512.0, 150.0), 176.0),
    'bird': ((700.0, 200.0), 64.0), 'rainbow': ((512.0, 280.0), 340.0), 'hot-air': ((740.0, 190.0), 180.0),
    'fish': ((512.0, 690.0), 70.0),
}
FREE_Y = -6.0

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


def free_root(name, coll):
    at, _size = FREE[name]
    return bp.billboard(f'{name}-root', coll, pt(at[0], at[1], FREE_Y))


def free_fit(name, root, longest=None):
    at, size = FREE[name]
    r = bp.fit(root, at, longest=longest or size)
    if r[0] < 4 or r[1] < 4 or r[2] > DESIGN[0] - 4 or r[3] > DESIGN[1] - 4:
        fail(f'{name} {fmt_rect(r)} leaves the frame')
    log(f'{name} {fmt_rect(r)}')
    return r


def ground_root(name, coll, sx, depth, yaw=0.0):
    """An empty on the ground at design x `sx`, world depth `depth` (its local front −y faces the camera)."""
    return empty(name, coll, None, (wx(sx), depth, 0.0), (0.0, 0.0, yaw))


def cyl_x(name, r, x0, x1, material, coll, parent, y=0.0, z=0.0, round_=0.25):
    """A cylinder along x from x0 to x1 (radius r) with rounded rims."""
    o = lathe(name, rounded_profile(r, 0.0, x1 - x0, round_), material, coll, parent, (x0, y, z), (0.0, 90.0, 0.0), seg=40)
    return o


# --- the plate ------------------------------------------------------------------------------------------------------

def build_sky(c, plate):
    bp.SUN_PX = SUN_PX
    bp.FAR_CLOUDS = [(180.0, 96.0, 0.9), (560.0, 70.0, 0.7), (960.0, 250.0, 0.55)]
    bp.build_sky(c, plate)


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
    if r[2] - r[0] < params['train']['carMinPx']:
        fail(f'the engine is under {params["train"]["carMinPx"]} px wide')
    hull_object('hit.engine', [p for p in bp.world_pts([o for o in meshes if not o.name.startswith('engine-puff')])], layout)
    add_empty('anchor.engine', (wx(ENGINE_X), 0.0, 0.0), layout)
    add_empty('anchor.chimney', root.matrix_world @ Vector((0.62, 0.0, 1.8)), layout)
    return r


def build_car(n, colour, params, c, sprites, layout):
    key = CAR_COLOUR_KEYS[colour]
    if key not in c or f'{key}Dark' not in c:
        fail(f'Tokens.art.train.{key}(Dark) is missing')
    coll = sprite(sprites, f'car-{colour}')
    root = ground_root(f'car-{colour}-root', coll, CAR_X[n], 0.0)
    main, dark = mat(c[key], 0.32), mat(c[f'{key}Dark'], 0.4)
    trim = mat(c['trim'], 0.4)
    ink = mat(c['chimney'], 0.5)
    rbox(f'car-{colour}-chassis', (CAR_LEN - 0.06, CAR_W, 0.1), 0.04, ink, coll, root, (0.0, 0.0, 0.5))
    # The wagon: a deep box whose top shows its dark inside under a light rim (an open wagon).
    rbox(f'car-{colour}-body', (CAR_LEN, CAR_W, 0.44), 0.1, main, coll, root, (0.0, 0.0, 0.78))
    rbox(f'car-{colour}-inside', (CAR_LEN - 0.14, CAR_W - 0.14, 0.05), 0.03, dark, coll, root, (0.0, 0.0, 0.985))
    for sy in (-1, 1):
        rbox(f'car-{colour}-rim-long-{sy}', (CAR_LEN + 0.02, 0.08, 0.07), 0.03, trim, coll, root, (0.0, sy * (CAR_W / 2 - 0.02), 1.0))
    for sx in (-1, 1):
        rbox(f'car-{colour}-rim-end-{sx}', (0.08, CAR_W + 0.02, 0.07), 0.03, trim, coll, root, (sx * (CAR_LEN / 2 - 0.02), 0.0, 1.0))
    # A big white dot on the side, and a smaller one either side of it.
    face_y = -CAR_W / 2 - 0.005
    blob(f'car-{colour}-dot', trim, coll, root, (0.0, face_y, 0.76), (0.13, 0.02, 0.13), seg=(28, 8))
    for sx in (-1, 1):
        blob(f'car-{colour}-dot-{sx}', trim, coll, root, (0.33 * sx, face_y, 0.76), (0.06, 0.02, 0.06), seg=(20, 8))
    # Two wheels a side and short hooks at the ends (kept inside the car's own length).
    near = -(CAR_W / 2 + 0.02)
    for k, x in enumerate((-0.33, 0.33)):
        wheel_set(f'car-{colour}-wheel-{k}', c, coll, root, x, CAR_WHEEL_R, near, E_RUN, [1], tyre_key='carWheel')
    for sx in (-1, 1):
        blob(f'car-{colour}-hook-{sx}', ink, coll, root, (sx * (CAR_LEN / 2 - 0.02), 0.0, 0.52), (0.05, 0.06, 0.05), seg=(12, 8))
    bpy.context.view_layer.update()
    meshes = bp.meshes_of(root)
    r = mesh_rect(meshes)
    log(f'car-{colour} {fmt_rect(r)}')
    if r[2] - r[0] < params['train']['carMinPx']:
        fail(f'car {colour} is under {params["train"]["carMinPx"]} px wide')
    hull_object(f'hit.car-{n}', bp.world_pts(meshes), layout)
    add_empty(f'anchor.car-{n}', (wx(CAR_X[n]), 0.0, 0.0), layout)
    add_empty(f'anchor.seat-{n}', (wx(CAR_X[n]), SEAT_Y, SEAT_Z), layout)
    return r


# --- the friends ----------------------------------------------------------------------------------------------------

def friend_rig(fid, name, params, coll):
    kind, colour_keys = PEN_CHIBIS[fid][0], PEN_CHIBIS[fid][1]
    return chibi(kind, name, coll, chibi_mats(params, colour_keys))


def build_friend(fid, params, sprites, layout, platform_z):
    coll = sprite(sprites, f'friend-{fid}', states=json.dumps(FRIEND_STATES, separators=(',', ':')))
    rig = friend_rig(fid, f'friend-{fid}', params, coll)
    root = rig['root']
    root.location = (wx(FRIEND_X), FRIEND_DEPTH, platform_z)
    root.rotation_euler = (0.0, 0.0, math.radians(FRIEND_YAW))
    key_chibi(rig, F_IDLE[0], head_pitch=-6.0, head_yaw=8.0, eyes='open')
    key_chibi(rig, F_WAVE[0], head_pitch=-10.0, head_roll=-12.0, head_yaw=4.0, tail=30.0, eyes='open', bob=0.04)
    key_chibi(rig, F_HAPPY[0], head_pitch=-19.0, head_roll=11.0, head_yaw=14.0, tail=26.0, tongue=True, bob=0.07, eyes='shut')
    scene = bpy.context.scene
    scene.frame_set(F_IDLE[0])
    pivot = project((wx(FRIEND_X), FRIEND_DEPTH, platform_z))
    r = bp.fit(root, pivot, height=FRIEND_HEIGHT_PX[fid], bottom=True)
    # fit moves the root in x and z; keep it standing on the platform (its feet at platform_z).
    hull_object(f'hit.friend-{fid}', bp.world_pts(bp.meshes_of(root)), layout)
    for f in F_WAVE + F_HAPPY:
        scene.frame_set(f)
        log(f'friend-{fid} frame {f} {fmt_rect(rect_of(root))}')
    scene.frame_set(F_IDLE[0])
    log(f'friend-{fid} idle {fmt_rect(r)}')
    if max(r[2] - r[0], r[3] - r[1]) < params['train']['friendMinPx'] + 4:
        fail(f'friend {fid} is under {params["train"]["friendMinPx"]} px')
    return r, root


def build_seat(fid, params, sprites):
    coll = sprite(sprites, f'seat-{fid}')
    rig = friend_rig(fid, f'seat-{fid}', params, coll)
    root = rig['root']
    root.location = (wx(CAR_X[0]), SEAT_Y, SEAT_Z)
    root.rotation_euler = (0.0, 0.0, math.radians(-24.0))
    rig['tail'].scale = HIDDEN
    key_chibi(rig, 1, head_pitch=-8.0, head_yaw=10.0, eyes='open')
    bpy.context.scene.frame_set(1)
    pivot = project((wx(CAR_X[0]), SEAT_Y, SEAT_Z))
    r = bp.fit(root, pivot, height=SEAT_HEIGHT_PX, bottom=True)
    log(f'seat-{fid} {fmt_rect(r)}')
    return r


# --- the platform ---------------------------------------------------------------------------------------------------

def build_platform(params, c, sprites, layout):
    coll = sprite(sprites, 'platform')
    d0, d1 = PLATFORM_DEPTH
    mid = (d0 + d1) / 2
    root = ground_root('platform-root', coll, PLATFORM_X, 0.0)
    deck, edge = mat(c['platform'], 0.55), mat(c['platformEdge'], 0.45)
    rbox('platform-base', (PLATFORM_LEN, d1 - d0, PLATFORM_Z - 0.03), 0.05, mat(c['stone'], 0.7), coll, root, (0.0, mid, (PLATFORM_Z - 0.03) / 2))
    rbox('platform-deck', (PLATFORM_LEN + 0.04, d1 - d0 + 0.04, 0.06), 0.025, deck, coll, root, (0.0, mid, PLATFORM_Z))
    for k in range(7):  # plank lines
        x = -PLATFORM_LEN / 2 + PLATFORM_LEN * (k + 1) / 8
        rbox(f'platform-plank-{k}', (0.018, d1 - d0, 0.012), 0.005, mat(bp.mix_hex(c['platform'], c['ink'], 0.2), 0.6), coll, root, (x, mid, PLATFORM_Z + 0.032))
    rbox('platform-edge', (PLATFORM_LEN + 0.06, 0.1, 0.07), 0.03, edge, coll, root, (0.0, d0 + 0.03, PLATFORM_Z + 0.02))
    # The little roof on two posts at the back, and a round sign on a post at its right end.
    post = mat(c['post'], 0.45)
    for sx in (-1, 1):
        rod(f'platform-post-{sx}', (0.62 * sx, d1 - 0.2, PLATFORM_Z), (0.62 * sx, d1 - 0.2, 1.9), 0.045, post, coll, root, seg=12)
    roof_w = PLATFORM_LEN + 0.1
    bp.prism('platform-roof', [(-roof_w / 2, 0.0), (roof_w / 2, 0.0), (0.0, 0.32)], 0.95, mat(c['platformRoof'], 0.4), coll, root, (0.0, d1 - 0.42, 1.9), bevel=0.04)
    rbox('platform-roof-trim', (roof_w + 0.06, 0.98, 0.06), 0.03, edge, coll, root, (0.0, d1 - 0.42, 1.9))
    sx = PLATFORM_LEN / 2 - 0.18
    rod('platform-sign-post', (sx, d0 + 0.32, PLATFORM_Z), (sx, d0 + 0.32, 1.12), 0.035, post, coll, root, seg=10)
    sign = empty('platform-sign', coll, root, (sx, d0 + 0.3, 1.28), (0.0, 0.0, -24.0))
    blob('platform-sign-disc', mat(c['sign'], 0.4), coll, sign, (0.0, 0.0, 0.0), (0.2, 0.04, 0.2), seg=(32, 10))
    torus('platform-sign-rim', 0.2, 0.03, mat(c['platformRoof'], 0.4), coll, sign, (0.0, -0.01, 0.0), (90.0, 0.0, 0.0))
    # A tiny engine drawn on the sign (a green blob and a chimney).
    blob('platform-sign-engine', mat(c['engine'], 0.4), coll, sign, (0.0, -0.045, -0.02), (0.1, 0.01, 0.055), seg=(20, 8))
    blob('platform-sign-chimney', mat(c['chimney'], 0.4), coll, sign, (0.06, -0.05, 0.06), (0.025, 0.01, 0.045), seg=(12, 6))
    # A flower box at the left end.
    rbox('platform-box', (0.36, 0.2, 0.14), 0.04, mat(c['trunk'], 0.6), coll, root, (-PLATFORM_LEN / 2 + 0.3, d0 + 0.22, PLATFORM_Z + 0.08))
    for k in range(3):
        bp.flower(f'platform-flower-{k}', coll, root, (-PLATFORM_LEN / 2 + 0.18 + 0.12 * k, d0 + 0.2, PLATFORM_Z + 0.2), 0.09, mat(c['flower'], 0.5), mat(c['flowerCentre'], 0.5))
    bpy.context.view_layer.update()
    meshes = bp.meshes_of(root)
    r = mesh_rect(meshes)
    log(f'platform {fmt_rect(r)}')
    deck_objs = [o for o in meshes if o.name.startswith(('platform-base', 'platform-deck', 'platform-edge', 'platform-box'))]
    hull_object('hit.platform', bp.world_pts(deck_objs), layout)
    add_empty('anchor.platform', (wx(PLATFORM_X), 0.0, 0.0), layout)
    deck = mesh_rect(deck_objs)
    log(f'platform deck (its tap area) {fmt_rect(deck)}')
    if deck[2] + HIT_PAD_PX > params['rect']['x1']:
        fail(f'the platform deck {fmt_rect(deck)}: padded, it leaves the interactive rect')
    return deck


# --- the destinations (each built facing local −y, its ground at z 0) -------------------------------------------------

def dest_beach(c, coll, root):
    """Sand with the sea behind (white wave crests), a tall pink-and-white umbrella, a sandcastle with a flag, a bucket
    and spade, a beach ball."""
    rbox('beach-sea', (2.4, 1.6, 0.04), 0.02, mat(c['sea'], 0.2), coll, root, (0.0, 1.5, 0.02))
    rbox('beach-sea-far', (2.4, 0.5, 0.045), 0.02, mat(c['seaDark'], 0.2), coll, root, (0.0, 2.1, 0.025))
    for k, (x, y) in enumerate(((-0.8, 1.0), (-0.25, 1.35), (0.35, 1.05), (0.85, 1.4), (-0.55, 1.75), (0.6, 1.8))):
        rod(f'beach-wave-{k}', (x - 0.16, y, 0.06), (x + 0.16, y, 0.06), 0.03, mat(c['umbrellaStripe'], 0.3), coll, root, seg=8)
    blob('beach-sand', mat(c['sand'], 0.8), coll, root, (0.0, 0.0, 0.0), (1.25, 0.85, 0.1), shape=bp.flat_bottom, seg=(48, 12))
    # The umbrella: a tall pole and a striped dome, tilted a little.
    tilt = empty('beach-umbrella', coll, root, (0.35, 0.3, 0.0), (0.0, 10.0, 0.0))
    rod('beach-pole', (0.0, 0.0, 0.0), (0.0, 0.0, 2.0), 0.035, mat(c['umbrellaStripe'], 0.4), coll, tilt, seg=10)
    bp.gore_ball('beach-canopy', [mat(c['umbrella'], 0.45), mat(c['umbrellaStripe'], 0.45)], 8, (0.85, 0.85, 0.4), coll, tilt, (0.0, 0.0, 1.86), dome=True)
    blob('beach-tip', mat(c['umbrella'], 0.4), coll, tilt, (0.0, 0.0, 2.28), (0.06, 0.06, 0.07), seg=(12, 8))
    # The sandcastle: three round towers and a flag.
    sand_dark = mat(bp.mix_hex(c['sand'], c['soil'], 0.35), 0.8)
    for k, (x, h, r) in enumerate(((-0.62, 0.42, 0.17), (-0.32, 0.6, 0.2), (-0.04, 0.38, 0.15))):
        lathe(f'beach-tower-{k}', rounded_profile(r, 0.0, h, 0.2), sand_dark, coll, root, (x, 0.05, 0.05), seg=28)
        for j in range(4):
            a = math.pi / 2 * j + 0.4
            rbox(f'beach-crenel-{k}-{j}', (0.06, 0.06, 0.07), 0.02, sand_dark, coll, root, (x + math.cos(a) * r * 0.8, 0.05 + math.sin(a) * r * 0.8, 0.05 + h + 0.03))
    rod('beach-flag-pole', (-0.32, 0.05, 0.65), (-0.32, 0.05, 1.05), 0.015, mat(c['ink'], 0.5), coll, root, seg=6)
    bp.prism('beach-flag', [(0.0, 0.0), (0.0, 0.16), (0.2, 0.08)], 0.02, mat(c['flag'], 0.4), coll, root, (-0.31, 0.05, 0.88), bevel=0.0)
    # The bucket and spade, and a beach ball.
    lathe('beach-bucket', [(0.0, 0.0), (0.13, 0.0), (0.17, 0.24), (0.15, 0.25), (0.0, 0.25)], mat(c['slideFrame'], 0.4), coll, root, (0.75, -0.35, 0.04), seg=28)
    rod('beach-spade', (0.92, -0.3, 0.05), (0.98, -0.22, 0.42), 0.02, mat(c['slide'], 0.4), coll, root, seg=8)
    bp.gore_ball('beach-ball', [mat(c['umbrella'], 0.35), mat(c['slide'], 0.35)], 6, (0.18, 0.18, 0.18), coll, root, (0.1, -0.5, 0.2))


def dest_playground(c, coll, root):
    """A slide tower: four blue posts, a deck, a red pointed roof with a flag, a ladder on the left and a yellow chute
    curling down to the right; a little swing beside it."""
    blob('play-mat', mat(c['sand'], 0.8), coll, root, (0.0, 0.1, 0.0), (1.25, 0.8, 0.08), shape=bp.flat_bottom, seg=(48, 12))
    frame, slide, red = mat(c['slideFrame'], 0.4), mat(c['slide'], 0.35), mat(c['swing'], 0.4)
    tx, top = -0.3, 1.05
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(f'play-leg-{sx}-{sy}', (tx + 0.28 * sx, 0.28 * sy, 0.0), (tx + 0.28 * sx, 0.28 * sy, 1.95), 0.045, frame, coll, root, seg=12)
    rbox('play-deck', (0.66, 0.66, 0.08), 0.03, mat(c['platform'], 0.5), coll, root, (tx, 0.0, top))
    for sy in (-1, 1):
        rod(f'play-rail-{sy}',(tx - 0.28, 0.28 * sy, top + 0.36), (tx + 0.28, 0.28 * sy, top + 0.36), 0.03, frame, coll, root, seg=10)
    bp.prism('play-roof', [(-0.48, 0.0), (0.48, 0.0), (0.0, 0.5)], 0.78, red, coll, root, (tx, 0.0, 1.95), bevel=0.04)
    rod('play-flag-pole', (tx, 0.0, 2.4), (tx, 0.0, 2.75), 0.018, mat(c['ink'], 0.5), coll, root, seg=6)
    bp.prism('play-flag', [(0.0, 0.0), (0.0, 0.16), (0.22, 0.08)], 0.02, mat(c['slide'], 0.4), coll, root, (tx + 0.01, 0.0, 2.58), bevel=0.0)
    for sy in (-1, 1):
        rod(f'play-ladder-{sy}', (tx - 0.62, 0.18 * sy, 0.0), (tx - 0.3, 0.18 * sy, top), 0.028, mat(c['trim'], 0.4), coll, root, seg=8)
    for k in range(4):
        t = (k + 0.7) / 4.6
        rod(f'play-rung-{k}', (tx - 0.62 + 0.32 * t, -0.18, top * t), (tx - 0.62 + 0.32 * t, 0.18, top * t), 0.022, mat(c['trim'], 0.4), coll, root, seg=8)
    a, b = Vector((tx + 0.3, 0.0, top + 0.02)), Vector((tx + 1.25, 0.0, 0.12))
    d = b - a
    chute = empty('play-chute', coll, root, (a + b) / 2, (0.0, -math.degrees(math.atan2(d.z, d.x)), 0.0))
    rbox('play-chute-bed', (d.length + 0.1, 0.44, 0.06), 0.03, slide, coll, chute, (0.0, 0.0, 0.0))
    for sy in (-1, 1):
        rbox(f'play-chute-side-{sy}', (d.length + 0.1, 0.06, 0.16), 0.03, slide, coll, chute, (0.0, 0.22 * sy, 0.07))
    blob('play-ball', red, coll, root, (0.75, -0.45, 0.14), (0.14, 0.14, 0.14), seg=(20, 10))


def dest_fair(c, coll, root):
    """A little Ferris wheel (a purple rim, coloured cars) on a stand, with a line of flags."""
    frame, dark = mat(c['wheelFair'], 0.4), mat(c['wheelFairDark'], 0.4)
    blob('fair-ground', mat(c['sand'], 0.8), coll, root, (0.0, 0.1, 0.0), (1.2, 0.7, 0.06), shape=bp.flat_bottom, seg=(48, 12))
    hub = Vector((0.1, 0.25, 1.15))
    r = 0.78
    for sy in (-1, 1):
        rod(f'fair-stand-a-{sy}', (hub.x - 0.5, hub.y + 0.2 * sy, 0.0), (hub.x, hub.y + 0.08 * sy, hub.z), 0.04, dark, coll, root, seg=10)
        rod(f'fair-stand-b-{sy}', (hub.x + 0.5, hub.y + 0.2 * sy, 0.0), (hub.x, hub.y + 0.08 * sy, hub.z), 0.04, dark, coll, root, seg=10)
    torus('fair-rim', r, 0.04, frame, coll, root, hub, (90.0, 0.0, 0.0))
    torus('fair-rim-in', r * 0.45, 0.03, frame, coll, root, hub + Vector((0.0, -0.01, 0.0)), (90.0, 0.0, 0.0))
    blob('fair-hub', mat(c['gondola2'], 0.3), coll, root, hub + Vector((0.0, -0.05, 0.0)), (0.09, 0.05, 0.09), seg=(16, 8))
    cars = [mat(c['gondola1'], 0.4), mat(c['gondola2'], 0.4), mat(c['gondola3'], 0.4)]
    for k in range(8):
        a = 2 * math.pi * k / 8 + 0.2
        p = hub + Vector((math.cos(a) * r, -0.02, math.sin(a) * r))
        rod(f'fair-spoke-{k}', hub, p, 0.018, frame, coll, root, seg=8)
        g = p + Vector((0.0, -0.06, -0.14))
        lathe(f'fair-car-{k}', rounded_profile(0.1, 0.0, 0.16, 0.4), cars[k % 3], coll, root, g, seg=20)
        rod(f'fair-hang-{k}', p, g + Vector((0.0, 0.0, 0.16)), 0.012, dark, coll, root, seg=6)
    # A line of little flags from the wheel's top to a pole on the right.
    pole = Vector((1.05, -0.05, 0.0))
    rod('fair-pole', pole, pole + Vector((0.0, 0.0, 1.35)), 0.025, mat(c['trim'], 0.4), coll, root, seg=8)
    top = hub + Vector((0.0, -0.08, r + 0.05))
    end = pole + Vector((0.0, 0.0, 1.32))
    flags = [mat(c['flag'], 0.4), mat(c['gondola2'], 0.4), mat(c['gondola3'], 0.4)]
    rod('fair-flag-line', top, end, 0.008, mat(c['string'], 0.5), coll, root, seg=6)
    for k in range(5):
        t = (k + 0.6) / 5.6
        p = top.lerp(end, t) - Vector((0.0, 0.0, 0.12 * math.sin(math.pi * t)))
        bp.prism(f'fair-flag-{k}', [(-0.07, 0.0), (0.07, 0.0), (0.0, -0.14)], 0.02, flags[k % 3], coll, root, p, bevel=0.0)


DESTINATIONS = {'beach': dest_beach, 'playground': dest_playground, 'fair': dest_fair}


def build_dest(did, params, c, sprites, layout):
    coll = sprite(sprites, f'dest-{did}')
    root = ground_root(f'dest-{did}-root', coll, DEST_X, DEST_DEPTH, -14.0)
    DESTINATIONS[did](c, coll, root)
    pivot = project((wx(DEST_X), DEST_DEPTH, 0.0))
    # Keep the destination on the ground at its depth: fit scales it into the box with its bottom on the pivot.
    r = bp.fit(root, (DEST_X, pivot[1]), box=DEST_BOX_PX, bottom=True)
    hull_object(f'hit.dest-{did}', bp.world_pts(bp.meshes_of(root)), layout)
    log(f'dest-{did} {fmt_rect(r)}')
    if max(r[2] - r[0], r[3] - r[1]) < params['train']['destMinPx'] + 4:
        fail(f'destination {did} is under {params["train"]["destMinPx"]} px')
    return r


# --- the tunnel -----------------------------------------------------------------------------------------------------

def hill_shape(d):
    return Vector((d.x, d.y, max(d.z, 0.0)))


def build_tunnel(c, sprites, layout, tail_x, nose_x):
    group = sprite(sprites, 'tunnel')
    # Rendered TUNNEL_SHIFT_PX right of the train (it scrolls: only its length matters), so the whole hill is in frame.
    x0, x1 = tail_x - TUNNEL_MARGIN_PX + TUNNEL_SHIFT_PX, nose_x + TUNNEL_MARGIN_PX + TUNNEL_SHIFT_PX
    mid = (x0 + x1) / 2
    half = (x1 - x0) / 2 / bp.ORTHO_PX_PER_M
    hill, hill_dark = mat(c['tunnelHill'], 0.85), mat(c['tunnelHillDark'], 0.85)
    stone, stone_dark = mat(c['stone'], 0.7), mat(c['stoneDark'], 0.7)
    inside = mat(c['tunnelInside'], 0.9)
    # Back: a tall rounded hill behind the track with a few trees on it.
    back = bp.state_child(group, 'tunnel', 'back')
    broot = ground_root('tunnel-back-root', back, mid, 1.2)
    top_z = (REF_PX[1] - TUNNEL_BACK_TOP_PX) / bp.ORTHO_PX_PER_M / math.cos(bp.P)
    blob('tunnel-back-hill', hill_dark, back, broot, (0.0, 0.6, 0.0), (half + 0.9, 1.6, top_z), shape=hill_shape, seg=(64, 24))
    for k, (dx, s) in enumerate(((-0.45, 1.0), (0.1, 1.2), (0.55, 0.9))):
        x = dx * half
        z = top_z * math.sqrt(max(0.0, 1 - (x / (half + 0.9)) ** 2)) - 0.12
        bp.tree(f'tunnel-tree-{k}', c, back, broot, (x, 0.2, z), s)
    # Front: a long grassy mound across the track, taller than the train (drawn over it), with a stone portal and its
    # dark mouth at each end (turned a little toward the camera), flowers on its face.
    front = bp.state_child(group, 'tunnel', 'front')
    froot = ground_root('tunnel-front-root', front, mid, -0.1)
    fz = (REF_PX[1] - TUNNEL_FRONT_TOP_PX) / bp.ORTHO_PX_PER_M / math.cos(bp.P) - 1.0 * math.tan(bp.P)
    rbox('tunnel-front-hill', (2 * half + 0.5, 1.9, fz), 0.7, hill, front, froot, (0.0, 0.0, fz / 2), seg=6)
    blob('tunnel-front-crest', hill, front, froot, (0.0, 0.2, fz - 0.25), (half + 0.1, 0.8, 0.5), seg=(96, 16))
    for k, x in enumerate((-half * 0.6, -half * 0.2, half * 0.25, half * 0.62)):
        bp.flower(f'tunnel-flower-{k}', front, froot, (x, -0.98, fz * (0.45 + 0.12 * (k % 2))), 0.13, mat(c['flower'] if k % 2 else c['trim'], 0.5), mat(c['flowerCentre'], 0.5))
        bp.flower(f'tunnel-flower-top-{k}', front, froot, (x + 0.3, -0.4, fz + 0.02), 0.11, mat(c['flower'], 0.5), mat(c['flowerCentre'], 0.5))
    arch_r, arch_leg = 0.8, 1.35
    for side, sx in (('left', -1), ('right', 1)):
        portal = empty(f'tunnel-portal-{side}', front, froot, (sx * (half + 0.12), -0.5, 0.0), (0.0, 0.0, 45.0 * sx))
        arch = torus_bm(arch_r, 0.16, arc=(0.0, 180.0), seg=40, tube=12)
        o = mesh_obj(f'tunnel-arch-{side}', arch, stone, front)
        bp.place(o, portal, (0.0, 0.0, arch_leg), (90.0, 0.0, 0.0))
        o['cute'] = 1
        for s2 in (-1, 1):
            rbox(f'tunnel-jamb-{side}-{s2}', (0.32, 0.3, arch_leg + 0.02), 0.07, stone, front, portal, (arch_r * s2, 0.0, (arch_leg + 0.02) / 2))
        blob(f'tunnel-mouth-{side}', inside, front, portal, (0.0, 0.06, 0.0), (arch_r - 0.08, 0.05, arch_leg + arch_r - 0.08), shape=hill_shape, seg=(40, 16))
        for k in range(5):
            a = math.radians(18.0 + 36.0 * k)
            blob(f'tunnel-stone-{side}-{k}', stone_dark, front, portal, (math.cos(a) * arch_r, -0.14, arch_leg + math.sin(a) * arch_r), (0.09, 0.05, 0.07), seg=(12, 8))
    bpy.context.view_layer.update()
    rb = mesh_rect(bp.meshes_of(broot))
    rf = mesh_rect(bp.meshes_of(froot))
    log(f'tunnel back {fmt_rect(rb)}, front {fmt_rect(rf)}; portals x {x0:.0f} … {x1:.0f}')
    add_empty('anchor.tunnel', (wx(x0), 0.0, 0.0), layout)
    add_empty('anchor.tunnel-end', (wx(x1), 0.0, 0.0), layout)
    return rf


# --- the ground, hills, trees, fences --------------------------------------------------------------------------------

def build_ground(c, sprites):
    coll = sprite(sprites, 'ground')
    wide = (GROUND_W_PX + GROUND_OVER_PX) / bp.ORTHO_PX_PER_M
    cx = wx((GROUND_W_PX - GROUND_OVER_PX) / 2)
    left = wx(0.0)
    grass, dark = mat(c['grass'], 0.85), mat(c['grassDark'], 0.85)
    back, front = GROUND_TOP_DEPTH, GROUND_FRONT_DEPTH
    slabs = [
        rbox('ground-grass', (wide, back - front, 0.4), 0.004, grass, coll, None, (cx, (back + front) / 2, -0.2)),
        rbox('ground-ballast', (wide, 1.3, 0.08), 0.004, mat(c['ballast'], 0.9), coll, None, (cx, 0.0, 0.0)),
    ]
    for s in (-1, 1):
        slabs.append(rbox(f'ground-rail-{s}', (wide, 0.07, 0.07), 0.004, mat(c['rail'], 0.3), coll, None, (cx, s * RAIL_GAUGE, RAIL_TOP - 0.035)))
        slabs.append(rbox(f'ground-rail-foot-{s}', (wide, 0.12, 0.03), 0.004, mat(c['railDark'], 0.4), coll, None, (cx, s * RAIL_GAUGE, RAIL_TOP - 0.085)))
    for o in slabs:
        for poly in o.data.polygons:
            poly.use_smooth = False
        o['cute'] = 1
    # The sleepers: evenly spaced so the strip tiles (the first and last half a gap from the ends).
    step = GROUND_W_PX / SLEEPERS / bp.ORTHO_PX_PER_M
    sleeper = mat(c['sleeper'], 0.7)
    for k in range(SLEEPERS):
        x = left + step * (k + 0.5)
        rbox(f'ground-sleeper-{k}', (step * 0.42, 1.0, 0.06), 0.015, sleeper, coll, None, (x, 0.0, 0.05))
    rnd = random.Random(SEED)
    petals = [mat(c['flower'], 0.6), mat(c['trim'], 0.6), mat(c['flowerCentre'], 0.6)]
    hearts = [mat(c['flowerCentre'], 0.5), mat(c['flowerCentre'], 0.5), mat(c['flower'], 0.5)]
    placed = []
    bands = [(gy(560.0), gy(490.0)), (gy(752.0), gy(632.0)), (gy(752.0), gy(632.0))]  # far grass, near grass ×2 (world depth ranges)
    for i in range(900):
        if len(placed) >= 52:
            break
        sx = rnd.uniform(GROUND_EDGE_PX + 22, DESIGN[0] - GROUND_EDGE_PX - 22)
        lo, hi = bands[i % 3]
        y = rnd.uniform(min(lo, hi), max(lo, hi))
        sy = screen_y(y, 0.0)
        if any(abs(sx - px) < 52 and abs(sy - py) < 22 for px, py in placed):
            continue
        k = len(placed)
        placed.append((sx, sy))
        if k % 3 == 0:
            bp.flower(f'ground-flower-{k}', coll, None, (wx(sx), y, 0.05), rnd.uniform(0.11, 0.15), petals[(k // 3) % 3], hearts[(k // 3) % 3])
        else:
            t = blob(f'ground-tuft-{k}', dark, coll, None, (wx(sx), y, 0.0), (rnd.uniform(0.16, 0.3), rnd.uniform(0.1, 0.16), 0.03), seg=(20, 8))
            t.visible_shadow = False
    r = mesh_rect([o for o in coll.all_objects if o.type == 'MESH'])
    log(f'ground strip {fmt_rect(r)}; rails at y {screen_y(RAIL_GAUGE, RAIL_TOP):.0f} / {screen_y(-RAIL_GAUGE, RAIL_TOP):.0f}')
    d = mesh_rect([o for o in coll.all_objects if o.name.startswith(('ground-flower', 'ground-tuft'))])
    if d[0] < GROUND_EDGE_PX - 8 or d[2] > DESIGN[0] - GROUND_EDGE_PX + 8:
        fail('the ground details come too close to the frame edges (the strip must tile)')


def build_hills(c, sprites):
    group = sprite(sprites, 'hill')
    green, dark = mat(c['hill'], 0.85), mat(c['hillDark'], 0.85)
    specs = {
        'a': ([(-0.5, 0.0, 2.3, 1.9, green), (1.55, 0.5, 1.75, 1.3, dark), (-2.0, 0.4, 1.2, 0.8, dark)], [(0, 0.42, 1.0), (1, 0.55, 0.8)]),
        'b': ([(0.6, 0.0, 1.95, 1.55, green), (-1.2, 0.5, 1.65, 1.15, dark), (1.9, 0.4, 0.9, 0.62, dark)], [(1, -0.3, 0.85)]),
    }
    for state, (domes, trees) in specs.items():
        child = bp.state_child(group, 'hill', state)
        root = empty(f'hill-{state}-root', child, None, (wx(DESIGN[0] / 2), HILL_Y, bp.wz(HILL_BOTTOM_PX, HILL_Y)))
        for j, (x, dy, rx, rz, m) in enumerate(domes):
            blob(f'hill-{state}-{j}', m, child, root, (x, dy, 0.0), (rx, 0.55, rz), shape=bp.flat_bottom, seg=(64, 24))
        for j, (dome, share, s) in enumerate(trees):
            x, dy, rx, rz, _m = domes[dome]
            bp.tree(f'hill-{state}-tree-{j}', c, child, root, (x + share * rx, dy - 0.1, rz * math.sqrt(1 - share * share) - 0.04), s)
        r = bp.fit(root, (DESIGN[0] / 2, HILL_BOTTOM_PX), box=HILL_BOX_PX[state], bottom=True)
        log(f'hill-{state} {fmt_rect(r)}')


def build_trees(c, sprites):
    group = sprite(sprites, 'tree')
    trunk = mat(c['trunk'], 0.7)
    leaf, leaf_dark = mat(c['leaf'], 0.7), mat(c['leafDark'], 0.7)
    for state in ('a', 'b'):
        child = bp.state_child(group, 'tree', state)
        root = ground_root(f'tree-{state}-root', child, DESIGN[0] / 2, TREE_DEPTH)
        if state == 'a':  # a round tree with three puffs
            rod('tree-a-trunk', (0.0, 0.0, 0.0), (0.0, 0.0, 0.8), 0.09, trunk, child, root, seg=12)
            for j, (dx, dz, rr, m) in enumerate(((0.0, 1.15, 0.5, leaf), (-0.32, 0.92, 0.36, leaf_dark), (0.34, 0.95, 0.38, leaf_dark))):
                blob(f'tree-a-crown-{j}', m, child, root, (dx, 0.1 * j, dz), (rr, rr * 0.9, rr), seg=(32, 16))
            for j, (dx, dz) in enumerate(((-0.15, 1.3), (0.2, 1.05), (-0.3, 0.95))):
                blob(f'tree-a-fruit-{j}', mat(c['flower'], 0.4), child, root, (dx, -0.42, dz), (0.06, 0.04, 0.06), seg=(12, 8))
        else:  # a cone tree in three tiers
            rod('tree-b-trunk', (0.0, 0.0, 0.0), (0.0, 0.0, 0.4), 0.08, trunk, child, root, seg=12)
            for j in range(3):
                lathe(f'tree-b-tier-{j}', [(0.0, 0.0), (0.5 - 0.12 * j, 0.0), (0.42 - 0.12 * j, 0.1), (0.0, 0.62 - 0.06 * j)], leaf if j % 2 else leaf_dark, child, root, (0.0, 0.0, 0.3 + 0.36 * j), seg=32)
        pivot = project((wx(DESIGN[0] / 2), TREE_DEPTH, 0.0))
        r = bp.fit(root, (DESIGN[0] / 2, pivot[1]), height=TREE_HEIGHT_PX[state], bottom=True)
        log(f'tree-{state} {fmt_rect(r)}')


def build_fence(c, sprites):
    coll = sprite(sprites, 'fence')
    root = ground_root('fence-root', coll, DESIGN[0] / 2, FENCE_DEPTH)
    wood = mat(c['fence'], 0.6)
    n = 9
    span = FENCE_W_PX / bp.ORTHO_PX_PER_M
    for k in range(n):
        x = -span / 2 + span * k / (n - 1)
        lathe(f'fence-picket-{k}', [(0.0, 0.0), (0.05, 0.0), (0.05, 0.4), (0.03, 0.47), (0.0, 0.5)], wood, coll, root, (x, 0.0, 0.0), seg=4)
    for z in (0.16, 0.34):
        rbox(f'fence-rail-{z}', (span + 0.08, 0.04, 0.05), 0.02, wood, coll, root, (0.0, 0.04, z))
    bpy.context.view_layer.update()
    r = mesh_rect(bp.meshes_of(root))
    log(f'fence {fmt_rect(r)}')


def build_clouds(c, sprites):
    group = sprite(sprites, 'cloud')
    white, shade = mat(c['cloud'], 0.75), mat(c['cloudShade'], 0.75)
    specs = {
        'a': [(-0.82, -0.06, 0.4), (-0.36, 0.2, 0.52), (0.26, 0.27, 0.6), (0.82, -0.02, 0.42), (0.02, -0.12, 0.48), (-0.48, -0.16, 0.36), (0.5, -0.16, 0.38)],
        'b': [(-0.62, 0.0, 0.42), (-0.06, 0.26, 0.56), (0.5, 0.1, 0.46), (0.9, -0.1, 0.3), (-0.2, -0.14, 0.4), (0.36, -0.16, 0.36)],
    }
    for state, spec in specs.items():
        child = bp.state_child(group, 'cloud', state)
        root = free_root(f'cloud-{state}', child)
        bp.puffs(f'cloud-{state}', spec, white, shade, child, root)
        free_fit(f'cloud-{state}', root)


def build_birds(c, colours, sprites):
    group = sprite(sprites, 'bird')
    wing = mat(bp.mix_hex(c['bird'], c['birdBelly'], 0.3), 0.5)
    for state, up in (('a', True), ('b', False)):
        child = bp.state_child(group, 'bird', state)
        root = free_root('bird', child)
        bp.bird_body(f'bird-{state}', c, colours, child, root)
        if up:
            blob(f'bird-{state}-wing-near', wing, child, root, (0.06, -0.2, 0.26), (0.15, 0.05, 0.25), (-12.0, 18.0, 0.0), seg=(24, 12))
            blob(f'bird-{state}-wing-far', wing, child, root, (0.1, 0.2, 0.26), (0.14, 0.05, 0.23), (12.0, 30.0, 0.0), seg=(24, 12))
        else:
            blob(f'bird-{state}-wing-near', wing, child, root, (0.07, -0.24, -0.17), (0.15, 0.05, 0.23), (22.0, -20.0, 0.0), seg=(24, 12))
            blob(f'bird-{state}-wing-far', wing, child, root, (0.12, 0.2, -0.2), (0.13, 0.05, 0.2), (-14.0, -32.0, 0.0), seg=(24, 12))
        at, size = FREE['bird']
        r = bp.fit(root, at, width=size)
        log(f'bird-{state} {fmt_rect(r)}')


def build_cow(params, sprites, layout):
    coll = sprite(sprites, 'cow', states=json.dumps({'idle': [1], 'happy': [20]}, separators=(',', ':')))
    rig = friend_rig('cow', 'grazer', params, coll)
    root = rig['root']
    root.location = (wx(DESIGN[0] / 2), COW_DEPTH, 0.0)
    root.rotation_euler = (0.0, 0.0, math.radians(-60.0))
    key_chibi(rig, 1, head_pitch=14.0, head_yaw=20.0, eyes='open')
    key_chibi(rig, 20, head_pitch=-16.0, head_roll=10.0, head_yaw=-10.0, tail=26.0, tongue=True, eyes='shut', bob=0.06)
    bpy.context.scene.frame_set(1)
    pivot = project((wx(DESIGN[0] / 2), COW_DEPTH, 0.0))
    r = bp.fit(root, (DESIGN[0] / 2, pivot[1]), height=COW_HEIGHT_PX, bottom=True)
    log(f'cow {fmt_rect(r)}')
    add_empty('anchor.cow', (wx(DESIGN[0] / 2), COW_DEPTH, 0.0), layout)


def build_particles(c, sprites):
    coll = sprite(sprites, 'puff')
    root = free_root('puff', coll)
    bp.puffs('puff', [(-0.26, -0.04, 0.26), (0.0, 0.1, 0.33), (0.27, -0.03, 0.25), (0.02, -0.14, 0.26)], mat(c['smoke'], 0.7), mat(c['smokeShade'], 0.7), coll, root, drop=0.07)
    free_fit('puff', root)
    coll = sprite(sprites, 'pop')
    root = free_root('pop', coll)
    m = mat(c['pop'], 0.55)
    for j in range(8):
        a = 360.0 * j / 8
        ar = math.radians(a)
        blob(f'pop-petal-{j}', m, coll, root, (0.36 * math.sin(ar), 0.0, 0.36 * math.cos(ar)), (0.075, 0.05, 0.16), (0.0, a, 0.0), seg=(20, 10))
        b = math.radians(a + 22.5)
        blob(f'pop-dot-{j}', m, coll, root, (0.5 * math.sin(b), 0.0, 0.5 * math.cos(b)), (0.045, 0.04, 0.045), seg=(12, 8))
    free_fit('pop', root)


# --- the surprises --------------------------------------------------------------------------------------------------

def build_crossing(params, c, sprites, layout):
    coll = sprite(sprites, 'crossing', states=json.dumps({'idle': [1], 'wave': [10]}, separators=(',', ':')))
    root = ground_root('crossing-root', coll, SURPRISE_X, 0.0)
    road = mat(c['road'], 0.85)
    # The road across the track (planks between the rails), from the far grass to the near grass.
    rbox('crossing-road', (1.1, 13.0, 0.02), 0.01, road, coll, root, (0.0, -2.6, 0.035))
    for k in range(4):
        rbox(f'crossing-plank-{k}', (1.1, 0.14, 0.03), 0.01, mat(c['sleeper'], 0.7), coll, root, (0.0, -0.25 + 0.17 * k, 0.09))
    for k in range(3):
        rbox(f'crossing-stripe-{k}', (0.12, 0.5, 0.01), 0.004, mat(c['crossingSign'], 0.6), coll, root, (0.0, -1.6 - 1.0 * k, 0.05))
    # The crossbuck on its post by the road (near side).
    post = Vector((0.85, -1.0, 0.0))
    rod('crossing-post', post, post + Vector((0.0, 0.0, 1.25)), 0.04, mat(c['crossingSign'], 0.4), coll, root, seg=10)
    for k in range(4):
        rbox(f'crossing-post-band-{k}', (0.09, 0.09, 0.12), 0.03, mat(c['crossingStripe'], 0.4), coll, root, post + Vector((0.0, 0.0, 0.15 + 0.28 * k)))
    sign = empty('crossing-sign', coll, root, post + Vector((0.0, -0.05, 1.2)), (0.0, 0.0, -10.0))
    for s in (-1, 1):
        board = rbox(f'crossing-board-{s}', (0.62, 0.03, 0.12), 0.04, mat(c['crossingSign'], 0.4), coll, sign, (0.0, 0.0, 0.0), (0.0, 35.0 * s, 0.0))
        rbox(f'crossing-board-edge-{s}', (0.64, 0.02, 0.04), 0.015, mat(c['crossingStripe'], 0.4), coll, sign, (0.0, -0.02, 0.0), (0.0, 35.0 * s, 0.0))
        del board
    # The little pink car waiting on the near side, its fox driver looking at the train.
    car = empty('crossing-car', coll, root, (0.0, CROSSING_CAR_DEPTH, 0.0), (0.0, 0.0, -62.0))
    pink, pink_dark = mat(c['littleCar'], 0.35), mat(c['littleCarDark'], 0.4)
    rbox('crossing-car-body', (0.62, 1.05, 0.34), 0.14, pink, coll, car, (0.0, 0.0, 0.33))
    rbox('crossing-car-hood', (0.58, 0.32, 0.12), 0.06, pink_dark, coll, car, (0.0, -0.42, 0.52))
    for sx in (-1, 1):
        for sy in (-1, 1):
            torus(f'crossing-car-wheel-{sx}-{sy}', 0.1, 0.06, mat(c['tire'], 0.6), coll, car, (0.33 * sx, 0.32 * sy, 0.16), (0.0, 90.0, 0.0))
    for sx in (-1, 1):
        blob(f'crossing-car-light-{sx}', mat(c['lamp'], 0.2), coll, car, (0.2 * sx, -0.53, 0.38), (0.06, 0.03, 0.06), seg=(12, 8))
    colours = {**params['colours'], 'creatureLight': params['art']['creatureLight']}
    mats = chibi_materials(colours, colours['creatureOrange'], colours['creatureLight'])
    rig = chibi('fox', 'crossing-fox', coll, mats)
    froot = rig['root']
    froot.parent = car
    froot.location = (0.0, 0.12, 0.2)
    froot.scale = (0.38, 0.38, 0.38)
    froot.rotation_euler = (0.0, 0.0, math.radians(-50.0))
    rig['tail'].scale = HIDDEN
    # The wave: one paw up beside the head (the wave frame only).
    arm = empty('crossing-fox-arm', coll, car)
    rod('crossing-fox-arm-rod', (0.14, -0.04, 0.5), (0.3, -0.16, 0.9), 0.045, mats['fur'], coll, arm, seg=10)
    blob('crossing-fox-paw', mats['light'], coll, arm, (0.3, -0.16, 0.9), (0.06, 0.055, 0.06), seg=(16, 8))
    show_on(arm, [10], [1, 10])
    key_chibi(rig, 1, head_pitch=-4.0, head_yaw=30.0, eyes='open')
    key_chibi(rig, 10, head_pitch=-12.0, head_roll=10.0, head_yaw=20.0, tongue=True, eyes='shut')
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    r = mesh_rect(bp.meshes_of(root))
    log(f'crossing {fmt_rect(r)}')
    car_px = project(car.matrix_world.translation)
    log(f'crossing car at {fmt_px(car_px)}')
    add_empty('anchor.surprise', (wx(SURPRISE_X), CROSSING_CAR_DEPTH, 0.0), layout)


def build_bridge(c, sprites):
    coll = sprite(sprites, 'bridge')
    root = ground_root('bridge-root', coll, SURPRISE_X, 0.0)
    river, river_dark = mat(c['river'], 0.15), mat(c['riverDark'], 0.2)
    stone, stone_dark = mat(c['bridge'], 0.7), mat(c['bridgeDark'], 0.7)
    # The river across the strip, from the far grass to the screen's bottom (its banks a darker blue).
    rbox('bridge-river', (1.4, 16.0, 0.02), 0.01, river, coll, root, (0.0, -1.0, 0.03))
    for s in (-1, 1):
        rbox(f'bridge-bank-{s}', (0.12, 16.0, 0.025), 0.01, river_dark, coll, root, (0.72 * s, -1.0, 0.032))
    for k, (dx, dy) in enumerate(((-0.3, -1.6), (0.25, -2.6), (-0.2, -3.8), (0.3, 2.4))):
        torus(f'bridge-ripple-{k}', 0.12, 0.018, mat(c['trim'], 0.3), coll, root, (dx, dy, 0.05), (0.0, 0.0, 0.0), arc=(200.0, 340.0))
    # The stone bridge under the track: a deck with its own sleepers and rails, a low parapet on each side.
    rbox('bridge-deck', (1.8, 2.1, 0.1), 0.03, stone, coll, root, (0.0, 0.0, -0.01))
    for k in range(4):
        rbox(f'bridge-sleeper-{k}', (0.19, 1.0, 0.05), 0.015, mat(c['sleeper'], 0.7), coll, root, (-0.66 + 0.44 * k, 0.0, 0.05))
    for s in (-1, 1):
        rbox(f'bridge-rail-{s}', (1.8, 0.07, 0.07), 0.01, mat(c['rail'], 0.3), coll, root, (0.0, s * RAIL_GAUGE, RAIL_TOP - 0.035))
        rbox(f'bridge-parapet-{s}', (1.9, 0.14, 0.18), 0.05, stone_dark, coll, root, (0.0, s * 1.02, 0.08))
        for k in range(5):
            rbox(f'bridge-cap-{s}-{k}', (0.3, 0.17, 0.05), 0.02, stone, coll, root, (-0.76 + 0.38 * k, s * 1.02, 0.19))
    bpy.context.view_layer.update()
    r = mesh_rect(bp.meshes_of(root))
    log(f'bridge {fmt_rect(r)}')


def build_fish(c, sprites):
    coll = sprite(sprites, 'fish')
    root = free_root('fish', coll)
    body, fin = mat(c['fish'], 0.35), mat(c['fishFin'], 0.4)
    tilt = empty('fish-tilt', coll, root, (0.0, 0.0, 0.0), (0.0, -30.0, 0.0))
    blob('fish-body', body, coll, tilt, (0.0, 0.0, 0.0), (0.42, 0.18, 0.26), seg=(32, 16))
    bp.prism('fish-tail', [(0.0, 0.0), (0.3, 0.2), (0.3, -0.2)], 0.06, fin, coll, tilt, (0.36, 0.0, 0.0), bevel=0.03)
    bp.prism('fish-fin', [(-0.1, 0.0), (0.12, 0.0), (0.0, 0.16)], 0.04, fin, coll, tilt, (0.0, 0.0, 0.22), bevel=0.02)
    blob('fish-eye', mat(c['ink'], 0.2), coll, tilt, (-0.25, -0.15, 0.06), (0.05, 0.03, 0.05), seg=(16, 8))
    blob('fish-eye-shine', mat(c['trim'], 0.2), coll, tilt, (-0.26, -0.175, 0.08), (0.016, 0.01, 0.016), seg=(10, 6))
    for k in range(2):
        blob(f'fish-drop-{k}', mat(c['river'], 0.15), coll, root, (0.2 + 0.18 * k, -0.05, -0.32 - 0.08 * k), (0.05, 0.03, 0.07), seg=(12, 8))
    free_fit('fish', root)


def build_rainbow(c, sprites):
    coll = sprite(sprites, 'rainbow')
    root = free_root('rainbow', coll)
    radius, minor, legs = 1.5, 0.046, 0.5
    for k in range(6):
        m = mat(c[f'rainbow{k + 1}'], 0.45)
        rk = radius - minor - k * 2 * minor * 0.97
        torus(f'rainbow-band-{k}', rk, minor, m, coll, root, (0.0, 0.0, 0.0), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
        for sx in (-1, 1):
            rod(f'rainbow-leg-{k}-{sx}', (rk * sx, 0.0, 0.02), (rk * sx, 0.0, -legs), minor, m, coll, root, seg=14)
    white, shade = mat(c['cloud'], 0.75), mat(c['cloudShade'], 0.75)
    mid = radius - 6 * minor
    for sx in (-1, 1):
        foot = empty(f'rainbow-foot-{sx}', coll, root, (sx * mid, -0.2, -legs))
        bp.puffs(f'rainbow-cloud-{sx}', [(-0.3, -0.02, 0.22), (0.0, 0.08, 0.3), (0.3, -0.02, 0.22), (0.0, -0.1, 0.24)], white, shade, coll, foot, depth=0.2, drop=0.06)
    free_fit('rainbow', root)


def build_hot_air(c, colours, sprites):
    coll = sprite(sprites, 'hot-air')
    root = free_root('hot-air', coll)
    a, b = mat(c['hotAir'], 0.4), mat(c['hotAirStripe'], 0.4)
    bp.gore_ball('hot-air-envelope', [a, b], 10, (0.74, 0.74, 0.76), coll, root, (0.0, 0.0, 1.0), shape=bp.envelope)
    lathe('hot-air-mouth', rounded_profile(0.2, 0.0, 0.16, 0.3), a, coll, root, (0.0, 0.0, 0.0), seg=24)
    torus('hot-air-band', 0.69, 0.045, b, coll, root, (0.0, 0.0, 0.6))
    rbox('hot-air-basket', (0.44, 0.38, 0.3), 0.08, mat(c['basket'], 0.7), coll, root, (0.0, 0.0, -0.5))
    rbox('hot-air-basket-rim', (0.5, 0.44, 0.08), 0.035, mat(c['trunk'], 0.6), coll, root, (0.0, 0.0, -0.35))
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(f'hot-air-rope-{sx}-{sy}', (0.2 * sx, 0.17 * sy, -0.35), (0.17 * sx, 0.15 * sy, 0.04), 0.014, mat(c['string'], 0.6), coll, root, seg=8)
    rider = empty('hot-air-rider', coll, root, (0.02, -0.02, -0.22))
    rider.scale = (0.56, 0.56, 0.56)
    bp.bird_body('hot-air-bird', c, colours, coll, rider)
    free_fit('hot-air', root)


def main():
    global DESIGN
    args = parse_args('build_train', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    bp.DESIGN = DESIGN
    tr = params['train']
    c = params['art']['train']
    if list(tr['cars']) != list(CAR_COLOUR_KEYS) or len(tr['cars']) != len(CAR_X):
        fail(f'the cars {tr["cars"]} do not match {list(CAR_COLOUR_KEYS)}')
    if list(tr['destinations']) != list(DESTINATIONS):
        fail(f'the destinations {tr["destinations"]} do not match {list(DESTINATIONS)}')
    if any(f not in PEN_CHIBIS or f not in FRIEND_HEIGHT_PX for f in tr['friends']):
        fail(f'no chibi for a friend in {tr["friends"]}')
    for s in tr['surprises']:
        if s not in ('crossing', 'bridge', 'hot-air', 'rainbow'):
            fail(f'no art for the surprise "{s}"')
    scene = bpy.context.scene
    bp.clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(1)
    bp.FRIEND_PX = REF_PX
    bp.setup_camera(scene)
    bpy.context.view_layer.update()
    bp.SCREEN = bp.Screen(scene)
    log(f'render engine {scene.render.engine}')
    plate = bpy.data.collections.new('train-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_sky(c, plate)
    engine = build_engine(params, c, sprites, layout)
    cars = [build_car(n, colour, params, c, sprites, layout) for n, colour in enumerate(tr['cars'])]
    nose, tail = engine[2], min(r[0] for r in cars)
    for a, b in [(cars[i + 1], cars[i]) for i in range(len(cars) - 1)] + [(cars[0], engine)]:
        if b[0] - a[2] < tr['gapPx'] + 1:
            fail(f'two train pieces are only {b[0] - a[2]:.0f} px apart (min {tr["gapPx"]})')
    add_empty('anchor.nose', (wx(nose), 0.0, 0.0), layout)
    add_empty('anchor.tail', (wx(tail), 0.0, 0.0), layout)
    log(f'train: tail {tail:.0f}, nose {nose:.0f} ({nose - tail:.0f} px)')
    platform = build_platform(params, c, sprites, layout)
    platform_z = PLATFORM_Z + 0.03
    add_empty('anchor.friend', (wx(FRIEND_X), FRIEND_DEPTH, platform_z), layout)
    for fid in tr['friends']:
        r, _root = build_friend(fid, params, sprites, layout, platform_z)
        if r[0] - HIT_PAD_PX - nose < tr['gapPx']:
            fail(f'friend {fid} comes within {r[0] - HIT_PAD_PX - nose:.0f} px of the engine')
        build_seat(fid, params, sprites)
    if platform[0] - HIT_PAD_PX - nose < tr['gapPx']:
        fail(f'the platform comes within {platform[0] - HIT_PAD_PX - nose:.0f} px of the engine')
    for did in tr['destinations']:
        r = build_dest(did, params, c, sprites, layout)
        if r[0] - HIT_PAD_PX - nose < tr['gapPx']:
            fail(f'destination {did} comes within {r[0] - HIT_PAD_PX - nose:.0f} px of the engine')
    add_empty('anchor.dest', (wx(DEST_X), DEST_DEPTH, 0.0), layout)
    for n, x in enumerate(DROP_X):
        add_empty(f'anchor.drop-{n}', (wx(x), DROP_DEPTH, 0.0), layout)
    build_tunnel(c, sprites, layout, tail, nose)
    build_ground(c, sprites)
    build_hills(c, sprites)
    build_trees(c, sprites)
    build_fence(c, sprites)
    build_clouds(c, sprites)
    build_birds(c, params['colours'], sprites)
    build_cow(params, sprites, layout)
    build_particles(c, sprites)
    build_crossing(params, c, sprites, layout)
    build_bridge(c, sprites)
    build_fish(c, sprites)
    build_rainbow(c, sprites)
    build_hot_air(c, params['colours'], sprites)
    scene.frame_set(1)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    log(f'saved {args["out"]}')


if __name__ == '__main__':
    main()
