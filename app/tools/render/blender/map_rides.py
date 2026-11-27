# The island's railway and rides for build_map.py (2026-11-13, spec-dao-moi-xe-ra-dao). Imported, never run.
#
# On the map's source scene (art/src/map-v4.blend, whose `RailPath` is the track's centreline) it builds:
# - the plate's railway: a ballast bed, sleepers and two rails along RailPath (the stretch under the volcano is left out);
# - the tunnel: the volcano and its lava cap become `sprite.volcano` (no hit; drawn by depth, so a train behind it is
#   hidden and one in front is not), with a stone portal where the track enters and leaves it. The arc range inside
#   the volcano's foot is the tunnel (`anchor.rail-tunnel-in` / `-out`);
# - occluders: plate scenery standing in front of the track on screen (palms, trees) becomes `sprite.occ-<n>` (no hit;
#   drawn by depth), so the train passes behind it;
# - the level crossing where the track crosses the road: boards between the rails (plate), a barrier each side of the
#   track (`sprite.crossing-near` / `-far`, states up / down), a signal post before it (plate);
#   anchors `rail-crossing-from` / `-to` (the road's edges on the track) and `rail-signal`;
# - Ga tàu: a wooden platform on the inland side of the track, a little roof and a round sign (plate); `hit.ga-tau`;
#   `anchor.train` (the engine's stop) and `anchor.train-car-<n>` (where the cars stand behind it);
# - the train: the train game's engine and three cars (appended from art/train.blend) at MAP_TRAIN_SCALE, each in
#   16 headings (`sprite.train-engine`, `sprite.train-car-<n>`, states h0…h15: world east, then counter-clockwise in
#   22.5° steps), all rendered standing at `anchor.train` (the runtime moves and scales them);
# - the airstrip (plate) on the bottom-right beach and the plane (appended from art/plane.blend) in 16 headings
#   (`sprite.plane`, states h0…h15) rendered parked at `anchor.plane`; `hit.plane`; its flight `path.plane-loop` (closed:
#   the take-off roll, a loop over the island, the landing roll back to its spot);
# - the launch pad and the rocket (appended from art/rocket.blend: the yard corner's colours) on the bottom-left beach:
#   `sprite.rocket` (states idle, puff-1…3: a soft steam cloud at its foot), `anchor.rocket`, `hit.rocket`;
# - `path.rail-back`: the rail points (a subset of `path.rail`'s) that a sprite in front hides from the camera (a ray
#   from the camera to the train's height there hits a station, the volcano, an occluder… first): the runtime draws the
#   train under every sprite there, so it passes behind the cave or the dinosaurs instead of over them (review
#   2026-11-13: one depth per sprite anchor cannot order a long train against a big sprite);
# - `path.rail` and `path.rail-up` (the same points 1 m higher: the runtime's local scale), `path.plane-loop-up`, and
#   `path.compass` (a ground origin, 1 m east, 1 m north: the runtime's world heading from a screen direction).
# Every length is in world metres.
import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from common import add_empty, eval_world_verts, hull_object, move_to
from cute import blob, lathe, mat, rbox, rod, torus

PROJECT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..'))
ART = os.path.join(PROJECT, 'art')

RAIL_OBJECT = 'RailPath'
RAIL_LAYOUT_STEP = 0.25  # path.rail is resampled every this many metres
HEADINGS = 16  # 2026-11-27 (spec-sua-tau-va-ten-lua-tren-dao): 22.5° steps; the runtime turns the residual
HEADING_STEP = 360.0 / HEADINGS

MAP_TRAIN_SCALE = 0.6
GAUGE = 0.36 * MAP_TRAIN_SCALE  # each rail this far from the middle (the train game's gauge, scaled)
RAIL_W, RAIL_H = 0.05, 0.05
SLEEPER = (0.13, 0.62, 0.04)  # along, across, thick
SLEEPER_STEP = 0.34
BALLAST_HALF = 0.44
BALLAST_H = 0.02
TRACK_LIFT = 0.005  # above the sand top
# The train game's pieces (art/train.blend), their own lengths (m, unscaled) and the gap between them on the map.
ENGINE_ROOT = 'engine-root'
CAR_ROOTS = ['car-red-root', 'car-yellow-root', 'car-blue-root']
ENGINE_LEN, CAR_LEN = 1.9, 1.15
PIECE_GAP = 0.18  # unscaled, between two pieces

VOLCANO = ('Volcano', 'Lava')
VOLCANO_FOOT_Z = 0.35  # the volcano's verts below this (world z) make its foot
PORTAL_R = 0.72  # the arch's inner radius (the scaled engine is ~1.2 m tall)
PORTAL_TUBE = 0.13
PORTAL_OUT = 0.15  # each portal stands this far outside the foot, along the track

GA_TAU_AT = (-1.2, -7.6)  # Ga tàu: the track point nearest this (world XY) is the engine's stop (the fountain's old spot)
PLATFORM = (2.6, 0.7, 0.16)  # length along the track, depth, height
PLATFORM_CLEAR = 0.42  # its near edge this far inland of the track's middle
ROOF_H = 1.05

CROSSING_MARGIN = 0.25  # the crossing's arc range reaches this far past the road's edges
SIGNAL_BEFORE = 1.6  # the signal stands this far before the crossing (along the travel direction)
BARRIER_ARM = 1.45

AIRSTRIP_ANGLE_DEG = -38.0  # where on the beach (angle round the island centre)
AIRSTRIP = (3.2, 0.62)  # length, width
AIRSTRIP_OUT = 0.95  # its middle this far outside the track's middle
PLANE_SCALE = 0.62
PLANE_ROOT = 'plane-root'
PLANE_LIFT = 0.42  # the plane's wheels touch the ground at this height of its root (unscaled)
PLANE_LOOP_SHRINK = 0.72  # the loop is the rail loop shrunk this much toward the island's middle …
PLANE_LOOP_Z = 2.6  # … at this height
PLANE_LOOP_STEP = 0.25

PAD_ANGLE_DEG = -126.0
PAD_OUT = 1.0
PAD_SCALE = 0.62  # the pad (its own radius 1.3 at the rocket's scale) is shrunk to this
ROCKET_PARTS = ['sprite.launchpad', 'sprite.body-red', 'sprite.nose-yellow', 'sprite.fins-blue']
ROCKET_HEIGHT = 2.6  # the rocket on its pad, top to ground (m)
RING_ANGLE_DEG = -64.0  # the swim ring lies on the outer beach here (its old spot is Ga tàu's)
RING_OUT = 1.3
ROAD_STUB = 1.7  # the kart road runs on past its old end at most this far (it used to end on the track), to a rounded end
ROAD_STUB_SAND = 0.35  # … and its end keeps this far inside the beach (parent review 2026-11-13: it ran into the sea)
ROAD_STUB_PAST_TRACK = 0.45  # … and at least this far past the track's outer edge (room for the outer barrier)
ROAD_TOP = 0.53  # build_map.ROAD_TOP_Z
CROSSING_FLAT = 0.15  # the raised track runs this far past each road edge before its ramp
CROSSING_RAMP = 0.9  # the ramp down to the sand
# Appended pad-world pieces the map leaves out: the launch tower (too tall for the beach) and its beacon's glow.
ROCKET_DROP = ('tower', 'halo')
PUFFS = [  # per puff state: (x, y, r) spheres round the pad's foot, scaled by the pad's radius
    [(-0.55, -0.2, 0.22), (0.5, -0.25, 0.2)],
    [(-0.75, -0.25, 0.3), (-0.4, -0.45, 0.24), (0.7, -0.3, 0.28), (0.35, -0.5, 0.22)],
    [(-0.95, -0.25, 0.26), (-0.6, -0.6, 0.2), (0.9, -0.35, 0.24), (0.55, -0.65, 0.18)],
]

# Rail-back: rays to these heights above the track (m) at every layout rail point; the sprites that never hide the track
# (the rides themselves, drawn by the runtime, and the kart, which moves).
BACK_HEIGHTS = (0.25, 0.6, 1.0)
NOT_BLOCKERS = ('sprite.train-', 'sprite.plane', 'sprite.kart')

GROUND_NAMES = ('Grass', 'Sand', 'Shallow', 'Sea', 'Road', 'RoadEdge', 'Pond', 'RailPath')
OCCLUDER_PREFIXES = ('Palm', 'PTr', 'RTr', 'Pine', 'Crown', 'Flower')


def fail(msg):
    raise RuntimeError(f'map_rides: {msg}')


def log(msg):
    print(f'map_rides: {msg}')


# --- geometry on the rail ---------------------------------------------------------------------------------------------

class Rail:
    """The closed centreline (world XY) at height z, measured by arc length."""

    def __init__(self, pts, z):
        self.pts = [Vector((p[0], p[1])) for p in pts]
        self.z = z
        self.s0 = []
        total = 0.0
        n = len(self.pts)
        for i in range(n):
            self.s0.append(total)
            total += (self.pts[(i + 1) % n] - self.pts[i]).length
        self.length = total

    def wrap(self, s):
        return s % self.length

    def at(self, s):
        s = self.wrap(s)
        n = len(self.pts)
        lo, hi = 0, n - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if self.s0[mid] <= s:
                lo = mid
            else:
                hi = mid - 1
        a, b = self.pts[lo], self.pts[(lo + 1) % n]
        seg = (b - a).length or 1.0
        t = (s - self.s0[lo]) / seg
        return a.lerp(b, t), (b - a).normalized()

    def set_rise(self, centre, half, ramp, height):
        """The track climbs `height` over `ramp` metres to lie flat on the road for `half` metres either side of
        `centre` (the level crossing: the road is a raised slab over the sand)."""
        self.rise = (centre, half, ramp, height)

    def z_at(self, s):
        rise = getattr(self, 'rise', None)
        if rise is None:
            return self.z
        centre, half, ramp, height = rise
        d = min(self.wrap(s - centre), self.wrap(centre - s))
        if d <= half:
            return self.z + height
        if d >= half + ramp:
            return self.z
        u = 1.0 - (d - half) / ramp
        return self.z + height * u * u * (3 - 2 * u)  # smoothstep

    def point3(self, s, lift=0.0):
        p, _t = self.at(s)
        return Vector((p.x, p.y, self.z_at(s) + lift))

    def project(self, p):
        best, best_d = 0.0, 1e18
        n = len(self.pts)
        for i in range(n):
            a, b = self.pts[i], self.pts[(i + 1) % n]
            d = b - a
            l2 = d.length_squared or 1e-12
            t = max(0.0, min(1.0, (Vector(p[:2]) - a).dot(d) / l2))
            q = a + d * t
            dist = (q - Vector(p[:2])).length
            if dist < best_d:
                best_d, best = dist, self.s0[i] + math.sqrt(l2) * t
        return best, best_d

    def samples(self, step):
        count = max(8, round(self.length / step))
        return [self.length * k / count for k in range(count)]

    def inward(self, s):
        """The unit normal toward the island's inside (the loop runs counter-clockwise: inside is on the left)."""
        _p, t = self.at(s)
        return Vector((-t.y, t.x))


def rail_from_scene():
    obj = bpy.data.objects.get(RAIL_OBJECT)
    if obj is None:
        fail(f'"{RAIL_OBJECT}" not found (art/src/map-v4.blend makes it)')
    spline = obj.data.splines[0]
    pts = [(obj.matrix_world @ Vector(p.co[:3])) for p in spline.points]
    return Rail([(p.x, p.y) for p in pts], pts[0].z + TRACK_LIFT)


def hull2(points):
    pts = sorted(set((round(p[0], 5), round(p[1], 5)) for p in points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def inside(p, poly):
    x, y = p[0], p[1]
    hit = False
    for i in range(len(poly)):
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % len(poly)]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            hit = not hit
    return hit


# --- the plate railway -------------------------------------------------------------------------------------------------

def strip_mesh(name, rail, s_list, offset, half_w, z0, z1, material, coll):
    """A closed band (a box swept along the rail at lateral `offset`), from `z0` to `z1` above the track's height
    there (rail.z_at: it climbs onto the road at the crossing)."""
    bm = bmesh.new()
    rings = []
    for s in s_list:
        p, t = rail.at(s)
        nrm = Vector((-t.y, t.x))
        c = p + nrm * offset
        ring = []
        base = rail.z_at(s)
        for (dx, z) in ((-half_w, z0), (half_w, z0), (half_w, z1), (-half_w, z1)):
            q = c + nrm * dx
            ring.append(bm.verts.new((q.x, q.y, base + z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    for ring in (rings[0], rings[-1]):
        bm.faces.new(ring if ring is rings[-1] else list(reversed(ring)))
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    me.materials.append(material)
    coll.objects.link(o)
    return o


def track_runs(rail, hidden):
    """The arc ranges of the visible track (everything but the tunnel's inside), as lists of sample arc lengths."""
    step = 0.08
    ss = rail.samples(step)
    runs, cur = [], []
    for s in ss:
        if hidden(s):
            if len(cur) > 1:
                runs.append(cur)
            cur = []
        else:
            cur.append(s)
    if len(cur) > 1:
        runs.append(cur)
    # The loop starts on visible track: join the last run onto the first.
    if len(runs) > 1 and not hidden(0.0) and not hidden(ss[-1]):
        runs[0] = runs[-1] + [s + rail.length for s in runs[0]]
        runs.pop()
    return runs


def build_track(rail, hidden, mats, coll):
    for k, run in enumerate(track_runs(rail, hidden)):
        strip_mesh(f'rail-ballast-{k}', rail, run, 0.0, BALLAST_HALF, -0.01, BALLAST_H, mats['ballast'], coll)
        for side in (-1, 1):
            strip_mesh(f'rail-{k}-{side}', rail, run, side * GAUGE, RAIL_W / 2, BALLAST_H + SLEEPER[2], BALLAST_H + SLEEPER[2] + RAIL_H, mats['rail'], coll)
        # sleepers
        s = run[0]
        while s < run[-1]:
            p, t = rail.at(s)
            yaw = math.atan2(t.y, t.x)
            rbox(f'rail-sleeper-{k}', (SLEEPER[0], SLEEPER[1], SLEEPER[2]), 0.012, mats['sleeper'], coll, None,
                 (p.x, p.y, rail.z_at(s) + BALLAST_H + SLEEPER[2] / 2), (0.0, 0.0, math.degrees(yaw)), seg=2)
            s += SLEEPER_STEP


# --- the tunnel -------------------------------------------------------------------------------------------------------

def volcano_foot(depsgraph):
    objs = [bpy.data.objects[n] for n in VOLCANO if n in bpy.data.objects]
    if len(objs) != len(VOLCANO):
        fail(f'the volcano objects {VOLCANO} are not all in the scene')
    pts = [p for p in eval_world_verts(objs, depsgraph) if p.z < VOLCANO_FOOT_Z]
    if len(pts) < 3:
        fail('the volcano has no foot')
    return hull2([(p.x, p.y) for p in pts]), objs


def tunnel_range(rail, foot):
    ss = rail.samples(0.05)
    ins = [inside(rail.at(s)[0], foot) for s in ss]
    if not any(ins):
        fail('the track does not run under the volcano')
    if all(ins):
        fail('the whole track is under the volcano')
    n = len(ss)
    start = next(i for i in range(n) if ins[i] and not ins[i - 1])
    end = start
    while ins[(end + 1) % n]:
        end = (end + 1) % n
    if any(ins[i] for i in range(n) if not (start <= i <= end if start <= end else (i >= start or i <= end))):
        fail('the track runs under the volcano twice')
    return ss[start], ss[end]


def build_portal(name, rail, s, facing, mats, coll):
    p, t = rail.at(s)
    yaw = math.degrees(math.atan2(t.y, t.x)) + (0.0 if facing > 0 else 180.0)
    root = bpy.data.objects.new(f'{name}-root', None)
    coll.objects.link(root)
    root.location = (p.x, p.y, rail.z)
    root.rotation_euler = (0.0, 0.0, math.radians(yaw))
    # The arch stands across the track (its plane is the track's normal plane): a half torus on two stone posts,
    # with the dark mouth (a half disc) just inside.
    arch = torus(f'{name}-arch', PORTAL_R + PORTAL_TUBE, PORTAL_TUBE, mats['portal'], coll, root, (0.0, 0.0, PORTAL_R * 0.55), (90.0, 0.0, 90.0), arc=(0.0, 180.0))
    arch['cute'] = 1
    for side in (-1, 1):
        rbox(f'{name}-post-{side}', (PORTAL_TUBE * 1.6, PORTAL_TUBE * 1.9, PORTAL_R * 0.6), 0.05, mats['portal'], coll, root,
             (0.0, side * (PORTAL_R + PORTAL_TUBE), PORTAL_R * 0.27))
    mouth = blob(f'{name}-mouth', mats['portalDark'], coll, root, (0.06, 0.0, PORTAL_R * 0.3), (0.04, PORTAL_R, PORTAL_R * 0.95), seg=(32, 12))
    mouth['cute'] = 1
    return root


# --- occluders --------------------------------------------------------------------------------------------------------

def scenery_groups():
    """Plate scenery roots grouped by object (palm trunks and leaves by their palm key)."""
    groups = {}
    for o in bpy.data.objects:
        if o.parent is not None or o.type != 'MESH' or o.name in GROUND_NAMES:
            continue
        if not o.name.startswith(OCCLUDER_PREFIXES):
            continue
        if any(c.name.startswith('sprite.') for c in o.users_collection):
            continue
        key = o.name[5:-1] if o.name.startswith(('PalmT', 'PalmL')) else o.name
        groups.setdefault(('palm' if o.name.startswith('Palm') else 'scene', key), []).append(o)
    return groups


def build_occluders(screen, rail, sprite_parent, layout, depsgraph):
    """Scenery in front of the track that covers it on screen becomes a sprite drawn by depth."""
    rail_px = [(screen.project(rail.point3(s, 0.3)), rail.at(s)[0]) for s in rail.samples(0.2)]
    made = []
    for (kind, key), objs in sorted(scenery_groups().items()):
        pts = eval_world_verts(objs, depsgraph)
        if not pts:
            continue
        base = min(pts, key=lambda p: p.z)
        foot = [p for p in pts if p.z < base.z + 0.15] or [base]
        gx = sum(p.x for p in foot) / len(foot)
        gy = sum(p.y for p in foot) / len(foot)
        poly = hull2([screen.project(p) for p in pts])
        if len(poly) < 3:
            continue
        # covered rail points: on screen inside the object's outline and farther from the camera (greater world y
        # means farther on this map: the camera looks toward +y)
        if not any(inside(px, poly) and w.y > gy + 0.05 for px, w in rail_px):
            continue
        n = len(made) + 1
        coll = bpy.data.collections.new(f'sprite.occ-{n}')
        sprite_parent.children.link(coll)
        coll['occlude'] = 1
        for o in objs:
            move_to(o, coll)
        add_empty(f'anchor.occ-{n}', (gx, gy, base.z), layout)
        made.append((n, kind, key))
        log(f'occluder occ-{n}: {kind} {key}')
    return made


# --- the level crossing -----------------------------------------------------------------------------------------------

def seg_cross(a, b, c, d):
    r = (b[0] - a[0], b[1] - a[1])
    q = (d[0] - c[0], d[1] - c[1])
    den = r[0] * q[1] - r[1] * q[0]
    if abs(den) < 1e-12:
        return None
    t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den
    u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    if 0 <= t <= 1 and 0 <= u <= 1:
        return t, u
    return None


def crossing_on(rail, road, road_half):
    hits = []
    n = len(rail.pts)
    for i in range(n):
        a, b = rail.pts[i], rail.pts[(i + 1) % n]
        for c, d in zip(road, road[1:]):
            tu = seg_cross(a, b, c, d)
            if tu:
                hits.append((rail.s0[i] + (b - a).length * tu[0], Vector(c).lerp(Vector(d), tu[1]), (Vector(d) - Vector(c)).normalized()))
    if len(hits) != 1:
        fail(f'the track crosses the road {len(hits)} times (one level crossing expected)')
    s, p, road_dir = hits[0]
    _q, t = rail.at(s)
    sin = abs(t.x * road_dir.y - t.y * road_dir.x) or 1.0
    half = road_half / sin  # the road's half width measured along the track
    return s, p, road_dir, half


def build_road_stub(road, road_half, z_top):
    """The kart road used to end on the track: it runs on ROAD_STUB past its first point to a rounded end, so the
    track crosses a road (the kart never drives there: no station stops on it)."""
    a, b = Vector(road[1]), Vector(road[0])
    d = (b - a).normalized()
    yaw = math.degrees(math.atan2(d.y, d.x))
    length = stub_length(b, d, road_half)
    road_mat = bpy.data.materials.get('Road')
    edge_mat = bpy.data.materials.get('RoadEdge')
    if road_mat is None or edge_mat is None:
        fail('the road materials "Road" / "RoadEdge" are missing')
    world = bpy.data.collections['World']
    c = b + d * (length / 2 - 0.05)
    rbox('road-stub-edge', (length + 0.1, road_half * 2 + 0.16, 0.07), 0.35, edge_mat, world, None, (c.x, c.y, z_top - 0.05), (0.0, 0.0, yaw))
    rbox('road-stub', (length, road_half * 2, 0.07), 0.3, road_mat, world, None, (c.x, c.y, z_top - 0.03), (0.0, 0.0, yaw))
    log(f'road stub {length:.2f} m past the old road end')
    return [tuple(b + d * length)] + list(road)


def on_beach(p):
    """True when the ground straight below `p` (world XY) is the grass or the sand (not the shallows or the sea)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    hit, _loc, _n, _i, obj, _m = bpy.context.scene.ray_cast(depsgraph, Vector((p.x, p.y, 20.0)), Vector((0.0, 0.0, -1.0)))
    while hit and obj is not None and obj.name not in ('Grass', 'Sand', 'Shallow', 'Sea'):
        hit, _loc, _n, _i, obj, _m = bpy.context.scene.ray_cast(depsgraph, _loc + Vector((0.0, 0.0, -0.01)), Vector((0.0, 0.0, -1.0)))
    return hit and obj is not None and obj.name in ('Grass', 'Sand')


def stub_length(end, d, road_half):
    """The longest stub (≤ ROAD_STUB) whose far corners stay ROAD_STUB_SAND inside the beach."""
    nrm = Vector((-d.y, d.x))
    length = ROAD_STUB
    while length > 0.0:
        tip = end + d * (length + ROAD_STUB_SAND)
        if all(on_beach(tip + nrm * (road_half * k)) for k in (-1.0, 0.0, 1.0)):
            return length
        length -= 0.05
    fail('no room on the beach for the road stub')


def plan_crossing(rail, road, road_half):
    """The road runs on past the track (the stub) and the track climbs onto it at the crossing (review 2026-11-13: the
    raised road slab hid the rails). Called before the track is built."""
    road = build_road_stub(road, road_half, ROAD_TOP)
    s, p, road_dir, half = crossing_on(rail, road, road_half)
    # the stub must still reach past the track's outer edge (the outer barrier stands there)
    past = (Vector(road[0]) - p).length
    if past < BALLAST_HALF + ROAD_STUB_PAST_TRACK:
        fail(f'the road stub ends {past:.2f} m past the track (min {BALLAST_HALF + ROAD_STUB_PAST_TRACK:.2f})')
    rail.set_rise(s, half + CROSSING_FLAT, CROSSING_RAMP, ROAD_TOP + 0.005 - rail.z)
    return s, p, road_dir, half


def build_crossing(rail, crossing, road_half, mats, sprite_parent, plate, layout):
    s, p, road_dir, half = crossing
    # boards between and beside the rails across the road, on the raised track
    for k in range(-2, 3):
        q, t = rail.at(s + k * (half * 0.4))
        rbox(f'crossing-board-{k}', (half * 0.36, BALLAST_HALF * 2.1, 0.03), 0.01, mats['crossingBoard'], plate, None,
             (q.x, q.y, rail.z_at(s) + BALLAST_H + SLEEPER[2] + RAIL_H * 0.7), (0.0, 0.0, math.degrees(math.atan2(t.y, t.x))), seg=2)
    add_empty('anchor.rail-crossing-from', rail.point3(s - half - CROSSING_MARGIN), layout)
    add_empty('anchor.rail-crossing-to', rail.point3(s + half + CROSSING_MARGIN), layout)
    signal_s = s - half - SIGNAL_BEFORE
    add_empty('anchor.rail-signal', rail.point3(signal_s), layout)
    # The signal post on the outer side, a little before the stop.
    q, _t = rail.at(signal_s + 0.3)
    out = -rail.inward(signal_s + 0.3)
    base = q + out * (BALLAST_HALF + 0.12)
    rod('signal-post', (base.x, base.y, rail.z), (base.x, base.y, rail.z + 0.95), 0.035, mats['signalPost'], plate, None)
    blob('signal-head', mats['signalPost'], plate, None, (base.x, base.y, rail.z + 1.0), (0.1, 0.08, 0.16), seg=(20, 10))
    blob('signal-light', mats['signalLight'], plate, None, (base.x + 0.0, base.y - 0.07, rail.z + 1.02), (0.055, 0.03, 0.055), seg=(16, 8))
    # A barrier each side of the track, its post on the road's right-hand verge, its arm across the road.
    for side, name in ((-1, 'near'), (1, 'far')):
        _q, t = rail.at(s)
        nrm = rail.inward(s)
        # which side of the track is "near" (toward the camera, world −y)
        sgn = side if nrm.y > 0 else -side
        centre = p + nrm * sgn * (BALLAST_HALF + 0.35)
        # the post stands on the verge: off the road's edge along the road's normal
        rn = Vector((-road_dir.y, road_dir.x))
        post_at = centre + rn * (road_half + 0.15) * (1 if side > 0 else -1)
        coll = bpy.data.collections.new(f'sprite.crossing-{name}')
        sprite_parent.children.link(coll)
        coll['occlude'] = 1
        for state, down in (('up', False), ('down', True)):
            child = bpy.data.collections.new(f'state.crossing-{name}-{state}')
            child['bhc_state'] = state
            coll.children.link(child)
            root = bpy.data.objects.new(f'crossing-{name}-{state}-root', None)
            child.objects.link(root)
            root.location = (post_at.x, post_at.y, rail.z)
            toward = (centre - post_at).normalized()
            root.rotation_euler = (0.0, 0.0, math.atan2(toward.y, toward.x))
            rbox(f'crossing-{name}-{state}-post', (0.12, 0.12, 0.6), 0.03, mats['barrierPost'], child, root, (0.0, 0.0, 0.3))
            blob(f'crossing-{name}-{state}-cap', mats['barrierStripe'], child, root, (0.0, 0.0, 0.62), (0.08, 0.08, 0.06), seg=(16, 8))
            hinge = bpy.data.objects.new(f'crossing-{name}-{state}-hinge', None)
            child.objects.link(hinge)
            hinge.parent = root
            hinge.location = (0.0, 0.0, 0.55)
            hinge.rotation_euler = (0.0, math.radians(0.0 if down else -78.0), 0.0)
            stripes = 6
            seg_len = BARRIER_ARM / stripes
            for k in range(stripes):
                key = 'barrierStripe' if k % 2 == 0 else 'barrierArm'
                rbox(f'crossing-{name}-{state}-arm-{k}', (seg_len, 0.07, 0.07), 0.025, mats[key], child, hinge, (seg_len * (k + 0.5), 0.0, 0.0))
        add_empty(f'anchor.crossing-{name}', (post_at.x, post_at.y, rail.z), layout)
    log(f'crossing at s {s:.2f} m, road half {half:.2f} m along the track; signal at {signal_s:.2f} m')
    return s, half


# --- Ga tàu ------------------------------------------------------------------------------------------------------------

def build_ga_tau(rail, mats, plate, layout, depsgraph):
    s, _d = rail.project(GA_TAU_AT)
    p, t = rail.at(s)
    nrm = rail.inward(s)
    yaw = math.degrees(math.atan2(t.y, t.x))
    centre = p + nrm * (PLATFORM_CLEAR + PLATFORM[1] / 2)
    objs = []
    objs.append(rbox('ga-tau-deck', PLATFORM, 0.04, mats['platform'], plate, None, (centre.x, centre.y, rail.z + PLATFORM[2] / 2), (0.0, 0.0, yaw)))
    objs.append(rbox('ga-tau-edge', (PLATFORM[0], 0.08, 0.03), 0.015, mats['platformEdge'], plate, None,
                     tuple(p + nrm * (PLATFORM_CLEAR + 0.04)) + (rail.z + PLATFORM[2] + 0.012,), (0.0, 0.0, yaw)))
    # four posts and a little roof over the back half of the deck (never over the track)
    roof_c = p + nrm * (PLATFORM_CLEAR + PLATFORM[1] * 0.62)
    for a in (-1, 1):
        for b in (0, 1):
            q = p + t * (a * PLATFORM[0] * 0.36) + nrm * (PLATFORM_CLEAR + 0.12 + b * (PLATFORM[1] - 0.24))
            objs.append(rod(f'ga-tau-post-{a}-{b}', (q.x, q.y, rail.z + PLATFORM[2]), (q.x, q.y, rail.z + ROOF_H), 0.03, mats['platformPost'], plate, None, seg=10))
    objs.append(rbox('ga-tau-roof', (PLATFORM[0] * 0.86, PLATFORM[1] * 0.9, 0.08), 0.04, mats['platformRoof'], plate, None,
                     (roof_c.x, roof_c.y, rail.z + ROOF_H + 0.04), (0.0, 0.0, yaw)))
    # the round sign on a pole at the platform's back end (the train comes in from there; Nhà Xoài is at the front)
    q = p - t * (PLATFORM[0] * 0.5 + 0.12) + nrm * (PLATFORM_CLEAR + 0.2)
    objs.append(rod('ga-tau-sign-pole', (q.x, q.y, rail.z), (q.x, q.y, rail.z + 1.0), 0.025, mats['platformPost'], plate, None, seg=10))
    objs.append(blob('ga-tau-sign', mats['sign'], plate, None, (q.x, q.y, rail.z + 1.1), (0.17, 0.035, 0.17), (0.0, 0.0, yaw), seg=(28, 8)))
    objs.append(torus('ga-tau-sign-rim', 0.17, 0.025, mats['platformRoof'], plate, None, (q.x, q.y, rail.z + 1.1), (90.0, 0.0, yaw)))
    bpy.context.view_layer.update()
    pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
    hull_object('hit.ga-tau', pts, layout)
    add_empty('anchor.ga-tau', (centre.x, centre.y, rail.z), layout)
    add_empty('anchor.train', rail.point3(s), layout)
    log(f'Ga tàu at s {s:.2f} m ({p.x:.2f}, {p.y:.2f})')
    return s


# --- appending the games' models --------------------------------------------------------------------------------------

def append_collections(blend, names):
    path = os.path.join(ART, blend)
    if not os.path.exists(path):
        fail(f'{path} is missing (build that screen first: npm run art:build -- {blend[:-6]})')
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        missing = [n for n in names if n not in src.collections]
        if missing:
            fail(f'{blend} has no collection {missing}')
        dst.collections = list(names)
    return dst.collections


def adopt(colls, into):
    """Moves every object of the appended collections into `into`; objects whose parent was not appended into a
    collection keep their world transform as roots. Returns the roots."""
    objs = []
    for c in colls:
        for o in c.all_objects:
            if o not in objs:
                objs.append(o)
    for o in objs:
        for uc in list(o.users_collection):
            uc.objects.unlink(o)
        into.objects.link(o)
    # parents outside the appended set (empties of the source scene): link them too, so the hierarchy stays whole
    for o in list(objs):
        p = o.parent
        while p is not None and p not in objs:
            objs.append(p)
            for uc in list(p.users_collection):
                uc.objects.unlink(p)
            into.objects.link(p)
            p = p.parent
    for c in colls:
        for ch in list(c.children_recursive):
            bpy.data.collections.remove(ch)
        bpy.data.collections.remove(c)
    return [o for o in objs if o.parent is None]


def placed_root(name, coll, at, yaw_deg, scale):
    root = bpy.data.objects.new(name, None)
    coll.objects.link(root)
    root.location = at
    root.rotation_euler = (0.0, 0.0, math.radians(yaw_deg))
    root.scale = (scale, scale, scale)
    return root


def reroot(objs_roots, model_root_name, new_root, local=(0.0, 0.0, 0.0)):
    """Parents the appended model (its root named `model_root_name`) under `new_root`, its root at `local`."""
    model = next((o for o in objs_roots if o.name.split('.')[0] == model_root_name), None)
    if model is None:
        fail(f'"{model_root_name}" not among {[o.name for o in objs_roots][:8]}')
    model.parent = new_root
    model.location = local
    model.rotation_euler = (0.0, 0.0, 0.0)
    model.scale = (1.0, 1.0, 1.0)
    return model


def heading_states(sprite_parent, sprite_name):
    group = bpy.data.collections.new(f'sprite.{sprite_name}')
    sprite_parent.children.link(group)
    group['movable'] = 1
    group['occlude'] = 0
    children = []
    for k in range(HEADINGS):
        child = bpy.data.collections.new(f'state.{sprite_name}-h{k}')
        child['bhc_state'] = f'h{k}'
        group.children.link(child)
        children.append(child)
    return group, children


def build_train(rail, station_s, sprite_parent, layout):
    """The engine and three cars in HEADINGS headings, all at the engine's stop; the cars' places behind it as anchors."""
    at = rail.point3(station_s)
    pieces = [('train-engine', 'sprite.engine', ENGINE_ROOT)] + [
        (f'train-car-{n + 1}', f'sprite.{r[:-5]}', r) for n, r in enumerate(CAR_ROOTS)]
    for sprite_name, coll_name, root_name in pieces:
        _g, children = heading_states(sprite_parent, sprite_name)
        for k, child in enumerate(children):
            colls = append_collections('train.blend', [coll_name])
            if root_name != ENGINE_ROOT:
                # a car: keep only its whole wagon (state idle), drop its front wall state
                for c in list(colls[0].children):
                    if not c.name.split('.')[0].endswith('-idle') and 'idle' not in c.name:
                        for o in list(c.all_objects):
                            bpy.data.objects.remove(o, do_unlink=True)
            roots = adopt(colls, child)
            root = placed_root(f'{sprite_name}-h{k}-root', child, at, HEADING_STEP * k, MAP_TRAIN_SCALE)
            reroot(roots, root_name, root)
    # where the cars stand behind the engine at the station (arc gaps)
    s = station_s
    half_prev = ENGINE_LEN / 2
    for n in range(len(CAR_ROOTS)):
        s -= (half_prev + PIECE_GAP + CAR_LEN / 2) * MAP_TRAIN_SCALE
        add_empty(f'anchor.train-car-{n + 1}', rail.point3(s), layout)
        half_prev = CAR_LEN / 2
    log(f'train: engine and 3 cars × {HEADINGS} headings')


# --- the plane --------------------------------------------------------------------------------------------------------

def beach_spot(rail, angle_deg, out, centre):
    """The track point at `angle_deg` round `centre`, and the spot `out` metres outside it."""
    ang = math.radians(angle_deg)
    far = Vector((centre[0] + math.cos(ang) * 40.0, centre[1] + math.sin(ang) * 40.0))
    best = min(rail.samples(0.1), key=lambda s: abs(math.remainder(math.atan2(rail.at(s)[0].y - centre[1], rail.at(s)[0].x - centre[0]) - ang, math.tau)))
    p, t = rail.at(best)
    return best, p - rail.inward(best) * out, t


def catmull(points, step):
    """A closed Catmull-Rom curve through `points` (Vectors, 3D), resampled about every `step`."""
    n = len(points)
    dense = []
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]
        for k in range(16):
            u = k / 16
            u2, u3 = u * u, u * u * u
            dense.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3))
    out = [dense[0]]
    acc = 0.0
    for a, b in zip(dense, dense[1:]):
        acc += (b - a).length
        if acc >= step:
            out.append(b)
            acc = 0.0
    return out


def plane_loop(rail, park, tdir, centre, ground_z):
    """Closed flight: the take-off roll from `park` along `tdir`, a climb, a loop round the island's middle at
    PLANE_LOOP_Z (the rail loop shrunk), a descent behind the strip and the landing roll back to `park`."""
    half = AIRSTRIP[0] / 2
    pts = []
    c = Vector((centre[0], centre[1]))
    # the loop: rail samples shrunk toward the middle, from just past the strip round to just before it
    s_park, _d = rail.project((park.x, park.y))
    ring = []
    count = 28
    for k in range(count):
        s = s_park + rail.length * (k + 2) / (count + 3)
        q = rail.at(s)[0]
        q = c + (q - c) * PLANE_LOOP_SHRINK
        lift = PLANE_LOOP_Z
        ring.append(Vector((q.x, q.y, ground_z + lift)))
    roll_out = park + tdir * half * 0.9
    climb = park + tdir * (half * 1.6) + (c - park).normalized() * 0.3
    approach = park - tdir * (half * 1.8)
    touch = park - tdir * half * 0.9
    pts = [Vector((park.x, park.y, ground_z)), Vector((roll_out.x, roll_out.y, ground_z + 0.05)),
           Vector((climb.x, climb.y, ground_z + PLANE_LOOP_Z * 0.45))] + ring + [
           Vector((approach.x, approach.y, ground_z + PLANE_LOOP_Z * 0.4)), Vector((touch.x, touch.y, ground_z + 0.04))]
    return catmull(pts, PLANE_LOOP_STEP)


def build_airstrip(rail, centre, mats, plate, sprite_parent, layout, ground_z):
    s, mid, t = beach_spot(rail, AIRSTRIP_ANGLE_DEG, AIRSTRIP_OUT, centre)
    yaw = math.degrees(math.atan2(t.y, t.x))
    rbox('airstrip', (AIRSTRIP[0], AIRSTRIP[1], 0.03), 0.06, mats['airstrip'], plate, None, (mid.x, mid.y, ground_z + 0.015), (0.0, 0.0, yaw))
    for k in range(-3, 4):
        q = mid + t * (k * AIRSTRIP[0] / 8)
        rbox(f'airstrip-dash-{k}', (0.18, 0.05, 0.01), 0.01, mats['airstripLine'], plate, None, (q.x, q.y, ground_z + 0.035), (0.0, 0.0, yaw), seg=2)
    # a windsock at the far end, on the sea side
    q = mid + t * (AIRSTRIP[0] / 2 + 0.25) - rail.inward(s) * 0.25
    rod('windsock-pole', (q.x, q.y, ground_z), (q.x, q.y, ground_z + 0.9), 0.022, mats['platformPost'], plate, None, seg=10)
    lathe('windsock', [(0.0, 0.0), (0.09, 0.0), (0.06, 0.32), (0.0, 0.32)], mats['windsock'], plate, None,
          (q.x, q.y, ground_z + 0.85), (0.0, 90.0, yaw + 40.0), seg=20)
    park = mid - t * (AIRSTRIP[0] * 0.18)
    add_empty('anchor.plane', (park.x, park.y, ground_z), layout)
    # the plane in HEADINGS headings, parked
    _g, children = heading_states(sprite_parent, 'plane')
    hull_pts = None
    for k, child in enumerate(children):
        roots = adopt(append_collections('plane.blend', ['sprite.plane']), child)
        root = placed_root(f'plane-h{k}-root', child, (park.x, park.y, ground_z), HEADING_STEP * k, PLANE_SCALE)
        reroot(roots, PLANE_ROOT, root, (0.0, 0.0, PLANE_LIFT))
        if k == round((yaw % 360.0) / HEADING_STEP) % HEADINGS:
            bpy.context.view_layer.update()
            hull_pts = eval_world_verts(list(child.all_objects), bpy.context.evaluated_depsgraph_get())
    hull_object('hit.plane', hull_pts, layout)
    loop = plane_loop(rail, Vector((park.x, park.y)), t, centre, ground_z)
    for name, lift in (('path.plane-loop', 0.0), ('path.plane-loop-up', 1.0)):
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '3D'
        sp = curve.splines.new('POLY')
        sp.points.add(len(loop) - 1)
        for pt, p in zip(sp.points, loop):
            pt.co = (p.x, p.y, p.z + lift, 1.0)
        layout.objects.link(bpy.data.objects.new(name, curve))
    log(f'airstrip at ({mid.x:.2f}, {mid.y:.2f}), yaw {yaw:.0f}°; plane loop {len(loop)} points')
    return park, yaw, loop


# --- the rocket -------------------------------------------------------------------------------------------------------

def drop_rocket_extras(roots):
    """Removes the holdout copies (they cut the rocket's own game sprites; here they would render black), the tower
    and the glow quads; returns the roots left."""
    names = [r.name for r in roots]
    gone = set()
    for r in list(roots):
        for o in [r] + list(r.children_recursive):
            if o.name in gone:
                continue
            base = o.name.split('.')[0]
            if getattr(o, 'is_holdout', False) or base.startswith(ROCKET_DROP) or '-cut-' in base or 'glow' in base:
                gone.add(o.name)
    for name in gone:
        o = bpy.data.objects.get(name)
        if o is not None:
            bpy.data.objects.remove(o, do_unlink=True)
    return [bpy.data.objects[n] for n in names if n not in gone and n in bpy.data.objects]


def copy_state(objs, coll, suffix):
    """Links into `coll` a copy of each of `objs` (sharing its data), parent links remapped onto the copies; each copy
    keeps its source's local matrices, so the whole copy stands exactly where the source does."""
    copies = {}
    for o in objs:
        c = o.copy()
        c.name = o.name.split('.')[0] + suffix
        coll.objects.link(c)
        copies[o.name] = c
    for o in objs:
        c = copies[o.name]
        if o.parent is not None and o.parent.name in copies:
            c.parent = copies[o.parent.name]
            c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
            c.matrix_basis = o.matrix_basis.copy()
        else:
            c.parent = None
            c.matrix_world = o.matrix_world.copy()
    return copies


def build_rocket(rail, centre, mats, sprite_parent, layout, ground_z, colours):
    _s, spot, _t = beach_spot(rail, PAD_ANGLE_DEG, PAD_OUT, centre)
    group = bpy.data.collections.new('sprite.rocket')
    sprite_parent.children.link(group)
    group['occlude'] = 1
    idle = bpy.data.collections.new('state.rocket-idle')
    idle['bhc_state'] = 'idle'
    group.children.link(idle)
    roots = drop_rocket_extras(adopt(append_collections('rocket.blend', ROCKET_PARTS), idle))
    bpy.context.view_layer.update()
    objs = [o for o in idle.all_objects]
    pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
    if not pts:
        fail('the appended rocket has no mesh')
    z0 = min(p.z for p in pts)
    z1 = max(p.z for p in pts)
    pad = [p for p in pts if p.z < z0 + 0.1 * (z1 - z0)]
    cx = sum(p.x for p in pad) / len(pad)
    cy = sum(p.y for p in pad) / len(pad)
    k = ROCKET_HEIGHT / (z1 - z0)
    off = Matrix.Translation((-cx, -cy, -z0))
    shrink = Matrix.Diagonal((PAD_SCALE, PAD_SCALE, 1.0, 1.0))

    def seat(rs, name, coll):
        """Puts the appended rocket on its pad at the spot: its pad's foot at the holder, the pad shrunk."""
        holder = placed_root(name, coll, (spot.x, spot.y, ground_z), 0.0, k)
        for r in rs:
            mw = r.matrix_world.copy()
            r.parent = holder
            r.matrix_parent_inverse = Matrix.Identity(4)
            r.matrix_basis = (shrink @ off @ mw) if r.name.split('.')[0].startswith('pad') else (off @ mw)
        return holder

    seat(roots, 'rocket-root', idle)
    bpy.context.view_layer.update()
    pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
    pad_r = max(math.hypot(p.x - spot.x, p.y - spot.y) for p in pts if p.z < ground_z + 0.15)
    hull_object('hit.rocket', pts, layout)
    add_empty('anchor.rocket', (spot.x, spot.y, ground_z), layout)
    steam = mat(colours['puff'], 0.8)
    idle_objs = list(idle.all_objects)
    for n, puffs in enumerate(PUFFS, 1):
        child = bpy.data.collections.new(f'state.rocket-puff-{n}')
        child['bhc_state'] = f'puff-{n}'
        group.children.link(child)
        # the rocket again (each state renders alone), plus its puffs. 2026-11-27 (spec-sua-tau-va-ten-lua-tren-dao):
        # an exact copy of the idle state (objects sharing its mesh data, the same parents and matrices), so the rocket
        # and its shrunk pad stand pixel-identical in every frame; re-appending and re-seating moved them.
        copy_state(idle_objs, child, f'-puff-{n}')
        for j, (x, y, r) in enumerate(puffs):
            blob(f'rocket-puff-{n}-{j}', steam, child, None, (spot.x + x * pad_r, spot.y + y * pad_r, ground_z + r * pad_r * 0.8),
                 (r * pad_r, r * pad_r, r * pad_r * 0.8), seg=(24, 12))
    log(f'rocket at ({spot.x:.2f}, {spot.y:.2f}), pad radius {pad_r:.2f} m, scale {k:.2f}')
    return spot


# --- what hides the track ---------------------------------------------------------------------------------------------

def blockers(sprite_parent):
    names = set()
    for coll in sprite_parent.children:
        if coll.name.startswith(NOT_BLOCKERS) or coll.get('bhc_detached'):
            continue
        names.update(o.name for o in coll.all_objects if o.type == 'MESH')
    return names


def hidden_from_camera(scene, depsgraph, cam, target, names):
    """True when the first sprite mesh on the ray from the camera to `target` is one of `names` (plate meshes and the
    rides' own copies on the way are passed through)."""
    d = target - cam
    total = d.length
    d.normalize()
    origin = cam.copy()
    gone = 0.0
    for _ in range(64):
        left = total - gone - 0.02
        if left <= 0:
            return False
        hit, loc, _n, _i, obj, _m = scene.ray_cast(depsgraph, origin, d, distance=left)
        if not hit:
            return False
        if obj is not None and obj.name in names:
            return True
        step = (loc - origin).length + 0.005
        gone += step
        origin = origin + d * step
    return False


def rail_back(scene, rail, ss, sprite_parent):
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    cam = scene.camera.matrix_world.translation.copy()
    names = blockers(sprite_parent)
    back = [s for s in ss if any(hidden_from_camera(scene, depsgraph, cam, rail.point3(s, h), names) for h in BACK_HEIGHTS)]
    log(f'rail-back: {len(back)} of {len(ss)} rail points hidden by a sprite in front')
    return back


# --- layout paths -----------------------------------------------------------------------------------------------------

def add_path(name, pts, layout):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    sp = curve.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for pt, p in zip(sp.points, pts):
        pt.co = (p[0], p[1], p[2], 1.0)
    layout.objects.link(bpy.data.objects.new(name, curve))


def materials(params):
    m = params['art']['map']
    keys = ['rail', 'sleeper', 'ballast', 'portal', 'portalDark', 'crossingBoard', 'signalPost', 'signalLight',
            'barrierPost', 'barrierStripe', 'barrierArm', 'platform', 'platformEdge', 'platformPost', 'platformRoof',
            'sign', 'airstrip', 'airstripLine', 'windsock', 'puff']
    missing = [k for k in keys if k not in m]
    if missing:
        fail(f'Tokens.art.map is missing {missing}')
    return {k: mat(m[k], 0.45) for k in keys}


def build_rides(scene, params, screen, sprite_parent, layout, road, road_half, island_centre):
    """Everything above; returns a report dict for the caller's log."""
    plate = bpy.data.collections['World']
    mats = materials(params)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    rail = rail_from_scene()
    foot, volcano = volcano_foot(depsgraph)
    t_in, t_out = tunnel_range(rail, foot)
    hidden = lambda s: (rail.wrap(s - t_in) <= rail.wrap(t_out - t_in))  # noqa: E731
    crossing = plan_crossing(rail, road, road_half)
    build_track(rail, hidden, mats, plate)
    add_empty('anchor.rail-tunnel-in', rail.point3(t_in), layout)
    add_empty('anchor.rail-tunnel-out', rail.point3(t_out), layout)
    vcoll = bpy.data.collections.new('sprite.volcano')
    sprite_parent.children.link(vcoll)
    vcoll['occlude'] = 1
    for o in volcano:
        move_to(o, vcoll)
    build_portal('portal-in', rail, t_in - PORTAL_OUT, -1, mats, vcoll)
    build_portal('portal-out', rail, t_out + PORTAL_OUT, 1, mats, vcoll)
    fx = sum(p[0] for p in foot) / len(foot)
    fy = sum(p[1] for p in foot) / len(foot)
    add_empty('anchor.volcano', (fx, fy, 0.45), layout)
    log(f'tunnel s {t_in:.2f}…{t_out:.2f} m ({rail.wrap(t_out - t_in):.2f} m) of {rail.length:.2f} m')

    crossing_s, crossing_half = build_crossing(rail, crossing, road_half, mats, sprite_parent, plate, layout)
    station_s = build_ga_tau(rail, mats, plate, layout, depsgraph)
    build_train(rail, station_s, sprite_parent, layout)
    ground_z = rail.z - TRACK_LIFT
    park, yaw, loop = build_airstrip(rail, island_centre, mats, plate, sprite_parent, layout, ground_z)
    pad = build_rocket(rail, island_centre, mats, sprite_parent, layout, ground_z, params['art']['map'])
    _s, ring, _t = beach_spot(rail, RING_ANGLE_DEG, RING_OUT, island_centre)

    # layout paths: the rail at the runtime's resolution, its 1 m lift, the compass
    ss = rail.samples(RAIL_LAYOUT_STEP)
    add_path('path.rail', [tuple(rail.point3(s)) for s in ss], layout)
    add_path('path.rail-up', [tuple(rail.point3(s, 1.0)) for s in ss], layout)
    o = Vector((island_centre[0], island_centre[1], ground_z))
    add_path('path.compass', [tuple(o), tuple(o + Vector((1.0, 0.0, 0.0))), tuple(o + Vector((0.0, 1.0, 0.0)))], layout)

    bpy.context.view_layer.update()
    occ = build_occluders(screen, rail, sprite_parent, layout, bpy.context.evaluated_depsgraph_get())
    back = rail_back(scene, rail, ss, sprite_parent)
    if back:
        add_path('path.rail-back', [tuple(rail.point3(s)) for s in back], layout)
    return {'rail': rail, 'tunnel': (t_in, t_out), 'crossing': crossing_s, 'station': station_s, 'park': park, 'ring': (ring.x, ring.y),
            'pad': pad, 'occluders': occ, 'loop': loop}
