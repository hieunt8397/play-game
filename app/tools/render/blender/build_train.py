# Builds art/train.blend (Tàu hỏa quanh đảo, spec-tau-quanh-dao, 2026-11-13): the train game on Xoài's island.
#
# Run by `npm run art:build -- train` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/map.blend --python-exit-code 1 --python build_train.py -- \
#     --out <tmp>/train.blend --params <tmp>/params.json
# The source is the BUILT map (art/map.blend: build_map.py's island with its stations, the railway, Ga tàu, the crossing,
# the volcano and the rides). Same camera, rendered at RENDER_SIZE = 2 × the map's (4096 × 3072: renderScale 4 over the
# 1024 × 768 design), so the train layout's design coordinates ARE the map's: the game shows it through a Phaser camera
# zoomed `ui.trainZoom` (2) and following the train. render.ts splits the plate into 2048 × 1536 tiles (pack.ts).
#
# What it does to the map:
#   - drops the map-only sprites: the clouds and waves (`ambient`), the decorations, the play-again icons, the guide's
#     outfits; and the layout the game does not use (slots, kart stops, the road, the plane's loop, clouds, waves);
#   - FRONTS: every sprite that a camera ray to the track (at the train's heights) hits first stays a sprite, drawn over
#     the train by depth (and under it nowhere: `path.rail-back` says where the train goes under every sprite). That set
#     must equal params.train.fronts (content/games/train.ts FRONT_SPRITES), else the build fails naming it. The volcano,
#     the `occ-<n>` scenery and the crossing's barriers (states up, down) are always sprites. Every other station
#     sprite, the parked plane (its parked heading), the rocket (idle) and the fountain are baked into the plate;
#   - keeps the map train's 8-heading frames (`train-engine`, `train-car-<n>`, h0…h7, at `anchor.train`): the game draws
#     the same sprites as the map, so the zoom handoff matches; the whale (idle, spout: `anchor.whale`, `hit.whale`);
#     the kart, moved onto the road beside the level crossing (`anchor.kart`; the trip's kart surprise);
#   - adds, per friend station (params.train.stations: ice-cream "Ga Xe kem", dino-puzzle "Ga Khủng long",
#     shadow-match "Ga Hang", race "Ga Đường đua"), a small wooden platform with a round sign beside the track (plate),
#     `anchor.stop-<station>` (the engine's stop on the rail), `anchor.friend-<station>` (where the friend stands) and
#     `hit.platform-<station>` (the deck and a friend-sized box over it);
#   - per destination (beach: the swim ring; whale: the shore by the whale; fountain: the fountain park),
#     `anchor.stop-<dest>`, `anchor.dest-<dest>`, `anchor.drop-<dest>-<n>` (where the friends hop off to) and
#     `hit.dest-<dest>`;
#   - the friends `friend-<f>` (idle [1], wave [10], happy [20]) standing on the beach below Ga tàu (`anchor.friend`:
#     the runtime draws them at a station's spot, scaled by the rail's local scale), the seated busts `seat-<f>` (the
#     friend sitting in a car at Ga tàu, cut below the chest by a holdout box; `anchor.seat`), `puff` and `pop`
#     (particles), `boat` (a little sailing boat) and `hot-air` (a balloon): drawn by their trimmed centre;
#   - the library collections `sprite.engine` / `sprite.car-<colour>` (train_models.build_library: never rendered) for
#     build_map.py's map_rides.py, which appends them from art/train.blend.
# Every length is in world metres.
import json
import math
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, chibi, key_chibi, mat, rbox, rod, soften_scene, torus  # noqa: E402
from common import add_empty, eval_world_verts, hull_object, move_to, parse_args  # noqa: E402
from build_animal_pens import PEN_CHIBIS, chibi_mats  # noqa: E402  (its main() only runs as a script)
import build_plane as bp  # noqa: E402  (puffs, gore_ball, envelope)
import map_rides as mr  # noqa: E402
import train_models  # noqa: E402

RENDER_SIZE = (4096, 3072)
BORDER_PROP = 'bhc_sprite_border'  # render_screen.py: each sprite pass renders inside its box + this margin
SPRITE_BORDER = 0.012

DROP_SPRITES = ('sprite.ambient', 'sprite.decoration', 'sprite.icon')
DROP_PREFIX = 'sprite.shiba-'  # the guide's outfits (sprite.shiba itself stays)
ALWAYS_FRONT = ('volcano', 'crossing-near', 'crossing-far')
OCC_PREFIX = 'occ-'
TRAIN_SPRITES = ('train-engine', 'train-car-1', 'train-car-2', 'train-car-3')
KEEP_SPRITES = TRAIN_SPRITES + ('whale', 'kart')
# Station-like sprites that may be fronts or baked into the plate.
PLACES = ('ice-cream', 'pizza', 'race', 'fishing', 'touch-talk', 'dino-puzzle', 'shadow-match', 'home', 'shiba', 'rocket', 'plane', 'fountain')
# Layout objects the game keeps (everything else in the map's layout goes).
KEEP_LAYOUT = (
    'anchor.train', 'anchor.rail-tunnel-in', 'anchor.rail-tunnel-out', 'anchor.rail-crossing-from', 'anchor.rail-crossing-to',
    'anchor.crossing-near', 'anchor.crossing-far', 'anchor.volcano', 'anchor.whale',
    'path.rail', 'path.rail-up', 'path.rail-back', 'path.compass',
) + tuple(f'anchor.{p}' for p in PLACES) + tuple(f'anchor.{OCC_PREFIX}{n}' for n in range(1, 10))  # the fronts' render pivots; the places' spots
# The place hulls the game keeps (a tap says the place's name): the map's own.
PLACE_HITS = ('ice-cream', 'pizza', 'race', 'fishing', 'touch-talk', 'dino-puzzle', 'shadow-match', 'home', 'plane', 'rocket')

# --- the friend stations ----------------------------------------------------------------------------------------------
# Per station: the side of the track its platform stands on (+1 the beach, −1 inland: on the island's left and right
# edges the beach side would leave the camera's interactive rect) and a shift along the rail (m) from the rail point
# nearest the place.
STATION_SPOTS = {
    'ice-cream': {'side': -1, 'shift': -3.4},
    'dino-puzzle': {'side': 1, 'shift': 0.6},
    'shadow-match': {'side': 1, 'shift': 0.0},
    'race': {'side': -1, 'shift': -1.5},
}
PLATFORM = (1.1, 0.62, 0.12)  # along the track, across, high
PLATFORM_CLEAR = 0.5  # its near edge this far from the track's middle
SIGN_UP = 0.95
STOP_BEFORE = 3.9  # the engine stops this far (m of rail) before the platform's middle: its tap disc ≥ targetGap from the friend's area

# --- the destinations -------------------------------------------------------------------------------------------------
DEST_STOP_BEFORE = {'beach': 2.2, 'whale': 2.2, 'fountain': 3.4}  # the engine stops this far (m of rail) before the point nearest the destination (like a station)
WHALE_SHIFT = -1.8  # the whale's bay: the shore this far (m of rail) from the point nearest the whale (between the swim ring and the airstrip)
WHALE_SHORE = 1.0  # … this far outside the track's middle
DROP_RING = 0.45  # the dropped friends stand round the destination's point at about this radius
FOUNTAIN_PARK = (-1.4, 0.0)  # the fountain park's drop spots: this far (world x, y m) from the fountain, on the grass beside it (clear of Ga tàu)
DEST_BOX = (1.4, 1.0, 1.2)  # a destination without its own mesh in the hull (the whale's shore): this box (x, y, z)

# --- the friends, the seats, the free sprites ------------------------------------------------------------------------
FRIEND_PX = 64.0  # a friend's drawn height (design px) at `anchor.friend`
FRIEND_OUT = 1.6  # `anchor.friend`: this far outside the track at Ga tàu (on the beach)
F_IDLE, F_WAVE, F_HAPPY = [1], [10], [20]
FRIEND_STATES = {'idle': F_IDLE, 'wave': F_WAVE, 'happy': F_HAPPY}
FRIEND_YAW = 0.0  # facing the camera (its front is −y)
SEAT_PX = 40.0  # a seated friend's whole drawn height before the cut
SEAT_CUT = 0.42  # the holdout box hides it below this share of its height (the car's walls)
SEAT_FLOOR = 0.34  # its pivot (`anchor.seat`): this high over the rail at Ga tàu (the car's floor at the map scale)
FREE_AT = (0.0, -2.6)  # the free sprites stand this far (m: along, out) from Ga tàu, apart along the track
FREE_PX = {'puff': 26.0, 'pop': 30.0, 'boat': 70.0, 'hot-air': 84.0}
FREE_GAP = 3.0


def fail(msg):
    raise RuntimeError(f'build_train: {msg}')


def log(msg):
    print(f'build_train: {msg}')


class Screen:
    """World → design px with the scene camera (render_screen.py's projection over the design size)."""

    def __init__(self, scene, design):
        self.scene, self.w, self.h = scene, design[0], design[1]

    def project(self, p):
        v = world_to_camera_view(self.scene, self.scene.camera, Vector(p))
        return (v.x * self.w, (1 - v.y) * self.h)

    def rect(self, pts):
        sp = [self.project(p) for p in pts]
        xs, ys = [p[0] for p in sp], [p[1] for p in sp]
        return (min(xs), min(ys), max(xs), max(ys))


def depsgraph():
    bpy.context.view_layer.update()
    return bpy.context.evaluated_depsgraph_get()


def objects_under(root):
    out = [root]
    for c in root.children_recursive:
        out.append(c)
    return out


def remove_collection(coll):
    for o in list(coll.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for ch in list(coll.children_recursive):
        bpy.data.collections.remove(ch)
    bpy.data.collections.remove(coll)


def layout_point(name):
    o = bpy.data.objects.get(name)
    if o is None:
        fail(f'the map layout has no "{name}"')
    return o.matrix_world.translation.copy()


def curve_points(name):
    o = bpy.data.objects.get(name)
    if o is None:
        fail(f'the map layout has no "{name}"')
    mw = o.matrix_world
    return [mw @ p.co.xyz for p in o.data.splines[0].points]


def sprite_group(sprites, name, **props):
    coll = bpy.data.collections.new(f'sprite.{name}')
    sprites.children.link(coll)
    for k, v in props.items():
        coll[k] = v
    return coll


# --- the map's sprites -------------------------------------------------------------------------------------------------

def drop_map_only(sprites, layout):
    for coll in list(sprites.children):
        if coll.name in DROP_SPRITES or coll.name.startswith(DROP_PREFIX):
            remove_collection(coll)
    keep_hits = {f'hit.{h}' for h in PLACE_HITS}
    for o in list(layout.all_objects):
        if o.name not in KEEP_LAYOUT and o.name not in keep_hits:
            bpy.data.objects.remove(o, do_unlink=True)


def first_sprite_hit(scene, dg, cam, target, owner):
    """The sprite collection of the first sprite mesh on the ray from the camera to `target` (plate meshes and the
    rides' own copies pass), or None."""
    d = target - cam
    total = d.length
    d.normalize()
    origin = cam.copy()
    gone = 0.0
    for _ in range(64):
        left = total - gone - 0.02
        if left <= 0:
            return None
        hit, loc, _n, _i, obj, _m = scene.ray_cast(dg, origin, d, distance=left)
        if not hit:
            return None
        if obj is not None and obj.name in owner:
            return owner[obj.name]
        step = (loc - origin).length + 0.005
        gone += step
        origin = origin + d * step
    return None


def find_fronts(scene, sprites, rail_pts):
    """The PLACES sprites a camera ray to the track hits first (at the train's heights)."""
    owner = {}
    for coll in sprites.children:
        sid = coll.name[len('sprite.'):]
        if sid in PLACES or sid in ALWAYS_FRONT or sid.startswith(OCC_PREFIX):
            for o in coll.all_objects:
                if o.type == 'MESH':
                    owner[o.name] = sid
    dg = depsgraph()
    cam = scene.camera.matrix_world.translation.copy()
    hits = {}
    for p in rail_pts:
        for h in mr.BACK_HEIGHTS:
            sid = first_sprite_hit(scene, dg, cam, p + Vector((0.0, 0.0, h)), owner)
            if sid is not None:
                hits[sid] = hits.get(sid, 0) + 1
    log(f'sprites in front of the track (rail points × heights hidden): {hits}')
    return sorted(s for s in hits if s in PLACES)


def keep_state(coll, state):
    """A sprite with `state.*` children keeps one (its objects move up into the group; the others are deleted)."""
    for ch in list(coll.children):
        if ch.get('bhc_state', ch.name) == state or ch.name.endswith(f'-{state}'):
            for o in list(ch.objects):
                move_to(o, coll)
        else:
            for o in list(ch.all_objects):
                bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(ch)


def parked_plane_state():
    """The plane's parked heading: its loop's first direction (world), as the map runtime picks it."""
    pts = curve_points('path.plane-loop')
    d = pts[1] - pts[0]
    k = round(math.degrees(math.atan2(d.y, d.x)) / 45.0) % mr.HEADINGS
    return f'h{k}'


def still_places(plane_state):
    """The parked plane keeps its parked heading, the rocket its idle state (no puff)."""
    keep_state(bpy.data.collections['sprite.plane'], plane_state)
    keep_state(bpy.data.collections['sprite.rocket'], 'idle')


def settle_places(sprites, fronts):
    """Fronts stay sprites in their idle state; every other place is baked into the plate (World)."""
    plate = bpy.data.collections['World']
    for coll in list(sprites.children):
        sid = coll.name[len('sprite.'):]
        if sid not in PLACES:
            continue
        if 'states' in coll.keys():
            coll['states'] = json.dumps({'idle': [1]}, separators=(',', ':'))
        coll['occlude'] = 1
        coll['movable'] = 0
        if sid in fronts:
            continue
        for o in list(coll.all_objects):
            move_to(o, plate)
        bpy.data.collections.remove(coll)


def move_kart(sprites, layout, rail):
    """The kart waits on the road a little inland of the crossing (the trip's kart surprise)."""
    import build_map
    coll = bpy.data.collections.get('sprite.kart')
    if coll is None:
        fail('the map has no sprite.kart')
    a, b = layout_point('anchor.rail-crossing-from'), layout_point('anchor.rail-crossing-to')
    c = (a + b) / 2
    road = build_map.ROAD_CENTRE
    inland = (Vector(road[1]) - Vector(road[0])).normalized()
    _d, (tx, ty) = build_map.nearest_on_road(tuple(c.xy + inland * KART_BACK))
    objs = list(coll.all_objects)
    pts = eval_world_verts(objs, depsgraph())
    kx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    ky = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    kz = min(p.z for p in pts)
    delta = Vector((tx - kx, ty - ky, 0.0))
    for o in objs:
        if o.parent is None or o.parent not in objs:
            o.location += delta
    add_empty('anchor.kart', (tx, ty, kz), layout)
    log(f'kart at ({tx:.2f}, {ty:.2f})')


KART_BACK = 2.2  # the kart waits this far (m) inland of the crossing along the road


# --- the platforms and destinations --------------------------------------------------------------------------------

def rail_dir(rail, s):
    _p, t = rail.at(s)
    return t


def build_platform(sid, rail, mats, plate, layout, friend_h):
    spot = STATION_SPOTS[sid]
    place = layout_point(f'anchor.{sid}')
    s0, _d = rail.project(place)
    s = rail.wrap(s0 + spot['shift'])
    p, t = rail.at(s)
    nrm = rail.inward(s) * (-spot['side'])  # +1: the beach (outside the loop)
    yaw = math.degrees(math.atan2(t.y, t.x))
    centre = p + nrm * (PLATFORM_CLEAR + PLATFORM[1] / 2)
    z = rail.z
    objs = [rbox(f'stop-{sid}-deck', PLATFORM, 0.04, mats['platform'], plate, None, (centre.x, centre.y, z + PLATFORM[2] / 2), (0.0, 0.0, yaw)),
            rbox(f'stop-{sid}-edge', (PLATFORM[0], 0.08, 0.03), 0.015, mats['platformEdge'], plate, None,
                 tuple(p + nrm * (PLATFORM_CLEAR + 0.04)) + (z + PLATFORM[2] + 0.012,), (0.0, 0.0, yaw))]
    q = centre + t * (PLATFORM[0] / 2 - 0.12) + nrm * (PLATFORM[1] / 2 - 0.1)
    objs.append(rod(f'stop-{sid}-pole', (q.x, q.y, z + PLATFORM[2]), (q.x, q.y, z + SIGN_UP), 0.025, mats['platformPost'], plate, None, seg=10))
    objs.append(blob(f'stop-{sid}-sign', mats['sign'], plate, None, (q.x, q.y, z + SIGN_UP + 0.12), (0.15, 0.035, 0.15), (0.0, 0.0, yaw), seg=(28, 8)))
    objs.append(torus(f'stop-{sid}-sign-rim', 0.15, 0.022, mats['platformRoof'], plate, None, (q.x, q.y, z + SIGN_UP + 0.12), (90.0, 0.0, yaw)))
    ground = Vector((centre.x, centre.y, z + PLATFORM[2]))
    box = [ground + Vector((dx, dy, dz)) for dx in (-0.45, 0.45) for dy in (-0.3, 0.3) for dz in (0.0, friend_h)]
    hull_object(f'hit.platform-{sid}', eval_world_verts(objs, depsgraph()) + box, layout)
    add_empty(f'anchor.friend-{sid}', tuple(ground), layout)
    add_empty(f'anchor.stop-{sid}', rail.point3(s - STOP_BEFORE), layout)
    log(f'station {sid}: rail s {s:.2f} m (place {s0:.2f}), side {spot["side"]}, stop {rail.wrap(s - STOP_BEFORE):.2f}')
    return s


def drop_spots(at, outward, n=3):
    """`n` spots round `at`, spread across the outward direction (the friends face the camera)."""
    side = Vector((-outward.y, outward.x))
    return [at + side * (DROP_RING * (k - (n - 1) / 2)) + outward * (0.25 if k == 1 else 0.0) for k in range(n)]


def build_destinations(rail, layout, friend_h, ground_z):
    dests = {}
    ring = bpy.data.objects.get('swim-ring')
    if ring is None:
        fail('the map has no swim-ring')
    rp = ring.matrix_world.translation
    s_ring, _d = rail.project(rp)
    dests['beach'] = {'s': s_ring, 'at': Vector((rp.x, rp.y)), 'out': -rail.inward(s_ring), 'objs': [ring]}
    wp = layout_point('anchor.whale')
    s_w, _d = rail.project(wp)
    s_w = rail.wrap(s_w + WHALE_SHIFT)
    pw, _t = rail.at(s_w)
    dests['whale'] = {'s': s_w, 'at': pw - rail.inward(s_w) * WHALE_SHORE, 'out': -rail.inward(s_w), 'objs': []}
    fp = layout_point('anchor.fountain') if bpy.data.objects.get('anchor.fountain') else None
    fobjs = []
    fcoll = bpy.data.collections.get('sprite.fountain')
    if fp is None:
        fail('the map has no anchor.fountain')
    if fcoll is not None:
        fobjs = list(fcoll.all_objects)
    s_f, _d = rail.project(fp)
    toward_rail = (rail.at(s_f)[0] - Vector((fp.x, fp.y))).normalized()
    dests['fountain'] = {'s': s_f, 'at': Vector((fp.x, fp.y)) + Vector(FOUNTAIN_PARK), 'out': toward_rail, 'objs': fobjs}
    dg = depsgraph()
    for did, d in dests.items():
        spots = drop_spots(d['at'], d['out'])
        pts = eval_world_verts(d['objs'], dg)
        for q in spots:
            pts += [Vector((q.x + dx, q.y + dy, ground_z + dz)) for dx in (-0.3, 0.3) for dy in (-0.25, 0.25) for dz in (0.0, friend_h)]
        if not d['objs']:
            c = d['at']
            pts += [Vector((c.x + dx, c.y + dy, ground_z + dz)) for dx in (-DEST_BOX[0] / 2, DEST_BOX[0] / 2) for dy in (-DEST_BOX[1] / 2, DEST_BOX[1] / 2) for dz in (0.0, DEST_BOX[2])]
        hull_object(f'hit.dest-{did}', pts, layout)
        add_empty(f'anchor.dest-{did}', (d['at'].x, d['at'].y, ground_z), layout)
        for n, q in enumerate(spots):
            add_empty(f'anchor.drop-{did}-{n}', (q.x, q.y, ground_z), layout)
        stop = rail.wrap(d['s'] - DEST_STOP_BEFORE[did])
        add_empty(f'anchor.stop-{did}', rail.point3(stop), layout)
        log(f'destination {did}: rail s {d["s"]:.2f} m, stop {stop:.2f}')


# --- the friends, seats and free sprites -----------------------------------------------------------------------------

def fit_height(root, screen, target_px, frame=1):
    """Scales `root` so its meshes are drawn `target_px` tall (design px). Returns the metric height."""
    bpy.context.scene.frame_set(frame)
    meshes = [o for o in objects_under(root) if o.type == 'MESH']
    r = screen.rect(eval_world_verts(meshes, depsgraph()))
    k = target_px / max(1e-6, r[3] - r[1])
    root.scale = root.scale * k
    pts = eval_world_verts(meshes, depsgraph())
    return max(p.z for p in pts) - min(p.z for p in pts)


def build_friend(fid, params, sprites, at, screen):
    coll = sprite_group(sprites, f'friend-{fid}', states=json.dumps(FRIEND_STATES, separators=(',', ':')), movable=1, occlude=0)
    kind, colours = PEN_CHIBIS[fid][0], PEN_CHIBIS[fid][1]
    rig = chibi(kind, f'friend-{fid}', coll, chibi_mats(params, colours))
    root = rig['root']
    root.location = at
    root.rotation_euler = (0.0, 0.0, math.radians(FRIEND_YAW))
    key_chibi(rig, F_IDLE[0], head_pitch=-6.0, head_yaw=8.0, eyes='open')
    key_chibi(rig, F_WAVE[0], head_pitch=-10.0, head_roll=-12.0, head_yaw=4.0, tail=30.0, eyes='open', bob=0.04)
    key_chibi(rig, F_HAPPY[0], head_pitch=-19.0, head_roll=11.0, head_yaw=14.0, tail=26.0, tongue=True, bob=0.07, eyes='shut')
    h = fit_height(root, screen, FRIEND_PX)
    bpy.context.scene.frame_set(1)
    return h


def build_seat(fid, params, sprites, at, screen, mats):
    coll = sprite_group(sprites, f'seat-{fid}', movable=1, occlude=0)
    kind, colours = PEN_CHIBIS[fid][0], PEN_CHIBIS[fid][1]
    rig = chibi(kind, f'seat-{fid}', coll, chibi_mats(params, colours))
    root = rig['root']
    root.location = at
    root.rotation_euler = (0.0, 0.0, math.radians(-20.0))
    rig['tail'].scale = train_models.HIDDEN
    key_chibi(rig, 1, head_pitch=-8.0, head_yaw=10.0, eyes='open')
    h = fit_height(root, screen, SEAT_PX)
    # A holdout box round the lower body: the bust peeks out of the car.
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    me = bpy.data.meshes.new(f'seat-{fid}-cut')
    bm.to_mesh(me)
    bm.free()
    cut = bpy.data.objects.new(f'seat-{fid}-cut', me)
    coll.objects.link(cut)
    cut.scale = (h * 1.6, h * 1.6, h * SEAT_CUT + 0.05)
    cut.location = (at.x, at.y, at.z + (h * SEAT_CUT - 0.05) / 2)
    cut.is_holdout = True
    cut['cute'] = 1  # soften_scene leaves it alone
    return h


def build_free(name, sprites, at, screen, c, colours, mats):
    coll = sprite_group(sprites, name, movable=1, occlude=0)
    root = bpy.data.objects.new(f'{name}-root', None)
    coll.objects.link(root)
    root.location = at
    if name == 'puff':
        bp.puffs('puff', [(-0.26, -0.04, 0.26), (0.0, 0.1, 0.33), (0.27, -0.03, 0.25), (0.02, -0.14, 0.26)],
                 mat(c['smoke'], 0.7), mat(c['smokeShade'], 0.7), coll, root, drop=0.07)
    elif name == 'pop':
        m = mat(c['pop'], 0.55)
        for j in range(8):
            a = 360.0 * j / 8
            ar = math.radians(a)
            blob(f'pop-petal-{j}', m, coll, root, (0.36 * math.sin(ar), 0.0, 0.36 * math.cos(ar)), (0.075, 0.05, 0.16), (0.0, a, 0.0), seg=(20, 10))
            b = math.radians(a + 22.5)
            blob(f'pop-dot-{j}', m, coll, root, (0.5 * math.sin(b), 0.0, 0.5 * math.cos(b)), (0.045, 0.04, 0.045), seg=(12, 8))
    elif name == 'boat':
        hull, sail, mast = mat(c['boatHull'], 0.35), mat(c['boatSail'], 0.5), mat(c['trunk'], 0.6)
        blob('boat-hull', hull, coll, root, (0.0, 0.0, 0.12), (0.7, 0.28, 0.16), seg=(32, 12))
        rbox('boat-deck', (1.1, 0.4, 0.06), 0.03, mat(c['boatDeck'], 0.6), coll, root, (0.0, 0.0, 0.25))
        rod('boat-mast', (0.0, 0.0, 0.25), (0.0, 0.0, 1.45), 0.035, mast, coll, root, seg=10)
        bp.prism('boat-sail', [(0.0, 0.0), (0.0, 1.05), (0.62, 0.0)], 0.03, sail, coll, root, (0.05, 0.0, 0.36), (90.0, 0.0, 0.0), bevel=0.012)
        bp.prism('boat-jib', [(0.0, 0.0), (0.0, 0.8), (-0.4, 0.0)], 0.03, sail, coll, root, (-0.05, 0.0, 0.36), (90.0, 0.0, 0.0), bevel=0.012)
        blob('boat-flag', mat(c['boatFlag'], 0.5), coll, root, (0.1, 0.0, 1.45), (0.14, 0.02, 0.06), seg=(12, 6))
    elif name == 'hot-air':
        a, b = mat(c['hotAir'], 0.4), mat(c['hotAirStripe'], 0.4)
        bp.gore_ball('hot-air-envelope', [a, b], 10, (0.74, 0.74, 0.76), coll, root, (0.0, 0.0, 1.0), shape=bp.envelope)
        torus('hot-air-band', 0.69, 0.045, b, coll, root, (0.0, 0.0, 0.6))
        rbox('hot-air-basket', (0.44, 0.38, 0.3), 0.08, mat(c['basket'], 0.7), coll, root, (0.0, 0.0, -0.5))
        rbox('hot-air-basket-rim', (0.5, 0.44, 0.08), 0.035, mat(c['trunk'], 0.6), coll, root, (0.0, 0.0, -0.35))
        for sx in (-1, 1):
            for sy in (-1, 1):
                rod(f'hot-air-rope-{sx}-{sy}', (0.2 * sx, 0.17 * sy, -0.35), (0.17 * sx, 0.15 * sy, 0.04), 0.014, mat(c['string'], 0.6), coll, root, seg=8)
    else:
        fail(f'no free sprite "{name}"')
    fit_height(root, screen, FREE_PX[name])


# --- main -------------------------------------------------------------------------------------------------------------

def check_list(what, built, wanted):
    if sorted(built) != sorted(wanted):
        fail(f'{what}: built {sorted(built)}, content/games/train.ts says {sorted(wanted)}')


def main():
    args = parse_args('build_train', required=('out', 'params'))
    params = args['params']
    tr = params['train']
    design = (params['design']['width'], params['design']['height'])
    scene = bpy.context.scene
    library = train_models.build_library(params)
    sprites = bpy.data.collections.get('sprites')
    layout = bpy.data.collections.get('layout')
    if sprites is None or layout is None or 'World' not in bpy.data.collections:
        fail('art/map.blend has no sprites / layout / World collection (build the map first)')
    for sid in KEEP_SPRITES + ALWAYS_FRONT:
        if f'sprite.{sid}' not in bpy.data.collections:
            fail(f'art/map.blend has no sprite.{sid}')
    check_list('the friend stations', list(STATION_SPOTS), tr['stations'])
    check_list('the destinations', list(DEST_STOP_BEFORE), tr['destinations'])
    still_places(parked_plane_state())
    drop_map_only(sprites, layout)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene[BORDER_PROP] = SPRITE_BORDER
    screen = Screen(scene, design)

    rail = mr.rail_from_scene()
    rail_pts = curve_points('path.rail')
    fronts = find_fronts(scene, sprites, rail_pts)
    check_list('the sprites drawn over the train (FRONT_SPRITES)', fronts, tr['fronts'])
    settle_places(sprites, fronts)
    move_kart(sprites, layout, rail)
    whale = bpy.data.collections['sprite.whale']
    hull_object('hit.whale', eval_world_verts(list(whale.all_objects), depsgraph()), layout)

    c = params['art']['train']
    mats = mr.materials(params)
    plate = bpy.data.collections['World']
    ground_z = rail.z - mr.TRACK_LIFT
    s_ga, _d = rail.project(layout_point('anchor.train'))
    p_ga, t_ga = rail.at(s_ga)
    out_ga = -rail.inward(s_ga)
    friend_at = Vector((p_ga.x, p_ga.y, ground_z)) + out_ga.to_3d() * FRIEND_OUT
    add_empty('anchor.friend', tuple(friend_at), layout)
    heights = [build_friend(fid, params, sprites, friend_at, screen) for fid in tr['friends']]
    friend_h = max(heights)
    seat_at = rail.point3(s_ga) + Vector((0.0, 0.0, SEAT_FLOOR))
    add_empty('anchor.seat', tuple(seat_at), layout)
    for fid in tr['friends']:
        build_seat(fid, params, sprites, seat_at, screen, mats)
    for k, name in enumerate(FREE_PX):
        q = p_ga + t_ga * (FREE_AT[0] + (k - 1.5) * FREE_GAP) + out_ga * -FREE_AT[1]
        build_free(name, sprites, Vector((q.x, q.y, ground_z + 1.2)), screen, c, params['colours'], mats)
    log(f'friends {friend_h:.2f} m tall (drawn {FRIEND_PX:.0f} px at anchor.friend)')

    for sid in tr['stations']:
        build_platform(sid, rail, mats, plate, layout, friend_h)
    build_destinations(rail, layout, friend_h, ground_z)
    for p in PLACES:
        if p not in PLACE_HITS and p not in fronts and bpy.data.objects.get(f'anchor.{p}'):
            bpy.data.objects.remove(bpy.data.objects[f'anchor.{p}'], do_unlink=True)

    scene.frame_set(1)
    soften_scene(scene)
    for name in library:
        if bpy.data.collections.get(name) is None:
            fail(f'library collection {name} lost')
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    log(f'saved {args["out"]}')


if __name__ == '__main__':
    main()
