# Builds art/garden.blend (Trồng cây, spec-trong-cay, 2026-10-30) from the vendored island art/src/map-v3.blend (only
# its render settings, world and Sun are kept).
#
# Run by `npm run art:build -- garden` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_garden.py -- \
#     --out <tmp>/garden.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens and content): colours, art.garden, art.dressUp (the outfit), outfit,
# garden (fruits, stages, packets, fruits per plant, the giant fruit, target / hit sizes, gap), design size, the
# interactive rect.
#
# One plate, 2048×1536, seen through an ORTHOGRAPHIC camera tilted CAM_PITCH degrees down (a shift along world x is a
# shift in design px, as in build_dress_up.py): a sunny yard — sky and clouds, round bushes behind a low white picket
# fence, grass with little flowers, a wooden raised bed of dark soil centre-left. The chibi Shiba (cute.chibi('dog'))
# sits on the grass at the right, three-quarter facing the plant; the watering can rests on the grass at the left.
# Sprites (all procedural, cute.py shapes):
#   - plant-<fruit>: one `state.<fruit>-<stage>` child per stage (bhc_state = the stage), all on the soil spot
#     (PLANT_PX, the world origin's column); the fruit stage has short stems ending at the fruit anchors. Strawberry: a
#     leafy clump with runners; tomato: a staked plant; lemon: a little lollipop tree; watermelon: a vine that climbs a
#     bamboo hoop (the fruits hang from it: the fruit anchors are shared by every plant);
#   - fruit-<fruit>, packet-<fruit>, can, the particles and the rainbow: rendered alone (no occluders);
#   - shiba: idle [1], chew [10, 11], happy [20, 21], sour [30, 31], puff [40] (cheek blobs on the head pivot, shown in
#     this frame only), and through outfit.dress one `shiba-<item>` overlay per item.
# Layout: hit.shiba (every state plus the tallest hat), anchors plant, pour, spout, shiba, mouth, worm, packet-<n>,
# fruit-<n>, flower-<fruit>.
import json
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, chibi, chibi_face, chibi_materials, key_chibi, lathe, mat, mesh_obj, rbox, rod, rounded_profile, soften_scene, torus  # noqa: E402
from common import add_empty, eval_world_verts, hex_to_linear, hull_object, key_constant, key_scale, parse_args, principled  # noqa: E402
from outfit import check_items, dress, flat_shape, heart_loop, star_loop  # noqa: E402
import build_ice_cream as ice  # noqa: E402  (add_strawberry; its main() only runs as a script)

RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main

# --- the camera: orthographic, looking along +y, tilted down -------------------------------------------------------
ORTHO_PX_PER_M = 100.0
CAM_PITCH = 28.0
CAM_DISTANCE = 60.0
SOIL_Z = 0.38  # the bed's soil surface (the grass is z 0)
PLANT_PX = (450.0, 585.0)  # design px: the plant's ground pivot (world (0, 0, SOIL_Z))

# --- the yard (design px / metres) ---------------------------------------------------------------------------------
BED_PX_X = (225.0, 675.0)  # the bed's outer left / right
BED_Y = (-1.25, 1.35)  # its front / back (depth)
BED_WALL = 0.2
BED_TOP = 0.46
FENCE_BOTTOM_PX = 318.0  # where the fence meets the grass
FENCE_H = 1.15
SKY_Y = 16.0
SEED = 30

# --- the fruit and the packets (design px) --------------------------------------------------------------------------
FRUIT_PX = [(318.0, 475.0), (450.0, 395.0), (582.0, 475.0)]
FRUIT_Y = -0.5  # the fruit anchors' depth (in front of the plant)
PACKET_PX = [(345.0, 450.0), (560.0, 450.0)]
FRUIT_LONGEST_PX = 106.0
PACKET_LONGEST_PX = 122.0
CAN_LONGEST_PX = 140.0
CAN_PX = (128.0, 646.0)  # the can's centre x and its bottom (on the grass)
SPOUT_TARGET_PX = (432.0, 478.0)  # where the tilted can's spout tip should end up (over the plant base)
POUR_DEG = 38.0  # Tokens.ui.gardenPourDeg (not in params.json): the can's tilt while it pours, clockwise on screen
SPOUT_DROP_PX = 12.0  # anchor.spout: this far under the tip
WORM_PX_X = 628.0
WORM_Y = -0.75

# --- Shiba ----------------------------------------------------------------------------------------------------------
SHIBA_PX = (822.0, 650.0)  # its ground pivot
SHIBA_HEIGHT_PX = 292.0  # idle, ear tips to paws
HEAD_UP = -12.0  # every pose's head pitched up this much: the camera looks down on Shiba, its face turns to it
SHIBA_YAW = -38.0  # three-quarter, facing the plant (screen left)
IDLE, CHEW, HAPPY, SOUR, PUFF = [1], [10, 11], [20, 21], [30, 31], [40]
STATES = {'idle': IDLE, 'chew': CHEW, 'happy': HAPPY, 'sour': SOUR, 'puff': PUFF}
ALL_FRAMES = IDLE + CHEW + HAPPY + SOUR + PUFF
MOUTH_OFFSET_PX = (-30.0, 16.0)  # anchor.mouth from the nose (towards the plant, a little down)

# --- the particles and surprises (design px, rendered alone; where they render does not matter) --------------------
PARTICLE_PX = {'drop': 20.0, 'seed': 18.0, 'pip': 14.0, 'juice': 20.0, 'heart': 40.0, 'sparkle': 40.0, 'butterfly': 72.0, 'worm': 52.0}
RAINBOW_CENTRE_PX = (450.0, 352.0)
RAINBOW_RADIUS = 2.05  # m: the outer band
RAINBOW_Y = 3.0

N0 = Vector((0.0, -0.55, 0.83)).normalized()  # a leaf's default face: up and towards the camera


def fail(msg):
    raise RuntimeError(f'build_garden: {msg}')


def log(msg):
    print(f'build_garden: {msg}')


def clear_island(scene):
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


P = math.radians(CAM_PITCH)
VIEW = Vector((0.0, math.cos(P), -math.sin(P)))
TX = 0.0
TZ = 0.0


def setup_camera(scene):
    """The camera target so that the plant spot (0, 0, SOIL_Z) projects to PLANT_PX."""
    global TX, TZ
    TX = -(PLANT_PX[0] - DESIGN[0] / 2) / ORTHO_PX_PER_M
    TZ = SOIL_Z + (PLANT_PX[1] - DESIGN[1] / 2) / ORTHO_PX_PER_M / math.cos(P)
    data = bpy.data.cameras.new('CamGarden')
    data.type = 'ORTHO'
    data.ortho_scale = DESIGN[0] / ORTHO_PX_PER_M
    data.clip_start = 0.1
    data.clip_end = 400.0
    cam = bpy.data.objects.new('CamGarden', data)
    scene.collection.objects.link(cam)
    cam.location = Vector((TX, 0.0, TZ)) - VIEW * CAM_DISTANCE
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = VIEW.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


def wx(sx):
    return TX + (sx - DESIGN[0] / 2) / ORTHO_PX_PER_M


def wz(sy, y):
    """World z of the point at depth y drawn at design px y."""
    return ((DESIGN[1] / 2 - sy) / ORTHO_PX_PER_M - y * math.sin(P)) / math.cos(P) + TZ


def gy(sy, z=0.0):
    """World depth of the point at height z drawn at design px y."""
    return ((DESIGN[1] / 2 - sy) / ORTHO_PX_PER_M - (z - TZ) * math.cos(P)) / math.sin(P)


def pt(sx, sy, y):
    return Vector((wx(sx), y, wz(sy, y)))


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


SCREEN = None


def world_pts(objs):
    bpy.context.view_layer.update()
    return eval_world_verts([o for o in objs if o.type == 'MESH'], bpy.context.evaluated_depsgraph_get())


def report(name, pts):
    r = SCREEN.rect(pts)
    log(f'{name} ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')
    return r


def fmt_px(p):
    return f'({p[0]:.0f}, {p[1]:.0f})'


# --- shape helpers --------------------------------------------------------------------------------------------------

def basis(x_dir, normal):
    """An orthonormal frame: X along x_dir, Z as close to `normal` as possible."""
    X = Vector(x_dir).normalized()
    n = Vector(normal)
    Z = n - X * n.dot(X)
    if Z.length < 1e-4:
        Z = Vector((0.0, -1.0, 0.0)) - X * (-X.y)
    Z.normalize()
    Y = Z.cross(X)
    return X, Y, Z


def leaf(name, material, coll, parent, base, direction, length, width, normal=N0, thick=0.03, curl=0.14, round_=False, teeth=None, seg=(28, 12)):
    """A soft leaf from `base` towards `direction` (parent space, baked): pointed (lens) or round, optionally toothed /
    lobed (teeth = (count, amplitude)), its tip curled towards its face."""
    X, Y, Z = basis(direction, normal)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1.0)
    base = Vector(base)
    for v in bm.verts:
        x, y, z = v.co
        w = y if round_ else y * math.sqrt(max(0.0, 1.0 - x * x))
        f = 1.0
        if teeth:
            phi = math.atan2(y, x)
            f = 1.0 + teeth[1] * math.cos(teeth[0] * phi)
        u = (x * f + 1.0) / 2.0
        lx = u * length
        ly = w * f * width / 2.0
        lz = z * thick + curl * length * u * u - 0.25 * curl * length * (2.0 * ly / width) ** 2
        v.co = base + X * lx + Y * ly + Z * lz
    o = mesh_obj(name, bm, material, coll)
    o.parent = parent
    return o


def oriented_blob(name, material, coll, parent, loc, size, x_dir, normal, seg=(32, 16)):
    X, Y, Z = basis(x_dir, normal)
    o = blob(name, material, coll, parent, loc, size, seg=seg)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Matrix((X, Y, Z)).transposed().to_quaternion()
    return o


def bezier(ctrl, n):
    pts = []
    for i in range(n + 1):
        t = i / n
        q = [Vector(c) for c in ctrl]
        while len(q) > 1:
            q = [a.lerp(b, t) for a, b in zip(q, q[1:])]
        pts.append(q[0])
    return pts


def path(name, ctrl, r0, r1, material, coll, parent=None, n=10):
    """A soft stem through a Bézier curve (it starts and ends exactly at the first and last control points)."""
    tube(name, bezier(ctrl, max(8, n * 3)), r0, r1, material, coll, parent)
    return bezier(ctrl, n)


def tube(name, pts, r0, r1, material, coll, parent=None, seg=14):
    """One smooth tube through the points (rotation-minimising rings), its radius tapering r0 → r1, round caps."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    tan = [(pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized() for i in range(n)]
    ref = Vector((0.0, 0.0, 1.0)) if abs(tan[0].z) < 0.9 else Vector((1.0, 0.0, 0.0))
    nrm = tan[0].cross(ref).normalized()
    bm = bmesh.new()

    def ring(c, t, nv, r):
        b = t.cross(nv)
        return [bm.verts.new(c + (nv * math.cos(2 * math.pi * j / seg) + b * math.sin(2 * math.pi * j / seg)) * r) for j in range(seg)]

    rings = []
    frames = []
    for i, p in enumerate(pts):
        if i > 0:
            nrm = tan[i - 1].rotation_difference(tan[i]) @ nrm
            nrm = (nrm - tan[i] * nrm.dot(tan[i])).normalized()
        frames.append(nrm.copy())
        rings.append(ring(p, tan[i], nrm, r0 + (r1 - r0) * i / max(1, n - 1)))
    # Round caps: two shrinking rings and a pole at each end.
    for end, sign in ((0, -1.0), (n - 1, 1.0)):
        r = r0 if end == 0 else r1
        caps = [ring(pts[end] + tan[end] * sign * r * math.sin(a), tan[end], frames[end], r * math.cos(a)) for a in (math.radians(40), math.radians(70))]
        pole = bm.verts.new(pts[end] + tan[end] * sign * r)
        seq = ([rings[0]] + caps) if end == 0 else ([rings[-1]] + caps)
        for a, b in zip(seq, seq[1:]):
            for j in range(seg):
                k = (j + 1) % seg
                bm.faces.new((a[j], a[k], b[k], b[j]))
        for j in range(seg):
            bm.faces.new((seq[-1][j], seq[-1][(j + 1) % seg], pole))
    for a, b in zip(rings, rings[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, material, coll)
    o.parent = parent
    o['cute'] = 1
    return o


def flower(name, coll, parent, centre, normal, size, petal, heart, pointed=False, n=5):
    """A flower facing `normal`: round petals (strawberry, lemon) or pointed ones (tomato, watermelon)."""
    ref = Vector((0.0, 0.0, 1.0)) if abs(Vector(normal).normalized().z) < 0.95 else Vector((1.0, 0.0, 0.0))
    _X, _Y, Z = basis(ref, normal)
    Z = Vector(normal).normalized()
    X = ref - Z * ref.dot(Z)
    X.normalize()
    Y = Z.cross(X)
    centre = Vector(centre)
    for i in range(n):
        a = 2 * math.pi * i / n + 0.3
        d = X * math.cos(a) + Y * math.sin(a)
        if pointed:
            leaf(f'{name}-petal-{i}', petal, coll, parent, centre, d, size, size * 0.5, Z, thick=0.02, curl=0.12)
        else:
            oriented_blob(f'{name}-petal-{i}', petal, coll, parent, centre + d * size * 0.5, (size * 0.5, size * 0.4, size * 0.1), d, Z, seg=(20, 10))
    blob(f'{name}-heart', heart, coll, parent, centre + Z * size * 0.08, (size * 0.3, size * 0.3, size * 0.3), seg=(20, 10))
    return centre


def emit_mat(name, hex_colour):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = hex_to_linear(hex_colour)
    e.inputs['Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], out.inputs['Surface'])
    return m


def stripe_material(name, base_hex, stripe_hex, n=8):
    """The watermelon rind: wavy dark stripes along the meridians (object space)."""
    m = mat(base_hex, 0.35).copy()
    m.name = name
    nt = m.node_tree
    bsdf = principled(m)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sep.inputs[0])

    def op(kind, a, b=None):
        node = nt.nodes.new('ShaderNodeMath')
        node.operation = kind
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                node.inputs[i].default_value = v
            else:
                nt.links.new(v, node.inputs[i])
        return node.outputs[0]

    phi = op('ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    wob = op('MULTIPLY', op('SINE', op('MULTIPLY', sep.outputs['Z'], 22.0)), 0.22)
    s = op('SINE', op('ADD', op('MULTIPLY', phi, float(n)), wob))
    mask = op('GREATER_THAN', s, 0.15)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(mask, mix.inputs[0])
    a = next(i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA')
    b = next(i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA')
    a.default_value = hex_to_linear(base_hex)
    b.default_value = hex_to_linear(stripe_hex)
    nt.links.new(next(o for o in mix.outputs if o.type == 'RGBA'), bsdf.inputs['Base Color'])
    return m


def empty(name, coll, parent=None, loc=(0.0, 0.0, 0.0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.2
    coll.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


def meshes_of(root):
    return [o for o in root.children_recursive if o.type == 'MESH']


def fit(root, longest_px, centre_px):
    """Scales `root` so its drawn longest side is `longest_px` and moves it so its drawn centre is `centre_px`."""
    r = SCREEN.rect(world_pts(meshes_of(root)))
    k = longest_px / max(r[2] - r[0], r[3] - r[1])
    root.scale = root.scale * k
    r = SCREEN.rect(world_pts(meshes_of(root)))
    root.location.x += (centre_px[0] - (r[0] + r[2]) / 2) / ORTHO_PX_PER_M
    root.location.z -= (centre_px[1] - (r[1] + r[3]) / 2) / ORTHO_PX_PER_M / math.cos(P)
    return SCREEN.rect(world_pts(meshes_of(root)))


def billboard(name, coll, loc=(0.0, 0.0, 0.0)):
    """A root empty whose local front (-y) faces the camera."""
    e = empty(name, coll, None, loc)
    e.rotation_euler = (-P, 0.0, 0.0)
    return e


def sprite(sprites, name, **props):
    coll = bpy.data.collections.new(f'sprite.{name}')
    sprites.children.link(coll)
    for k, v in props.items():
        coll[k] = v
    return coll


# --- the plate ------------------------------------------------------------------------------------------------------

def build_yard(c, plate):
    rnd = random.Random(SEED)
    fence_y = gy(FENCE_BOTTOM_PX)
    front_y = gy(DESIGN[1] + 40)
    grass = rbox('grass', (24.0, fence_y + 1.5 - front_y, 0.4), 0.05, mat(c['grass'], 0.85), plate, None, (TX, (fence_y + 1.5 + front_y) / 2, -0.2))
    grass['cute'] = 1
    sky_top = wz(-40, SKY_Y)
    sky = rbox('sky', (30.0, 0.2, sky_top + 4.0), 0.02, emit_mat('garden-sky', c['sky']), plate, None, (TX, SKY_Y, (sky_top - 4.0) / 2))
    sky.visible_shadow = False
    # Clouds on the sky (white puffs).
    white = mat(c['fence'], 0.9)
    for k, (sx, sy, s) in enumerate([(210, 80, 1.0), (640, 60, 1.25), (930, 300, 0.8), (40, 300, 0.7)]):
        cx, cz = wx(sx), wz(sy, SKY_Y - 0.6)
        for j, (dx, dz, r) in enumerate([(-0.55, 0.0, 0.42), (0.0, 0.18, 0.58), (0.55, 0.02, 0.45), (0.25, -0.12, 0.4), (-0.25, -0.12, 0.4)]):
            b = blob(f'cloud-{k}-{j}', white, plate, None, (cx + dx * s, SKY_Y - 0.6, cz + dz * s), (r * s, 0.25, r * s * 0.85), seg=(24, 12))
            b.visible_shadow = False
    # Round bushes behind the fence.
    bush_y = fence_y + 1.6
    greens = [mat(c['leaf'], 0.7), mat(c['leafDark'], 0.7), mat(c['grassDark'], 0.7)]
    x = wx(-60)
    k = 0
    while x < wx(DESIGN[0] + 60):
        r = rnd.uniform(0.7, 1.15)
        blob(f'bush-{k}', greens[k % 3], plate, None, (x, bush_y + rnd.uniform(-0.3, 0.6), r * 0.75), (r, r * 0.8, r * 0.95), seg=(32, 16))
        x += r * 1.25
        k += 1
    # The picket fence.
    fence, shade = mat(c['fence'], 0.6), mat(c['fenceShade'], 0.6)
    for zr in (0.32, 0.8):
        rbox(f'fence-rail-{zr}', (24.0, 0.08, 0.12), 0.04, shade, plate, None, (TX, fence_y + 0.08, zr))
    x = wx(-40)
    k = 0
    while x < wx(DESIGN[0] + 40):
        rbox(f'picket-{k}', (0.3, 0.08, FENCE_H - 0.15), 0.06, fence, plate, None, (x, fence_y, (FENCE_H - 0.15) / 2))
        blob(f'picket-top-{k}', fence, plate, None, (x, fence_y, FENCE_H - 0.15), (0.15, 0.04, 0.17), seg=(20, 10))
        x += 0.46
        k += 1
    # Grass texture: soft darker tufts, little flowers and pebbles (kept off the bed, the can's spot and Shiba).
    dark = mat(c['grassDark'], 0.85)
    petals = [mat(c['flower'], 0.6), mat(c['flowerYellow'], 0.6), mat(c['heart'], 0.6)]
    centre = mat(c['flowerHeart'], 0.5)
    bed_x0, bed_x1 = wx(BED_PX_X[0]) - 0.3, wx(BED_PX_X[1]) + 0.3
    placed = 0
    for i in range(400):
        if placed >= 55:
            break
        sx, sy = rnd.uniform(0, DESIGN[0]), rnd.uniform(FENCE_BOTTOM_PX + 15, DESIGN[1] - 5)
        y = gy(sy)
        xw = wx(sx)
        if bed_x0 < xw < bed_x1 and BED_Y[0] - 0.4 < y < BED_Y[1] + 0.4:
            continue
        if abs(sx - SHIBA_PX[0]) < 120 and sy > 560:
            continue
        if abs(sx - CAN_PX[0]) < 95 and abs(sy - CAN_PX[1] + 30) < 70:
            continue
        kind = i % 3
        if kind == 0:
            t = blob(f'tuft-{placed}', dark, plate, None, (xw, y, 0.0), (rnd.uniform(0.25, 0.45), rnd.uniform(0.12, 0.2), 0.04), seg=(20, 8))
            t.visible_shadow = False
        elif kind == 1:
            flower(f'grass-flower-{placed}', plate, None, (xw, y, 0.07), (0.0, -0.3, 1.0), rnd.uniform(0.12, 0.17), petals[placed % 3], centre)
        else:
            blob(f'pebble-{placed}', mat(c['fenceShade'], 0.7), plate, None, (xw, y, 0.02), (0.12, 0.09, 0.06), seg=(16, 8))
        placed += 1
    # Soft spots on the grass under the can and Shiba (their resting places; the sprites cast no shadow).
    spot = mat(c['grassDark'], 0.9)
    s1 = blob('can-spot', spot, plate, None, (wx(CAN_PX[0]), gy(CAN_PX[1]) + 0.1, 0.005), (0.9, 0.45, 0.01), seg=(32, 8))
    s2 = blob('shiba-spot', spot, plate, None, (wx(SHIBA_PX[0]), gy(SHIBA_PX[1]) + 0.15, 0.005), (0.95, 0.6, 0.01), seg=(32, 8))
    for s in (s1, s2):
        s.visible_shadow = False


def build_bed(c, plate):
    """The raised bed: plank walls (two planks a side), corner posts, dark soil with a few clods."""
    x0, x1 = wx(BED_PX_X[0]), wx(BED_PX_X[1])
    y0, y1 = BED_Y
    w, d = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    wood, dark = mat(c['bed'], 0.6), mat(c['bedDark'], 0.6)
    ph = BED_TOP / 2
    for k in range(2):
        m = wood if k == 1 else dark
        z = ph * (k + 0.5)
        rbox(f'bed-front-{k}', (w, BED_WALL, ph - 0.02), 0.06, m, plate, None, (cx, y0 + BED_WALL / 2, z))
        rbox(f'bed-back-{k}', (w, BED_WALL, ph - 0.02), 0.06, m, plate, None, (cx, y1 - BED_WALL / 2, z))
        rbox(f'bed-left-{k}', (BED_WALL, d, ph - 0.02), 0.06, m, plate, None, (x0 + BED_WALL / 2, cy, z))
        rbox(f'bed-right-{k}', (BED_WALL, d, ph - 0.02), 0.06, m, plate, None, (x1 - BED_WALL / 2, cy, z))
    for sx in (x0, x1):
        for sy in (y0, y1):
            rbox(f'bed-post-{sx:.1f}-{sy:.1f}', (0.3, 0.3, BED_TOP + 0.12), 0.1, wood, plate, None, (sx + (0.1 if sx == x0 else -0.1), sy + (0.1 if sy == y0 else -0.1), (BED_TOP + 0.12) / 2))
    soil = mat(c['soil'], 0.95)
    rbox('bed-soil', (w - 2 * BED_WALL + 0.02, d - 2 * BED_WALL + 0.02, SOIL_Z), 0.04, soil, plate, None, (cx, cy, SOIL_Z / 2))
    rnd = random.Random(SEED + 1)
    clod = mat(c['soilDark'], 0.95)
    for k in range(26):
        x = rnd.uniform(x0 + 0.35, x1 - 0.35)
        y = rnd.uniform(y0 + 0.35, y1 - 0.35)
        if abs(x) < 0.5 and abs(y) < 0.5:
            continue
        r = rnd.uniform(0.06, 0.12)
        blob(f'soil-clod-{k}', clod if k % 2 else soil, plate, None, (x, y, SOIL_Z), (r, r * 0.8, r * 0.55), seg=(16, 8))
    # The planting spot: a soft dark ring of soil.
    blob('soil-spot', clod, plate, None, (0.0, 0.0, SOIL_Z - 0.02), (0.55, 0.42, 0.05), seg=(32, 10)).visible_shadow = False


# --- plants ---------------------------------------------------------------------------------------------------------

class Kit:
    """Materials and the fruit anchors (relative to the plant spot) shared by the plant builders."""

    def __init__(self, c, anchors):
        self.c = c
        self.leaf = mat(c['leaf'], 0.45)
        self.leaf_dark = mat(c['leafDark'], 0.45)
        self.gloss = mat(c['leaf'], 0.25)
        self.gloss_dark = mat(c['leafDark'], 0.25)
        self.soft = mat(c['leaf'], 0.6)
        self.soft_dark = mat(c['leafDark'], 0.6)
        self.shine = mat(c['leafLight'], 0.6)
        self.stem = mat(c['stem'], 0.5)
        self.wood = mat(c['bed'], 0.55)
        self.bark = mat(c['bedDark'], 0.65)
        self.white = mat(c['flower'], 0.5)
        self.yellow = mat(c['flowerYellow'], 0.5)
        self.heart = mat(c['flowerHeart'], 0.45)
        self.mound = mat(c['soilDark'], 0.95)
        self.tie = mat(c['fence'], 0.6)
        self.O = Vector((0.0, 0.0, SOIL_Z))
        self.A = [a - self.O for a in anchors]


def mound(kit, coll, root, s):
    blob(f'{coll.name}-mound', kit.mound, coll, root, (0.0, 0.0, 0.0), (0.32 * s, 0.26 * s, 0.09 * s), seg=(24, 10))


def sprout(kit, coll, root, fruit):
    """A tiny two-leaf sprout (cotyledons shaped per fruit)."""
    spec = {
        'strawberry': (0.22, 0.17, True, kit.leaf),
        'tomato': (0.3, 0.12, False, kit.leaf),
        'watermelon': (0.27, 0.21, True, kit.leaf),
        'lemon': (0.25, 0.15, False, kit.soft_dark),
    }[fruit]
    length, width, round_, m = spec
    n = coll.name
    top = Vector((0.0, -0.02, 0.36))
    path(f'{n}-stem', [(0, 0, -0.05), (0.04, 0, 0.2), top], 0.045, 0.04, kit.stem, coll, root, n=5)
    for sx in (-1, 1):
        leaf(f'{n}-cot-{sx}', m, coll, root, top, (0.85 * sx, -0.2, 0.5), length * 1.6, width * 1.6, N0, thick=0.035, curl=0.18, round_=round_)
    mound(kit, coll, root, 1.0)


def trifoliate(name, kit, coll, root, base, tip, size, m=None):
    path(f'{name}-petiole', [base, (Vector(base) + Vector(tip)) / 2 + Vector((0, 0, 0.1)), tip], 0.045, 0.038, kit.stem, coll, root, n=5)
    d = (Vector(tip) - Vector(base)).normalized()
    for k, a in enumerate((-52.0, 0.0, 52.0)):
        dd = Matrix.Rotation(math.radians(a), 3, N0) @ d
        leaf(f'{name}-leaflet-{k}', m or kit.leaf, coll, root, Vector(tip) - dd * size * 0.08, dd, size * (0.92 if k != 1 else 1.0), size * 0.82, N0, thick=0.04, curl=0.12, round_=True, teeth=(11, 0.05))


def dome(count, rx, rz, z0, spread=150.0):
    """Leaf tips over a dome: (x, y, z) from the left to the right, alternating back and front."""
    out = []
    for k in range(count):
        a = math.radians(-spread / 2 + spread * k / max(1, count - 1))
        y = 0.3 if k % 2 == 0 else -0.25
        out.append((math.sin(a) * rx, y, z0 + math.cos(a) * rz))
    return out


def plant_strawberry(kit, coll, root, stage):
    n = coll.name
    if stage == 'small':
        tips, size, s = dome(5, 0.45, 0.32, 0.22, 140.0), 0.36, 1.0
    elif stage == 'flower':
        tips, size, s = dome(9, 0.95, 0.62, 0.3) + [(0.0, -0.45, 0.5), (-0.45, -0.5, 0.35), (0.45, -0.5, 0.38)], 0.5, 1.4
    else:
        tips, size, s = dome(11, 1.15, 0.8, 0.35) + [(0.0, -0.5, 0.6), (-0.6, -0.55, 0.4), (0.6, -0.55, 0.42), (-0.3, 0.1, 1.05), (0.3, 0.1, 1.05)], 0.6, 1.7
    for k, tip in enumerate(tips):
        trifoliate(f'{n}-leaf-{k}', kit, coll, root, (0.0, 0.0, 0.05), tip, size, kit.leaf_dark if k % 3 == 2 else kit.leaf)
    flower_at = None
    if stage in ('flower', 'fruit'):
        # Runners: thin stems along the soil to little plantlets.
        for sx in (-1, 1):
            end = Vector((1.8 * sx, -0.65, 0.03))
            path(f'{n}-runner-{sx}', [(0.2 * sx, -0.1, 0.05), (1.0 * sx, -0.6, 0.3), end], 0.03, 0.026, kit.stem, coll, root, n=8)
            for j, a in enumerate((-55.0, 55.0, 0.0)):
                dd = Matrix.Rotation(math.radians(a), 3, Vector((0, 0, 1))) @ Vector((sx * 0.3, -0.2, 0.9)).normalized()
                leaf(f'{n}-plantlet-{sx}-{j}', kit.leaf, coll, root, end, dd, 0.3, 0.24, N0, round_=True, teeth=(9, 0.05))
    if stage == 'flower':
        for k, (x, z) in enumerate([(-0.55, 1.2), (0.62, 1.15), (0.05, 1.42), (-1.05, 0.75), (1.0, 0.7)]):
            c = Vector((x, -0.55, z))
            path(f'{n}-fstalk-{k}', [(0, 0, 0.05), (x * 0.5, -0.2, z * 0.8), c], 0.03, 0.026, kit.stem, coll, root, n=6)
            fc = flower(f'{n}-flower-{k}', coll, root, c + Vector((0, -0.05, 0)), N0, 0.3, kit.white, kit.heart)
            if k == 2:
                flower_at = fc
    if stage == 'fruit':
        for k, a in enumerate(kit.A):
            up = Vector((a.x * 0.6, a.y * 0.6, a.z + 0.55))
            ctrl = [(0, 0, 0.05), (a.x * 0.25, a.y * 0.3, a.z * 0.75), up, a]
            path(f'{n}-fstalk-{k}', ctrl, 0.045, 0.038, kit.stem, coll, root, n=12)
            pts = bezier(ctrl, 10)
            for j, idx in enumerate((5, 7)):
                side = (1.0 if (a.x >= 0) == (j == 0) else -1.0)
                leaf(f'{n}-bract-{k}-{j}', kit.leaf, coll, root, pts[idx], (side, -0.3, 0.5), 0.3, 0.2, N0, teeth=(7, 0.06))
    mound(kit, coll, root, s)
    return flower_at


def compound(name, kit, coll, root, base, direction, length, size, m=None):
    """A tomato leaf: a rachis with two pairs of toothed leaflets and a tip leaflet."""
    d = Vector(direction).normalized()
    base = Vector(base)
    tip = base + d * length
    sag = Vector((0, 0, -0.15 * length))
    ctrl = [base, base + d * length * 0.5 + Vector((0, 0, 0.12 * length)), tip + sag]
    path(f'{name}-rachis', ctrl, 0.04, 0.03, kit.stem, coll, root, n=5)
    side = N0.cross(d).normalized()
    pts = bezier(ctrl, 10)
    for k, t in enumerate((0.42, 0.75)):
        p = pts[int(t * 10)]
        for sgn in (-1, 1):
            dd = (side * sgn + d * 0.5).normalized()
            leaf(f'{name}-leaflet-{k}-{sgn}', m or kit.leaf, coll, root, p, dd, size * (0.85 if k == 0 else 1.0), size * 0.6, N0, thick=0.035, curl=0.1, teeth=(9, 0.08))
    leaf(f'{name}-leaflet-tip', m or kit.leaf, coll, root, tip + sag - d * 0.05, d, size * 1.15, size * 0.68, N0, thick=0.035, curl=0.1, teeth=(9, 0.08))


def star_flowers(name, kit, coll, root, at, count=3):
    """A small truss of yellow star flowers (tomato, watermelon)."""
    out = []
    for k in range(count):
        c = Vector(at) + Vector(((k - (count - 1) / 2) * 0.26, -0.1 * k, 0.08 * (k % 2)))
        rod(f'{name}-pedicel-{k}', at, c, 0.022, kit.stem, coll, root)
        out.append(flower(f'{name}-{k}', coll, root, c + Vector((0, -0.05, 0)), N0, 0.24, kit.yellow, kit.heart, pointed=True))
    return out


def plant_tomato(kit, coll, root, stage):
    n = coll.name
    a1 = kit.A[1]
    if stage == 'small':
        h, stake, size, s, length = 0.95, 1.25, 0.3, 1.0, 0.55
        leaves = [(0.3, -1), (0.5, 1), (0.72, -1), (0.9, 1)]
    elif stage == 'flower':
        h, stake, size, s, length = 1.75, 2.05, 0.4, 1.4, 0.85
        leaves = [(0.3, -1), (0.5, 1), (0.8, -1), (1.05, 1), (1.3, -1), (1.55, 1)]
    else:
        h, stake, size, s, length = a1.z + 0.3, a1.z + 0.5, 0.46, 1.7, 1.0
        leaves = [(0.3, -1), (0.5, 1), (0.8, -1), (1.05, 1), (1.35, -1), (1.6, 1), (1.9, -1), (2.15, 1)]
    rod(f'{n}-stake', (0.2, 0.32, -0.2), (0.2, 0.32, stake), 0.065, kit.wood, coll, root)
    blob(f'{n}-stake-cap', kit.wood, coll, root, (0.2, 0.32, stake), (0.085, 0.085, 0.06))
    ctrl = [(0, 0, -0.05), (0.1, 0.0, h * 0.35), (-0.08, 0.0, h * 0.7), (0.02, 0.0, h)]
    spine = path(f'{n}-stem', ctrl, 0.09, 0.06, kit.stem, coll, root, n=24)
    for k, z in enumerate([h * 0.32, h * 0.66]):
        torus(f'{n}-tie-{k}', 0.12, 0.03, kit.tie, coll, root, (0.1, 0.16, z), (0.0, 0.0, 0.0))

    def on_spine(z):
        return min(spine, key=lambda p: abs(p.z - z))

    for k, (z, sx) in enumerate(leaves):
        base = on_spine(z)
        fwd = -0.45 if k % 2 == 0 else 0.15
        compound(f'{n}-leaf-{k}', kit, coll, root, base, (sx, fwd, 0.4 - 0.15 * (z / h)), length * (1.05 - 0.3 * z / h), size, kit.leaf_dark if k % 3 == 1 else kit.leaf)
    top = spine[-1]
    for k, d in enumerate([(-0.5, -0.3, 1.0), (0.55, -0.2, 1.0), (0.0, -0.6, 0.8)]):
        leaf(f'{n}-top-{k}', kit.leaf, coll, root, top, d, size * 1.0, size * 0.6, N0, thick=0.035, teeth=(9, 0.08))
    flower_at = None
    if stage == 'flower':
        for k, (z, sx) in enumerate([(0.95, 1), (1.3, -1), (1.6, 1)]):
            base = on_spine(z)
            at = base + Vector((sx * 0.5, -0.45, 0.15))
            rod(f'{n}-truss-{k}', base, at, 0.03, kit.stem, coll, root)
            fl = star_flowers(f'{n}-flowers-{k}', kit, coll, root, at, 3 if k != 1 else 2)
            if k == 2:
                flower_at = fl[1]
    if stage == 'fruit':
        for k, a in enumerate(kit.A):
            base = on_spine(min(a.z + 0.5, h - 0.05))
            path(f'{n}-truss-{k}', [base, (base + a) / 2 + Vector((0, 0, 0.45)), a], 0.045, 0.038, kit.stem, coll, root, n=8)
    mound(kit, coll, root, s)
    return flower_at


def plant_lemon(kit, coll, root, stage):
    n = coll.name
    rnd = random.Random(f'{n}')
    if stage == 'small':
        path(f'{n}-trunk', [(0, 0, -0.05), (0.05, 0.0, 0.35), (0.0, 0.0, 0.7)], 0.07, 0.05, kit.bark, coll, root, n=6)
        for k in range(9):
            a = math.radians(-165 + 330 * k / 8)
            d = Vector((math.sin(a), -0.35, math.cos(a) * 0.9 + 0.35))
            leaf(f'{n}-leaf-{k}', kit.soft if k % 2 else kit.soft_dark, coll, root, (0.0, 0.0, 0.66 - 0.05 * (k % 3)), d, 0.5, 0.3, N0, thick=0.04, curl=0.1)
        mound(kit, coll, root, 1.0)
        return None
    big = stage == 'fruit'
    a1 = kit.A[1]
    if big:
        cz = a1.z - 0.6
        blobs = [((0.0, 0.4, cz), (1.0, 0.75, 0.82)), ((-0.85, 0.35, cz - 0.3), (0.62, 0.58, 0.58)), ((0.85, 0.35, cz - 0.3), (0.62, 0.58, 0.58)),
                 ((-0.42, 0.35, cz + 0.5), (0.6, 0.55, 0.55)), ((0.42, 0.35, cz + 0.5), (0.6, 0.55, 0.55))]
        trunk_top = cz - 0.45
    else:
        cz = 1.4
        blobs = [((0.0, 0.35, cz), (0.8, 0.6, 0.66)), ((-0.62, 0.3, cz - 0.25), (0.5, 0.48, 0.48)), ((0.62, 0.3, cz - 0.25), (0.5, 0.48, 0.48)),
                 ((0.0, 0.3, cz + 0.48), (0.5, 0.45, 0.45))]
        trunk_top = cz - 0.35
    path(f'{n}-trunk', [(0, 0.1, -0.05), (0.1, 0.15, trunk_top * 0.5), (0.0, 0.3, trunk_top + 0.2)], 0.13 if big else 0.1, 0.09, kit.bark, coll, root, n=8)
    for sx in (-1, 1):
        path(f'{n}-branch-{sx}', [(0.0, 0.25, trunk_top * 0.7), (0.3 * sx, 0.28, trunk_top * 0.85), (0.55 * sx, 0.32, trunk_top + 0.25)], 0.07, 0.05, kit.bark, coll, root, n=5)
    for k, (c, r) in enumerate(blobs):
        # One crown: the front blobs share one green; a darker blob behind gives it depth.
        blob(f'{n}-canopy-{k}', kit.soft, coll, root, c, r, seg=(40, 20))
    cb, rb = blobs[0]
    blob(f'{n}-canopy-back', kit.soft_dark, coll, root, (cb[0], cb[1] + 0.35, cb[2] - 0.1), (rb[0] * 1.45, rb[1], rb[2] * 1.2), seg=(40, 20))
    # A few soft leaves around the crown's rim, flat towards the camera (a tidy picture-book tree, never a shaggy blob).
    c0, r0 = blobs[0]
    rim = 12 if big else 9
    face = Vector((0.0, -0.9, 0.42)).normalized()
    for k in range(rim):
        a = math.radians(-30 + 240 * k / (rim - 1))
        d = Vector((math.cos(a), 0.0, math.sin(a)))
        rx = r0[0] + (0.55 if big else 0.4)
        rz = r0[2] + (0.35 if big else 0.25)
        p = Vector((c0[0] + d.x * rx * 0.86, c0[1] - 0.35, c0[2] + d.z * rz * 0.86))
        leaf(f'{n}-rim-{k}', kit.soft_dark if k % 2 else kit.soft, coll, root, p, d, 0.42 if big else 0.34, 0.26 if big else 0.21, face, thick=0.04, curl=0.05)
    # A light shine on the crown (soft, toy-like).
    blob(f'{n}-shine', kit.shine, coll, root, (c0[0] - r0[0] * 0.35, c0[1] - r0[1] * 0.9, c0[2] + r0[2] * 0.45), (r0[0] * 0.28, 0.04, r0[2] * 0.18), seg=(24, 10))
    flower_at = None
    if stage == 'flower':
        for k, (x, z) in enumerate([(-0.4, cz + 0.2), (0.32, cz - 0.08), (-0.75, cz - 0.3), (0.72, cz - 0.38), (0.05, cz + 0.62), (0.05, cz - 0.42)]):
            c, r = blobs[0]
            yy = c[1] - r[1] * math.sqrt(max(0.05, 1 - (x / r[0]) ** 2 - ((z - c[2]) / r[2]) ** 2)) - 0.22
            fc = flower(f'{n}-flower-{k}', coll, root, (x, yy, z), (0.0, -0.8, 0.6), 0.27, kit.white, kit.yellow)
            if k == 1:
                flower_at = fc
    if stage == 'fruit':
        for k, a in enumerate(kit.A):
            top = a + Vector((0.08 if a.x >= 0 else -0.08, 0.4, 0.55))
            path(f'{n}-fstem-{k}', [top, a + Vector((0, 0.1, 0.35)), a], 0.04, 0.035, kit.stem, coll, root, n=6)
            leaf(f'{n}-fleaf-{k}', kit.soft, coll, root, top + Vector((0, -0.2, -0.08)), (1.0 if a.x >= 0 else -1.0, -0.5, 0.15), 0.42, 0.25, N0, thick=0.04)
    mound(kit, coll, root, 1.4 if big else 1.2)
    return flower_at


def hoop(kit):
    """The bamboo hoop over the watermelon: an ellipse through points 0.55 above the side fruits and the middle one."""
    a0, a1 = kit.A[0], kit.A[1]
    lift = 0.55
    b = a1.z + lift
    a = abs(a0.x) / math.sqrt(max(0.05, 1.0 - ((a0.z + lift) / b) ** 2))
    return a, b


HOOP_Y = -0.12


def hoop_point(a, b, t):
    return Vector((a * math.cos(t), HOOP_Y, b * math.sin(t)))


def plant_watermelon(kit, coll, root, stage):
    n = coll.name
    big = stage == 'fruit'
    wleaf = dict(round_=True, teeth=(5, 0.17), curl=0.08, thick=0.04)
    flat = Vector((0.0, -0.3, 0.95)).normalized()
    if stage == 'small':
        for k, (x, y, z, s) in enumerate([(-0.55, -0.2, 0.22, 0.55), (0.6, -0.15, 0.25, 0.55), (-0.1, 0.15, 0.48, 0.5), (0.2, -0.4, 0.2, 0.48)]):
            tip = Vector((x, y, z))
            path(f'{n}-petiole-{k}', [(0, 0, 0.05), tip * 0.5 + Vector((0, 0, 0.12)), tip], 0.04, 0.034, kit.stem, coll, root, n=5)
            leaf(f'{n}-leaf-{k}', kit.leaf if k % 2 == 0 else kit.leaf_dark, coll, root, tip, (x, y - 0.2, 0.15), s, s * 0.95, flat, **wleaf)
        path(f'{n}-tendril', [(0.2, -0.1, 0.05), (0.9, -0.55, 0.05), (1.15, -0.3, 0.25), (1.0, -0.2, 0.34)], 0.025, 0.018, kit.stem, coll, root, n=10)
        mound(kit, coll, root, 1.0)
        return None
    # Vines along the soil both ways, with big lobed leaves lying on the soil.
    for sx in (-1, 1):
        end = Vector((1.8 * sx, -0.65, 0.05))
        pts = path(f'{n}-ground-vine-{sx}', [(0.1 * sx, 0, 0.06), (0.7 * sx, -0.7, 0.06), (1.2 * sx, -0.3, 0.06), end], 0.05, 0.04, kit.stem, coll, root, n=12)
        for j, idx in enumerate((3, 7, 11)):
            p = pts[idx]
            leaf(f'{n}-ground-leaf-{sx}-{j}', kit.leaf if j % 2 == 0 else kit.leaf_dark, coll, root, p + Vector((0, 0, 0.05)), (sx * 0.4, -0.6 if j % 2 else 0.5, 0.25), 0.62, 0.6, flat, **wleaf)
    a, b = hoop(kit)
    # The bamboo hoop (flower and fruit stages).
    ring = [hoop_point(a, b, math.pi * i / 48) for i in range(49)]
    ring.insert(0, ring[0] + Vector((0, 0, -0.3)))
    ring.append(ring[-1] + Vector((0, 0, -0.3)))
    tube(f'{n}-hoop', ring, 0.06, 0.06, kit.wood, coll, root)
    # The vine climbs the hoop: halfway up each side (flower) or all over it (fruit).
    reach = 1.0 if big else 0.55
    flower_at = None
    for sx, (t0, t1) in ((-1, (math.pi, math.pi * (1 - reach / 2))), (1, (0.0, math.pi * reach / 2))):
        steps = 18 if big else 10
        pts = []
        for i in range(steps * 3 + 1):
            t = t0 + (t1 - t0) * i / (steps * 3)
            q = hoop_point(a, b, t)
            wob = 0.07 * math.sin(i * 0.9)
            pts.append(q + Vector((wob * 0.4, -0.07, wob)))
        pts.insert(0, Vector((0.1 * sx, -0.05, 0.05)))
        tube(f'{n}-vine-{sx}', pts, 0.045, 0.035, kit.stem, coll, root)
        nodes = pts[1::3]
        for j in range(1, len(nodes), 2):
            p = nodes[j]
            out = Vector((p.x * 0.8, -0.8, (p.z / b) * 0.5 + 0.2))
            leaf(f'{n}-vine-leaf-{sx}-{j}', kit.leaf if j % 4 == 1 else kit.leaf_dark, coll, root, p + Vector((0, -0.06, 0)), out, 0.6 if big else 0.55, 0.58 if big else 0.52, (out.normalized() * 0.3 + N0).normalized(), **wleaf)
        if not big:
            fl = flower(f'{n}-flower-{sx}', coll, root, nodes[-1] + Vector((0.18 * sx, -0.25, 0.05)), N0, 0.27, kit.yellow, kit.heart, pointed=True)
            rod(f'{n}-pedicel-{sx}', nodes[-1], fl, 0.025, kit.stem, coll, root)
            fl2 = flower(f'{n}-flower2-{sx}', coll, root, nodes[4] + Vector((0.25 * sx, -0.3, 0.0)), N0, 0.24, kit.yellow, kit.heart, pointed=True)
            rod(f'{n}-pedicel2-{sx}', nodes[4], fl2, 0.025, kit.stem, coll, root)
            if sx == 1:
                flower_at = fl
        # Curly tendrils.
        p = nodes[len(nodes) // 2]
        torus(f'{n}-curl-{sx}', 0.1, 0.016, kit.stem, coll, root, p + Vector((0.18 * sx, -0.14, -0.05)), (90.0, 0.0, 0.0), arc=(0.0, 300.0))
    if big:
        for k, av in enumerate(kit.A):
            t = math.acos(max(-1.0, min(1.0, av.x / a)))
            top = hoop_point(a, b, t)
            path(f'{n}-fstem-{k}', [top, (top + av) / 2 + Vector((0.05, -0.05, 0.05)), av], 0.045, 0.038, kit.stem, coll, root, n=6)
            torus(f'{n}-fcurl-{k}', 0.08, 0.014, kit.stem, coll, root, top + Vector((0.16, -0.12, -0.1)), (90.0, 0.0, 0.0), arc=(0.0, 300.0))
    mound(kit, coll, root, 1.3)
    return flower_at


PLANTS = {'strawberry': plant_strawberry, 'tomato': plant_tomato, 'lemon': plant_lemon, 'watermelon': plant_watermelon}


def build_plants(params, sprites, kit, layout):
    flowers = {}
    for fruit in params['garden']['fruits']:
        group = sprite(sprites, f'plant-{fruit}', holdout_occluders=1, movable=1)
        pts_all = []
        for stage in params['garden']['stages']:
            child = bpy.data.collections.new(f'state.{fruit}-{stage}')
            child['bhc_state'] = stage
            group.children.link(child)
            root = empty(f'plant-{fruit}-{stage}-root', child, None, kit.O)
            if stage == 'sprout':
                sprout(kit, child, root, fruit)
                fl = None
            else:
                fl = PLANTS[fruit](kit, child, root, stage)
            if stage == 'flower':
                if fl is None:
                    fail(f'plant-{fruit}: its flower stage has no flower for the butterfly')
                flowers[fruit] = kit.O + Vector(fl)
            pts = world_pts(list(child.all_objects))
            pts_all += pts
            report(f'plant-{fruit}/{stage}', pts)
    for fruit, p in flowers.items():
        add_empty(f'anchor.flower-{fruit}', p, layout)
        log(f'anchor.flower-{fruit} {fmt_px(SCREEN.project(p))}')


# --- the fruit ------------------------------------------------------------------------------------------------------

def fruit_model(fruit, c, coll, name):
    """One fruit on a root empty at the origin (about 1 m across; `fit` sizes it)."""
    root = empty(f'{name}-root', coll)
    leafm = mat(c['leaf'], 0.45)
    if fruit == 'strawberry':
        holder = empty(f'{name}-holder', coll, root)
        mats = {'berry': mat(c['strawberry'], 0.3), 'seed': mat(c['strawberrySeed'], 0.5), 'berryLeaf': leafm}
        parts = ice.add_strawberry(holder, mats, coll)
        parts[0].location = (0.0, 0.0, 0.0)
        holder.rotation_euler = (0.0, math.pi, 0.0)
        rod(f'{name}-stalk', (0.0, 0.0, 0.25), (0.03, 0.0, 0.42), 0.03, mat(c['stem'], 0.5), coll, root)
    elif fruit == 'tomato':
        def ribs(d):
            phi = math.atan2(d.y, d.x)
            k = 1.0 + 0.05 * math.cos(6 * phi) * (1.0 - abs(d.z))
            z = d.z - 0.12 * max(0.0, d.z) ** 6
            return Vector((d.x * k, d.y * k, z))
        blob(f'{name}-body', mat(c['tomato'], 0.25), coll, root, (0.0, 0.0, 0.0), (0.5, 0.5, 0.42), shape=ribs, seg=(48, 24))
        top = Vector((0.0, 0.0, 0.36))
        for k in range(5):
            a = 2 * math.pi * k / 5 + 0.4
            d = Vector((math.cos(a), math.sin(a), -0.15))
            leaf(f'{name}-sepal-{k}', leafm, coll, root, top, d, 0.3, 0.12, Vector((0, 0, 1)), thick=0.025, curl=-0.1)
        rod(f'{name}-stalk', top, top + Vector((0.03, 0.0, 0.14)), 0.035, mat(c['stem'], 0.5), coll, root)
    elif fruit == 'lemon':
        body = empty(f'{name}-body-pivot', coll, root)
        body.rotation_euler = (0.0, math.radians(-18.0), 0.0)
        lm = mat(c['lemon'], 0.3)
        blob(f'{name}-body', lm, coll, body, (0.0, 0.0, 0.0), (0.56, 0.4, 0.41), seg=(48, 24))
        for sx in (-1, 1):
            blob(f'{name}-nub-{sx}', lm, coll, body, (0.55 * sx, 0.0, 0.0), (0.1, 0.09, 0.09), seg=(20, 10))
        top = Vector((0.08, 0.0, 0.38))
        rod(f'{name}-stalk', top - Vector((0, 0, 0.05)), top + Vector((0.0, 0.0, 0.1)), 0.03, mat(c['stem'], 0.5), coll, root)
        leaf(f'{name}-leaf', mat(c['leaf'], 0.3), coll, root, top + Vector((0, 0, 0.08)), (1.0, -0.2, 0.45), 0.42, 0.22, N0, curl=0.12)
    elif fruit == 'watermelon':
        rind = stripe_material(f'{name}-rind', c['watermelon'], c['watermelonStripe'])
        blob(f'{name}-body', rind, coll, root, (0.0, 0.0, 0.0), (0.52, 0.5, 0.46), seg=(56, 28))
        top = Vector((0.0, 0.0, 0.44))
        rod(f'{name}-stalk', top - Vector((0, 0, 0.04)), top + Vector((0.03, 0.0, 0.12)), 0.035, mat(c['stem'], 0.5), coll, root)
        torus(f'{name}-curl', 0.06, 0.012, mat(c['stem'], 0.5), coll, root, top + Vector((0.1, -0.02, 0.12)), (90.0, 0.0, 0.0), arc=(0.0, 300.0))
    else:
        fail(f'unknown fruit "{fruit}"')
    return root


def build_fruit(params, sprites, c):
    rects = {}
    for k, fruit in enumerate(params['garden']['fruits']):
        coll = sprite(sprites, f'fruit-{fruit}')
        root = fruit_model(fruit, c, coll, f'fruit-{fruit}')
        root.location = (0.0, -3.0 + 0.2 * k, 0.0)
        r = fit(root, FRUIT_LONGEST_PX, FRUIT_PX[1])
        rects[fruit] = r
        log(f'fruit-{fruit} {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')
    return rects


def build_packets(params, sprites, c):
    paper, band = mat(c['packet'], 0.8), mat(c['packetBand'], 0.6)
    window = mat(c['sky'], 0.6)
    seed = mat(c['seed'], 0.6)
    for k, fruit in enumerate(params['garden']['fruits']):
        coll = sprite(sprites, f'packet-{fruit}')
        name = f'packet-{fruit}'
        root = billboard(f'{name}-root', coll)
        rbox(f'{name}-paper', (1.0, 0.08, 1.3), 0.07, paper, coll, root, (0.0, 0.0, 0.0))
        rbox(f'{name}-band', (1.02, 0.1, 0.26), 0.05, band, coll, root, (0.0, 0.0, 0.5))
        for j in range(9):
            blob(f'{name}-crimp-{j}', band, coll, root, (-0.44 + 0.11 * j, 0.0, 0.65), (0.06, 0.05, 0.05), seg=(12, 8))
        blob(f'{name}-window', window, coll, root, (0.0, -0.045, -0.08), (0.4, 0.02, 0.4), seg=(40, 8))
        for j, x in enumerate((-0.22, 0.0, 0.22)):
            blob(f'{name}-seed-{j}', seed, coll, root, (x, -0.05, -0.53), (0.05, 0.02, 0.075), seg=(12, 8))
        f = fruit_model(fruit, c, coll, f'{name}-fruit')
        f.parent = root
        f.location = (0.0, -0.35, -0.08)
        f.scale = (0.6, 0.6, 0.6)
        anchor = PACKET_PX[k % 2]
        root.location = pt(anchor[0], anchor[1], -3.5 - 0.3 * k)
        r = fit(root, PACKET_LONGEST_PX, anchor)
        log(f'packet-{fruit} {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')


# --- the watering can -----------------------------------------------------------------------------------------------

def build_can(sprites, c, layout, pour_deg):
    coll = sprite(sprites, 'can', movable=1)
    root = empty('can-root', coll)
    body, dark = mat(c['can'], 0.3), mat(c['canDark'], 0.3)
    lathe('can-body', rounded_profile(0.42, 0.0, 0.74, 0.3), body, coll, root)
    torus('can-band', 0.425, 0.035, dark, coll, root, (0.0, 0.0, 0.16))
    blob('can-lid', dark, coll, root, (0.0, 0.0, 0.74), (0.3, 0.3, 0.1), seg=(32, 12))
    blob('can-knob', body, coll, root, (0.0, 0.0, 0.84), (0.07, 0.07, 0.05), seg=(16, 8))
    spout_base, tip = Vector((0.3, 0.0, 0.28)), Vector((0.98, 0.0, 0.8))
    rod('can-spout', spout_base, tip, 0.065, body, coll, root)
    d = (tip - spout_base).normalized()
    rose = rod('can-rose', tip - d * 0.02, tip + d * 0.1, 0.13, dark, coll, root)
    torus('can-handle', 0.3, 0.05, dark, coll, root, (-0.42, 0.0, 0.6), (90.0, 0.0, 0.0), arc=(0.0, 270.0))
    # A little white flower on the front.
    flower('can-decal', coll, root, (0.0, -0.43, 0.38), (0.0, -1.0, 0.1), 0.16, mat(c['flower'], 0.5), mat(c['flowerHeart'], 0.4))
    ground_y = gy(CAN_PX[1])
    root.location = (wx(CAN_PX[0]), ground_y, 0.0)
    r = SCREEN.rect(world_pts(meshes_of(root)))
    k = CAN_LONGEST_PX / max(r[2] - r[0], r[3] - r[1])
    root.scale = (k, k, k)
    pts = world_pts(meshes_of(root))
    xs = [p.x for p in pts]
    root.location = (root.location.x + wx(CAN_PX[0]) - (min(xs) + max(xs)) / 2, ground_y, -min(p.z for p in pts) + root.location.z)
    pts = world_pts(meshes_of(root))
    r = report('can', pts)
    centre = ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
    bpy.context.view_layer.update()
    tip_w = root.matrix_world @ (tip + d * 0.12)
    tip_px = SCREEN.project(tip_w)
    off = (tip_px[0] - centre[0], tip_px[1] - centre[1])
    t = math.radians(pour_deg)  # clockwise on screen (y down)
    rot = (off[0] * math.cos(t) - off[1] * math.sin(t), off[0] * math.sin(t) + off[1] * math.cos(t))
    pour = (SPOUT_TARGET_PX[0] - rot[0], SPOUT_TARGET_PX[1] - rot[1])
    spout = (SPOUT_TARGET_PX[0], SPOUT_TARGET_PX[1] + SPOUT_DROP_PX)
    add_empty('anchor.pour', pt(pour[0], pour[1], -2.0), layout)
    add_empty('anchor.spout', pt(spout[0], spout[1], -2.0), layout)
    log(f'can centre {fmt_px(centre)}, spout tip offset {fmt_px(off)}; anchor.pour {fmt_px(pour)}, anchor.spout {fmt_px(spout)}')
    return r


# --- particles and surprises ----------------------------------------------------------------------------------------

def drop_shape(d):
    """A teardrop, its point up."""
    t = (d.z + 1.0) / 2.0
    k = 1.0 - 0.85 * t ** 2.2
    return Vector((d.x * k, d.y * k, d.z * 1.25))


def build_particles(sprites, c, colours):
    spots = {}
    x = 120.0

    def at(name):
        nonlocal x
        p = (x, 110.0)
        x += 85.0
        return p

    def drop_like(name, colour, size, rough=0.15, shape=drop_shape):
        coll = sprite(sprites, name)
        root = billboard(f'{name}-root', coll)
        blob(f'{name}-body', mat(colour, rough), coll, root, (0.0, 0.0, 0.0), (0.5, 0.5, 0.5), shape=shape, seg=(32, 16))
        blob(f'{name}-shine', mat(c['flower'], 0.2), coll, root, (-0.17, -0.42, -0.05), (0.09, 0.05, 0.14), seg=(16, 8))
        p = at(name)
        root.location = pt(p[0], p[1], -4.0)
        spots[name] = fit(root, size, p)
        return root

    for name, colour in (('drop', c['drop']), ('juice', c['juice'])):
        drop_like(name, colour, PARTICLE_PX[name])
    # The seed (a brown oval) and the watermelon pip (a black teardrop, point up).
    for name, colour, size, shape in (('seed', c['seed'], PARTICLE_PX['seed'], None), ('pip', c['pip'], PARTICLE_PX['pip'], drop_shape)):
        coll = sprite(sprites, name)
        root = billboard(f'{name}-root', coll)
        if shape is None:
            blob(f'{name}-body', mat(colour, 0.5), coll, root, (0.0, 0.0, 0.0), (0.5, 0.35, 0.7), (0.0, 25.0, 0.0), seg=(24, 12))
        else:
            blob(f'{name}-body', mat(colour, 0.3), coll, root, (0.0, 0.0, 0.0), (0.45, 0.35, 0.45), shape=shape, seg=(24, 12))
        p = at(name)
        root.location = pt(p[0], p[1], -4.0)
        fit(root, size, p)
    # Heart and sparkle: puffy flat shapes.
    for name, loop, colour in (('heart', heart_loop(0.5), c['heart']), ('sparkle', star_loop(0.5, 0.17, points=4), c['sparkle'])):
        coll = sprite(sprites, name)
        root = billboard(f'{name}-root', coll)
        flat_shape(f'{name}-body', loop, 0.16, mat(colour, 0.3), coll, root)
        blob(f'{name}-shine', mat(c['flower'], 0.2), coll, root, (-0.15 if name == 'heart' else -0.06, -0.09, 0.22 if name == 'heart' else 0.12), (0.07, 0.02, 0.05), seg=(12, 8))
        p = at(name)
        root.location = pt(p[0], p[1], -4.0)
        fit(root, PARTICLE_PX[name], p)
    build_butterfly(sprites, c, at('butterfly'))
    build_worm(sprites, c, colours, at('worm'))
    return spots


def build_butterfly(sprites, c, px):
    coll = sprite(sprites, 'butterfly', states=json.dumps({'idle': [1], 'flap': [2]}, separators=(',', ':')))
    root = billboard('butterfly-root', coll)
    wing, dot, bodym = mat(c['butterfly'], 0.45), mat(c['butterflyDot'], 0.5), mat(c['butterflyBody'], 0.5)
    rod('butterfly-body', (0.0, 0.0, -0.32), (0.0, 0.0, 0.25), 0.07, bodym, coll, root)
    blob('butterfly-head', bodym, coll, root, (0.0, -0.01, 0.32), (0.1, 0.1, 0.1), seg=(20, 10))
    for sx in (-1, 1):
        rod(f'butterfly-antenna-{sx}', (0.03 * sx, 0.0, 0.38), (0.16 * sx, 0.0, 0.62), 0.014, bodym, coll, root)
        blob(f'butterfly-antenna-tip-{sx}', bodym, coll, root, (0.16 * sx, 0.0, 0.62), (0.035, 0.035, 0.035), seg=(12, 8))
        pivot = empty(f'butterfly-wings-{sx}', coll, root, (0.04 * sx, 0.02, 0.0))
        blob(f'butterfly-upper-{sx}', wing, coll, pivot, (0.36 * sx, 0.0, 0.18), (0.36, 0.03, 0.3), (0.0, 25.0 * sx, 0.0), seg=(32, 12))
        blob(f'butterfly-lower-{sx}', wing, coll, pivot, (0.26 * sx, 0.0, -0.2), (0.22, 0.03, 0.2), (0.0, -20.0 * sx, 0.0), seg=(32, 12))
        blob(f'butterfly-dot-{sx}', dot, coll, pivot, (0.42 * sx, -0.035, 0.22), (0.09, 0.01, 0.08), seg=(16, 8))
        blob(f'butterfly-dot2-{sx}', dot, coll, pivot, (0.26 * sx, -0.035, -0.2), (0.06, 0.01, 0.06), seg=(16, 8))
        for f, ang in ((1, 0.0), (2, 62.0 * sx)):
            pivot.rotation_euler = (0.0, 0.0, math.radians(ang))
            pivot.keyframe_insert('rotation_euler', frame=f)
        key_constant(pivot)
    eye = mat(c['pip'], 0.2)
    for sx in (-1, 1):
        blob(f'butterfly-eye-{sx}', eye, coll, root, (0.045 * sx, -0.09, 0.34), (0.025, 0.01, 0.03), seg=(12, 8))
    bpy.context.scene.frame_set(1)
    root.location = pt(px[0], px[1], -4.0)
    r = fit(root, PARTICLE_PX['butterfly'], px)
    log(f'butterfly {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')


def build_worm(sprites, c, colours, px):
    coll = sprite(sprites, 'worm')
    root = billboard('worm-root', coll)
    pink, light = mat(c['worm'], 0.4), mat(c['wormLight'], 0.4)
    rod('worm-body', (0.0, 0.0, -0.2), (0.0, 0.0, 0.42), 0.17, pink, coll, root)
    blob('worm-head', pink, coll, root, (0.0, 0.0, 0.5), (0.22, 0.2, 0.2), seg=(32, 16))
    for k, z in enumerate((-0.05, 0.12)):
        torus(f'worm-ring-{k}', 0.168, 0.025, light, coll, root, (0.0, 0.0, z))
    face = {'iconInk': colours['iconInk'], 'white': '#FFFFFF', 'tintPink': colours['tintPink']}
    eyes = [((sx * 0.08, -0.17, 0.55), (sx * 0.3, -1.0, 0.1)) for sx in (-1, 1)]
    cheeks = [((sx * 0.14, -0.15, 0.45), (sx * 0.5, -1.0, 0.0)) for sx in (-1, 1)]
    chibi_face('worm-face', root, coll, face, eyes, 0.06, cheeks, ((0.0, -0.2, 0.45), (0.0, -1.0, 0.0), 0.07))
    root.location = pt(px[0], px[1], -4.0)
    r = fit(root, PARTICLE_PX['worm'], px)
    log(f'worm {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')


def build_rainbow(sprites, c):
    coll = sprite(sprites, 'rainbow')
    root = billboard('rainbow-root', coll)
    bands = [c[f'rainbow{k}'] for k in range(1, 7)]
    minor = 0.085
    for k, colour in enumerate(bands):
        torus(f'rainbow-band-{k}', RAINBOW_RADIUS - minor - k * 2 * minor * 0.98, minor, mat(colour, 0.45), coll, root, (0.0, 0.0, 0.0), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    white = mat(c['fence'], 0.8)
    mid = RAINBOW_RADIUS - 6 * minor
    for sx in (-1, 1):
        for j, (dx, dz, r) in enumerate([(-0.22, 0.0, 0.2), (0.0, 0.08, 0.26), (0.22, 0.0, 0.2)]):
            blob(f'rainbow-cloud-{sx}-{j}', white, coll, root, (sx * mid + dx, -0.15, dz + 0.02), (r, 0.15, r * 0.85), seg=(24, 12))
    root.location = pt(RAINBOW_CENTRE_PX[0], RAINBOW_CENTRE_PX[1], RAINBOW_Y)
    report('rainbow', world_pts(meshes_of(root)))


# --- Shiba ----------------------------------------------------------------------------------------------------------

def build_shiba(params, sprites):
    colours = {**params['colours'], 'creatureLight': params['art']['creatureLight']}
    coll = sprite(sprites, 'shiba', states=json.dumps(STATES, separators=(',', ':')), holdout_occluders=1, movable=1)
    mats = chibi_materials(colours, colours['creatureOrange'], colours['creatureLight'])
    rig = chibi('dog', 'shiba', coll, mats)
    # Puffed cheeks (the giant bite): blobs on the head pivot, shown in the puff frame only.
    puffs = []
    for sx in (-1, 1):
        p = blob(f'shiba-puff-{sx}', mats['light'], coll, rig['head'], (0.35 * sx, -0.41, 0.19), (0.21, 0.19, 0.18), seg=(32, 16))
        p['cute'] = 1
        puffs.append(p)
    root = rig['root']
    root.location = (wx(SHIBA_PX[0]), gy(SHIBA_PX[1]), 0.0)
    root.rotation_euler = (0.0, 0.0, math.radians(SHIBA_YAW))
    for f in ALL_FRAMES:
        for p in puffs:
            p.scale = (1.0, 1.0, 1.0) if f in PUFF else (0.0001, 0.0001, 0.0001)
            p.keyframe_insert('scale', frame=f)
    for p in puffs:
        key_constant(p)
    def key(f, head_pitch=0.0, **kw):
        key_chibi(rig, f, head_pitch=head_pitch + HEAD_UP, **kw)

    key(IDLE[0], eyes='open')
    key(CHEW[0], head_pitch=9.0, head_roll=3.0, tail=10.0, eyes='squint')
    key(CHEW[1], head_pitch=-4.0, head_roll=-3.0, tail=-10.0, bob=0.02, eyes='squint')
    for i, f in enumerate(HAPPY):
        side = 1 if i % 2 == 0 else -1
        key(f, head_pitch=-6.0, head_roll=6.0 * side, tail=22.0 * side, tongue=True, bob=0.05 * i, eyes='shut')
    for i, f in enumerate(SOUR):
        side = 1 if i % 2 == 0 else -1
        key(f, head_pitch=12.0, head_roll=11.0 * side, head_yaw=6.0 * side, tail=-8.0 * side, eyes='shut')
    key(PUFF[0], head_pitch=-3.0, tail=14.0, eyes='squint')
    bpy.context.scene.frame_set(IDLE[0])
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    r = SCREEN.rect(world_pts(meshes))
    k = SHIBA_HEIGHT_PX / (r[3] - r[1])
    root.scale = (k, k, k)
    report('shiba idle', world_pts(meshes))
    return rig, coll


def build_layout(params, rig, shiba_coll, layout, kit):
    meshes = [o for o in shiba_coll.all_objects if o.type == 'MESH']
    pts = []
    for f in ALL_FRAMES:
        bpy.context.scene.frame_set(f)
        pts += world_pts(meshes)
    bpy.context.scene.frame_set(IDLE[0])
    base = world_pts(meshes)
    tall = bpy.data.collections.get('sprite.shiba-party-hat')
    hat = world_pts(list(tall.all_objects)) if tall else []
    hull_object('hit.shiba', pts + hat, layout)
    report('hit.shiba', pts + hat)
    xs, ys = [p.x for p in base], [p.y for p in base]
    shiba = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(p.z for p in base)))
    add_empty('anchor.shiba', shiba, layout)
    nose = rig['nose'].matrix_world.translation
    npx = SCREEN.project(nose)
    mouth = (npx[0] + MOUTH_OFFSET_PX[0], npx[1] + MOUTH_OFFSET_PX[1])
    add_empty('anchor.mouth', pt(mouth[0], mouth[1], nose.y - 1.0), layout)
    add_empty('anchor.plant', kit.O, layout)
    worm = Vector((wx(WORM_PX_X), WORM_Y, SOIL_Z))
    add_empty('anchor.worm', worm, layout)
    for k, a in enumerate(PACKET_PX):
        add_empty(f'anchor.packet-{k}', pt(a[0], a[1], -3.5), layout)
    for k, a in enumerate(kit.A):
        add_empty(f'anchor.fruit-{k}', kit.O + a, layout)
    log(f'anchor.shiba {fmt_px(SCREEN.project(shiba))}, anchor.mouth {fmt_px(mouth)} (nose {fmt_px(npx)}), anchor.plant {fmt_px(SCREEN.project(kit.O))}, anchor.worm {fmt_px(SCREEN.project(worm))}')


def main():
    global DESIGN, SCREEN
    args = parse_args('build_garden', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    check_items(params['outfit'])
    g = params['garden']
    if g['fruitsPerPlant'] != len(FRUIT_PX) or g['packets'] != len(PACKET_PX):
        fail(f'fruitsPerPlant {g["fruitsPerPlant"]} / packets {g["packets"]} do not match FRUIT_PX / PACKET_PX')
    c = params['art']['garden']
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(IDLE[0])
    setup_camera(scene)
    bpy.context.view_layer.update()
    SCREEN = Screen(scene)
    plate = bpy.data.collections.new('garden-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_yard(c, plate)
    build_bed(c, plate)
    kit = Kit(c, [pt(x, y, FRUIT_Y) for x, y in FRUIT_PX])
    build_plants(params, sprites, kit, layout)
    build_fruit(params, sprites, c)
    build_packets(params, sprites, c)
    build_can(sprites, c, layout, POUR_DEG)
    build_particles(sprites, c, params['colours'])
    build_rainbow(sprites, c)
    rig, shiba_coll = build_shiba(params, sprites)
    dress(rig, shiba_coll, params['art']['dressUp'], params['outfit'])
    build_layout(params, rig, shiba_coll, layout, kit)
    scene.frame_set(IDLE[0])
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    log(f'saved {args["out"]}')


if __name__ == '__main__':
    main()
