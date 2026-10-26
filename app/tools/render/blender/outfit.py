# Story 8.2: Shiba's outfit items (Thay đồ cho Shiba) — script-built in the cute style (cute.py shapes, smooth shading).
#
# Every item is an OVERLAY sprite, never a pre-composited Shiba: `dress(rig, base_coll, …)` adds one
# `sprite.shiba-<id>` collection per item next to the Shiba's own `sprite.shiba` group, with the base's `states` and
# `holdout_occluders`, `movable` = 1 (no shadow in the plate) and `bhc_holdout_sprites` = ["shiba"]: render_screen.py
# renders each item alone for every Shiba state frame, same camera and full frame, the Shiba's meshes as holdouts
# (its head hides the back of a hat, its ears poke through a beanie). The runtime draws `shiba-<id>/<state>/<nn>` on
# the Shiba's anchor and origin (core/outfit-layers).
#
# Items attach to the cute.chibi() rig (unit size: paws at z 0, ~2.0 tall to the ear tips, facing -Y): hats and
# glasses to the `head` pivot, shirts to the `body` pivot (jumper and raincoat sleeves to the front legs, so they
# follow the map guide's wave). Coordinates below are in that pivot's space:
#   head (pivot at body (0, -0.02, 0.95)): skull centre (0, -0.03, 0.38) radii (0.62, 0.55, 0.55) (top z 0.93), the
#     eyes at (±0.24, -0.52, 0.46) (front y -0.58), the snout at (0, -0.55, 0.24), the ears at x ±0.34 from z 0.7 to 1.1;
#   body: torso centre (0, 0.06, 0.55) radii (0.42, 0.44, 0.44), belly front y -0.42, the head covers it above z ~0.8;
#   legs (front): unit spheres scaled (0.13, 0.13, 0.17) at (±0.2, -0.14, 0.15).
#
# `icon(item_id, colours, coll, …)` builds the same item alone, centred on a root empty (a shirt hangs on a little
# hanger over a cream form), for the wardrobe icons (build_dress_up.py).
# Colours come from Tokens.art.dressUp (params['art']['dressUp']); nothing here hard-codes a design colour.
import json
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from cute import blob, lathe, mat, mesh_obj, place, rod, torus

HOLDOUT_BASE = 'shiba'
ICON_SHIRT_STRETCH = 1.4  # a wardrobe shirt icon is this much taller than the worn shirt  # the Shiba's own sprite (its meshes cut every item)


def fail(msg):
    raise RuntimeError(f'outfit: {msg}')


# --- shape helpers ---------------------------------------------------------------------------------------------

def _empty(name, coll, parent=None, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.1
    coll.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_euler = tuple(math.radians(a) for a in rot)
    return e


def tube_loop(name, pts, r, material, coll, parent, seg=10):
    """A closed tube of radius r through the points of a closed loop (parent space)."""
    n = len(pts)
    bm = bmesh.new()
    rings = []
    # The loop's plane normal (Newell): one reference for every ring, so the tube never twists.
    vs = [Vector(q) for q in pts]
    plane = Vector((0.0, 0.0, 0.0))
    for i in range(n):
        a, b = vs[i], vs[(i + 1) % n]
        plane += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    plane = plane.normalized() if plane.length > 1e-9 else Vector((0.0, 1.0, 0.0))
    for i, p in enumerate(pts):
        p = Vector(p)
        t = (vs[(i + 1) % n] - vs[i - 1]).normalized()
        u = plane
        v = t.cross(u).normalized()
        rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * k / seg) + v * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, material, coll)
    o.parent = parent
    return o


def flat_shape(name, pts, depth, material, coll, parent):
    """A thin plate (thickness `depth` along y) filling a closed loop of (x, z) points (parent space, y = 0)."""
    bm = bmesh.new()
    cx = sum(p[0] for p in pts) / len(pts)
    cz = sum(p[1] for p in pts) / len(pts)
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    cf = bm.verts.new((cx, -depth / 2, cz))
    cb = bm.verts.new((cx, depth / 2, cz))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((cf, front[j], front[i]))
        bm.faces.new((cb, back[i], back[j]))
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, material, coll)
    o.parent = parent
    return o


def heart_loop(size, n=40):
    """A heart outline (x, z), about `size` from the centre to the lobes' sides, its tip down."""
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        out.append((x / 17.0 * size, (z + 2.0) / 17.0 * size))
    return out


def star_loop(outer, inner, points=5, per_edge=4):
    """A soft five-point star outline (x, z), a point up."""
    corners = []
    for i in range(2 * points):
        a = math.pi / 2 + math.pi * i / points
        r = outer if i % 2 == 0 else inner
        corners.append((r * math.cos(a), r * math.sin(a)))
    out = []
    for i, (x0, z0) in enumerate(corners):
        x1, z1 = corners[(i + 1) % len(corners)]
        for k in range(per_edge):
            t = k / per_edge
            out.append((x0 + (x1 - x0) * t, z0 + (z1 - z0) * t))
    return out


def lens_material(hex_colour, alpha):
    """A tinted see-through lens (the eyes show through it in the overlay's alpha)."""
    m = mat(hex_colour, 0.15).copy()
    m.name = f'outfit-lens-{hex_colour.lstrip("#").lower()}'
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Alpha'].default_value = alpha
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    if hasattr(m, 'blend_method'):
        m.blend_method = 'BLEND'
    return m


def on_ellipsoid(centre, radii, direction, lift=0.0):
    """The point of an ellipsoid (centre, radii) along `direction`, pushed `lift` out along its normal, and the normal."""
    d = Vector(direction).normalized()
    t = 1.0 / math.sqrt(sum((d[i] / radii[i]) ** 2 for i in range(3)))
    p = d * t
    nrm = Vector(tuple(p[i] / radii[i] ** 2 for i in range(3))).normalized()
    return Vector(centre) + p + nrm * lift, nrm


def facing(o, normal, up=(0.0, 0.0, 1.0)):
    """Turns a flat (y-thin) object so its front (-y) faces along `normal`."""
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (-Vector(normal)).to_track_quat('Y', 'Z')
    return o


# --- hats (head pivot space) -------------------------------------------------------------------------------------

def party_hat(c, coll, head, n):
    root = _empty(f'{n}-root', coll, head, (0.04, -0.06, 0.84), (-6.0, 12.0, 0.0))
    pink = mat(c['partyHat'], 0.45)
    h, r = 0.6, 0.24
    prof = [(0.0, 0.0)] + [(r * (1 - k / 12) + 0.012 * math.sin(math.pi * k / 12), h * k / 12) for k in range(13)] + [(0.0, h + 0.01)]
    lathe(f'{n}-cone', prof, pink, coll, root)
    dot = mat(c['partyDot'], 0.4)
    for i, (frac, az) in enumerate([(0.18, 250), (0.22, 320), (0.42, 290), (0.4, 210), (0.62, 260), (0.2, 180), (0.45, 345), (0.7, 310)]):
        rr = r * (1 - frac) + 0.006
        a = math.radians(az)
        d = blob(f'{n}-dot-{i}', dot, coll, root, (rr * math.cos(a), rr * math.sin(a), h * frac), (0.035, 0.012, 0.035))
        facing(d, (math.cos(a), math.sin(a), 0.35))
    torus(f'{n}-trim', r + 0.005, 0.035, mat(c['partyTrim'], 0.5), coll, root, (0.0, 0.0, 0.02))
    blob(f'{n}-pompom', mat(c['pompom'], 0.7), coll, root, (0.0, 0.0, h + 0.05), (0.085, 0.085, 0.085))
    return root


def cowboy_hat(c, coll, head, n):
    root = _empty(f'{n}-root', coll, head, (0.0, -0.03, 0.82), (8.0, 0.0, 0.0))
    felt = mat(c['cowboy'], 0.6)
    # The brim: a flat oval disc whose sides curl up.
    bm = bmesh.new()
    rings, seg = 8, 48
    rx, ry, th = 0.62, 0.54, 0.035
    verts_top, verts_bot = [], []
    for k in range(1, rings + 1):
        f = k / rings
        top_ring, bot_ring = [], []
        for j in range(seg):
            a = 2 * math.pi * j / seg
            x, y = rx * f * math.cos(a), ry * f * math.sin(a)
            z = 0.22 * (x / rx) ** 4 + 0.05 * f ** 3
            top_ring.append(bm.verts.new((x, y, z + th / 2)))
            bot_ring.append(bm.verts.new((x, y, z - th / 2)))
        verts_top.append(top_ring)
        verts_bot.append(bot_ring)
    ct = bm.verts.new((0.0, 0.0, th / 2))
    cb = bm.verts.new((0.0, 0.0, -th / 2))
    for j in range(seg):
        j2 = (j + 1) % seg
        bm.faces.new((ct, verts_top[0][j], verts_top[0][j2]))
        bm.faces.new((cb, verts_bot[0][j2], verts_bot[0][j]))
        for k in range(rings - 1):
            bm.faces.new((verts_top[k][j], verts_top[k + 1][j], verts_top[k + 1][j2], verts_top[k][j2]))
            bm.faces.new((verts_bot[k][j2], verts_bot[k + 1][j2], verts_bot[k + 1][j], verts_bot[k][j]))
        bm.faces.new((verts_top[-1][j], verts_bot[-1][j], verts_bot[-1][j2], verts_top[-1][j2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    brim = mesh_obj(f'{n}-brim', bm, felt, coll)
    brim.parent = root
    # The crown: a rounded lathe with a soft dent on top.
    prof = [(0.0, 0.28)] + [(0.08 + 0.02 * k, 0.3 - 0.008 * k) for k in range(4)]
    prof += [(0.22, 0.26), (0.24, 0.2), (0.25, 0.1), (0.26, 0.0), (0.0, 0.0)]
    crown = lathe(f'{n}-crown', list(reversed(prof)), felt, coll, root)
    crown.scale = (1.0, 0.88, 1.0)
    band = torus(f'{n}-band', 0.258, 0.03, mat(c['cowboyBand'], 0.6), coll, root, (0.0, 0.0, 0.05))
    band.scale = (1.0, 0.88, 1.0)
    return root


def crown(c, coll, head, n):
    root = _empty(f'{n}-root', coll, head, (0.0, -0.06, 0.86), (-4.0, -8.0, 0.0))
    gold = mat(c['crown'], 0.25)
    r, h, t = 0.24, 0.13, 0.03
    lathe(f'{n}-band', [(0.0, 0.0), (r, 0.0), (r + t, 0.01), (r + t, h), (r, h + 0.005), (r - 0.002, 0.004), (0.0, 0.004)], gold, coll, root)
    for i in range(6):
        a = 2 * math.pi * i / 6 - math.pi / 2
        x, y = (r + t / 2) * math.cos(a), (r + t / 2) * math.sin(a)
        lathe(f'{n}-point-{i}', [(0.0, 0.0), (0.06, 0.0), (0.045, 0.06), (0.0, 0.15)], gold, coll, root, (x, y, h - 0.01))
        blob(f'{n}-ball-{i}', gold, coll, root, (x, y, h + 0.15), (0.032, 0.032, 0.032))
    for i, (az, colour) in enumerate([(-90, 'gemPink'), (-50, 'gemBlue'), (-130, 'gemBlue'), (90, 'gemPink')]):
        a = math.radians(az)
        g = blob(f'{n}-gem-{i}', mat(c[colour], 0.15), coll, root, ((r + t + 0.01) * math.cos(a), (r + t + 0.01) * math.sin(a), h * 0.5), (0.04, 0.02, 0.045))
        facing(g, (math.cos(a), math.sin(a), 0.0))
    return root


def beanie(c, coll, head, n):
    root = _empty(f'{n}-root', coll, head, (0.0, -0.03, 0.6), (-4.0, 0.0, 0.0))
    knit = mat(c['beanie'], 0.85)
    rx, ry, rz = 0.665, 0.61, 0.58
    steps = 16
    prof = [(rx * math.cos(math.pi / 2 * k / steps), rz * math.sin(math.pi / 2 * k / steps)) for k in range(steps + 1)]
    dome = lathe(f'{n}-dome', [(0.0, 0.0)] + prof, knit, coll, root, seg=48)
    dome.scale = (1.0, ry / rx, 1.0)
    stripe = mat(c['beanieStripe'], 0.85)
    for i, zf in enumerate((0.38, 0.62)):
        z = rz * zf
        rr = rx * math.sqrt(1 - zf ** 2)
        s = torus(f'{n}-stripe-{i}', rr, 0.022, stripe, coll, root, (0.0, 0.0, z))
        s.scale = (1.0, ry / rx, 1.0)
    cuff = torus(f'{n}-cuff', rx - 0.01, 0.06, mat(c['beanieCuff'], 0.85), coll, root, (0.0, 0.0, 0.04))
    cuff.scale = (1.0, ry / rx, 1.0)
    blob(f'{n}-pompom', mat(c['pompom'], 0.9), coll, root, (0.0, 0.02, rz + 0.08), (0.14, 0.14, 0.13))
    return root


# --- glasses (head pivot space; the lenses sit in front of the eyes, the arms run back into the skull) ---------------

EYE_X, EYE_Z, LENS_Y = 0.24, 0.47, -0.665


def _arms(n, coll, root, material, r, outer_x):
    for sx, side in ((-1, 'L'), (1, 'R')):
        rod(f'{n}-arm{side}', (sx * outer_x, LENS_Y + 0.02, EYE_Z + 0.02), (sx * 0.52, -0.12, EYE_Z + 0.06), r, material, coll, root)


def round_glasses(c, coll, head, n):
    root = _empty(f'{n}-root', coll, head)
    red = mat(c['glassesRed'], 0.3)
    lr = 0.15
    for sx, side in ((-1, 'L'), (1, 'R')):
        torus(f'{n}-rim{side}', lr, 0.03, red, coll, root, (sx * EYE_X, LENS_Y, EYE_Z), (90.0, 0.0, 0.0))
    rod(f'{n}-bridge', (-EYE_X + lr, LENS_Y - 0.01, EYE_Z + 0.03), (EYE_X - lr, LENS_Y - 0.01, EYE_Z + 0.03), 0.026, red, coll, root)
    _arms(n, coll, root, red, 0.022, EYE_X + lr)
    return root


def heart_glasses(c, coll, head, n):
    root = _empty(f'{n}-root', coll, head)
    rim = mat(c['heartRim'], 0.3)
    lens = lens_material(c['heartLens'], 0.5)
    size = 0.19
    for sx, side in ((-1, 'L'), (1, 'R')):
        at = _empty(f'{n}-at{side}', coll, root, (sx * EYE_X, LENS_Y, EYE_Z - 0.03))
        loop = heart_loop(size)
        tube_loop(f'{n}-rim{side}', [(x, 0.0, z) for x, z in loop], 0.026, rim, coll, at)
        flat_shape(f'{n}-lens{side}', loop, 0.01, lens, coll, at)
    rod(f'{n}-bridge', (-EYE_X + 0.15, LENS_Y - 0.01, EYE_Z + 0.04), (EYE_X - 0.15, LENS_Y - 0.01, EYE_Z + 0.04), 0.024, rim, coll, root)
    _arms(n, coll, root, rim, 0.022, EYE_X + 0.17)
    return root


def star_glasses(c, coll, head, n):
    root = _empty(f'{n}-root', coll, head)
    rim = mat(c['starRim'], 0.3)
    lens = lens_material(c['starLens'], 0.45)
    for sx, side in ((-1, 'L'), (1, 'R')):
        at = _empty(f'{n}-at{side}', coll, root, (sx * EYE_X, LENS_Y, EYE_Z), (0.0, sx * 8.0, 0.0))
        loop = star_loop(0.2, 0.1)
        tube_loop(f'{n}-rim{side}', [(x, 0.0, z) for x, z in loop], 0.024, rim, coll, at)
        flat_shape(f'{n}-lens{side}', loop, 0.01, lens, coll, at)
    rod(f'{n}-bridge', (-EYE_X + 0.12, LENS_Y - 0.01, EYE_Z + 0.02), (EYE_X - 0.12, LENS_Y - 0.01, EYE_Z + 0.02), 0.024, rim, coll, root)
    _arms(n, coll, root, rim, 0.022, EYE_X + 0.17)
    return root


# --- shirts (body pivot space): an open shell around the torso, a collar and a hem; sleeves on the front legs ------

SHELL_C = (0.0, 0.04, 0.55)
SHELL_R = (0.465, 0.505, 0.475)
SHELL_TOP = 0.86


def shell(n, coll, root, materials, z0, z1=SHELL_TOP, band=None, seg=(48, 32)):
    """The shirt body: the shell ellipsoid between body z0 and z1 (open top and bottom). `band(z)` picks a material
    index per face from its centre height (stripes); default 0."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1.0)
    for v in bm.verts:
        v.co = Vector((SHELL_C[0] + v.co.x * SHELL_R[0], SHELL_C[1] + v.co.y * SHELL_R[1], SHELL_C[2] + v.co.z * SHELL_R[2]))
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not (z0 <= f.calc_center_median().z <= z1)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    if band is not None:
        for f in bm.faces:
            f.material_index = band(f.calc_center_median().z)
    o = mesh_obj(f'{n}-shell', bm, materials, coll)
    o.parent = root
    return o


def shell_ring_radius(z):
    """The shell's (x, y) radii at body height z."""
    k = math.sqrt(max(0.0, 1 - ((z - SHELL_C[2]) / SHELL_R[2]) ** 2))
    return SHELL_R[0] * k, SHELL_R[1] * k


def rim_ring(name, z, minor, material, coll, root, lift=0.0):
    rx, ry = shell_ring_radius(z)
    t = torus(name, rx + lift, minor, material, coll, root, (SHELL_C[0], SHELL_C[1], z))
    t.scale = (1.0, (ry + lift) / (rx + lift), 1.0)
    return t


def sleeves(n, coll, root, material, legs, cuff=None):
    """Sleeves over the front legs' upper half: parented to each leg (so they follow a waving leg), or placed at the
    legs' rest spots when there is no rig (an icon)."""
    prof = [(1.12 * math.sqrt(max(0.0, 1 - z * z)) + 0.07, z) for z in [-0.35 + 0.1 * k for k in range(12)]]
    out = []
    for sx, side in ((-1, 'L'), (1, 'R')):
        leg = legs.get(side) if legs else None
        if leg is not None:
            s = lathe(f'{n}-sleeve{side}', prof, material, coll, leg)
        else:
            s = lathe(f'{n}-sleeve{side}', prof, material, coll, root, (0.2 * sx, -0.14, 0.15))
            s.scale = (0.13, 0.13, 0.17)
        if cuff is not None:
            c2 = torus(f'{n}-cuff{side}', 1.14, 0.14, cuff, coll, s, (0.0, 0.0, -0.3))
            c2.scale = (1.0, 1.0, 0.8)
        out.append(s)
    return out


def striped_tee(c, coll, body, n, legs=None):
    root = _empty(f'{n}-root', coll, body)
    a, b = mat(c['stripeA'], 0.6), mat(c['stripeB'], 0.6)
    shell(n, coll, root, [a, b], 0.25, band=lambda z: int((z - 0.25) / 0.075) % 2)
    rim_ring(f'{n}-collar', SHELL_TOP - 0.01, 0.04, a, coll, root)
    rim_ring(f'{n}-hem', 0.26, 0.035, a, coll, root)
    return root


def raincoat(c, coll, body, n, legs=None):
    root = _empty(f'{n}-root', coll, body)
    yellow, trim = mat(c['raincoat'], 0.3), mat(c['raincoatTrim'], 0.35)
    shell(n, coll, root, [yellow], 0.17)
    rim_ring(f'{n}-collar', SHELL_TOP - 0.01, 0.06, trim, coll, root)
    rim_ring(f'{n}-hem', 0.18, 0.04, trim, coll, root)
    btn = mat(c['raincoatButton'], 0.3)
    for i, z in enumerate((0.36, 0.5, 0.64)):
        p, nrm = on_ellipsoid(SHELL_C, SHELL_R, (0.0, -1.0, (z - SHELL_C[2]) * 1.6), 0.01)
        d = blob(f'{n}-button-{i}', btn, coll, root, tuple(p), (0.045, 0.02, 0.045))
        facing(d, nrm)
    sleeves(n, coll, root, yellow, legs, trim)
    return root


def heart_jumper(c, coll, body, n, legs=None):
    root = _empty(f'{n}-root', coll, body)
    red, rib = mat(c['jumper'], 0.85), mat(c['jumperRib'], 0.85)
    shell(n, coll, root, [red], 0.22)
    rim_ring(f'{n}-collar', SHELL_TOP - 0.01, 0.055, rib, coll, root)
    rim_ring(f'{n}-hem', 0.23, 0.05, rib, coll, root)
    p, nrm = on_ellipsoid(SHELL_C, SHELL_R, (0.0, -1.0, 0.0), 0.012)
    at = _empty(f'{n}-heart-at', coll, root, tuple(p))
    facing(at, nrm)
    flat_shape(f'{n}-heart', heart_loop(0.13), 0.02, mat(c['jumperHeart'], 0.6), coll, at)
    sleeves(n, coll, root, red, legs, rib)
    return root


def flower_shirt(c, coll, body, n, legs=None):
    root = _empty(f'{n}-root', coll, body)
    teal = mat(c['flowerShirt'], 0.5)
    shell(n, coll, root, [teal], 0.24)
    rim_ring(f'{n}-hem', 0.25, 0.03, teal, coll, root)
    white = mat(c['flowerWhite'], 0.5)
    # The collar: two soft flaps folded down at the front of the neck.
    for sx, side in ((-1, 'L'), (1, 'R')):
        p, nrm = on_ellipsoid(SHELL_C, SHELL_R, (0.22 * sx, -1.0, 0.62), 0.02)
        f = blob(f'{n}-collar{side}', white, coll, root, tuple(p), (0.11, 0.025, 0.07))
        facing(f, nrm)
        f.rotation_quaternion = f.rotation_quaternion @ Matrix.Rotation(math.radians(30.0 * sx), 4, 'Y').to_quaternion()
    petals = [mat(c['flowerPink'], 0.5), white]
    centre = mat(c['flowerYellow'], 0.5)
    spots = [(-0.35, -1.0, 0.1), (0.4, -1.0, -0.15), (0.0, -1.0, -0.42), (-0.9, -0.4, 0.2), (0.9, -0.4, 0.0), (-0.7, -0.6, -0.4), (0.75, -0.6, 0.38), (0.0, 1.0, 0.1)]
    for i, d in enumerate(spots):
        p, nrm = on_ellipsoid(SHELL_C, SHELL_R, d, 0.008)
        if not (0.3 <= p.z <= 0.8):
            continue
        at = _empty(f'{n}-flower-{i}', coll, root, tuple(p))
        facing(at, nrm)
        for k in range(5):
            a = 2 * math.pi * k / 5 + i
            blob(f'{n}-petal-{i}-{k}', petals[i % 2], coll, at, (0.05 * math.cos(a), -0.004, 0.05 * math.sin(a)), (0.042, 0.01, 0.03), (0.0, -math.degrees(a), 0.0))
        blob(f'{n}-flower-c-{i}', centre, coll, at, (0.0, -0.012, 0.0), (0.025, 0.01, 0.025))
    return root


# --- the catalogue ---------------------------------------------------------------------------------------------

ITEMS = {
    'party-hat': {'slot': 'hat', 'parent': 'head', 'build': party_hat},
    'cowboy-hat': {'slot': 'hat', 'parent': 'head', 'build': cowboy_hat},
    'crown': {'slot': 'hat', 'parent': 'head', 'build': crown},
    'beanie': {'slot': 'hat', 'parent': 'head', 'build': beanie},
    'round-glasses': {'slot': 'glasses', 'parent': 'head', 'build': round_glasses},
    'heart-glasses': {'slot': 'glasses', 'parent': 'head', 'build': heart_glasses},
    'star-glasses': {'slot': 'glasses', 'parent': 'head', 'build': star_glasses},
    'striped-tee': {'slot': 'shirt', 'parent': 'body', 'build': striped_tee},
    'raincoat': {'slot': 'shirt', 'parent': 'body', 'build': raincoat},
    'heart-jumper': {'slot': 'shirt', 'parent': 'body', 'build': heart_jumper},
    'flower-shirt': {'slot': 'shirt', 'parent': 'body', 'build': flower_shirt},
}


def check_items(content_items):
    """The content catalogue (params['outfit']: [{id, slot}]) must match ITEMS exactly (ids and slots)."""
    want = {i['id']: i['slot'] for i in content_items}
    have = {k: v['slot'] for k, v in ITEMS.items()}
    if want != have:
        fail(f'content items {sorted(want.items())} differ from the builder items {sorted(have.items())}')
    return [i['id'] for i in content_items]


def _build(item_id, colours, coll, pivot, legs):
    spec = ITEMS[item_id]
    n = f'outfit-{item_id}'
    if spec['slot'] == 'shirt':
        return spec['build'](colours, coll, pivot, n, legs)
    return spec['build'](colours, coll, pivot, n)


def dress(rig, base_coll, colours, content_items, prefix='shiba'):
    """One `sprite.<prefix>-<id>` group per item next to `base_coll` (the Shiba's sprite group), every item on the rig.
    `rig` needs 'head' and 'body' pivots; its front legs are found as `<prefix>-legL/R` (sleeves follow them).
    Returns {id: collection}."""
    ids = check_items(content_items)
    parents = [p for p in bpy.data.collections if base_coll.name in p.children]
    if not parents:
        fail(f'"{base_coll.name}" has no parent collection')
    legs = {side: bpy.data.objects.get(f'{prefix}-leg{side}') for side in ('L', 'R')}
    out = {}
    for item_id in ids:
        coll = bpy.data.collections.new(f'sprite.{prefix}-{item_id}')
        parents[0].children.link(coll)
        coll['states'] = base_coll.get('states', json.dumps({'idle': [1]}))
        coll['holdout_occluders'] = int(bool(base_coll.get('holdout_occluders', base_coll.get('occlude', 0))))
        coll['movable'] = 1
        coll['bhc_holdout_sprites'] = json.dumps([HOLDOUT_BASE if prefix == 'shiba' else prefix])
        pivot = rig[ITEMS[item_id]['parent']]
        _build(item_id, colours, coll, pivot, legs)
        for o in coll.all_objects:
            o['cute'] = 1
            o.visible_shadow = False if ITEMS[item_id]['slot'] == 'glasses' else o.visible_shadow
        out[item_id] = coll
    return out


def icon(item_id, colours, coll, name):
    """The wardrobe icon of an item: built alone on a root empty, centred on it (a shirt hangs on a little hanger
    over a cream form). Returns the root (scale and place it)."""
    root = _empty(name, coll)
    holder = _empty(f'{name}-holder', coll, root)
    spec = ITEMS[item_id]
    built = _build(item_id, colours, coll, holder, None)
    if spec['slot'] == 'shirt':
        built.scale = (1.0, 1.0, ICON_SHIRT_STRETCH)  # a taller shirt reads as a shirt (not a bowl) on its hanger
        form = mat(colours['form'], 0.7)
        # The cream form fills the shirt up to its collar (it never shows above it).
        blob(f'{name}-form', form, coll, built, (SHELL_C[0], SHELL_C[1], 0.5), (SHELL_R[0] - 0.03, SHELL_R[1] - 0.03, SHELL_TOP - 0.5 - 0.02))
        wood = mat(colours['hanger'], 0.5)
        top = SHELL_TOP + 0.02
        rod(f'{name}-hanger-l', (-0.36, SHELL_C[1], top - 0.04), (0.0, SHELL_C[1], top + 0.1), 0.025, wood, coll, built)
        rod(f'{name}-hanger-r', (0.36, SHELL_C[1], top - 0.04), (0.0, SHELL_C[1], top + 0.1), 0.025, wood, coll, built)
        torus(f'{name}-hook', 0.07, 0.016, mat(colours['rail'], 0.3), coll, built, (0.0, SHELL_C[1], top + 0.19), (90.0, 0.0, 0.0), arc=(-60.0, 200.0))
    for o in coll.all_objects:
        o['cute'] = 1
    bpy.context.view_layer.update()
    pts = []
    for o in coll.all_objects:
        if o.type == 'MESH' and (o == built or built in _ancestors(o)):
            pts.extend(o.matrix_world @ v.co for v in o.data.vertices)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    holder.location = -(lo + hi) / 2
    return root


def _ancestors(o):
    out = []
    p = o.parent
    while p is not None:
        out.append(p)
        p = p.parent
    return out
