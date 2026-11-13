# Makes art/src/map-v4.blend (the island with a railway round it, 2026-11-13, spec-dao-moi-xe-ra-dao) from
# art/src/map-v3.blend.
#
# Run once by hand (the result is the vendored source every map builder starts from):
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python make_source_v4.py -- \
#     --out art/src/map-v4.blend
#
# Every object keeps its name (build_map.py looks objects up by name). Changes:
# - the beach (Sand) and the shallows (Shallow) are re-shaped as smooth offsets of the grass outline, wider than
#   before (wider still along the bottom, where the camera sees most of it), so a railway fits on the sand;
# - `RailPath`: a closed POLY curve on the sand, RAIL_OFFSET outside the grass outline (smoothed, resampled every
#   RAIL_STEP m, counter-clockwise seen from above, starting below Nhà Xoài). build_map.py builds the track on it and
#   projects it as `path.rail`. Where it runs under the volcano is the tunnel (build_map.py measures that);
# - the palms on the rail's band move out onto the outer beach;
# - the swim ring's spot is on the rail now: build_map.py places the ring (RING there), not this script;
# - the camera pulls back (CAMERA_LENS, CAMERA_SHIFT) so the whole island and its beach are on screen;
# - the plate's ground colours soften toward the yard's pastel palette (PASTEL).
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import parse_args  # noqa: E402

GRASS = 'Grass'
SAND = 'Sand'
SHALLOW = 'Shallow'
# Beach width outside the grass outline (m): SAND_BASE everywhere, + SAND_BOTTOM × (−sin θ)² toward the camera.
SAND_BASE = 2.0
SAND_BOTTOM = 0.7
SHALLOW_EXTRA = 1.2  # the shallows reach this much past the sand
# Local bulges of the beach: (angle round the grass centre in degrees, half width in degrees, extra metres). The level
# crossing's corner (the kart road ends there) needs room past the track for the road's stub and its outer barrier.
SAND_BULGES = [(-150.0, 22.0, 0.9)]
RAIL_OFFSET = 0.95  # the track's centreline outside the grass outline (m)
RAIL_STEP = 0.1
RAIL_SMOOTH = 3  # Chaikin passes on the offset outline
RAIL_START_ANGLE_DEG = -80.0  # the curve starts at this angle round the grass centre (below Nhà Xoài)
PALM_OFFSET = 1.75  # a palm on the rail's band moves out to this offset
PALM_CLEAR = 0.75  # a palm closer than this to the rail's centreline moves
# Palms that would stand over the airstrip (bottom right) go round the beach to this angle (degrees round the grass
# centre) instead of straight out.
PALM_ANGLE = {'7.8-6.1': -16.0, '-7.5-6.6': -168.0}
# Palms that move even though they are clear of the rail: the one standing over the level crossing (review 2026-11-13).
PALM_FORCE = ('-7.5-6.6',)
# The camera keeps its place and tilt; its lens and lens shift are fitted so the rail's projection spans
# RAIL_FIT_X (render fraction of the width) and its vertical centre sits at RAIL_FIT_CY (fraction from the top):
# the rail (the train's tap area) stays on screen while the stations stay as large as the loop allows. The outer
# beach and the shallows may run off the sides.
RAIL_FIT_X = (0.065, 0.935)
RAIL_FIT_CY = 0.52
# The volcano (and its lava cap) moves onto the rail, so the track runs through it (the tunnel), and grows a little
# so the tunnel is longer than the map train.
VOLCANO = ('Volcano', 'Lava')
VOLCANO_SCALE = 1.15
# Base colours (linear RGBA) of the plate's ground, pastel like the yard (art.touchTalk's picnic lawn).
PASTEL = {
    'Grass': (0.30, 0.72, 0.16, 1.0),
    'Sand': (0.96, 0.80, 0.50, 1.0),
    'Shallow': (0.30, 0.78, 0.88, 1.0),
    'Sea': (0.10, 0.52, 0.86, 1.0),
}


def fail(msg):
    raise RuntimeError(f'make_source_v4: {msg}')


def top_ring(name):
    o = bpy.data.objects[name]
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    zmax = max(v.z for v in vs)
    top = [v for v in vs if abs(v.z - zmax) < 1e-3]
    cx = sum(v.x for v in top) / len(top)
    cy = sum(v.y for v in top) / len(top)
    top.sort(key=lambda v: math.atan2(v.y - cy, v.x - cx))
    return [(v.x, v.y) for v in top], (cx, cy)


def offset_ring(ring, dist_at):
    """Each point moved along its outward normal (the ring is counter-clockwise) by dist_at(angle)."""
    n = len(ring)
    out = []
    for i, (x, y) in enumerate(ring):
        ax, ay = ring[i - 1]
        bx, by = ring[(i + 1) % n]
        tx, ty = bx - ax, by - ay
        ln = math.hypot(tx, ty)
        nx, ny = ty / ln, -tx / ln  # outward for a counter-clockwise ring
        d = dist_at(x, y)
        out.append((x + nx * d, y + ny * d))
    return out


def chaikin(ring, passes):
    for _ in range(passes):
        nxt = []
        for i, a in enumerate(ring):
            b = ring[(i + 1) % len(ring)]
            nxt.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            nxt.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        ring = nxt
    return ring


def resample(ring, step):
    pts = ring + [ring[0]]
    total = sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    count = max(8, round(total / step))
    step = total / count
    out = []
    seg = 0
    acc = 0.0
    for k in range(count):
        target = k * step
        while acc + math.dist(pts[seg], pts[seg + 1]) < target:
            acc += math.dist(pts[seg], pts[seg + 1])
            seg += 1
        a, b = pts[seg], pts[seg + 1]
        t = (target - acc) / math.dist(a, b)
        out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def ray_hit(ring, centre, angle):
    """Distance from centre to the ring along the ray at `angle`."""
    dx, dy = math.cos(angle), math.sin(angle)
    best = None
    for a, b in zip(ring, ring[1:] + ring[:1]):
        ex, ey = b[0] - a[0], b[1] - a[1]
        den = dx * ey - dy * ex
        if abs(den) < 1e-12:
            continue
        wx, wy = a[0] - centre[0], a[1] - centre[1]
        t = (wx * ey - wy * ex) / den
        u = (wx * dy - wy * dx) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9 and (best is None or t < best):
            best = t
    if best is None:
        fail('ray missed the ring')
    return best


def reshape(name, target, centre):
    """Scales each vertex of `name` radially (about the grass centre) so its top ring lands on `target`."""
    o = bpy.data.objects[name]
    old, _c = top_ring(name)
    mw = o.matrix_world
    inv = mw.inverted()
    for v in o.data.vertices:
        w = mw @ v.co
        ang = math.atan2(w.y - centre[1], w.x - centre[0])
        f = ray_hit(target, centre, ang) / ray_hit(old, centre, ang)
        w2 = Vector((centre[0] + (w.x - centre[0]) * f, centre[1] + (w.y - centre[1]) * f, w.z))
        v.co = inv @ w2


def dist_to_ring(p, ring):
    best = 1e9
    for a, b in zip(ring, ring[1:] + ring[:1]):
        dx, dy = b[0] - a[0], b[1] - a[1]
        t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.dist(p, (a[0] + t * dx, a[1] + t * dy)))
    return best


def palm_groups():
    groups = {}
    for o in bpy.data.objects:
        if o.parent is None and (o.name.startswith('PalmT') or o.name.startswith('PalmL')):
            key = o.name[5:-1]  # 'PalmT-10.6-3.00' → '-10.6-3.0'
            groups.setdefault(key, []).append(o)
    return groups


def palm_base(objs):
    trunks = [o for o in objs if o.name.startswith('PalmT')]
    low = min(trunks, key=lambda o: o.location.z)
    return (low.location.x, low.location.y)


def move_palms(grass, centre, rail):
    for key, objs in sorted(palm_groups().items()):
        bx, by = palm_base(objs)
        if dist_to_ring((bx, by), rail) >= PALM_CLEAR and key not in PALM_FORCE:
            continue
        ang = math.radians(PALM_ANGLE[key]) if key in PALM_ANGLE else math.atan2(by - centre[1], bx - centre[0])
        out_ring = offset_ring(grass, lambda _x, _y: PALM_OFFSET)
        r = ray_hit(out_ring, centre, ang)
        tx, ty = centre[0] + math.cos(ang) * r, centre[1] + math.sin(ang) * r
        for o in objs:
            o.location.x += tx - bx
            o.location.y += ty - by
        print(f'make_source_v4: palm {key} moved to ({tx:.2f}, {ty:.2f})')


def move_volcano(rail):
    base = bpy.data.objects[VOLCANO[0]]
    vs = [base.matrix_world @ v.co for v in base.data.vertices]
    cx = (min(v.x for v in vs) + max(v.x for v in vs)) / 2
    cy = (min(v.y for v in vs) + max(v.y for v in vs)) / 2
    tx, ty = min(rail, key=lambda p: math.dist(p, (cx, cy)))
    for name in VOLCANO:
        o = bpy.data.objects[name]
        o.location.x += tx - cx
        o.location.y += ty - cy
        # scale about the volcano's ground centre (x, y) only, its height with it
        o.location.x = tx + (o.location.x - tx) * VOLCANO_SCALE
        o.location.y = ty + (o.location.y - ty) * VOLCANO_SCALE
        o.scale = tuple(c * VOLCANO_SCALE for c in o.scale)
    print(f'make_source_v4: volcano moved from ({cx:.2f}, {cy:.2f}) onto the rail at ({tx:.2f}, {ty:.2f})')


def rail_box(scene, cam, rail, z):
    from bpy_extras.object_utils import world_to_camera_view
    pts = [world_to_camera_view(scene, cam, Vector((x, y, z))) for x, y in rail]
    return min(p.x for p in pts), max(p.x for p in pts), 1 - max(p.y for p in pts), 1 - min(p.y for p in pts)


def fit_camera(rail, z):
    scene = bpy.context.scene
    cam = scene.camera
    cam.data.shift_x = cam.data.shift_y = 0.0
    want = RAIL_FIT_X[1] - RAIL_FIT_X[0]
    for _ in range(30):
        bpy.context.view_layer.update()
        x0, x1, y0, y1 = rail_box(scene, cam, rail, z)
        cam.data.lens *= (x1 - x0) and want / (x1 - x0)
        bpy.context.view_layer.update()
        x0, x1, y0, y1 = rail_box(scene, cam, rail, z)
        aspect = scene.render.resolution_y / scene.render.resolution_x
        cam.data.shift_x += ((x0 + x1) / 2 - 0.5)
        cam.data.shift_y -= ((y0 + y1) / 2 - RAIL_FIT_CY) * aspect
    bpy.context.view_layer.update()
    x0, x1, y0, y1 = rail_box(scene, cam, rail, z)
    print(f'make_source_v4: camera lens {cam.data.lens:.2f} shift ({cam.data.shift_x:.3f}, {cam.data.shift_y:.3f}); '
          f'rail x {x0:.3f}..{x1:.3f} y {y0:.3f}..{y1:.3f} (fractions)')


def rail_curve(rail, z):
    curve = bpy.data.curves.new('RailPath', 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    spline.points.add(len(rail) - 1)
    for pt, (x, y) in zip(spline.points, rail):
        pt.co = (x, y, z, 1.0)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new('RailPath', curve)
    obj.hide_render = True
    bpy.data.collections['World'].objects.link(obj)
    return obj


def pastel():
    for obj_name, rgba in PASTEL.items():
        o = bpy.data.objects[obj_name]
        mat = o.material_slots[0].material
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = rgba


def beach_width(angle):
    """The beach's width (m) outside the grass at `angle` (radians round the grass centre)."""
    w = SAND_BASE + SAND_BOTTOM * max(0.0, -math.sin(angle)) ** 2
    for at, half, extra in SAND_BULGES:
        d = abs(math.remainder(angle - math.radians(at), math.tau))
        if d < math.radians(half):
            u = 1.0 - d / math.radians(half)
            w += extra * u * u * (3 - 2 * u)
    return w


def main(args):
    grass, centre = top_ring(GRASS)
    sand_d = lambda x, y: beach_width(math.atan2(y - centre[1], x - centre[0]))  # noqa: E731
    sand = chaikin(offset_ring(grass, sand_d), 2)
    shallow = chaikin(offset_ring(grass, lambda x, y: sand_d(x, y) + SHALLOW_EXTRA), 2)
    reshape(SAND, sand, centre)
    reshape(SHALLOW, shallow, centre)

    rail = resample(chaikin(offset_ring(grass, lambda _x, _y: RAIL_OFFSET), RAIL_SMOOTH), RAIL_STEP)
    start = math.radians(RAIL_START_ANGLE_DEG)
    k = min(range(len(rail)), key=lambda i: abs(math.remainder(math.atan2(rail[i][1] - centre[1], rail[i][0] - centre[0]) - start, math.tau)))
    rail = rail[k:] + rail[:k]
    sand_top = max((bpy.data.objects[SAND].matrix_world @ v.co).z for v in bpy.data.objects[SAND].data.vertices)
    rail_curve(rail, sand_top)
    length = sum(math.dist(a, b) for a, b in zip(rail, rail[1:] + rail[:1]))
    print(f'make_source_v4: rail {len(rail)} points, {length:.1f} m, z {sand_top:.2f}')

    move_palms(grass, centre, rail)
    move_volcano(rail)
    pastel()

    fit_camera(rail, sand_top)

    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'make_source_v4: saved {args["out"]}')


if __name__ == '__main__':
    main(parse_args('make_source_v4', required=('out',)))
