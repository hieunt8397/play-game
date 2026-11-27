# Builds art/home.blend (the yard — sân nhà, Story 7.1) from the vendored island art/src/map-v3.blend (only
# its render settings, world and Sun are kept).
#
# Run by `npm run art:build -- home` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_home.py -- \
#     --out <tmp>/home.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), art (art.home for the house and the props, art.touchTalk
# for the lawn, sky and haze), design size, renderScale.
#
# 2026-11-13 (spec-nha-xoai-nha-bup-be): one plate, 2048×1536, laid out like a dollhouse with its yard.
#   - On the left, Xoài's house cut open (its front wall removed, script-built with cute.py shapes): a foundation, two
#     floors, a back wall and two side walls, an attic slab and a pink gable roof with a round attic window.
#     Upstairs the bedroom (pink wallpaper: a window, a picture frame); downstairs the living room (mint wallpaper: a
#     window, a picture frame, a standing lamp, a rug). No stairs, no doors.
#   - On the right and in front, the yard: the lawn, a picket fence along the back (Homely House fences) with hazed trees
#     behind it, the garage at the back right (a roller door, closed) and the driveway down to the front edge.
# Seven corner props, each its own `sprite.<corner>` (idle at frame 1; the runtime bounce is a scale motion around the
# ground pivot), with `hit.<corner>` (convex hull of its meshes) and `anchor.<corner>` (its ground pivot, on its floor)
# in the hidden `layout` collection:
#   - bed (upstairs, left): the KayKit Furniture single bed with an extra pillow;
#   - wardrobe (upstairs, right): a lilac wardrobe with two doors, knobs, a crown top and a shirt on its side hook;
#   - stage (Ban nhạc; downstairs): a toy drum kit (bass drum, tom, snare, cymbal, sticks) and a little pink piano;
#   - pen (yard, by the back fence): a Homely House fence pen with a real Quaternius cow (Cow.fbx, its Idle pose);
#   - clinic (Nhà Shiba; yard, middle left): Shiba's dog house with the chibi Shiba sitting at its door, a white
#     first-aid kit with a red cross beside it and a food bowl;
#   - garden (Vườn rau; yard, front left): a wooden raised bed with a strawberry plant, a staked tomato plant, a
#     seedling, a sign stake, and a watering can (colours from art.garden);
#   - car-wash (Rửa xe; yard, on the driveway in front of the garage): the family car (Kenney Car Kit sedan, CC0) with
#     foam on its roof and a hose on its reel spraying it (colours from art.carWash).
# Each prop is fitted into its CORNER_BOXES box (design px; bottom edge = its ground line, on its floor) by
# unprojecting through the camera, so the layout is exactly what tools/layout/rules.ts › validateHome checks (hulls
# inside the interactive rect, clear of the Home/Speaker zones, ≥ targetGap apart, each frame ≥ 150 px).
# Every constant is in Blender world units (metres) unless its name says otherwise (…_PX: design px).
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, chibi, chibi_materials, import_joined, key_chibi, lathe, mat, mesh_obj, rbox, rod, rounded_profile, soften_scene, torus, tt_model  # noqa: E402
from common import add_empty, eval_world_verts, flat_material, force_opaque, hex_to_linear, hull_object, key_constant, move_to, parse_args, principled  # noqa: E402

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main
IDLE_FRAME = 1

# --- the camera: a little above a child's eye, looking across the lawn -----------------------------------------
CAM_LOC = (0.0, -26.0, 9.5)
CAM_TARGET = (0.0, 2.0, 0.2)
CAM_LENS = 58.0

# --- the backdrop -------------------------------------------------------------------------------------------
GROUND_HALF = 80.0
GRASS_Y = (-8.0, 22.0)  # grassNear → verge (art.touchTalk)
FENCE_PX = (500.0, 1060.0, 214.0)  # the back fence: screen x span and its ground line (design px)
FENCE_SCALE = 1.6
FENCE_MODEL = 'fence_straight'
FENCE_STEP = 2.0  # module width × FENCE_SCALE (measured: Homely House fence modules are 1.25 wide)
TREES_BEHIND = [(dx, dy, stem, k) for dx, dy, stem, k in [(-2.0, 2.2, 'tree_large', 1.6), (2.4, 3.6, 'tree', 1.5), (6.2, 1.8, 'tree_large', 1.7), (10.0, 3.4, 'tree', 1.4), (-6.5, 4.0, 'tree', 1.6), (14.0, 2.5, 'tree_large', 1.5)]]
BUSHES_BEHIND = [(dx, dy, k) for dx, dy, k in [(-0.5, 0.9, 1.1), (4.2, 1.0, 1.0), (8.6, 0.9, 1.2), (12.4, 1.1, 1.0)]]
TUFTS = 34
FLOWERS = 30
SEED = 11
HAZE = (0.28, 0.6)  # (fac, saturation) of the far backdrop (fence, trees)
NEAR_HAZE = (0.08, 0.92)
SKY_GRADIENT_Z = (0.0, 26.0)
SKY_EMISSION = 1.1
CLOUDS = [(-30.0, 120.0, 20.0, 5.0), (-4.0, 130.0, 25.0, 4.2), (28.0, 120.0, 21.0, 5.5)]

# --- the dollhouse: laid out in design px on its front plane (the cut-open front), then built in metres ----------
HOUSE_X_PX = (30.0, 492.0)  # its outer left and right edges at the ground line
HOUSE_PX = {
    'ground': 690.0,  # the foundation's front bottom edge (sets the front plane's depth)
    'floor0': 670.0,  # the living-room floor (top of the foundation)
    'ceiling0': 412.0,  # the underside of the floor between the rooms
    'floor1': 376.0,  # the bedroom floor
    'ceiling1': 126.0,  # the underside of the attic slab
    'eaves': 104.0,  # the attic slab's top: where the roof starts
    'ridge': 14.0,  # the top of the gable
}
HOUSE_DEPTH = 5.0  # front to back (m)
WALL_T = 0.3  # wall thickness
TRIM_T = 0.06  # the white cut-edge trim's proud depth
ROOF_OVERHANG = 0.35
ROOF_LIFT = 0.12  # the roof panels' centres sit this far over the gable's slope (half their 0.2 thickness + 0.02)
WALLPAPER_IN = 0.02  # the wallpaper panels sit this far inside the walls

# --- the garage and the driveway (yard, back right) --------------------------------------------------------------
GARAGE_PX = (864.0, 1110.0, 300.0)  # its front's screen x span and its ground line
GARAGE_DEPTH = 3.2  # its width comes from GARAGE_PX
GARAGE_WALL_H = 2.6
DRIVEWAY_PX = [(842.0, 300.0), (1100.0, 300.0), (1150.0, 800.0), (640.0, 800.0)]  # a quad on the lawn (design px)

# --- the corners: design-px boxes (x0, y0, x1, y1), y1 = the ground line; the prop fills the box ---------------
# Inside: the bed and the wardrobe on the bedroom floor (upstairs), the band (drums + piano) on the living-room floor.
# Outside: the pen by the back fence, Shiba's dog house in the middle, the garden in front, the car on the driveway.
# Padded by hitPad (24) each hull stays inside the interactive rect (x 24…1000, y 66…694) and off the Home zone
# (x ≤ 124, y ≤ 177) and the Speaker zone (x ≥ 900, y ≤ 257); the boxes are ≥ 72 px (2 × hitPad + targetGap) apart.
CORNER_BOXES = {
    'bed': (74, 220, 286, 350),
    'wardrobe': (358, 150, 464, 350),
    'stage': (74, 452, 452, 648),
    'pen': (556, 98, 842, 262),
    'clinic': (556, 336, 712, 478),
    'car-wash': (784, 356, 970, 556),
    'garden': (556, 552, 712, 668),
}
# The floor each prop stands on ('floor1' bedroom, 'floor0' living room; the lawn otherwise, z 0).
CORNER_FLOOR = {'bed': 'floor1', 'wardrobe': 'floor1', 'stage': 'floor0'}
PLACE_PASSES = 6
# Yaw (degrees) of each prop's root (0 = its front toward the camera).
CORNER_YAW = {'pen': 0.0, 'stage': 0.0, 'bed': -30.0, 'clinic': 14.0, 'wardrobe': 0.0, 'garden': 8.0, 'car-wash': -14.0}
# Rửa xe corner: the family car (Kenney Car Kit sedan, CC0) on the driveway, turned to show its side.
FAMILY_CAR = os.path.join('kenney', 'kenney_car-kit', 'Models', 'GLB format', 'sedan.glb')
# Nhà Shiba corner: the chibi Shiba's height (m), a little under the dog house's eaves (build_doghouse: body 1.0 m).
SHIBA_HEIGHT = 0.95

# The pen: a fence rectangle (modules) and the cow inside, its head over the front rail.
PEN_W = 3.0  # x extent (m)
PEN_D = 2.0  # y extent
PEN_FENCE = 'fence_straight'
COW = os.path.join('quaternius', 'animals', 'Cow.fbx')
COW_LENGTH = 2.9  # nose to tail (m): big enough that its head and back show over the low rails
PEN_RAIL_Z = 0.6  # the pen's fence modules are squashed to this height factor (the cow peeks over)
COW_YAW = -55.0  # its head toward the camera, three-quarter view
COW_AT = (0.15, -0.1)  # in the pen (pen-local)
FBX_FRONT_DEG = 90.0  # Quaternius FBX: the model's front is +y after import → +x with this extra yaw (as build_shadow_match)


def fail(msg):
    raise RuntimeError(f'build_home: {msg}')


# --- scene helpers (as build_touch_talk.py) -----------------------------------------------------------------

def clear_island(scene):
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


def make_camera(scene):
    data = bpy.data.cameras.new('CamYard')
    data.lens = CAM_LENS
    cam = bpy.data.objects.new('CamYard', data)
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


def model(stem, pack, coll, name, parent=None, loc=(0.0, 0.0, 0.0), scale=1.0, yaw=0.0):
    """One joined Tiny Treats / KayKit model (its own mesh) under `parent`."""
    o = import_joined(tt_model(stem, pack), name)
    move_to(o, coll)
    o.parent = parent
    o.location = loc
    o.scale = (scale,) * 3
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0.0, 0.0, math.radians(yaw))
    return o


def flat_quad(name, corners, material, coll):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(c) for c in corners])
    return mesh_obj(name, bm, material, coll, smooth=False)


def view_ray(scene, px, py):
    """The camera ray (origin, unit direction) through design px (px, py)."""
    cam = scene.camera
    tr, br, bl, tl = [cam.matrix_world @ v for v in cam.data.view_frame(scene=scene)]
    u, v = px / DESIGN[0], py / DESIGN[1]
    top = tl + (tr - tl) * u
    bot = bl + (br - bl) * u
    return cam.location.copy(), (top + (bot - top) * v - cam.location).normalized()


def on_plane_y(scene, px, py, y):
    """The world point seen at design px (px, py) on the vertical plane at world y (the dollhouse's front)."""
    o, d = view_ray(scene, px, py)
    return o + d * ((y - o.y) / d.y)


def inside_poly(p, poly):
    """Even-odd test of a 2D point against a polygon (design px)."""
    x, y = p
    hit = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            hit = not hit
    return hit


def no_shadow(*objs):
    for o in objs:
        o.visible_shadow = False


class House:
    """The dollhouse's measures in metres, from its design-px layout on the front plane (HOUSE_X_PX, HOUSE_PX)."""

    def __init__(self, scene):
        mid = (HOUSE_X_PX[0] + HOUSE_X_PX[1]) / 2
        self.front = unproject(scene, mid, HOUSE_PX['ground'], 0.0).y
        self.x0 = on_plane_y(scene, HOUSE_X_PX[0], HOUSE_PX['ground'], self.front).x
        self.x1 = on_plane_y(scene, HOUSE_X_PX[1], HOUSE_PX['ground'], self.front).x
        base = on_plane_y(scene, mid, HOUSE_PX['ground'], self.front).z
        self.z = {k: on_plane_y(scene, mid, v, self.front).z - base for k, v in HOUSE_PX.items()}
        self.w = self.x1 - self.x0
        self.cx = (self.x0 + self.x1) / 2
        self.back = self.front + HOUSE_DEPTH
        self.cy = self.front + HOUSE_DEPTH / 2
        print(f'build_home: house x {self.x0:.2f}…{self.x1:.2f} y {self.front:.2f}…{self.back:.2f} z ' + ' '.join(f'{k} {v:.2f}' for k, v in self.z.items()))


def build_house(scene, c, coll):
    """Xoài's house cut open: two rooms one above the other, seen through the missing front wall."""
    h = House(scene)
    z = h.z
    outer, trim = mat(c['houseWall'], 0.55), mat(c['houseTrim'], 0.45)
    paper = {'living': mat(c['wallLiving'], 0.7), 'bedroom': mat(c['wallBedroom'], 0.7)}
    floor = {'living': mat(c['floorLiving'], 0.6), 'bedroom': mat(c['floorBedroom'], 0.6)}
    rooms = {'living': (z['floor0'], z['ceiling0']), 'bedroom': (z['floor1'], z['ceiling1'])}
    w, d, t = h.w, HOUSE_DEPTH, WALL_T
    shell = []
    # the foundation (the living-room floor), the slab between the rooms, the attic slab: white cut edges in front
    rbox('house-foundation', (w + 0.12, d + 0.12, z['floor0']), 0.05, outer, coll, None, (h.cx, h.cy, z['floor0'] / 2))
    shell.append(rbox('house-slab-mid', (w, d, z['floor1'] - z['ceiling0']), 0.06, trim, coll, None, (h.cx, h.cy, (z['ceiling0'] + z['floor1']) / 2)))
    shell.append(rbox('house-slab-attic', (w, d, z['eaves'] - z['ceiling1']), 0.06, trim, coll, None, (h.cx, h.cy, (z['ceiling1'] + z['eaves']) / 2)))
    for room, (f0, f1) in rooms.items():
        shell.append(rbox(f'house-floor-{room}', (w - 2 * t, d - t, 0.05), 0.02, floor[room], coll, None, (h.cx, h.cy - t / 2, f0 - 0.02)))
        # the wallpaper: on the back wall and on the inner faces of both side walls
        py = h.back - t - WALLPAPER_IN
        shell.append(rbox(f'house-paper-back-{room}', (w - 2 * t, 0.03, f1 - f0), 0.01, paper[room], coll, None, (h.cx, py, (f0 + f1) / 2)))
        for side, x in ((-1, h.x0 + t + WALLPAPER_IN), (1, h.x1 - t - WALLPAPER_IN)):
            shell.append(rbox(f'house-paper-side-{room}-{side}', (0.03, d - t, f1 - f0), 0.01, paper[room], coll, None, (x, h.cy - t / 2, (f0 + f1) / 2)))
        # a skirting board along the back
        rbox(f'house-skirting-{room}', (w - 2 * t, 0.05, 0.12), 0.02, trim, coll, None, (h.cx, py - 0.03, f0 + 0.06))
    # the back wall and the side walls, white trim on their cut front edges
    shell.append(rbox('house-wall-back', (w, t, z['eaves']), 0.05, outer, coll, None, (h.cx, h.back - t / 2, z['eaves'] / 2)))
    for side, x in ((-1, h.x0 + t / 2), (1, h.x1 - t / 2)):
        shell.append(rbox(f'house-wall-{side}', (t, d, z['eaves']), 0.05, outer, coll, None, (x, h.cy, z['eaves'] / 2)))
        shell.append(rbox(f'house-wall-trim-{side}', (t + 0.06, TRIM_T, z['eaves']), 0.03, trim, coll, None, (x, h.front - TRIM_T / 2 + 0.01, z['eaves'] / 2)))
    # the gable: a front triangle with a round attic window, two pink roof panels
    bm = bmesh.new()
    gy0, gy1 = h.front, h.front + t
    tri = [(h.x0, z['eaves']), (h.x1, z['eaves']), (h.cx, z['ridge'])]
    a = [bm.verts.new((x, gy0, zz)) for x, zz in tri]
    b = [bm.verts.new((x, gy1, zz)) for x, zz in tri]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new([a[i], a[j], b[j], b[i]])
    shell.append(mesh_obj('house-gable', bm, outer, coll, smooth=False))
    wz = z['eaves'] + (z['ridge'] - z['eaves']) * 0.36
    wr = (z['ridge'] - z['eaves']) * 0.2
    shell.append(torus('house-attic-window-rim', wr, wr * 0.18, trim, coll, None, (h.cx, gy0 - 0.02, wz), (90.0, 0.0, 0.0)))
    shell.append(blob('house-attic-window', mat(c['glass'], 0.15), coll, None, (h.cx, gy0 - 0.01, wz), (wr, 0.04, wr), seg=(32, 12)))
    rise, half = z['ridge'] - z['eaves'], w / 2 + ROOF_OVERHANG
    slope = math.atan2(rise, w / 2)
    length = half / math.cos(slope)
    roof, roof_dark = mat(c['roof'], 0.5), mat(c['roofDark'], 0.5)
    # each panel's centre: halfway up the slope, minus the overhang's drop, raised by ROOF_LIFT (half the panel's
    # thickness plus a hair, so the panel sits on the gable's edge instead of cutting through it)
    roof_mid_z = z['eaves'] + rise / 2 - ROOF_OVERHANG * math.tan(slope) / 2 + ROOF_LIFT
    for side in (-1, 1):
        shell.append(rbox(f'house-roof-{side}', (length, d + 2 * ROOF_OVERHANG, 0.2), 0.08, roof, coll, None,
                          (h.cx + side * half / 2, h.cy, roof_mid_z),
                          (0.0, side * math.degrees(slope), 0.0)))
        shell.append(rbox(f'house-roof-edge-{side}', (length, 0.14, 0.26), 0.07, roof_dark, coll, None,
                          (h.cx + side * half / 2, h.front - ROOF_OVERHANG, roof_mid_z),
                          (0.0, side * math.degrees(slope), 0.0)))
    no_shadow(*shell)
    # dressing (part of the plate, never tappable): windows, picture frames, a lamp, a rug
    py = h.back - t - WALLPAPER_IN - 0.04
    glass = mat(c['glass'], 0.15)
    for room, wx in (('bedroom', h.x0 + w * 0.42), ('living', h.cx + w * 0.02)):
        f0, f1 = rooms[room]
        wz, ww, wh = f0 + (f1 - f0) * (0.6 if room == 'bedroom' else 0.5), min(1.3, w * 0.16), (f1 - f0) * 0.4
        rbox(f'{room}-window-frame', (ww + 0.16, 0.06, wh + 0.16), 0.05, trim, coll, None, (wx, py, wz))
        rbox(f'{room}-window-glass', (ww, 0.06, wh), 0.03, glass, coll, None, (wx, py - 0.02, wz))
        rbox(f'{room}-window-bar-v', (0.06, 0.06, wh), 0.02, trim, coll, None, (wx, py - 0.05, wz))
        rbox(f'{room}-window-bar-h', (ww, 0.06, 0.06), 0.02, trim, coll, None, (wx, py - 0.05, wz))
        for side in (-1, 1):
            blob(f'{room}-curtain-{side}', mat(c['curtain'] if room == 'bedroom' else c['knob'], 0.7), coll, None, (wx + side * (ww / 2 + 0.12), py - 0.08, wz + 0.02), (0.14, 0.05, wh * 0.62))
    for room, fx, colour in (('bedroom', h.x0 + w * 0.66, c['tom']), ('living', h.x0 + w * 0.2, c['roof'])):
        f0, f1 = rooms[room]
        fz = f0 + (f1 - f0) * 0.66
        rbox(f'{room}-picture-frame', (0.62, 0.05, 0.5), 0.04, mat(c['woodDark'], 0.6), coll, None, (fx, py, fz))
        rbox(f'{room}-picture', (0.48, 0.05, 0.36), 0.02, mat(c['houseTrim'], 0.6), coll, None, (fx, py - 0.02, fz))
        blob(f'{room}-picture-heart', mat(colour, 0.5), coll, None, (fx, py - 0.05, fz), (0.1, 0.02, 0.1))
    kit = Kit(coll)
    lamp = kit.put('lamp_standing', 'Furniture', 'living-lamp', (h.x1 - t - 0.42, h.back - t - 0.45, z['floor0']))
    bpy.context.view_layer.update()
    pts = eval_world_verts([lamp], bpy.context.evaluated_depsgraph_get())
    lamp.scale = (((z['ceiling0'] - z['floor0']) * 0.62) / max(max(p.z for p in pts) - min(p.z for p in pts), 1e-6),) * 3
    rug = kit.put('rug_oval_A', 'Furniture', 'living-rug', (h.cx - w * 0.04, h.cy - 0.2, z['floor0'] + 0.01))
    bpy.context.view_layer.update()
    pts = eval_world_verts([rug], bpy.context.evaluated_depsgraph_get())
    k = (w * 0.66) / max(max(p.x for p in pts) - min(p.x for p in pts), 1e-6)
    rug.scale = (k, k * 0.85, 1.0)
    return h


def build_garage(scene, c, coll):
    """The garage at the back right (its roller door closed) and the driveway from it down to the front edge."""
    gy = unproject(scene, (GARAGE_PX[0] + GARAGE_PX[1]) / 2, GARAGE_PX[2], 0.0).y
    gx0 = unproject(scene, GARAGE_PX[0], GARAGE_PX[2], 0.0).x
    gx1 = unproject(scene, GARAGE_PX[1], GARAGE_PX[2], 0.0).x
    gw, gd, gh = gx1 - gx0, GARAGE_DEPTH, GARAGE_WALL_H
    cx, cy = (gx0 + gx1) / 2, gy + gd / 2
    wall, trim, roof = mat(c['garage'], 0.6), mat(c['houseTrim'], 0.45), mat(c['roof'], 0.5)
    rbox('garage-body', (gw, gd, gh), 0.08, wall, coll, None, (cx, cy, gh / 2))
    rise = 0.9
    slope = math.atan2(rise, gw / 2)
    for side in (-1, 1):
        rbox(f'garage-roof-{side}', ((gw / 2 + 0.3) / math.cos(slope), gd + 0.5, 0.18), 0.07, roof, coll, None,
             (cx + side * gw / 4, cy, gh + rise / 2 + 0.05), (0.0, side * math.degrees(slope), 0.0))
    bm = bmesh.new()
    tri = [(gx0, gh), (gx1, gh), (cx, gh + rise)]
    a = [bm.verts.new((x, gy - 0.01, zz)) for x, zz in tri]
    bm.faces.new(a[::-1])
    mesh_obj('garage-gable', bm, wall, coll, smooth=False)
    dw, dh = gw * 0.74, gh * 0.8
    rbox('garage-door-frame', (dw + 0.24, 0.08, dh + 0.12), 0.05, trim, coll, None, (cx, gy - 0.03, dh / 2 + 0.06))
    rbox('garage-door', (dw, 0.08, dh), 0.03, mat(c['garageDoor'], 0.5), coll, None, (cx, gy - 0.06, dh / 2))
    stripe = mat(c['garageStripe'], 0.5)
    for k in range(4):
        rbox(f'garage-door-stripe-{k}', (dw - 0.1, 0.06, 0.07), 0.02, stripe, coll, None, (cx, gy - 0.1, dh * (0.2 + 0.2 * k)))
    quad = [unproject(scene, x, y, 0.006) for x, y in DRIVEWAY_PX]
    flat_quad('driveway', [tuple(p) for p in quad], mat(c['driveway'], 0.8), coll)


def build_plate(scene, screen, params, plate):
    tt = params['art']['touchTalk']
    c = {**params['colours'], **params['art']['home']}
    grass = gradient_material('yard-grass', 'y', GRASS_Y[0], GRASS_Y[1], tt['grassNear'], tt['verge'], 0.85, noise=(2.0, 0.2))
    flat_quad('yard-grass', [(-GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, GROUND_HALF, 0.0), (-GROUND_HALF, GROUND_HALF, 0.0)], grass, plate)
    house = build_house(scene, c, plate)
    build_garage(scene, c, plate)
    kit = Kit(plate)
    far = []
    fy = unproject(scene, (FENCE_PX[0] + FENCE_PX[1]) / 2, FENCE_PX[2], 0.0).y
    fa = unproject(scene, FENCE_PX[0], FENCE_PX[2], 0.0).x
    fb = unproject(scene, FENCE_PX[1], FENCE_PX[2], 0.0).x
    for i in range(int((fb - fa) / FENCE_STEP) + 1):
        far.append(kit.put(FENCE_MODEL, 'Homely-House', f'yard-fence-{i}', (fa + i * FENCE_STEP, fy, 0.0), FENCE_SCALE))
    for i, (dx, dy, stem, k) in enumerate(TREES_BEHIND):
        far.append(kit.put(stem, 'Homely-House', f'yard-tree-{i}', (fa + dx, fy + dy, 0.0), k))
    for i, (dx, dy, k) in enumerate(BUSHES_BEHIND):
        far.append(kit.put('foliage_A' if i % 2 else 'foliage_B', 'Homely-House', f'yard-bush-{i}', (fa + dx, fy + dy, 0.0), k))
    haze(far, tt['haze'], *HAZE)
    # tufts and flowers on the open lawn only: not in the house, on the driveway, by the garage or under a corner
    rnd = random.Random(SEED)
    near = []

    def open_lawn(x, y):
        px, py = screen.project((x, y, 0.0))
        if not (0 <= px <= DESIGN[0] and FENCE_PX[2] + 10 <= py <= DESIGN[1]):
            return False
        if px < HOUSE_X_PX[1] + 24 and py < HOUSE_PX['ground'] + 8:
            return False
        if px > GARAGE_PX[0] - 10 and py < GARAGE_PX[2] + 10:
            return False
        if inside_poly((px, py), [(x0 - 30, y0) for x0, y0 in DRIVEWAY_PX[:1]] + DRIVEWAY_PX[1:3] + [(DRIVEWAY_PX[3][0] - 30, DRIVEWAY_PX[3][1])]):
            return False
        return not any(x0 - 20 <= px <= x1 + 20 and y0 - 10 <= py <= y1 + 24 for x0, y0, x1, y1 in CORNER_BOXES.values())

    for n, (count, stems, scale, pack) in enumerate(((TUFTS, ('grass_A', 'grass_B'), 0.9, 'Pretty-Park'), (FLOWERS, ('flower_A', 'flower_B'), 1.3, 'Pretty-Park'))):
        made, tries = 0, 0
        while made < count and tries < count * 40:
            tries += 1
            x, y = rnd.uniform(-30.0, 30.0), rnd.uniform(-14.0, fy - 0.6)
            if open_lawn(x, y):
                near.append(kit.put(stems[made % 2], pack, f'yard-{n}-{made}', (x, y, 0.0), scale, rnd.uniform(0.0, 360.0)))
                made += 1
        if made < count:
            print(f'build_home: WARNING only {made} of {count} {stems[0][:-2]}s found open lawn')
    haze(near, tt['haze'], *NEAR_HAZE)
    sky(params, plate)
    return house


def sky(params, plate):
    tt = params['art']['touchTalk']
    distance = 140.0
    y = CAM_LOC[1] + distance
    m = gradient_material('yard-sky', 'z', SKY_GRADIENT_Z[0], SKY_GRADIENT_Z[1], tt['skyHorizon'], tt['skyTop'], emit=True)
    bm = bmesh.new()
    w = distance * 2.0
    bm.faces.new([bm.verts.new(p) for p in ((-w, y, -40.0), (w, y, -40.0), (w, y, 120.0), (-w, y, 120.0))])
    s = mesh_obj('yard-sky', bm, m, plate)
    s.visible_shadow = False
    cloud = flat_material('yard-cloud', tt['white'], 0.9)
    b = principled(cloud)
    b.inputs['Emission Color'].default_value = hex_to_linear(tt['white'])
    b.inputs['Emission Strength'].default_value = 0.35
    puffs = [(-0.9, 0.0, -0.15, 0.55), (-0.35, 0.0, 0.2, 0.75), (0.35, 0.0, 0.15, 0.7), (0.9, 0.0, -0.1, 0.5), (0.0, -0.1, -0.25, 0.6)]
    for i, (x, cy, z, sz) in enumerate(CLOUDS):
        for k, (dx, dy, dz, r) in enumerate(puffs):
            o = blob(f'yard-cloud-{i}-{k}', cloud, plate, None, (x + dx * sz, cy + dy * sz, z + dz * sz), (r * sz, r * sz * 0.6, r * sz * 0.8), seg=(24, 12))
            o.visible_shadow = False


# --- the corner props ---------------------------------------------------------------------------------------

def import_fbx(path, coll):
    full = os.path.join(ASSETS, path)
    if not os.path.isfile(full):
        fail(f'{full} is missing')
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=full)
    new = [o for o in bpy.data.objects if o not in before]
    force_opaque(new)
    for o in new:
        move_to(o, coll)
    actions = [a for a in bpy.data.actions if a not in before_actions]
    return new, actions


def pose_idle(arm, actions):
    """The armature held in the first frame of its `…|Idle` action (keyed at IDLE_FRAME, constant)."""
    action = next((a for a in actions if a.name.rsplit('|', 1)[-1].split('.')[0] == 'Idle'), None)
    if action is None:
        print('build_home: WARNING no Idle action — the rest pose stays')
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


def build_pen(root, coll, c):
    """A fence pen (front rail low enough for the head) with the real cow inside."""
    probe = model(PEN_FENCE, 'Homely-House', coll, 'pen-probe')
    bpy.context.view_layer.update()
    pts = eval_world_verts([probe], bpy.context.evaluated_depsgraph_get())
    mod = max(p.x for p in pts) - min(p.x for p in pts)
    bpy.data.objects.remove(probe, do_unlink=True)
    nx = max(1, round(PEN_W / mod))
    ny = max(1, round(PEN_D / mod))
    w, d = nx * mod, ny * mod
    i = 0
    for k in range(nx):
        x = -w / 2 + (k + 0.5) * mod
        model(PEN_FENCE, 'Homely-House', coll, f'pen-fence-{i}', root, (x, -d / 2, 0.0)); i += 1  # noqa: E702
        model(PEN_FENCE, 'Homely-House', coll, f'pen-fence-{i}', root, (x, d / 2, 0.0)); i += 1  # noqa: E702
    for k in range(ny):
        y = -d / 2 + (k + 0.5) * mod
        model(PEN_FENCE, 'Homely-House', coll, f'pen-fence-{i}', root, (-w / 2, y, 0.0), yaw=90.0); i += 1  # noqa: E702
        model(PEN_FENCE, 'Homely-House', coll, f'pen-fence-{i}', root, (w / 2, y, 0.0), yaw=90.0); i += 1  # noqa: E702
    for o in root.children:
        if o.name.startswith('pen-fence-'):
            o.scale = (o.scale.x, o.scale.y, o.scale.z * PEN_RAIL_Z)
    # straw on the pen floor
    rbox('pen-straw', (w * 0.92, d * 0.92, 0.04), 0.02, mat(c['tintButter'], 0.9), coll, root, (0.0, 0.0, 0.02))
    new, actions = import_fbx(COW, coll)
    cow_root = add_empty('pen-cow', (0.0, 0.0, 0.0), coll)
    for o in new:
        if o.parent is None:
            o.parent = cow_root
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    if arm is not None:
        pose_idle(arm, actions)
    meshes = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    length = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
    k = COW_LENGTH / max(length, 1e-6)
    cow_root.scale = (k, k, k)
    cow_root.rotation_euler = (0.0, 0.0, math.radians(COW_YAW + FBX_FRONT_DEG))
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    cow_root.location = (COW_AT[0] - cx, COW_AT[1] - cy, -min(p.z for p in pts))
    cow_root.parent = root


def build_bed(root, coll, c):
    bed = model('bed_single_A', 'Furniture', coll, 'bed-model', root)
    bpy.context.view_layer.update()
    pts = eval_world_verts([bed], bpy.context.evaluated_depsgraph_get())
    top = max(p.z for p in pts)
    y_head = max(p.y for p in pts)
    model('pillow_A', 'Furniture', coll, 'bed-pillow', root, (0.0, y_head - 0.45, top - 0.05), 1.0, 0.0)


def build_wardrobe(root, coll, c):
    """A lilac wardrobe: body, two doors, knobs, little feet, a crown top and a shirt on a side hook."""
    body, door, knob = mat(c['wardrobe'], 0.45), mat(c['wardrobeDoor'], 0.45), mat(c['knob'], 0.3)
    w, d, h, foot = 1.5, 0.8, 2.4, 0.14
    rbox('wardrobe-body', (w, d, h), 0.1, body, coll, root, (0.0, 0.0, foot + h / 2))
    fy = -d / 2 - 0.03
    for sx in (-1, 1):
        rbox(f'wardrobe-door-{sx}', (w / 2 - 0.12, 0.06, h - 0.3), 0.06, door, coll, root, (sx * w / 4, fy, foot + h / 2))
        blob(f'wardrobe-knob-{sx}', knob, coll, root, (sx * 0.1, fy - 0.06, foot + h / 2), (0.07, 0.07, 0.07))
        rbox(f'wardrobe-foot-{sx}', (0.16, 0.16, foot), 0.04, mat(c['woodDark'], 0.6), coll, root, (sx * (w / 2 - 0.15), 0.0, foot / 2))
    rbox('wardrobe-crown', (w + 0.16, d + 0.12, 0.16), 0.06, body, coll, root, (0.0, 0.0, foot + h + 0.08))
    blob('wardrobe-crest', body, coll, root, (0.0, 0.0, foot + h + 0.2), (0.32, 0.16, 0.2))
    # the shirt on a hook on the right side
    shirt = mat(c['shirt'], 0.6)
    sx = w / 2 + 0.06
    rod('wardrobe-hook', (w / 2, -0.05, foot + h - 0.35), (sx + 0.04, -0.05, foot + h - 0.3), 0.025, knob, coll, root)
    rbox('shirt-body', (0.06, 0.62, 0.72), 0.05, shirt, coll, root, (sx + 0.03, -0.05, foot + h - 0.82))
    for side in (-1, 1):
        rbox(f'shirt-sleeve-{side}', (0.05, 0.3, 0.22), 0.05, shirt, coll, root, (sx + 0.03, -0.05 + side * 0.4, foot + h - 0.6), (side * 30.0, 0.0, 0.0))


def build_garden(root, coll, c):
    """A wooden raised bed of dark soil: a strawberry plant (berries over the front rim), a staked tomato plant, a
    seedling, a sign stake with a strawberry on it, and a light-blue watering can on the ground beside the bed."""
    g = c['garden']
    wood, plank = mat(g['bed'], 0.6), mat(g['bedDark'], 0.6)
    soil, lump = mat(g['soil'], 0.95), mat(g['soilDark'], 0.95)
    leaf, leaf2, stem = mat(g['leaf'], 0.5), mat(g['leafDark'], 0.5), mat(g['stem'], 0.5)
    berry, seed, tomato = mat(g['strawberry'], 0.3), mat(g['strawberrySeed'], 0.4), mat(g['tomato'], 0.3)
    w, d, h = 2.1, 1.05, 0.5
    # the bed: a wooden box, darker plank lines on the front, corner posts a little proud, the soil inside
    rbox('garden-bed', (w, d, h), 0.1, wood, coll, root, (0.0, 0.0, h / 2))
    fy = -d / 2 - 0.015
    for k, z in enumerate((h * 0.36, h * 0.7)):
        rbox(f'garden-plank-{k}', (w - 0.3, 0.04, 0.035), 0.015, plank, coll, root, (0.0, fy, z))
    for sx in (-1, 1):
        for sy in (-1, 1):
            rbox(f'garden-post-{sx}-{sy}', (0.17, 0.17, h + 0.1), 0.06, plank, coll, root, (sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), (h + 0.1) / 2))
    rbox('garden-soil', (w - 0.2, d - 0.2, 0.12), 0.05, soil, coll, root, (0.0, 0.0, h - 0.02))
    rnd = random.Random(5)
    for k in range(9):
        x, y = rnd.uniform(-w / 2 + 0.2, w / 2 - 0.2), rnd.uniform(-d / 2 + 0.18, d / 2 - 0.18)
        r = rnd.uniform(0.05, 0.08)
        blob(f'garden-lump-{k}', lump, coll, root, (x, y, h + 0.04), (r, r, r * 0.6), seg=(16, 8))
    top = h + 0.04

    def berry_shape(v):  # narrower toward the tip (−z)
        k = 0.62 + 0.38 * (v.z + 1) / 2
        return Vector((v.x * k, v.y * k, v.z))

    # the strawberry plant (left): a rosette of round leaves, berries hanging over the front rim
    sx0 = -0.6
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        tilt = 25.0
        blob(f'straw-leaf-{k}', leaf if k % 2 else leaf2, coll, root, (sx0 + math.cos(a) * 0.2, math.sin(a) * 0.17 + 0.05, top + 0.2), (0.2, 0.15, 0.07), (tilt * math.sin(a), -tilt * math.cos(a), math.degrees(a)), seg=(24, 12))
    blob('straw-leaf-top', leaf, coll, root, (sx0, 0.08, top + 0.34), (0.17, 0.14, 0.09), seg=(24, 12))
    for k, (x, y, z) in enumerate([(sx0 - 0.3, -0.5, top + 0.02), (sx0 + 0.02, -0.56, top - 0.04), (sx0 + 0.32, -0.48, top + 0.05)]):
        rod(f'straw-runner-{k}', (sx0 + (x - sx0) * 0.3, 0.0, top + 0.15), (x, y + 0.05, z + 0.17), 0.022, stem, coll, root)
        blob(f'straw-berry-{k}', berry, coll, root, (x, y, z), (0.16, 0.14, 0.18), shape=berry_shape)
        blob(f'straw-cap-{k}', leaf2, coll, root, (x, y, z + 0.17), (0.12, 0.12, 0.04), seg=(16, 8))
        for j, (dx, dz) in enumerate([(-0.05, 0.04), (0.05, 0.03), (0.0, -0.05), (-0.04, -0.02), (0.045, -0.025)]):
            blob(f'straw-seed-{k}-{j}', seed, coll, root, (x + dx, y - 0.135 + abs(dx) * 0.6, z + dz), (0.018, 0.012, 0.024), seg=(8, 6))
    # the tomato plant (centre right): a stake, a stem, leaf clusters, three red tomatoes with green star caps
    tx = 0.35
    rod('tomato-stake', (tx + 0.12, 0.12, top - 0.05), (tx + 0.12, 0.12, top + 1.15), 0.035, plank, coll, root)
    rod('tomato-stem', (tx, 0.05, top), (tx + 0.04, 0.08, top + 1.0), 0.04, stem, coll, root)
    for k, (dx, dz, sz) in enumerate([(-0.22, 0.35, 0.2), (0.24, 0.5, 0.2), (-0.18, 0.72, 0.18), (0.2, 0.88, 0.17), (0.02, 1.06, 0.2)]):
        blob(f'tomato-leaf-{k}', leaf if k % 2 else leaf2, coll, root, (tx + dx, 0.06, top + dz), (sz, sz * 0.8, sz * 0.6), (0.0, 0.0, 20.0 * k), seg=(24, 12))
    for k, (dx, dz) in enumerate([(-0.1, 0.42), (0.18, 0.66), (-0.12, 0.84)]):
        x, y, z = tx + dx, -0.14, top + dz
        blob(f'tomato-{k}', tomato, coll, root, (x, y, z), (0.18, 0.17, 0.16))
        for j in range(5):
            a = 2 * math.pi * j / 5
            blob(f'tomato-cap-{k}-{j}', leaf2, coll, root, (x + math.cos(a) * 0.05, y + math.sin(a) * 0.05, z + 0.155), (0.05, 0.018, 0.012), (0.0, 0.0, math.degrees(a)), seg=(10, 6))
    # a seedling (right): two round leaves on a short stem
    px = 0.82
    rod('sprout-stem', (px, -0.1, top), (px, -0.1, top + 0.2), 0.025, stem, coll, root)
    for side in (-1, 1):
        blob(f'sprout-leaf-{side}', leaf, coll, root, (px + side * 0.09, -0.1, top + 0.23), (0.1, 0.06, 0.035), (0.0, -side * 20.0, 0.0), seg=(20, 10))
    # the sign stake at the front left: a post, a round-cornered board, a strawberry painted on it
    gx = -w / 2 + 0.05
    rod('sign-post', (gx, -d / 2 - 0.2, 0.0), (gx, -d / 2 - 0.2, 0.95), 0.04, plank, coll, root)
    rbox('sign-board', (0.42, 0.06, 0.32), 0.06, mat(g['packet'], 0.5), coll, root, (gx, -d / 2 - 0.25, 0.85))
    blob('sign-berry', berry, coll, root, (gx, -d / 2 - 0.29, 0.83), (0.08, 0.02, 0.09), shape=berry_shape)
    blob('sign-berry-cap', leaf2, coll, root, (gx, -d / 2 - 0.3, 0.92), (0.06, 0.015, 0.025), seg=(12, 6))
    # the watering can on the ground to the right of the bed, tipped a little toward it
    can_root = add_empty('garden-can', (w / 2 + 0.5, -0.2, 0.0), coll)
    can_root.parent = root
    can_root.rotation_euler = (0.0, math.radians(-10.0), math.radians(-25.0))
    can, can_dark = mat(g['can'], 0.3), mat(g['canDark'], 0.3)
    cr, ch = 0.3, 0.46
    lathe('can-body', rounded_profile(cr, 0.0, ch, 0.25), can, coll, can_root)
    torus('can-rim', cr * 0.82, 0.035, can_dark, coll, can_root, (0.0, 0.0, ch + 0.005))
    torus('can-handle', 0.2, 0.04, can_dark, coll, can_root, (0.1, 0.0, ch), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    rod('can-spout', (-cr * 0.7, 0.0, ch * 0.3), (-cr - 0.32, 0.0, ch + 0.2), 0.045, can, coll, can_root)
    blob('can-rose', can_dark, coll, can_root, (-cr - 0.36, 0.0, ch + 0.23), (0.07, 0.09, 0.09))


def build_band(root, coll, c):
    """Ban nhạc: a toy drum kit (a bass drum on its side, a tom on top, a snare on a stand, a cymbal, two sticks) and a
    little pink upright piano beside it (white and black keys, a music stand), both facing the camera (−y)."""
    drum, rim, head = mat(c['drum'], 0.35), mat(c['drumRim'], 0.35), mat(c['drumHead'], 0.5)
    tom, metal, gold = mat(c['tom'], 0.35), mat(c['woodDark'], 0.4), mat(c['cymbal'], 0.25)
    dx = -0.95
    # the bass drum, its axis along y (toward the camera), a heart on its front head
    r, half = 0.5, 0.24
    lathe('band-bass', rounded_profile(r, -half, half, 0.06), drum, coll, root, (dx, 0.0, r + 0.04), (90.0, 0.0, 0.0))
    for k, y in enumerate((-half, half)):
        torus(f'band-bass-rim-{k}', r, 0.05, rim, coll, root, (dx, y, r + 0.04), (90.0, 0.0, 0.0))
    blob('band-bass-head', head, coll, root, (dx, -half - 0.01, r + 0.04), (r * 0.94, 0.02, r * 0.94), seg=(40, 10))
    blob('band-bass-heart', mat(c['curtain'], 0.45), coll, root, (dx, -half - 0.035, r + 0.04), (0.17, 0.02, 0.15), seg=(24, 8))
    for side in (-1, 1):
        rod(f'band-bass-foot-{side}', (dx + side * 0.32, -0.1, 0.35), (dx + side * 0.5, -0.25, 0.0), 0.035, metal, coll, root, seg=10)
    # the tom on top of the bass drum
    tz = 2 * r + 0.08
    lathe('band-tom', rounded_profile(0.25, tz, tz + 0.26, 0.1), tom, coll, root, (dx + 0.08, 0.02, 0.0))
    torus('band-tom-rim', 0.25, 0.035, rim, coll, root, (dx + 0.08, 0.02, tz + 0.26))
    lathe('band-tom-head', [(0.0, tz + 0.27), (0.24, tz + 0.27), (0.0, tz + 0.272)], head, coll, root, (dx + 0.08, 0.02, 0.0))
    # the snare on its stand (right of the bass drum) with two crossed sticks on it
    sx, sz = dx + 0.72, 0.62
    rod('band-snare-stand', (sx, -0.2, 0.0), (sx, -0.2, sz), 0.035, metal, coll, root, seg=10)
    lathe('band-snare', rounded_profile(0.27, sz, sz + 0.18, 0.1), drum, coll, root, (sx, -0.2, 0.0))
    torus('band-snare-rim', 0.27, 0.035, rim, coll, root, (sx, -0.2, sz + 0.18))
    lathe('band-snare-head', [(0.0, sz + 0.19), (0.26, sz + 0.19), (0.0, sz + 0.192)], head, coll, root, (sx, -0.2, 0.0))
    stick = mat(c['stick'], 0.5)
    for side in (-1, 1):
        a, b = (sx - 0.3, -0.2 - side * 0.12, sz + 0.24), (sx + 0.32, -0.2 + side * 0.18, sz + 0.3)
        rod(f'band-stick-{side}', a, b, 0.03, stick, coll, root, seg=10)
        blob(f'band-stick-tip-{side}', stick, coll, root, b, (0.05, 0.05, 0.05), seg=(12, 8))
    # the cymbal on a tall stand (left)
    cx, cz = dx - 0.62, 1.42
    rod('band-cymbal-stand', (cx, 0.1, 0.0), (cx, 0.1, cz), 0.035, metal, coll, root, seg=10)
    for side in (-1, 1):
        rod(f'band-cymbal-leg-{side}', (cx, 0.1, 0.25), (cx + side * 0.22, 0.1 - 0.12, 0.0), 0.03, metal, coll, root, seg=8)
    lathe('band-cymbal', [(0.0, cz + 0.06), (0.06, cz + 0.06), (0.4, cz), (0.4, cz - 0.02), (0.0, cz + 0.02)], gold, coll, root, (cx, 0.1, 0.0), (-14.0, 0.0, 0.0))
    # the little piano (right): a pink body on short legs, a keyboard shelf, keys, a lid and a music stand
    piano, dark = mat(c['piano'], 0.35), mat(c['pianoDark'], 0.35)
    white, black = mat(c['keyWhite'], 0.3), mat(c['keyBlack'], 0.3)
    px, leg, bw, bd, bh = 0.98, 0.16, 1.3, 0.55, 0.66
    for sx_ in (-1, 1):
        rbox(f'band-piano-leg-{sx_}', (0.14, 0.5, leg), 0.04, dark, coll, root, (px + sx_ * (bw / 2 - 0.12), 0.12, leg / 2))
    rbox('band-piano-body', (bw, bd, bh), 0.1, piano, coll, root, (px, 0.12, leg + bh / 2))
    rbox('band-piano-lid', (bw + 0.08, bd + 0.06, 0.08), 0.04, dark, coll, root, (px, 0.12, leg + bh + 0.03))
    kz = leg + bh * 0.62
    rbox('band-piano-shelf', (bw - 0.04, 0.34, 0.08), 0.03, dark, coll, root, (px, -0.27, kz))
    n = 8
    kw = (bw - 0.2) / n
    for k in range(n):
        rbox(f'band-piano-key-{k}', (kw - 0.015, 0.28, 0.05), 0.012, white, coll, root, (px - (bw - 0.2) / 2 + kw * (k + 0.5), -0.3, kz + 0.06))
    for k in (0, 1, 3, 4, 5):
        rbox(f'band-piano-black-{k}', (kw * 0.55, 0.16, 0.06), 0.012, black, coll, root, (px - (bw - 0.2) / 2 + kw * (k + 1), -0.22, kz + 0.1))
    blob('band-piano-heart', mat(c['curtain'], 0.4), coll, root, (px, 0.12 - bd / 2 - 0.01, leg + bh * 0.28), (0.1, 0.02, 0.09), seg=(20, 8))
    rbox('band-piano-stand', (0.62, 0.05, 0.3), 0.03, white, coll, root, (px, 0.2, leg + bh + 0.2), (-12.0, 0.0, 0.0))
    for k in range(3):
        rbox(f'band-piano-note-{k}', (0.42, 0.055, 0.02), 0.005, black, coll, root, (px, 0.18, leg + bh + 0.13 + 0.07 * k), (-12.0, 0.0, 0.0))


def build_doghouse(root, coll, c):
    """Nhà Shiba: a blue dog house with a coral gable roof and a round door, the chibi Shiba sitting at its door, a
    white first-aid kit with a red cross on the other side and a red food bowl."""
    body, roof, dark = mat(c['dogHouse'], 0.45), mat(c['dogHouseRoof'], 0.45), mat(c['dogHouseDoor'], 0.7)
    trim = mat(c['houseTrim'], 0.45)
    hx, hy, w, d, h = -0.15, 0.25, 1.3, 1.25, 1.0
    rbox('dog-house-body', (w, d, h), 0.12, body, coll, root, (hx, hy, h / 2))
    rise = 0.62
    slope = math.atan2(rise, w / 2)
    length = (w / 2 + 0.16) / math.cos(slope)
    for side in (-1, 1):
        rbox(f'dog-house-roof-{side}', (length, d + 0.3, 0.13), 0.05, roof, coll, root,
             (hx + side * (w / 4 + 0.04), hy, h + rise / 2 + 0.02), (0.0, side * math.degrees(slope), 0.0))
    bm = bmesh.new()
    fy = hy - d / 2 - 0.005
    tri = [(hx - w / 2 + 0.05, h - 0.02), (hx + w / 2 - 0.05, h - 0.02), (hx, h + rise - 0.06)]
    a = [bm.verts.new((x, fy, z)) for x, z in tri]
    bm.faces.new(a[::-1])
    mesh_obj('dog-house-gable', bm, body, coll, smooth=False).parent = root
    blob('dog-house-door', dark, coll, root, (hx, fy - 0.01, 0.38), (0.3, 0.02, 0.36), seg=(32, 10))
    torus('dog-house-door-rim', 0.33, 0.04, trim, coll, root, (hx, fy - 0.02, 0.4), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    # a bone sign over the door
    rbox('dog-house-bone', (0.34, 0.04, 0.09), 0.04, trim, coll, root, (hx, fy - 0.03, h + 0.14))
    for sx in (-1, 1):
        for sz in (-1, 1):
            blob(f'dog-house-bone-end-{sx}-{sz}', trim, coll, root, (hx + sx * 0.18, fy - 0.03, h + 0.14 + sz * 0.04), (0.06, 0.04, 0.06), seg=(12, 8))
    # Shiba sitting on the right of the door, facing the camera
    rig = chibi('dog', 'dog-house-shiba', coll, chibi_materials(c, c['creatureOrange'], c['creatureLight']))
    rig['root'].parent = root
    key_chibi(rig, IDLE_FRAME, tail=14.0, eyes='open')
    bpy.context.scene.frame_set(IDLE_FRAME)
    bpy.context.view_layer.update()
    pts = eval_world_verts(rig['meshes'], bpy.context.evaluated_depsgraph_get())
    k = SHIBA_HEIGHT / max(max(p.z for p in pts) - min(p.z for p in pts), 1e-6)
    rig['root'].scale = (k, k, k)
    rig['root'].location = (hx + w / 2 + 0.32, hy - d / 2 - 0.2, 0.0)
    rig['root'].rotation_euler = (0.0, 0.0, math.radians(-14.0))
    # the first-aid kit (left of the house): a white case, a red cross, a red handle
    kit, cross = mat(c['kit'], 0.4), mat(c['cross'], 0.35)
    kx, ky, kw, kd, kh = hx - w / 2 - 0.5, hy - d / 2 - 0.1, 0.78, 0.42, 0.56
    rbox('first-aid-kit', (kw, kd, kh), 0.1, kit, coll, root, (kx, ky, kh / 2))
    rbox('first-aid-lid-line', (kw + 0.02, kd + 0.02, 0.04), 0.02, cross, coll, root, (kx, ky, kh * 0.8))
    rbox('first-aid-cross-v', (0.13, 0.05, 0.36), 0.03, cross, coll, root, (kx, ky - kd / 2 - 0.01, kh * 0.42))
    rbox('first-aid-cross-h', (0.36, 0.05, 0.13), 0.03, cross, coll, root, (kx, ky - kd / 2 - 0.01, kh * 0.42))
    torus('first-aid-handle', 0.14, 0.035, cross, coll, root, (kx, ky, kh + 0.01), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    # the food bowl in front of the door
    lathe('dog-bowl', [(0.0, 0.0), (0.16, 0.0), (0.22, 0.12), (0.18, 0.13), (0.0, 0.08)], mat(c['bowl'], 0.35), coll, root, (hx + 0.1, hy - d / 2 - 0.42, 0.0))


def build_family_car(root, coll, c):
    """Rửa xe: the family car (Kenney sedan) on the driveway, shown from its side, foam on its roof, and a hose on its
    reel behind it spraying a little arc of water at the car."""
    w = c['carWash']
    car = import_joined(os.path.join(ASSETS, FAMILY_CAR), 'family-car')
    move_to(car, coll)
    car.parent = root
    car.rotation_mode = 'XYZ'  # the glTF import leaves a quaternion mode
    car.rotation_euler = (0.0, 0.0, math.radians(90.0))  # its front (−y) to +x
    del car['cute']  # Kenney's flat facets get the soft shading like the script-built props
    bevel = car.modifiers.new('soft-edge', 'BEVEL')
    bevel.width = 0.025
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(40.0)
    for m in car.data.materials:
        if m is not None and m.use_nodes:
            principled(m).inputs['Roughness'].default_value = 0.55
    vs = [v.co for v in car.data.vertices]
    length = max(v.y for v in vs) - min(v.y for v in vs)  # along x once turned
    width = max(v.x for v in vs) - min(v.x for v in vs)
    height = max(v.z for v in vs)
    foam, shade = mat(w['foam'], 0.55), mat(w['foamShade'], 0.55)
    for j, (x, y, z, r) in enumerate([(-0.35, 0.0, height + 0.04, 0.22), (-0.05, 0.08, height + 0.1, 0.27), (0.28, -0.04, height + 0.03, 0.2),
                                       (-0.7, -width / 2 - 0.02, height * 0.55, 0.16), (0.45, -width / 2 - 0.02, height * 0.5, 0.14)]):
        blob(f'car-foam-{j}', foam if j % 3 else shade, coll, root, (x, y, z), (r, r * 0.9, r * 0.85), seg=(24, 12))
    # the hose reel behind the car's tail (−x), its axis along y
    reel, reel_dark, hose = mat(w['reel'], 0.45), mat(w['reelDark'], 0.45), mat(w['hose'], 0.45)
    rx, ry, rz = -length / 2 - 0.2, width / 2 + 0.3, 0.5
    for side in (-1, 1):
        blob(f'hose-reel-disc-{side}', reel, coll, root, (rx, ry + side * 0.17, rz), (0.42, 0.04, 0.42), seg=(32, 8))
        rod(f'hose-reel-leg-{side}', (rx, ry + side * 0.2, rz), (rx + side * 0.25, ry + side * 0.2, 0.0), 0.04, reel_dark, coll, root, seg=8)
    for k, rr in enumerate((0.2, 0.26, 0.32)):
        for j, yy in enumerate((-0.08, 0.0, 0.08)):
            torus(f'hose-coil-{k}-{j}', rr, 0.045, hose, coll, root, (rx, ry + yy, rz), (90.0, 0.0, 0.0))
    # the hose from the reel along the ground to the nozzle near the car's rear wheel, and the water arc
    nx, ny, nz = -length / 2 + 0.05, -width / 2 - 0.55, 0.35
    rod('hose-run-0', (rx, ry - 0.2, rz - 0.35), (-length / 2 - 0.45, 0.0, 0.05), 0.045, hose, coll, root, seg=10)
    rod('hose-run-1', (-length / 2 - 0.45, 0.0, 0.05), (nx - 0.25, ny, nz - 0.1), 0.045, hose, coll, root, seg=10)
    rod('hose-nozzle', (nx - 0.25, ny, nz - 0.1), (nx, ny + 0.06, nz), 0.06, mat(w['nozzle'], 0.35), coll, root, seg=12)
    drop = mat(w['drop'], 0.15)
    for k in range(5):
        t = (k + 1) / 6
        blob(f'hose-water-{k}', drop, coll, root, (nx + 0.6 * t, ny + 0.06 + 0.35 * t, nz + 0.45 * math.sin(math.pi * t)), (0.07, 0.07, 0.09), seg=(12, 8))


BUILDERS = {'bed': build_bed, 'wardrobe': build_wardrobe, 'stage': build_band, 'pen': build_pen, 'clinic': build_doghouse, 'garden': build_garden, 'car-wash': build_family_car}


def place_in_box(scene, screen, root, meshes, box, z0=0.0):
    """Scales the prop to fit `box` (design px) and stands it on its floor (z `z0`) at the box's bottom centre."""
    x0, y0, x1, y1 = box
    target = unproject(scene, (x0 + x1) / 2, y1, z0)
    root.location = (target.x, target.y, z0)
    for _ in range(PLACE_PASSES):
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        rx0, ry0, rx1, ry1 = screen.rect(pts)
        root.scale = root.scale * min((x1 - x0) / max(rx1 - rx0, 1e-6), (y1 - y0) / max(ry1 - ry0, 1e-6))
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        rx0, ry0, rx1, ry1 = screen.rect(pts)
        now = unproject(scene, (rx0 + rx1) / 2, ry1, z0)
        root.location += Vector((target.x - now.x, target.y - now.y, z0 - min(p.z for p in pts)))
    bpy.context.view_layer.update()


def build_corner(scene, screen, cid, params, sprites, layout, house):
    c = {**params['colours'], **params['art']['home'], 'garden': params['art']['garden'], 'carWash': params['art']['carWash'], 'creatureLight': params['art']['creatureLight']}
    coll = bpy.data.collections.new(f'sprite.{cid}')
    sprites.children.link(coll)
    root = add_empty(f'{cid}-root', (0.0, 0.0, 0.0), coll)
    inner = add_empty(f'{cid}-model', (0.0, 0.0, 0.0), coll)
    inner.parent = root
    BUILDERS[cid](inner, coll, c)
    root.rotation_euler = (0.0, 0.0, math.radians(CORNER_YAW[cid]))
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    z0 = house.z[CORNER_FLOOR[cid]] if cid in CORNER_FLOOR else 0.0
    place_in_box(scene, screen, root, meshes, CORNER_BOXES[cid], z0)
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    hull_object(f'hit.{cid}', [tuple(p) for p in pts], layout)
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    add_empty(f'anchor.{cid}', (cx, cy, z0), layout)
    r = screen.rect(pts)
    print(f'build_home: corner {cid} ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')
    if cid in CORNER_FLOOR:
        lo = (min(p.x for p in pts), min(p.y for p in pts), max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))
        room = (house.x0 + WALL_T, house.front, house.x1 - WALL_T, house.back - WALL_T)
        top = house.z['ceiling1' if CORNER_FLOOR[cid] == 'floor1' else 'ceiling0']
        if lo[0] < room[0] or lo[1] < room[1] - 0.05 or lo[2] > room[2] or lo[3] > room[3] or lo[4] > top:
            fail(f'corner {cid} does not fit in its room: x {lo[0]:.2f}…{lo[2]:.2f} y {lo[1]:.2f}…{lo[3]:.2f} top {lo[4]:.2f}; room x {room[0]:.2f}…{room[2]:.2f} y {room[1]:.2f}…{room[3]:.2f} top {top:.2f}')
    return coll


def main():
    global DESIGN
    args = parse_args('build_home', required=('out', 'params'))
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
    plate = bpy.data.collections.new('yard-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    house = build_plate(scene, screen, params, plate)
    for cid in BUILDERS:
        build_corner(scene, screen, cid, params, sprites, layout, house)
    scene.frame_set(IDLE_FRAME)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_home: saved {args["out"]}')


main()
