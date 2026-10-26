# Builds art/band.blend (Ban nhạc, Story 7.3) from the vendored island art/src/map-v3.blend (only its render
# settings, world and Sun are kept).
#
# Run by `npm run art:build -- band` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_band.py -- \
#     --out <tmp>/band.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), art (art.band for the stage and the instruments,
# art.touchTalk for the lawn, sky and haze), design size, renderScale.
#
# One plate, 2048×1536: a low wooden stage on the yard's lawn (the picnic lawn's palette) with a lilac curtain
# backdrop, a yellow scalloped valance and a bunting of flags, Pretty Park street lanterns at its front corners,
# Tiny Treats Homely House trees, bushes and fences hazed behind, Pretty Park grass and flowers on the lawn, a
# gradient sky with clouds. Five instruments stand on the stage, each its own `sprite.<id>` (idle at frame 1; the
# runtime bounce is a scale motion around the ground pivot, the bob a small lift), with `hit.<id>` (convex hull of
# its meshes) and `anchor.<id>` (its ground pivot) in the hidden `layout` collection:
#   - drum (front left): a red drum with white rims, gold lugs and two sticks resting on its head (script-built);
#   - horn (back left): a golden toy trumpet on a little blue stand, its bell toward the camera (script-built);
#   - frog (back centre): the singer — a real Quaternius frog (Frog.glb, its Idle pose, source colours) on an orange
#     stool (script-built);
#   - xylophone (front right): five rainbow bars on a wooden frame, tilted toward the camera, two pink mallets;
#   - bell (back right): a gold bell with a clapper and a red bow, hanging in a small blue arch stand.
# Each instrument is fitted into its BOXES box (design px; bottom edge = its ground line on the stage) by
# unprojecting through the camera, so the layout is exactly what tools/layout/rules.ts › validateBand checks (hulls
# inside the interactive rect, clear of the Home/Speaker zones, ≥ targetGap apart, each frame ≥ 150 px).
# Every constant is in Blender world units (metres) unless its name says otherwise.
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, import_joined, lathe, mat, mesh_obj, rbox, rod, rounded_profile, soften_scene, torus, tt_model  # noqa: E402
from common import add_empty, eval_world_verts, flat_material, force_opaque, hex_to_linear, hull_object, key_constant, move_to, parse_args, principled  # noqa: E402

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main
IDLE_FRAME = 1

# --- the camera: a little above a child's eye, looking across the stage --------------------------------------
CAM_LOC = (0.0, -9.0, 4.2)
CAM_TARGET = (0.0, 2.0, -0.4)
CAM_LENS = 30.0

# --- the stage ------------------------------------------------------------------------------------------------
STAGE_H = 0.35  # the stage floor's height above the lawn (the instruments stand on it)
STAGE_MARGIN_X = 1.3  # the floor reaches this far past the outermost instrument boxes
STAGE_FRONT = 0.9  # … this far in front of the front row's ground line
STAGE_BACK = 1.6  # … and this far behind the back row's ground line (the curtain stands there)
BOARD_W = 0.42  # floor boards (darker grooves between them)
CURTAIN_H = 4.4  # the backdrop's height above the stage floor
DRAPE_W = 1.5  # each side drape's half width
VALANCE_SCALLOPS = 11
FLAGS = 13
FLAG_SAG = 0.55  # the bunting string sags this much in the middle

# --- the dressing (Tiny Treats Homely House / Pretty Park) ---------------------------------------------------
GROUND_HALF = 80.0
GRASS_Y = (-8.0, 22.0)  # grassNear → verge (art.touchTalk)
TREES = [(-9.5, 9.5, 'tree_large', 1.6), (-6.6, 11.5, 'tree', 1.4), (6.8, 11.0, 'tree', 1.5), (9.8, 9.0, 'tree_large', 1.7), (-13.0, 12.5, 'tree', 1.6), (13.5, 12.0, 'tree_large', 1.4), (0.0, 14.0, 'tree_large', 1.5)]
BUSHES = [(-8.2, 5.5, 1.2), (8.4, 5.6, 1.2), (-10.8, 6.8, 1.1), (10.9, 6.6, 1.1)]
FENCE_Y = 8.6
FENCE_SCALE = 1.6
FENCE_STEP = 2.0  # module width × FENCE_SCALE (Homely House fence modules are 1.25 wide)
FENCE_X = [(-16.0, -6.0), (6.0, 16.0)]
TUFTS = 34
FLOWERS = 26
SEED = 37
HAZE = (0.3, 0.6)  # (fac, saturation) of the far backdrop (trees, bushes, fences)
NEAR_HAZE = (0.08, 0.92)
SKY_GRADIENT_Z = (0.0, 26.0)
SKY_EMISSION = 1.1
CLOUDS = [(-30.0, 120.0, 22.0, 5.0), (-2.0, 130.0, 27.0, 4.2), (28.0, 120.0, 23.0, 5.5)]
LANTERN_SCALE = 0.55
CORNER_PROPS_PX = [(70, 600), (955, 600)]  # design px of the front-corner lanterns and bushes (on the stage floor)

# --- the instruments: design-px boxes (x0, y0, x1, y1), y1 = the ground line on the stage; each fills its box ---------
# Back row: horn, frog, bell; front row: drum, xylophone. Padded by hitPad (24) each hull stays inside the interactive
# rect (x 24…1000, y 66…694), off the Home/Speaker zones (top corners) and ≥ targetGap (24) from the others.
BOXES = {
    'drum': (190, 470, 440, 664),
    'horn': (130, 215, 330, 392),
    'frog': (410, 200, 610, 392),
    'xylophone': (540, 492, 830, 664),
    'bell': (690, 210, 868, 392),
}
PLACE_PASSES = 6
FRONT_ROW_PX = 500  # a box whose ground line is below this (design px) is in the front row
# Yaw (degrees) of each instrument's root (0 = its front toward the camera).
YAW = {'drum': 0.0, 'horn': 0.0, 'frog': 15.0, 'xylophone': 0.0, 'bell': 0.0}
FROG = os.path.join('quaternius', 'frog', 'Frog.glb')
JUNK_MESHES = ('Icosphere',)  # the Poly Pizza glTF exports carry a stray unit icosphere


def fail(msg):
    raise RuntimeError(f'build_band: {msg}')


# --- scene helpers (as build_home.py) -------------------------------------------------------------------------

def clear_island(scene):
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


def make_camera(scene):
    data = bpy.data.cameras.new('CamBand')
    data.lens = CAM_LENS
    cam = bpy.data.objects.new('CamBand', data)
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


def unproject(scene, px, py, z):
    cam = scene.camera
    tr, br, bl, tl = [cam.matrix_world @ v for v in cam.data.view_frame(scene=scene)]
    u, v = px / DESIGN[0], py / DESIGN[1]
    top = tl + (tr - tl) * u
    bot = bl + (br - bl) * u
    d = (top + (bot - top) * v - cam.location).normalized()
    t = (z - cam.location.z) / d.z
    return cam.location + d * t


def _socket(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def gradient_material(name, axis, v0, v1, hex0, hex1, rough=0.6, emit=False, noise=None):
    """hex0 at object `axis` = v0 blending to hex1 at v1 (smoothstep); `emit`: unlit (the sky)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = principled(m)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = v0
    mr.inputs['From Max'].default_value = v1
    nt.links.new(sep.outputs[axis.upper()], mr.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(mr.outputs['Result'], _socket(mix.inputs, 'Factor_Float'))
    _socket(mix.inputs, 'A_Color').default_value = hex_to_linear(hex0)
    _socket(mix.inputs, 'B_Color').default_value = hex_to_linear(hex1)
    colour = _socket(mix.outputs, 'Result_Color')
    if noise is not None:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = noise[0]
        fac = nt.nodes.new('ShaderNodeMath')
        fac.operation = 'MULTIPLY'
        nt.links.new(tex.outputs['Fac'], fac.inputs[0])
        fac.inputs[1].default_value = noise[1]
        mix2 = nt.nodes.new('ShaderNodeMix')
        mix2.data_type = 'RGBA'
        nt.links.new(fac.outputs[0], _socket(mix2.inputs, 'Factor_Float'))
        nt.links.new(colour, _socket(mix2.inputs, 'A_Color'))
        _socket(mix2.inputs, 'B_Color').default_value = hex_to_linear(hex0)
        colour = _socket(mix2.outputs, 'Result_Color')
    if emit:
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(colour, em.inputs['Color'])
        em.inputs['Strength'].default_value = SKY_EMISSION
        nt.links.new(em.outputs[0], out.inputs['Surface'])
    else:
        nt.links.new(colour, bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = rough
    return m


def haze(objs, hex_haze, fac, sat):
    """Desaturates the objects' materials (copied) to `sat` and blends them `fac` towards the haze colour."""
    done = {}
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.name.endswith('-haze'):
                continue
            if m.name not in done:
                c = m.copy()
                c.name = f'{m.name}-haze'
                b = principled(c)
                if b is not None:
                    nt = c.node_tree
                    inp = b.inputs['Base Color']
                    h = hex_to_linear(hex_haze)
                    if inp.links:
                        src = inp.links[0].from_socket
                        hs = nt.nodes.new('ShaderNodeHueSaturation')
                        hs.inputs['Saturation'].default_value = sat
                        nt.links.new(src, hs.inputs['Color'])
                        mix = nt.nodes.new('ShaderNodeMix')
                        mix.data_type = 'RGBA'
                        _socket(mix.inputs, 'Factor_Float').default_value = fac
                        nt.links.new(hs.outputs['Color'], _socket(mix.inputs, 'A_Color'))
                        _socket(mix.inputs, 'B_Color').default_value = h
                        nt.links.new(_socket(mix.outputs, 'Result_Color'), inp)
                    else:
                        base = inp.default_value
                        grey = sum(base[:3]) / 3
                        inp.default_value = tuple((grey + (base[i] - grey) * sat) * (1 - fac) + h[i] * fac for i in range(3)) + (1.0,)
                done[m.name] = c
            slot.material = done[m.name]


class Kit:
    """Imports each Tiny Treats / KayKit model once and places linked copies of it."""

    def __init__(self, coll):
        self.coll = coll
        self.src = {}

    def put(self, stem, pack, name, loc, scale=1.0, yaw=0.0):
        key = (stem, pack)
        if key not in self.src:
            o = import_joined(tt_model(stem, pack), name)
            move_to(o, self.coll)
            self.src[key] = o
        else:
            o = self.src[key].copy()
            o.name = name
            self.coll.objects.link(o)
        o.location = loc
        o.scale = (scale,) * 3 if isinstance(scale, (int, float)) else scale
        o.rotation_mode = 'XYZ'
        o.rotation_euler = (0.0, 0.0, math.radians(yaw))
        return o


def box(name, x0, x1, y0, y1, z0, z1, material, coll, radius=0.03):
    """An axis-aligned rounded box from its extents (world)."""
    return rbox(name, (x1 - x0, y1 - y0, z1 - z0), radius, material, coll, None, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))


def flat_poly(name, corners, material, coll, parent=None):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(c) for c in corners])
    o = mesh_obj(name, bm, material, coll, smooth=False)
    o.parent = parent
    return o


# --- the plate ----------------------------------------------------------------------------------------------

def stage_extent(scene):
    """The stage floor's world rect (x0, x1, y0, y1) covering every instrument box on the floor (z = STAGE_H)."""
    xs, ys_front, ys_back = [], [], []
    for (x0, _y0, x1, y1) in BOXES.values():
        for px in (x0, x1):
            p = unproject(scene, px, y1, STAGE_H)
            xs.append(p.x)
        p = unproject(scene, (x0 + x1) / 2, y1, STAGE_H)
        (ys_front if y1 > FRONT_ROW_PX else ys_back).append(p.y)
    return (min(xs) - STAGE_MARGIN_X, max(xs) + STAGE_MARGIN_X, min(ys_front) - STAGE_FRONT, max(ys_back) + STAGE_BACK)


def build_stage(scene, c, plate):
    x0, x1, y0, y1 = stage_extent(scene)
    wood, dark = mat(c['wood'], 0.62), mat(c['woodDark'], 0.62)
    box('stage-floor', x0, x1, y0, y1, 0.0, STAGE_H, wood, plate, 0.06)
    box('stage-skirt', x0 + 0.03, x1 - 0.03, y0 - 0.02, y0 + 0.1, 0.02, STAGE_H - 0.04, dark, plate, 0.03)
    n = int((x1 - x0) / BOARD_W)
    for k in range(1, n):
        x = x0 + k * (x1 - x0) / n
        box(f'stage-groove-{k}', x - 0.012, x + 0.012, y0 + 0.12, y1 - 0.05, STAGE_H, STAGE_H + 0.006, dark, plate, 0.004)
    # The backdrop: a dark curtain wall, two gathered side drapes, a frame, a scalloped valance and the bunting.
    curtain, deep = mat(c['curtain'], 0.75), mat(c['curtainDark'], 0.8)
    cy = y1 - 0.35
    top = STAGE_H + CURTAIN_H
    box('curtain-back', x0 + 0.2, x1 - 0.2, cy + 0.15, cy + 0.3, STAGE_H, top, deep, plate, 0.04)
    for side in (-1, 1):
        xc = (x0 if side < 0 else x1) - side * (DRAPE_W * 0.55)
        for k in range(4):
            xx = xc + side * (k - 1.5) * 0.32
            blob(f'curtain-drape-{side}-{k}', curtain, plate, None, (xx, cy, STAGE_H + CURTAIN_H / 2), (0.24, 0.16, CURTAIN_H / 2 + 0.05))
        rod(f'curtain-post-{side}', ((x0 if side < 0 else x1) - side * 0.1, cy - 0.2, STAGE_H), ((x0 if side < 0 else x1) - side * 0.1, cy - 0.2, top + 0.2), 0.12, dark, plate, None)
    rbox('curtain-bar', (x1 - x0, 0.2, 0.2), 0.08, dark, plate, None, ((x0 + x1) / 2, cy - 0.2, top + 0.2))
    val = mat(c['valance'], 0.6)
    w = (x1 - x0) / VALANCE_SCALLOPS
    for k in range(VALANCE_SCALLOPS):
        x = x0 + (k + 0.5) * w
        blob(f'valance-{k}', val, plate, None, (x, cy - 0.3, top - 0.12), (w * 0.56, 0.12, 0.34))
    flags = [mat(c[k], 0.6) for k in ('flagRed', 'flagYellow', 'flagBlue', 'flagGreen')]
    string = mat(c['woodDark'], 0.7)
    yb = cy - 0.55
    zt = top - 0.55
    fx = lambda t: x0 + 0.4 + t * (x1 - x0 - 0.8)  # noqa: E731
    fz = lambda t: zt - FLAG_SAG * 4 * t * (1 - t)  # noqa: E731
    for k in range(FLAGS * 2):
        t0, t1 = k / (FLAGS * 2), (k + 1) / (FLAGS * 2)
        rod(f'bunting-string-{k}', (fx(t0), yb, fz(t0)), (fx(t1), yb, fz(t1)), 0.018, string, plate, None, seg=8)
    for k in range(FLAGS):
        t = (k + 0.5) / FLAGS
        xa, xb = fx(t - 0.32 / FLAGS), fx(t + 0.32 / FLAGS)
        za, zb = fz(t - 0.32 / FLAGS), fz(t + 0.32 / FLAGS)
        tip = (fx(t), yb - 0.01, fz(t) - 0.55)
        o = flat_poly(f'bunting-flag-{k}', [(xa, yb - 0.01, za), tip, (xb, yb - 0.01, zb)], flags[k % len(flags)], plate)
        o.visible_shadow = False
    # The backdrop casts no shadow across the stage floor (only the instruments' own shadows stay readable).
    for o in plate.objects:
        if o.name.startswith(('curtain-', 'valance-', 'bunting-')):
            o.visible_shadow = False
    return (x0, x1, y0, y1)


def build_plate(scene, params, plate):
    tt = params['art']['touchTalk']
    c = params['art']['band']
    grass = gradient_material('band-grass', 'y', GRASS_Y[0], GRASS_Y[1], tt['grassNear'], tt['verge'], 0.85, noise=(2.0, 0.2))
    flat_poly('band-grass', [(-GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, GROUND_HALF, 0.0), (-GROUND_HALF, GROUND_HALF, 0.0)], grass, plate)
    x0, x1, y0, y1 = build_stage(scene, c, plate)
    kit = Kit(plate)
    # Pretty Park lanterns and bushes at the stage's front corners (on screen, clear of the instruments).
    for side, (px, py) in enumerate(CORNER_PROPS_PX):
        at = unproject(scene, px, py, STAGE_H)
        lantern = kit.put('street_lantern', 'Pretty-Park', f'band-lantern-{side}', (at.x, at.y + 0.5, STAGE_H), LANTERN_SCALE)
        kit.put('bush', 'Pretty-Park', f'band-bush-front-{side}', (at.x + (0.35 if side else -0.35), at.y - 0.3, STAGE_H), 0.8)
        lantern.visible_shadow = False  # its long pole shadow would streak across the stage
    far = []
    for side, (a, b) in enumerate(FENCE_X):
        n = int((b - a) / FENCE_STEP)
        for i in range(n + 1):
            far.append(kit.put('fence_straight', 'Homely-House', f'band-fence-{side}-{i}', (a + i * FENCE_STEP, FENCE_Y, 0.0), FENCE_SCALE))
    for i, (x, y, stem, k) in enumerate(TREES):
        far.append(kit.put(stem, 'Homely-House', f'band-tree-{i}', (x, y, 0.0), k))
    for i, (x, y, k) in enumerate(BUSHES):
        far.append(kit.put('foliage_A' if i % 2 else 'foliage_B', 'Homely-House', f'band-bush-{i}', (x, y, 0.0), k))
    haze(far, tt['haze'], *HAZE)
    rnd = random.Random(SEED)
    near = []
    for i in range(TUFTS):
        x, y = rnd.uniform(-12.0, 12.0), rnd.uniform(-6.0, 6.0)
        if x0 - 0.6 < x < x1 + 0.6 and y0 - 0.6 < y < y1 + 0.6:
            continue
        near.append(kit.put('grass_A' if i % 2 else 'grass_B', 'Pretty-Park', f'band-tuft-{i}', (x, y, 0.0), 0.9, rnd.uniform(0.0, 360.0)))
    for i in range(FLOWERS):
        x, y = rnd.uniform(-12.0, 12.0), rnd.uniform(-6.0, 6.0)
        if x0 - 0.6 < x < x1 + 0.6 and y0 - 0.6 < y < y1 + 0.6:
            continue
        near.append(kit.put('flower_A' if i % 2 else 'flower_B', 'Pretty-Park', f'band-flower-{i}', (x, y, 0.0), 1.3, rnd.uniform(0.0, 360.0)))
    haze(near, tt['haze'], *NEAR_HAZE)
    sky(params, plate)


def sky(params, plate):
    tt = params['art']['touchTalk']
    distance = 140.0
    y = CAM_LOC[1] + distance
    m = gradient_material('band-sky', 'z', SKY_GRADIENT_Z[0], SKY_GRADIENT_Z[1], tt['skyHorizon'], tt['skyTop'], emit=True)
    bm = bmesh.new()
    w = distance * 2.0
    bm.faces.new([bm.verts.new(p) for p in ((-w, y, -40.0), (w, y, -40.0), (w, y, 120.0), (-w, y, 120.0))])
    s = mesh_obj('band-sky', bm, m, plate)
    s.visible_shadow = False
    cloud = flat_material('band-cloud', tt['white'], 0.9)
    b = principled(cloud)
    b.inputs['Emission Color'].default_value = hex_to_linear(tt['white'])
    b.inputs['Emission Strength'].default_value = 0.35
    puffs = [(-0.9, 0.0, -0.15, 0.55), (-0.35, 0.0, 0.2, 0.75), (0.35, 0.0, 0.15, 0.7), (0.9, 0.0, -0.1, 0.5), (0.0, -0.1, -0.25, 0.6)]
    for i, (x, cy, z, sz) in enumerate(CLOUDS):
        for k, (dx, dy, dz, r) in enumerate(puffs):
            o = blob(f'band-cloud-{i}-{k}', cloud, plate, None, (x + dx * sz, cy + dy * sz, z + dz * sz), (r * sz, r * sz * 0.6, r * sz * 0.8), seg=(24, 12))
            o.visible_shadow = False


# --- the instruments (each built around its root at the origin, its ground at z 0, its front toward −y) ---------

def build_drum(root, coll, c):
    """A red drum (white rims, cream head, gold lugs) with two sticks crossed on its head."""
    r, h = 0.62, 0.72
    lathe('drum-shell', rounded_profile(r, 0.0, h, 0.08), mat(c['drum'], 0.35), coll, root)
    rim = mat(c['drumRim'], 0.35)
    torus('drum-rim-top', r, 0.06, rim, coll, root, (0.0, 0.0, h))
    torus('drum-rim-bottom', r, 0.06, rim, coll, root, (0.0, 0.0, 0.05))
    lathe('drum-head', [(0.0, h + 0.01), (r * 0.97, h + 0.01), (0.0, h + 0.012)], mat(c['drumHead'], 0.5), coll, root)
    lug = mat(c['lug'], 0.3)
    for k in range(8):
        a = 2 * math.pi * k / 8
        rbox(f'drum-lug-{k}', (0.07, 0.07, 0.24), 0.03, lug, coll, root, (math.cos(a) * (r + 0.02), math.sin(a) * (r + 0.02), h / 2), (0.0, 0.0, math.degrees(a)))
    # A zig-zag cord around the shell (white rods between the rims).
    for k in range(16):
        a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
        z0, z1 = (0.12, h - 0.08) if k % 2 == 0 else (h - 0.08, 0.12)
        rod(f'drum-cord-{k}', (math.cos(a0) * (r + 0.015), math.sin(a0) * (r + 0.015), z0), (math.cos(a1) * (r + 0.015), math.sin(a1) * (r + 0.015), z1), 0.016, rim, coll, root, seg=8)
    stick = mat(c['stick'], 0.5)
    top = h + 0.05
    rod('drum-stick-l', (-0.45, -0.25, top), (0.35, 0.3, top + 0.05), 0.04, stick, coll, root)
    rod('drum-stick-r', (0.45, -0.25, top + 0.03), (-0.35, 0.3, top + 0.08), 0.04, stick, coll, root)
    blob('drum-stick-tip-l', stick, coll, root, (0.35, 0.3, top + 0.05), (0.075, 0.075, 0.075))
    blob('drum-stick-tip-r', stick, coll, root, (-0.35, 0.3, top + 0.08), (0.075, 0.075, 0.075))


def build_horn(root, coll, c):
    """A golden toy trumpet on a little blue stand, seen from the side (its bell to the right, turned a little toward the
    camera, angled up), so it reads as a trumpet and not a disc."""
    brass, dark = mat(c['brass'], 0.25), mat(c['brassDark'], 0.3)
    stand = mat(c['stand'], 0.5)
    # The stand: a round foot, a post and a cradle.
    lathe('horn-foot', rounded_profile(0.38, 0.0, 0.08, 0.4), stand, coll, root)
    rod('horn-post', (0.0, 0.0, 0.05), (0.0, 0.0, 0.85), 0.05, stand, coll, root)
    # The trumpet: a pivot at the cradle, pointing toward the camera (−y) and a little up and to the right.
    pivot = add_empty('horn-pivot', (0.0, 0.0, 0.95), coll)
    pivot.parent = root
    pivot.rotation_euler = (math.radians(-14.0), 0.0, math.radians(68.0))
    # Built along −y from the mouthpiece (y +0.75) to the bell (y −0.75).
    rod('horn-tube', (0.0, 0.75, 0.0), (0.0, -0.45, 0.0), 0.055, brass, coll, pivot)
    bell = [(0.06, 0.0), (0.075, 0.12), (0.11, 0.24), (0.18, 0.33), (0.3, 0.4), (0.38, 0.42), (0.36, 0.44), (0.0, 0.42)]
    lathe('horn-bell', bell, brass, coll, pivot, (0.0, -0.4, 0.0), (90.0, 0.0, 0.0))
    torus('horn-bell-rim', 0.37, 0.025, dark, coll, pivot, (0.0, -0.81, 0.0), (90.0, 0.0, 0.0))
    lathe('horn-mouth', [(0.0, 0.0), (0.075, 0.0), (0.06, 0.03), (0.04, 0.12), (0.0, 0.12)], dark, coll, pivot, (0.0, 0.78, 0.0), (-90.0, 0.0, 0.0))
    # The second tube under the first (the loop), and three valves on top with round caps.
    rod('horn-tube-low', (0.0, 0.45, -0.2), (0.0, -0.15, -0.2), 0.045, brass, coll, pivot)
    torus('horn-loop', 0.1, 0.045, brass, coll, pivot, (0.0, 0.45, -0.1), (0.0, 90.0, 0.0), arc=(90.0, 270.0))
    for k in range(3):
        y = 0.25 - k * 0.16
        rod(f'horn-valve-{k}', (0.0, y, -0.25), (0.0, y, 0.2), 0.05, brass, coll, pivot)
        lathe(f'horn-cap-{k}', rounded_profile(0.07, 0.0, 0.07, 0.5), dark, coll, pivot, (0.0, y, 0.2))
    blob('horn-cradle', stand, coll, root, (0.0, 0.0, 0.88), (0.12, 0.12, 0.08))


def import_frog(coll):
    full = os.path.join(ASSETS, FROG)
    if not os.path.isfile(full):
        fail(f'{full} is missing')
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=full)
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.type == 'MESH' and o.name.split('.')[0] in JUNK_MESHES:
            new.remove(o)
            bpy.data.objects.remove(o, do_unlink=True)
    force_opaque(new)
    for o in new:
        move_to(o, coll)
    actions = [a for a in bpy.data.actions if a not in before_actions]
    return new, actions


def pose_idle(arm, actions):
    """The armature held in the first frame of its `…Idle` action (keyed at IDLE_FRAME, constant)."""
    action = next((a for a in actions if a.name.rsplit('|', 1)[-1].split('.')[0].endswith('Idle')), None)
    if action is None:
        print('build_band: WARNING no Idle action — the rest pose stays')
        return
    ad = arm.animation_data or arm.animation_data_create()
    rest = arm.matrix_basis.copy()
    ad.action = action
    if hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots) > 0:
        ad.action_slot = action.slots[0]
    bpy.context.scene.frame_set(int(action.frame_range[0]))
    pose = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    ad.action = None
    arm.matrix_basis = rest
    for pb in arm.pose.bones:
        pb.matrix_basis = pose[pb.name]
        pb.keyframe_insert('location', frame=IDLE_FRAME)
        pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=IDLE_FRAME)
        pb.keyframe_insert('scale', frame=IDLE_FRAME)
    key_constant(arm)
    bpy.context.scene.frame_set(IDLE_FRAME)


FROG_LENGTH = 1.45  # the frog's longest horizontal side (m), on a stool of STOOL_R
STOOL_R = 0.42
STOOL_H = 0.6


def build_frog(root, coll, c):
    """The singer: the real Quaternius frog (Idle pose, source colours) sitting on a round orange stool."""
    stool, wood = mat(c['stool'], 0.5), mat(c['woodDark'], 0.6)
    lathe('frog-stool-seat', rounded_profile(STOOL_R, STOOL_H - 0.14, STOOL_H, 0.35), stool, coll, root)
    for k in range(3):
        a = 2 * math.pi * k / 3 + math.pi / 2
        rod(f'frog-stool-leg-{k}', (math.cos(a) * STOOL_R * 0.55, math.sin(a) * STOOL_R * 0.55, STOOL_H - 0.12), (math.cos(a) * STOOL_R * 0.8, math.sin(a) * STOOL_R * 0.8, 0.0), 0.045, wood, coll, root)
    torus('frog-stool-ring', STOOL_R * 0.66, 0.03, wood, coll, root, (0.0, 0.0, STOOL_H * 0.4))
    new, actions = import_frog(coll)
    frog = add_empty('frog-model', (0.0, 0.0, 0.0), coll)
    for o in new:
        if o.parent is None:
            o.parent = frog
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    if arm is not None:
        pose_idle(arm, actions)
    meshes = [o for o in new if o.type == 'MESH']
    if not meshes:
        fail(f'{FROG} has no mesh')
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    length = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
    k = FROG_LENGTH / max(length, 1e-6)
    frog.scale = (k, k, k)
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    frog.location = (-cx, -cy, STOOL_H - min(p.z for p in pts) - 0.01)
    frog.parent = root
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    print(f'build_band: frog {len(meshes)} mesh(es), scale {k:.3f}, x {min(p.x for p in pts):.2f}…{max(p.x for p in pts):.2f}, y {min(p.y for p in pts):.2f}…{max(p.y for p in pts):.2f}, z {min(p.z for p in pts):.2f}…{max(p.z for p in pts):.2f}')


XYLO_BARS = ('barRed', 'barOrange', 'barYellow', 'barGreen', 'barBlue')


def build_xylophone(root, coll, c):
    """Five rainbow bars (long to short, left to right) on a wooden frame tilted toward the camera, two mallets."""
    frame = mat(c['xyloFrame'], 0.55)
    tilt = add_empty('xylo-tilt', (0.0, 0.0, 0.32), coll)
    tilt.parent = root
    tilt.rotation_euler = (math.radians(-22.0), 0.0, 0.0)
    n = len(XYLO_BARS)
    pitch = 0.3
    xs = [(k - (n - 1) / 2) * pitch for k in range(n)]
    lengths = [0.95 - k * 0.1 for k in range(n)]
    # Two rails under the bars (converging to the right), with legs.
    for side in (-1, 1):
        a = (xs[0] - 0.22, side * lengths[0] * 0.33, 0.0)
        b = (xs[-1] + 0.22, side * lengths[-1] * 0.33, 0.0)
        rod(f'xylo-rail-{side}', a, b, 0.055, frame, coll, tilt)
    for k, (x, ln, key) in enumerate(zip(xs, lengths, XYLO_BARS)):
        rbox(f'xylo-bar-{k}', (0.24, ln, 0.07), 0.03, mat(c[key], 0.35), coll, tilt, (x, 0.0, 0.08))
        for side in (-1, 1):
            blob(f'xylo-pin-{k}-{side}', mat(c['drumRim'], 0.4), coll, tilt, (x, side * ln * 0.33, 0.13), (0.025, 0.025, 0.02))
    for side, (x, y) in enumerate(((xs[0] - 0.2, -0.3), (xs[0] - 0.2, 0.3), (xs[-1] + 0.2, -0.25), (xs[-1] + 0.2, 0.25))):
        rod(f'xylo-leg-{side}', (x, y, -0.02), (x, y, -0.4), 0.045, frame, coll, tilt)
    # Two mallets resting across the bars.
    stick, head = mat(c['stick'], 0.5), mat(c['mallet'], 0.4)
    for k, (a, b) in enumerate((((-0.55, -0.55, 0.2), (0.05, 0.05, 0.2)), ((-0.1, -0.6, 0.22), (0.45, 0.02, 0.22)))):
        rod(f'xylo-mallet-{k}', a, b, 0.025, stick, coll, tilt)
        blob(f'xylo-mallet-head-{k}', head, coll, tilt, b, (0.075, 0.075, 0.075))


def build_bell(root, coll, c):
    """A gold bell with a clapper and a red bow, hanging from a small blue arch stand."""
    stand, gold, dark = mat(c['stand'], 0.5), mat(c['bell'], 0.22), mat(c['bellDark'], 0.3)
    w, h = 0.62, 1.75
    for side in (-1, 1):
        rbox(f'bell-foot-{side}', (0.22, 0.5, 0.08), 0.04, stand, coll, root, (side * w, 0.0, 0.04))
        rod(f'bell-post-{side}', (side * w, 0.0, 0.05), (side * w, 0.0, h), 0.055, stand, coll, root)
        blob(f'bell-knob-{side}', mat(c['valance'], 0.4), coll, root, (side * w, 0.0, h + 0.08), (0.09, 0.09, 0.09))
    rod('bell-bar', (-w, 0.0, h), (w, 0.0, h), 0.05, stand, coll, root)
    # The bell: a classic profile (crown, waist, flared lip), mouth down.
    top = h - 0.12
    prof = [(0.0, 0.0), (0.12, 0.02), (0.2, 0.07), (0.25, 0.16), (0.3, 0.35), (0.38, 0.52), (0.46, 0.6), (0.47, 0.64), (0.4, 0.64), (0.0, 0.6)]
    lathe('bell-body', [(r, top - 0.12 - z) for r, z in prof], gold, coll, root)
    torus('bell-lip', 0.44, 0.035, dark, coll, root, (0.0, 0.0, top - 0.12 - 0.62))
    torus('bell-band', 0.29, 0.022, dark, coll, root, (0.0, 0.0, top - 0.12 - 0.36))
    rod('bell-hanger', (0.0, 0.0, top - 0.13), (0.0, 0.0, h), 0.03, dark, coll, root)
    blob('bell-clapper', dark, coll, root, (0.0, 0.0, top - 0.12 - 0.66), (0.09, 0.09, 0.09))
    bow = mat(c['flagRed'], 0.5)
    for side in (-1, 1):
        blob(f'bell-bow-{side}', bow, coll, root, (side * 0.13, -0.05, top - 0.06), (0.13, 0.05, 0.08), (0.0, side * 20.0, 0.0))
    blob('bell-bow-knot', bow, coll, root, (0.0, -0.06, top - 0.06), (0.05, 0.05, 0.05))


BUILDERS = {'drum': build_drum, 'horn': build_horn, 'frog': build_frog, 'xylophone': build_xylophone, 'bell': build_bell}


def place_in_box(scene, screen, root, meshes, bx):
    """Scales the instrument to fit `bx` (design px) and stands it on the stage floor at the box's bottom centre."""
    x0, y0, x1, y1 = bx
    target = unproject(scene, (x0 + x1) / 2, y1, STAGE_H)
    root.location = (target.x, target.y, STAGE_H)
    for _ in range(PLACE_PASSES):
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        rx0, ry0, rx1, ry1 = screen.rect(pts)
        root.scale = root.scale * min((x1 - x0) / max(rx1 - rx0, 1e-6), (y1 - y0) / max(ry1 - ry0, 1e-6))
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        rx0, ry0, rx1, ry1 = screen.rect(pts)
        now = unproject(scene, (rx0 + rx1) / 2, ry1, STAGE_H)
        root.location += Vector((target.x - now.x, target.y - now.y, STAGE_H - min(p.z for p in pts)))
    bpy.context.view_layer.update()


def build_instrument(scene, screen, iid, params, sprites, layout):
    c = {**params['colours'], **params['art']['band']}
    coll = bpy.data.collections.new(f'sprite.{iid}')
    sprites.children.link(coll)
    root = add_empty(f'{iid}-root', (0.0, 0.0, 0.0), coll)
    inner = add_empty(f'{iid}-model', (0.0, 0.0, 0.0), coll)
    inner.parent = root
    BUILDERS[iid](inner, coll, c)
    root.rotation_euler = (0.0, 0.0, math.radians(YAW[iid]))
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    place_in_box(scene, screen, root, meshes, BOXES[iid])
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    hull_object(f'hit.{iid}', [tuple(p) for p in pts], layout)
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    add_empty(f'anchor.{iid}', (cx, cy, STAGE_H), layout)
    r = screen.rect(pts)
    print(f'build_band: {iid} ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')
    return coll


def main():
    global DESIGN
    args = parse_args('build_band', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(IDLE_FRAME)
    make_camera(scene)
    bpy.context.view_layer.update()
    screen = Screen(scene)
    plate = bpy.data.collections.new('band-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_plate(scene, params, plate)
    for iid in BUILDERS:
        build_instrument(scene, screen, iid, params, sprites, layout)
    scene.frame_set(IDLE_FRAME)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_band: saved {args["out"]}')


main()
