# Builds art/animal-pens.blend (Ú òa chuồng thú, Story 7.2) from the vendored island art/src/map-v3.blend (only its
# render settings, world and Sun are kept).
#
# Run by `npm run art:build -- animal-pens` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_animal_pens.py -- \
#     --out <tmp>/animal-pens.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours, art (art.animalPens for the barn and doors,
# art.touchTalk for the lawn, sky and haze), design size, renderScale.
#
# One plate, 2048×1536, seen through an ORTHOGRAPHIC camera tilted a little down, so a shift along world x is
# the same shift on screen: a red barn front with four pens in a row (dark insides with straw), its roof and a
# hayloft window, Tiny Treats Homely House fences, trees and bushes to both sides, Pretty Park grass and
# flowers on the lawn, a gradient sky with clouds. The four pen doors and the animals are sprites rendered once,
# at door 1; the game draws them at door n shifted by `anchor.door-<n>` − `anchor.door-1`:
#   - `sprite.door` (movable, no shadow in the plate): `state.closed` (a double barn door with X-braces over the
#     opening) and `state.open` (its two leaves swung out on their outer hinges);
#   - `sprite.animal-<id>` (holdout: the barn wall in front cuts it; movable): state `peek` — the real animal
#     (its Idle pose, source colours) standing in door 1's pen, turned three-quarter toward the camera, its head
#     poking out of the doorway;
#   - layout: `hit.door-<n>` (the convex hull of the closed door shifted to door n) and `anchor.door-<n>` (the
#     door's ground pivot), in the hidden `layout` collection.
# Every constant is in Blender world units (metres) unless its name says otherwise; with ORTHO_PX_PER_M design
# px per metre along x.
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, chibi, chibi_materials, import_joined, key_chibi, mat, mesh_obj, rbox, soften_scene, tt_model  # noqa: E402
from common import add_empty, eval_world_verts, flat_material, force_opaque, hex_to_linear, hull_object, key_constant, move_to, parse_args, principled  # noqa: E402

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main
IDLE_FRAME = 1

# --- the camera: orthographic, looking along +y, tilted CAM_PITCH degrees down ---------------------------------
ORTHO_PX_PER_M = 100.0  # design px per metre (the ortho scale spans DESIGN[0] / this metres)
CAM_PITCH = 10.0
CAM_TARGET_Z = 2.15  # the screen centre is this high on the barn front (the doors' feet sit ~212 px below it)
CAM_DISTANCE = 40.0

# --- the barn ---------------------------------------------------------------------------------------------------
DOOR_W = 1.5  # each opening (its two door leaves together), metres = design px / 100
DOOR_H = 2.06
DOOR_PITCH = 2.3  # door centre to door centre (the padded hulls stay ≥ targetGap apart)
DOORS = 4
DOOR_XS = [(i - (DOORS - 1) / 2) * DOOR_PITCH for i in range(DOORS)]
WALL_T = 0.2  # the barn front's thickness (y from -WALL_T/2)
WALL_X = 4.75  # half width of the barn front
WALL_H = 3.05
ROOF_PEAK = 4.75
ROOF_OVER = 0.35  # eaves overhang
PEN_DEPTH = 3.0  # each pen goes this deep behind the front
TRIM_W = 0.12  # white trim boards around each opening and at the barn's edges
LEAF_T = 0.12
LEAF_Y = -WALL_T / 2 - LEAF_T / 2 - 0.02  # the door leaf hangs just in front of the wall
OPEN_DEG = 115.0  # each leaf of the double door swings out (toward the camera) on its outer hinge
HAYLOFT_R = 0.42
# These cast no shadow: the pens' insides stay lit, so the animals in them read clearly.
SHADOWLESS = ('barn-roof', 'barn-gable', 'barn-band', 'pen-ceiling', 'pen-side', 'pen-back')

# --- the dressing (Tiny Treats Homely House / Pretty Park) -----------------------------------------------------------
GROUND_X = 40.0
GROUND_Y = (-20.0, 11.0)  # the lawn ends behind the trees: the tilted ortho camera sees the sky above it
GRASS_Y = (-6.0, 11.0)
FENCE_SCALE = 1.5
FENCE_STEP = 1.875  # module width × FENCE_SCALE (Homely House fence modules are 1.25 wide)
FENCES = [(-9.5, -5.2, 1.2), (5.2, 9.5, 1.2)]  # (x0, x1, y) left and right of the barn
TREES = [(-7.4, 4.0, 'tree_large', 1.9), (7.6, 4.5, 'tree_large', 2.0), (-6.0, 7.0, 'tree', 1.6), (6.2, 7.5, 'tree', 1.7), (-9.0, 9.0, 'tree', 1.8), (9.2, 9.0, 'tree', 1.6)]
BUSHES = [(-5.4, 0.6, 1.1), (5.5, 0.7, 1.2), (-8.6, 1.6, 1.0), (8.4, 1.8, 1.0)]
TUFTS = 34
FLOWERS = 26
TUFT_Y = (-3.4, -0.6)  # on the lawn in front of the barn (low on the screen, under the doors)
SEED = 23
HAZE = (0.22, 0.65)
NEAR_HAZE = (0.06, 0.92)
SKY_GRADIENT_Z = (0.0, 16.0)
SKY_EMISSION = 1.1
CLOUDS = [(-3.6, 60.0, 7.6, 0.9), (0.6, 60.0, 8.2, 0.75), (3.9, 60.0, 7.4, 0.85)]

# --- the animals: (model under assets/, height in m, turn in degrees from facing the camera, nose x offset from
# the door centre for the head, how far the nose pokes out of the doorway) -------------------------------------------------------
ANIMALS = {
    'dog': ('quaternius/animals/ShibaInu.fbx', 1.65, -25.0, 0.0, 0.25),
    'cat': ('polybygoogle/cat/Cat.glb', 1.7, -25.0, 0.0, 0.25),  # CC-BY 3.0 (app/public/CREDITS.txt)
    'rooster': ('polybygoogle/rooster/Rooster.glb', 1.6, -25.0, 0.0, 0.2),  # CC-BY 3.0 (app/public/CREDITS.txt)
    'cow': ('quaternius/animals/Cow.fbx', 1.92, -25.0, 0.05, 0.3),
    'pig': ('quaternius/farm/Pig.glb', 1.45, -25.0, 0.0, 0.3),
    'sheep': ('quaternius/farm/Sheep.glb', 1.65, -25.0, 0.0, 0.3),
    'horse': ('quaternius/animals/Horse.fbx', 1.98, -25.0, 0.05, 0.3),
}
# 2026-11-03: the pens show chibi toys instead (cute.chibi, the soft big-headed look of the barn and of the island
# Shiba); ANIMALS (the real models) stay for build_pet_clinic.py, which imports them. Per animal: the cute.chibi
# kind, its colours (cute mats key → Tokens.art.animalPens key, or 'c:<Tokens.colors key>' / 'creatureLight'), the
# height in m, the turn and nose offset and poke (as ANIMALS) and the head's turn back toward the camera (degrees).
PEN_CHIBIS = {
    'dog': ('dog', {'fur': 'c:creatureOrange', 'light': 'creatureLight'}, 1.6, -25.0, 0.0, 0.25, 12.0),
    'cat': ('cat', {'fur': 'catFur', 'light': 'creatureLight', 'patch': 'catStripe', 'nose': 'catNose'}, 1.55, -25.0, 0.0, 0.25, 12.0),
    'rooster': ('rooster', {'fur': 'roosterFur', 'light': 'roosterBreast', 'wing': 'roosterWing', 'comb': 'roosterComb',
                            'beak': 'roosterBeak', 'tail': 'roosterTail', 'tail2': 'roosterTail2'}, 1.55, -25.0, 0.0, 0.2, 12.0),
    'cow': ('cow', {'fur': 'cowFur', 'light': 'creatureLight', 'patch': 'cowPatch', 'muzzle': 'cowMuzzle', 'horn': 'cowHorn',
                    'hoof': 'hoof', 'mane': 'cowPatch'}, 1.75, -25.0, 0.05, 0.3, 12.0),
    'pig': ('pig', {'fur': 'pigFur', 'light': 'pigLight', 'muzzle': 'pigSnout', 'nose': 'pigHoof', 'hoof': 'pigHoof'}, 1.5, -25.0, 0.0, 0.3, 12.0),
    'sheep': ('sheep', {'fur': 'sheepWool', 'light': 'creatureLight', 'wool': 'sheepWool', 'face': 'sheepFace', 'hoof': 'sheepLeg'}, 1.6, -25.0, 0.0, 0.3, 12.0),
    'horse': ('horse', {'fur': 'horseFur', 'light': 'horseLight', 'muzzle': 'horseLight', 'mane': 'horseMane', 'hoof': 'hoof'}, 1.8, -25.0, 0.05, 0.3, 12.0),
}
# The animals' source front faces −y after import (FBX and glTF alike; checked on renders, Story 7.2).
SOURCE_FRONT_DEG = 0.0
JUNK_MESHES = ('Icosphere',)
HEAD_SHARE = 0.25  # the Poly Pizza glTF exports carry a stray unit icosphere


def fail(msg):
    raise RuntimeError(f'build_animal_pens: {msg}')


# --- scene helpers (as build_home.py) ------------------------------------------------------------------------

def clear_island(scene):
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


def make_camera(scene):
    data = bpy.data.cameras.new('CamPens')
    data.type = 'ORTHO'
    data.ortho_scale = DESIGN[0] / ORTHO_PX_PER_M
    data.clip_start = 0.1
    data.clip_end = 400.0
    cam = bpy.data.objects.new('CamPens', data)
    scene.collection.objects.link(cam)
    p = math.radians(CAM_PITCH)
    target = Vector((0.0, 0.0, CAM_TARGET_Z))
    cam.location = target + Vector((0.0, -math.cos(p), math.sin(p))) * CAM_DISTANCE
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
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
        o.scale = (scale,) * 3
        o.rotation_mode = 'XYZ'
        o.rotation_euler = (0.0, 0.0, math.radians(yaw))
        return o


def box(name, x0, x1, y0, y1, z0, z1, material, coll, radius=0.03):
    """An axis-aligned rounded box from its extents (world)."""
    return rbox(name, (x1 - x0, y1 - y0, z1 - z0), radius, material, coll, None, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))


def flat_quad(name, corners, material, coll):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(c) for c in corners])
    return mesh_obj(name, bm, material, coll, smooth=False)


# --- the plate ----------------------------------------------------------------------------------------------

def build_barn(c, plate):
    barn, dark, trim, roof = mat(c['barn'], 0.7), mat(c['barnDark'], 0.7), mat(c['trim'], 0.6), mat(c['roof'], 0.75)
    inside, straw = mat(c['inside'], 0.9), mat(c['straw'], 0.95)
    y0, y1 = -WALL_T / 2, WALL_T / 2
    # The front wall: posts between the openings and a band over them.
    edges = [-WALL_X] + [x for cx in DOOR_XS for x in (cx - DOOR_W / 2, cx + DOOR_W / 2)] + [WALL_X]
    for i in range(0, len(edges), 2):
        box(f'barn-post-{i // 2}', edges[i], edges[i + 1], y0, y1, 0.0, DOOR_H, barn, plate, 0.02)
    box('barn-band', -WALL_X, WALL_X, y0, y1, DOOR_H, WALL_H, barn, plate, 0.02)
    # Vertical boards (darker grooves) on the band and the posts.
    for k in range(int(2 * WALL_X / 0.38)):
        x = -WALL_X + 0.19 + k * 0.38
        if any(abs(x - cx) < DOOR_W / 2 + 0.02 for cx in DOOR_XS):
            box(f'barn-groove-top-{k}', x - 0.015, x + 0.015, y0 - 0.012, y0, DOOR_H + 0.1, WALL_H - 0.05, dark, plate, 0.005)
        else:
            box(f'barn-groove-{k}', x - 0.015, x + 0.015, y0 - 0.012, y0, 0.05, WALL_H - 0.05, dark, plate, 0.005)
    # White trim: around each opening, the barn's corners and its top.
    t = TRIM_W
    for i, cx in enumerate(DOOR_XS):
        x0, x1 = cx - DOOR_W / 2, cx + DOOR_W / 2
        box(f'trim-l-{i}', x0 - t, x0, y0 - 0.04, y0, 0.0, DOOR_H + t, trim, plate)
        box(f'trim-r-{i}', x1, x1 + t, y0 - 0.04, y0, 0.0, DOOR_H + t, trim, plate)
        box(f'trim-t-{i}', x0 - t, x1 + t, y0 - 0.04, y0, DOOR_H, DOOR_H + t, trim, plate)
        # The pen behind the opening: dark sides, back and ceiling, a straw floor and a hay bale at the back.
        box(f'pen-back-{i}', x0 - 0.05, x1 + 0.05, PEN_DEPTH, PEN_DEPTH + 0.1, 0.0, DOOR_H + 0.3, inside, plate, 0.01)
        box(f'pen-side-l-{i}', x0 - 0.1, x0, y1, PEN_DEPTH, 0.0, DOOR_H + 0.3, inside, plate, 0.01)
        box(f'pen-side-r-{i}', x1, x1 + 0.1, y1, PEN_DEPTH, 0.0, DOOR_H + 0.3, inside, plate, 0.01)
        box(f'pen-ceiling-{i}', x0 - 0.1, x1 + 0.1, y0, PEN_DEPTH, DOOR_H, DOOR_H + 0.1, inside, plate, 0.01)
        box(f'pen-straw-{i}', x0, x1, y0, PEN_DEPTH, 0.0, 0.05, straw, plate, 0.02)
        box(f'pen-bale-{i}', x0 + 0.1, x0 + 0.75, PEN_DEPTH - 0.6, PEN_DEPTH - 0.05, 0.0, 0.5, straw, plate, 0.06)
    box('trim-corner-l', -WALL_X - 0.02, -WALL_X + t, y0 - 0.04, y1, 0.0, WALL_H, trim, plate)
    box('trim-corner-r', WALL_X - t, WALL_X + 0.02, y0 - 0.04, y1, 0.0, WALL_H, trim, plate)
    box('trim-top', -WALL_X - 0.02, WALL_X + 0.02, y0 - 0.04, y1, WALL_H - t, WALL_H, trim, plate)
    # The gable (a triangle of wall) and the roof's two slopes.
    bm = bmesh.new()
    a = [bm.verts.new((-WALL_X, y0, WALL_H)), bm.verts.new((WALL_X, y0, WALL_H)), bm.verts.new((0.0, y0, ROOF_PEAK))]
    b = [bm.verts.new((-WALL_X, PEN_DEPTH, WALL_H)), bm.verts.new((WALL_X, PEN_DEPTH, WALL_H)), bm.verts.new((0.0, PEN_DEPTH, ROOF_PEAK))]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((a[i], b[i], b[j], a[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh_obj('barn-gable', bm, barn, plate, smooth=False)
    slope = math.atan2(ROOF_PEAK - WALL_H, WALL_X)
    length = math.hypot(WALL_X, ROOF_PEAK - WALL_H) + ROOF_OVER
    for side in (-1, 1):
        mid = Vector((side * (length / 2) * math.cos(slope), PEN_DEPTH / 2 - 0.2, ROOF_PEAK - (length / 2) * math.sin(slope) + 0.12))
        rbox(f'barn-roof-{side}', (length + 0.1, PEN_DEPTH + 0.8, 0.22), 0.06, roof, plate, None, tuple(mid), (0.0, side * math.degrees(slope), 0.0))
    # The hayloft window: a white ring with a dark pane and a cross.
    for o in plate.objects:
        if o.name.startswith(SHADOWLESS):
            o.visible_shadow = False
    zc = (WALL_H + ROOF_PEAK) / 2 - 0.05
    blob('hayloft-ring', trim, plate, None, (0.0, y0 - 0.03, zc), (HAYLOFT_R + 0.1, 0.05, HAYLOFT_R + 0.1), seg=(40, 12))
    blob('hayloft-pane', inside, plate, None, (0.0, y0 - 0.06, zc), (HAYLOFT_R, 0.05, HAYLOFT_R), seg=(40, 12))
    box('hayloft-bar-v', -0.04, 0.04, y0 - 0.12, y0 - 0.06, zc - HAYLOFT_R, zc + HAYLOFT_R, trim, plate, 0.02)
    box('hayloft-bar-h', -HAYLOFT_R, HAYLOFT_R, y0 - 0.12, y0 - 0.06, zc - 0.04, zc + 0.04, trim, plate, 0.02)


def build_plate(params, plate):
    c = params['art']['animalPens']
    tt = params['art']['touchTalk']
    grass = gradient_material('pens-grass', 'y', GRASS_Y[0], GRASS_Y[1], tt['grassNear'], tt['verge'], 0.85, noise=(2.0, 0.2))
    g0, g1 = GROUND_Y
    flat_quad('pens-grass', [(-GROUND_X, g0, 0.0), (GROUND_X, g0, 0.0), (GROUND_X, g1, 0.0), (-GROUND_X, g1, 0.0)], grass, plate)
    build_barn(c, plate)
    kit = Kit(plate)
    far = []
    for side, (a, b, y) in enumerate(FENCES):
        n = int((b - a) / FENCE_STEP)
        for i in range(n + 1):
            far.append(kit.put('fence_straight', 'Homely-House', f'pens-fence-{side}-{i}', (a + i * FENCE_STEP, y, 0.0), FENCE_SCALE))
    for i, (x, y, stem, k) in enumerate(TREES):
        far.append(kit.put(stem, 'Homely-House', f'pens-tree-{i}', (x, y, 0.0), k))
    for i, (x, y, k) in enumerate(BUSHES):
        far.append(kit.put('foliage_A' if i % 2 else 'foliage_B', 'Homely-House', f'pens-bush-{i}', (x, y, 0.0), k))
    haze(far, tt['haze'], *HAZE)
    rnd = random.Random(SEED)
    near = []
    for i in range(TUFTS):
        x, y = rnd.uniform(-5.2, 5.2), rnd.uniform(*TUFT_Y)
        near.append(kit.put('grass_A' if i % 2 else 'grass_B', 'Pretty-Park', f'pens-tuft-{i}', (x, y, 0.0), 0.8, rnd.uniform(0.0, 360.0)))
    for i in range(FLOWERS):
        x, y = rnd.uniform(-5.2, 5.2), rnd.uniform(*TUFT_Y)
        near.append(kit.put('flower_A' if i % 2 else 'flower_B', 'Pretty-Park', f'pens-flower-{i}', (x, y, 0.0), 1.1, rnd.uniform(0.0, 360.0)))
    haze(near, tt['haze'], *NEAR_HAZE)
    sky(params, plate)


def sky(params, plate):
    tt = params['art']['touchTalk']
    y = 60.0
    m = gradient_material('pens-sky', 'z', SKY_GRADIENT_Z[0], SKY_GRADIENT_Z[1], tt['skyHorizon'], tt['skyTop'], emit=True)
    bm = bmesh.new()
    w = 60.0
    bm.faces.new([bm.verts.new(p) for p in ((-w, y, -20.0), (w, y, -20.0), (w, y, 40.0), (-w, y, 40.0))])
    s = mesh_obj('pens-sky', bm, m, plate)
    s.visible_shadow = False
    cloud = flat_material('pens-cloud', tt['white'], 0.9)
    b = principled(cloud)
    b.inputs['Emission Color'].default_value = hex_to_linear(tt['white'])
    b.inputs['Emission Strength'].default_value = 0.35
    puffs = [(-0.9, 0.0, -0.15, 0.55), (-0.35, 0.0, 0.2, 0.75), (0.35, 0.0, 0.15, 0.7), (0.9, 0.0, -0.1, 0.5), (0.0, -0.1, -0.25, 0.6)]
    for i, (x, cy, z, sz) in enumerate(CLOUDS):
        for k, (dx, dy, dz, r) in enumerate(puffs):
            o = blob(f'pens-cloud-{i}-{k}', cloud, plate, None, (x + dx * sz, cy - 1.0 + dy * sz, z + dz * sz), (r * sz, r * sz * 0.6, r * sz * 0.8), seg=(24, 12))
            o.visible_shadow = False


# --- the door ---------------------------------------------------------------------------------------------------

def build_leaf(name, c, coll, parent):
    """One leaf of the double barn door hanging from `parent` (its hinge at x 0; the leaf runs along +x): planks,
    a white frame and X-brace, hinges and a handle at the free edge."""
    door, dark, trim, hinge = mat(c['door'], 0.6), mat(c['doorDark'], 0.6), mat(c['trim'], 0.55), mat(c['hinge'], 0.4)
    w, h, t = DOOR_W / 2, DOOR_H - 0.02, LEAF_T
    rbox(f'{name}-panel', (w, t, h), 0.03, door, coll, parent, (w / 2, 0.0, h / 2 + 0.01))
    for k in range(1, 3):
        x = k * w / 3
        rbox(f'{name}-groove-{k}', (0.025, 0.02, h - 0.1), 0.008, dark, coll, parent, (x, -t / 2 - 0.005, h / 2 + 0.01))
    f = 0.13
    # The white frame and X-braces on both faces (an open leaf shows its back), hinges and handle in front.
    for side, fy in (('front', -t / 2 - 0.03), ('back', t / 2 + 0.03)):
        out = -1 if side == 'front' else 1
        rbox(f'{name}-{side}-frame-l', (f, 0.05, h), 0.02, trim, coll, parent, (f / 2, fy, h / 2 + 0.01))
        rbox(f'{name}-{side}-frame-r', (f, 0.05, h), 0.02, trim, coll, parent, (w - f / 2, fy, h / 2 + 0.01))
        rbox(f'{name}-{side}-frame-t', (w, 0.05, f), 0.02, trim, coll, parent, (w / 2, fy, h - f / 2 + 0.01))
        rbox(f'{name}-{side}-frame-b', (w, 0.05, f), 0.02, trim, coll, parent, (w / 2, fy, f / 2 + 0.01))
        rbox(f'{name}-{side}-frame-m', (w, 0.05, f), 0.02, trim, coll, parent, (w / 2, fy, h / 2 + 0.01))
        for half, (z0, z1) in enumerate(((f, h / 2), (h / 2, h - f))):
            dz, dx = z1 - z0, w - 2 * f
            ang = math.degrees(math.atan2(dz, dx))
            length = math.hypot(dx, dz)
            rbox(f'{name}-{side}-brace-{half}', (length, 0.045, f * 0.85), 0.02, trim, coll, parent, (w / 2, fy + out * 0.01, (z0 + z1) / 2 + 0.01), (0.0, ang if half else -ang, 0.0))
    fy = -t / 2 - 0.03
    for z in (0.4, h - 0.4):
        rbox(f'{name}-hinge-{z:.1f}', (0.3, 0.05, 0.09), 0.02, hinge, coll, parent, (0.15, fy - 0.03, z))
    blob(f'{name}-handle', hinge, coll, parent, (w - 0.16, fy - 0.08, h / 2 + 0.01), (0.065, 0.065, 0.065))


def build_door(c, sprites):
    coll = bpy.data.collections.new('sprite.door')
    sprites.children.link(coll)
    coll['movable'] = 1
    x0, x1 = DOOR_XS[0] - DOOR_W / 2, DOOR_XS[0] + DOOR_W / 2
    leaves = {}
    for state, deg in (('closed', 0.0), ('open', OPEN_DEG)):
        sc = bpy.data.collections.new(f'state.{state}')
        coll.children.link(sc)
        # The left leaf runs +x from its hinge; the right one is the same leaf turned 180° on the right hinge.
        left = add_empty(f'door-hinge-l-{state}', (x0, LEAF_Y, 0.0), sc)
        left.rotation_euler = (0.0, 0.0, math.radians(-deg))
        right = add_empty(f'door-hinge-r-{state}', (x1, LEAF_Y, 0.0), sc)
        right.rotation_euler = (0.0, 0.0, math.radians(180.0 + deg))
        right.scale = (1.0, -1.0, 1.0)  # mirrored so its face (−y side) still faces the camera
        build_leaf(f'door-l-{state}', c, sc, left)
        build_leaf(f'door-r-{state}', c, sc, right)
        leaves[state] = [o for o in sc.all_objects if o.type == 'MESH']
    return leaves


# --- the animals ----------------------------------------------------------------------------------------------

def import_model(rel, coll):
    full = os.path.join(ASSETS, *rel.split('/'))
    if not os.path.isfile(full):
        fail(f'{full} is missing')
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    if full.lower().endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=full)
    else:
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
    """The armature held in the first frame of its `…|Idle` action (keyed at IDLE_FRAME, constant)."""
    action = next((a for a in actions if a.name.rsplit('|', 1)[-1].split('.')[0] == 'Idle'), None)
    if action is None:
        print(f'build_animal_pens: WARNING {arm.name}: no Idle action — the rest pose stays')
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


def chibi_mats(params, colour_keys):
    """cute.chibi materials for one pen animal from PEN_CHIBIS colour keys."""
    colours, pens = params['colours'], params['art']['animalPens']

    def hex_of(key):
        if key == 'creatureLight':
            return params['art']['creatureLight']
        if key.startswith('c:'):
            return colours[key[2:]]
        if key not in pens:
            fail(f'Tokens.art.animalPens.{key} is missing')
        return pens[key]

    mats = chibi_materials(colours, hex_of(colour_keys['fur']), hex_of(colour_keys['light']))
    for k, key in colour_keys.items():
        if k not in ('fur', 'light'):
            mats[k] = flat_material(f'pen-{k}-{key}', hex_of(key), 0.6)
    return mats


def build_animal(aid, spec, sprites, params):
    kind, colour_keys, height, turn, nose_dx, poke, head_yaw = spec
    coll = bpy.data.collections.new(f'sprite.animal-{aid}')
    sprites.children.link(coll)
    coll['holdout_occluders'] = 1
    coll['movable'] = 1
    coll['states'] = '{"peek": [1]}'
    rig = chibi(kind, f'animal-{aid}', coll, chibi_mats(params, colour_keys))
    root = rig['root']
    # The body turns away (turn), the head turns back a little toward the camera: a curious look out of the door.
    key_chibi(rig, IDLE_FRAME, head_yaw=head_yaw * (1 if turn < 0 else -1), eyes='open')
    meshes = rig['meshes']
    if not meshes:
        fail(f'chibi {kind} has no mesh')
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    k = height / max(max(p.z for p in pts) - min(p.z for p in pts), 1e-6)
    root.scale = (k, k, k)
    root.rotation_euler = (0.0, 0.0, math.radians(SOURCE_FRONT_DEG + turn))
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    # The head: the front HEAD_SHARE of the body (toward the camera); its centre goes to the door's centre.
    y_min, y_max = min(p.y for p in pts), max(p.y for p in pts)
    head = [p for p in pts if p.y <= y_min + HEAD_SHARE * (y_max - y_min)]
    head_x = (min(p.x for p in head) + max(p.x for p in head)) / 2
    root.location = (DOOR_XS[0] + nose_dx - head_x, -WALL_T / 2 - poke - y_min, -min(p.z for p in pts) + 0.05)
    bpy.context.view_layer.update()
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    print(f'build_animal_pens: {aid} {len(meshes)} mesh(es), scale {k:.3f}, x {min(p.x for p in pts):.2f}…{max(p.x for p in pts):.2f}, y {min(p.y for p in pts):.2f}…{max(p.y for p in pts):.2f}, z ≤ {max(p.z for p in pts):.2f}')
    if max(p.y for p in pts) > PEN_DEPTH:
        print(f'build_animal_pens: WARNING {aid} reaches past the pen back ({max(p.y for p in pts):.2f} > {PEN_DEPTH})')


# --- the layout -------------------------------------------------------------------------------------------------

def build_layout(screen, closed_leaf, layout):
    pts = eval_world_verts(closed_leaf, bpy.context.evaluated_depsgraph_get())
    for i, cx in enumerate(DOOR_XS):
        dx = cx - DOOR_XS[0]
        shifted = [(p.x + dx, p.y, p.z) for p in pts]
        hull_object(f'hit.door-{i + 1}', shifted, layout)
        add_empty(f'anchor.door-{i + 1}', (cx, LEAF_Y, 0.0), layout)
        r = screen.rect(shifted)
        print(f'build_animal_pens: door-{i + 1} ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')


def main():
    global DESIGN
    args = parse_args('build_animal_pens', required=('out', 'params'))
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
    plate = bpy.data.collections.new('pens-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_plate(params, plate)
    leaves = build_door(params['art']['animalPens'], sprites)
    for aid, spec in PEN_CHIBIS.items():
        build_animal(aid, spec, sprites, params)
    scene.frame_set(IDLE_FRAME)
    bpy.context.view_layer.update()
    build_layout(screen, leaves['closed'], layout)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_animal_pens: saved {args["out"]}')


if __name__ == '__main__':
    main()
