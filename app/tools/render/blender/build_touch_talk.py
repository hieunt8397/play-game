# Builds art/touch-talk.blend (Chạm là nói, Stories 4.5 / 4.6; cute-toy restyle 2026-10-21) from the
# vendored island art/src/map-v3.blend (only its render settings, world and Sun are kept).
#
# Run by `npm run art:build -- touch-talk` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_touch_talk.py -- \
#     --out <tmp>/touch-talk.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours (hex), art (incl. art.touchTalk), touchTalk
# {propMinPx, propMaxPx}, design size, renderScale.
#
# One Blender scene per plate (content/assets.ts › SCREEN_PLATES['touch-talk']); render.ts renders each
# with `-S <plate>` and merges them. Each plate is a dressed, quiet "cute toy" backdrop (soft shading,
# pastel, hazed distant models) with 10 props, each its own `sprite.<propId>` (states idle 1 / react 10,
# movable: no shadow in the plate) with a `hit.prop-<propId>` convex hull in the plate's `layout.<plate>`:
#   - `sea`: the island is removed; a gradient sky with puffy clouds, a calm two-tone sea with foam and
#     a soft sand beach; every prop script-built soft (fish, crab, starfish and seagull with chibi faces).
#   - `street`: sidewalk, a KayKit City Builder road with a crossing, a verge with Pretty Park bushes and
#     flowers and City Builder buildings behind; props KayKit cars / traffic light / dumpster, Pretty Park
#     tree, Homely House house and script-built bus, truck, tractor and cone.
#   - `kitchen`: a Tiny Treats Charming Kitchen room (tiled floor and wall, shelf, counter run, fridge) with a KayKit Furniture rug; props Tiny Treats / KayKit food and kitchenware and
#     script-built banana, egg and watermelon.
# 2026-10-21 (batch 2):
#   - `bathroom`: a Bubbly Bathroom room (tiled floor and wall, wall shelf, plants, mat); props Bubbly Bathroom
#     models and script-built soap and potty.
#   - `bakery`: a Charming Kitchen shop (plain wall, shelf, a counter on a lower floor), a striped awning and a
#     pink display table; props Baked Goods models.
#   - `picnic`: a lawn with a Pleasant Picnic blanket, Pretty Park tufts, flowers, bushes, trees and a bench,
#     sky and clouds; props Pleasant Picnic models and a script-built chibi butterfly.
# Every constant is in Blender world units (metres) unless its name says otherwise.
import json
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import (  # noqa: E402
    EYE_GLOSS, blob, build_bus, build_tractor, build_truck, chibi_face, ellipsoid_point, import_joined, lathe, lathe_bm, mat, mesh_obj,
    on_body, place, rbox, rod, rounded_profile, soften_scene, torus, tt_model,
)
from common import add_empty, eval_world_verts, flat_material, hex_to_linear, hull_object, key_constant, move_to, parse_args, principled  # noqa: E402

RENDER_SIZE = (2048, 1536)
RENDER_DESIGN = (1024, 768)  # the design size (set from params in main)
SEA_Z = -0.15
SAND_Z = 0.52  # the beach's flat top (the props' ground)

# --- the sea plate --------------------------------------------------------------------------------------
CAM_SEA_LOC = (6.8, 3.2, 2.0)
CAM_SEA_TARGET = (6.8, 9.6, -0.1)
CAM_SEA_LENS = 28.0
BEACH_X = (-60.0, 75.0)
BEACH_Y = (-6.0, 11.0)
BEACH_FLAT_Y = 7.7  # the sand is flat up to here, then slopes under the sea
BEACH_DROP = 2.0  # metres (y) of slope down to BEACH_LOW
BEACH_LOW = -0.2
# The visible water surface sits a little below the sand (the props keep SEA_Z): the low camera sees the
# waterline and its foam instead of the sand's crest hiding them.
WATER_Z = 0.36
BEACH_STEP = (1.0, 0.1)  # grid step (x, y)
SEA_FAR_Y = 170.0
SEA_GRADIENT_Y = (9.0, 45.0)  # seaNear → seaFar
SKY_Y = 175.0  # the sky backdrop's distance (world y)
SKY_GRADIENT_Z = (0.0, 26.0)  # skyHorizon → skyTop
SKY_EMISSION = 1.1  # the unlit sky's brightness (the Standard view renders it a touch grey at 1)
SEA_CLOUDS = [(-42.0, 150.0, 13.5, 4.5), (-20.0, 160.0, 9.0, 3.4), (48.0, 150.0, 14.0, 5.0), (70.0, 165.0, 9.0, 3.6)]  # (x, y, z, size)
FOAM_BLOBS = 90
FOAM_SIZE = (0.95, 0.32, 0.05)

IDLE_FRAME = 1
REACT_FRAME = 10
STATES = {'idle': [IDLE_FRAME], 'react': [REACT_FRAME]}
FIT_PASSES = 5

# propId → (kind, builder, world anchor (x, y, z), placement, yaw°, target longest side (design px)).
# placement: 'ground' = its lowest point on z; 'centre' = its centre at (x, y, z).
# Four rows on screen: the seagull in the sky; the fish and the boat on the sea; the parasol, ball and
# bucket on the upper sand; the coconut, crab, starfish and shell along the front. The anchors were
# unprojected from those screen spots (each ground prop from the bottom of its box).
SEA_PROPS = {
    'seagull': ('script', 'seagull', (7.1, 8.5, 1.95), 'centre', -20.0, 140),
    'fish': ('script', 'fish', (3.38, 18.42, 0.35), 'centre', -15.0, 115),
    'boat': ('script', 'boat', (10.45, 14.95, SEA_Z), 'ground', -30.0, 170),
    'parasol': ('script', 'parasol', (5.24, 6.45, SAND_Z), 'ground', 0.0, 150),
    'beach-ball': ('script', 'beach-ball', (6.47, 6.51, SAND_Z), 'ground', 0.0, 115),
    'bucket': ('script', 'bucket', (7.61, 6.53, SAND_Z), 'ground', -20.0, 130),
    'coconut': ('script', 'coconut', (5.64, 5.2, SAND_Z), 'ground', 0.0, 105),
    'crab': ('script', 'crab', (6.2, 5.21, SAND_Z), 'ground', 0.0, 130),
    'starfish': ('script', 'starfish', (6.82, 5.28, SAND_Z), 'ground', 10.0, 110),
    'shell': ('script', 'shell', (7.4, 5.25, SAND_Z), 'ground', 15.0, 105),
}
# 2026-10-21 (six scenes, two bubble columns): sea props moved across the screen by this many design px
# from their anchor (positive moves right, negative left; the anchor is re-unprojected on its own height):
# the boat sails where the seagull was, the seagull flies right of it under the Speaker, and the bucket and the front row close up,
# all clear of the Home/Speaker zones and the bubbles.
SEA_SHIFT_PX = {'seagull': 222.0, 'boat': -215.0, 'bucket': -40.0, 'coconut': -12.0, 'crab': -6.0, 'starfish': -24.0, 'shell': -31.0}
# Recolours of imported models: propId → colour token for every material (the texture link is dropped).
RECOLOUR = {'pot': 'creatureBlue', 'frying-pan': 'tire'}
# The react pose (frame 10): (rotation about x, y, z in degrees, scale (x, y, z)); sub-part rotations below.
REACT_POSE = {
    'boat': ((0.0, 8.0, 0.0), (1.0, 1.0, 1.0)),  # rolls
    'fish': ((0.0, -20.0, 0.0), (1.0, 1.0, 1.0)),  # pitches up
    'crab': ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),  # claws rise (CRAB_CLAW_DEG)
    'starfish': ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),  # turns in its own plane (STAR_TURN_DEG)
    'parasol': ((6.0, 0.0, 0.0), (1.0, 1.0, 1.0)),  # tilts
    'bucket': ((10.0, 0.0, 0.0), (1.0, 1.0, 1.0)),  # tilts
    'seagull': ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)),  # wings rise (GULL_WING_DEG)
    'coconut': ((0.0, 15.0, 0.0), (1.0, 1.0, 1.0)),  # rolls
    'shell': ((10.0, 0.0, 0.0), (1.0, 1.0, 1.0)),  # tips
    'beach-ball': ((0.0, 0.0, 0.0), (1.08, 1.08, 0.85)),  # squashes
}
FISH_LEAP_DEG = 30.0  # the fish leaps nose-up out of the shallows
CRAB_CLAW_DEG = 30.0
GULL_WING_DEG = 35.0
STAR_TURN_DEG = 15.0  # about the leaning star's own axis (its body's local z)
FLY_WING_DEG = 30.0  # the butterfly's wings fold forward about its body (z)
BALL_SECTOR_DEG = 60.0  # beach-ball stripes: face material = floor(azimuth / 60°) % 3
PARASOL_SECTORS = 8


def fail(msg):
    raise RuntimeError(f'build_touch_talk: {msg}')


def clear_island(scene):
    """Removes every collection of the reference island (and their objects); the Sun, the cameras, the
    world and the render settings stay."""
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


def make_camera(scene, name, loc, target, lens):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    cam = bpy.data.objects.new(name, data)
    scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


class Screen:
    """World → design px through a scene's camera (same projection as render_screen.py)."""

    def __init__(self, scene, params):
        self.scene = scene
        self.w, self.h = params['design']['width'], params['design']['height']

    def project(self, p):
        v = world_to_camera_view(self.scene, self.scene.camera, Vector(p))
        return (v.x * self.w, (1 - v.y) * self.h)

    def rect(self, pts):
        sp = [self.project(p) for p in pts]
        xs, ys = [p[0] for p in sp], [p[1] for p in sp]
        return (min(xs), min(ys), max(xs), max(ys))


# --- materials ----------------------------------------------------------------------------------------------

def _socket(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def _mix_rgba(nt, fac, a, b):
    """A Mix (colour) node; `fac` a socket or float, `a`/`b` sockets or linear RGBA tuples."""
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    for ident, v in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
        s = _socket(mix.inputs, ident)
        if isinstance(v, (int, float, tuple)):
            s.default_value = v
        else:
            nt.links.new(v, s)
    return _socket(mix.outputs, 'Result_Color')


def _object_axis(nt, axis):
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sep.inputs[0])
    return sep.outputs[axis.upper()]


def _ramp(nt, value, v0, v1):
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = v0
    mr.inputs['From Max'].default_value = v1
    nt.links.new(value, mr.inputs['Value'])
    return mr.outputs['Result']


def gradient_material(name, axis, v0, v1, hex0, hex1, rough=0.6, emit=False, noise=None):
    """hex0 at object `axis` = v0 blending to hex1 at v1 (smoothstep). `emit`: an unlit emission surface
    (the sky). `noise` (scale, amount): a faint mottling back towards hex0."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = principled(m)
    colour = _mix_rgba(nt, _ramp(nt, _object_axis(nt, axis), v0, v1), hex_to_linear(hex0), hex_to_linear(hex1))
    if noise is not None:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = noise[0]
        fac = nt.nodes.new('ShaderNodeMath')
        fac.operation = 'MULTIPLY'
        nt.links.new(tex.outputs['Fac'], fac.inputs[0])
        fac.inputs[1].default_value = noise[1]
        colour = _mix_rgba(nt, fac.outputs[0], colour, hex_to_linear(hex0))
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


def tile_material(name, hex_base, hex_line, scale):
    """The sidewalk: soft square slabs (Brick texture) in object x/y."""
    m = flat_material(name, hex_base, 0.8)
    nt = m.node_tree
    bsdf = principled(m)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.inputs['Color1'].default_value = hex_to_linear(hex_base)
    brick.inputs['Color2'].default_value = hex_to_linear(hex_base)
    brick.inputs['Mortar'].default_value = hex_to_linear(hex_line)
    brick.inputs['Scale'].default_value = scale
    brick.inputs['Mortar Size'].default_value = 0.025
    brick.inputs['Mortar Smooth'].default_value = 0.6
    brick.inputs['Brick Width'].default_value = 1.0
    brick.inputs['Row Height'].default_value = 1.0
    brick.offset = 0.0
    nt.links.new(coord.outputs['Object'], brick.inputs['Vector'])
    nt.links.new(brick.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def haze(objs, hex_haze, fac, sat):
    """The quiet backdrop: each material of `objs` (copied) is desaturated to `sat` and blended `fac`
    towards the haze colour, so the props in front pop."""
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
                    if inp.links:
                        src = inp.links[0].from_socket
                        hs = nt.nodes.new('ShaderNodeHueSaturation')
                        hs.inputs['Saturation'].default_value = sat
                        nt.links.new(src, hs.inputs['Color'])
                        nt.links.new(_mix_rgba(nt, fac, hs.outputs['Color'], hex_to_linear(hex_haze)), inp)
                    else:
                        base = inp.default_value
                        grey = sum(base[:3]) / 3
                        h = hex_to_linear(hex_haze)
                        inp.default_value = tuple((grey + (base[i] - grey) * sat) * (1 - fac) + h[i] * fac for i in range(3)) + (1.0,)
                done[m.name] = c
            slot.material = done[m.name]


def recolour(pid, objs, colours):
    token = RECOLOUR.get(pid)
    if token is None:
        return
    for m in {m for o in objs if o.type == 'MESH' for m in o.data.materials if m}:
        b = principled(m)
        if b is None:
            continue
        for link in list(b.inputs['Base Color'].links):
            m.node_tree.links.remove(link)
        b.inputs['Base Color'].default_value = hex_to_linear(colours[token])


# --- script-built props: the sea ------------------------------------------------------------------------------

def build_fish(root, coll, c):
    """A round chibi fish facing +x, its face on the camera side (-y)."""
    radii = (1.0, 0.6, 0.78)
    body = blob('fish-body', mat(c['creatureBlue']), coll, root, size=radii, seg=(48, 24))
    blob('fish-belly', mat(c['creatureLight']), coll, body, (0.15, -0.05, -0.3), (0.72, 0.52, 0.46))
    fin = mat(c['fin'])
    for k, tilt in enumerate((35.0, -35.0)):
        blob(f'fish-tail-{k}', fin, coll, body, (-1.05, 0.0, 0.22 * (1 - 2 * k)), (0.42, 0.1, 0.24), (0.0, tilt, 0.0))
    blob('fish-dorsal', fin, coll, body, (-0.1, 0.0, 0.72), (0.42, 0.08, 0.26), (0.0, 15.0, 0.0))
    blob('fish-side-fin', fin, coll, body, (-0.05, -0.55, -0.2), (0.26, 0.07, 0.15), (0.0, 25.0, -15.0))
    eye, n = on_body(radii, (0, 0, 0), (0.58, -0.62, 0.32))
    cheek, cn = on_body(radii, (0, 0, 0), (0.7, -0.55, -0.12))
    mouth, mn = on_body(radii, (0, 0, 0), (0.92, -0.38, -0.1))
    chibi_face('fish', body, coll, c, [(eye, n)], 0.26, [(cheek, cn)], (mouth, mn, 0.2))


def build_crab(root, coll, c):
    orange = mat(c['creatureOrange'])
    radii = (1.0, 0.72, 0.58)
    body = blob('crab-body', orange, coll, root, (0.0, 0.0, 0.62), radii, seg=(48, 24))
    blob('crab-belly', mat(c['creatureLight']), coll, body, (0.0, -0.28, -0.12), (0.7, 0.45, 0.38))
    for side, name in ((-1, 'ClawL'), (1, 'ClawR')):
        claw = place(add_empty(name, (0, 0, 0), coll), root, (side * 0.9, -0.3, 0.62))
        rod(f'crab-arm-{name}', (0.0, 0.0, 0.0), (side * 0.35, -0.2, 0.35), 0.11, orange, coll, claw)
        blob(f'crab-claw-{name}', orange, coll, claw, (side * 0.45, -0.28, 0.6), (0.3, 0.24, 0.34), (0.0, side * -20.0, 0.0))
        blob(f'crab-pincer-{name}', orange, coll, claw, (side * 0.62, -0.32, 0.92), (0.11, 0.1, 0.24), (0.0, side * 35.0, 0.0))
        for k in range(3):
            y = -0.05 + 0.28 * k
            rod(f'crab-leg-{name}-{k}', (side * 0.75, y, 0.5), (side * 1.25, y + 0.1, 0.05), 0.08, orange, coll, root)
        stalk_top = Vector((side * 0.32, -0.42, 1.38))
        rod(f'crab-stalk-{name}', (side * 0.28, -0.35, 1.0), stalk_top, 0.06, orange, coll, root)
        ball = blob(f'crab-eyeball-{name}', mat(c['white'], EYE_GLOSS), coll, root, stalk_top, (0.24, 0.22, 0.26))
        chibi_face(f'crab-{name}', ball, coll, c, [((0.0, -0.17, 0.02), (0.0, -1.0, 0.1))], 0.2)
    cheeks = [on_body(radii, (0, 0, 0), (s * 0.55, -0.8, 0.05)) for s in (-1, 1)]
    smile = on_body(radii, (0, 0, 0), (0.0, -1.0, 0.12))
    chibi_face('crab', body, coll, c, [], 0.3, cheeks, (smile[0], smile[1], 0.3))


def starfish_shape(d):
    a = math.atan2(d.y, d.x)
    arm = (0.5 + 0.5 * math.cos(5 * (a - math.pi / 2))) ** 1.4
    r = 0.48 + 0.52 * arm
    return Vector((d.x * r, d.y * r, d.z * (0.22 + 0.14 * (1 - arm))))


def build_starfish(root, coll, c):
    """A puffy star sitting up (leaning back) so its face looks at the camera."""
    lean = place(add_empty('starfish-lean', (0, 0, 0), coll), root, (0.0, 0.0, 0.0), (68.0, 0.0, 0.0))
    body = blob('starfish-body', mat(c['creaturePink']), coll, lean, size=(1.0, 1.0, 1.0), seg=(80, 24), shape=starfish_shape)
    dots = mat(c['tintPink'], 0.5)
    for k in range(5):
        a = math.pi / 2 + 2 * math.pi * k / 5
        for t in (0.55, 0.78):
            blob(f'starfish-dot-{k}-{t}', dots, coll, body, (math.cos(a) * t, math.sin(a) * t, 0.2 - 0.07 * t), (0.06, 0.06, 0.03), seg=(12, 6))
    up = Vector((0.0, 0.0, 1.0))
    eyes = [((s * 0.17, 0.08, 0.34), up) for s in (-1, 1)]
    cheeks = [((s * 0.3, -0.08, 0.31), up) for s in (-1, 1)]
    chibi_face('starfish', body, coll, c, eyes, 0.15, cheeks, ((0.0, -0.12, 0.33), up, 0.16))


def build_seagull(root, coll, c):
    """A round chibi gull flying towards +x (the yaw turns its face to the camera)."""
    white = mat(c['white'])
    tip = mat(c['gullTip'])
    body = blob('gull-body', white, coll, root, size=(0.95, 0.6, 0.55), seg=(40, 20))
    head = blob('gull-head', white, coll, root, (0.8, 0.0, 0.42), (0.5, 0.5, 0.48), seg=(40, 20))
    blob('gull-beak', mat(c['beak']), coll, head, (0.5, 0.0, -0.06), (0.24, 0.12, 0.09), (0.0, 10.0, 0.0))
    blob('gull-tail', tip, coll, body, (-0.95, 0.0, 0.12), (0.32, 0.22, 0.08), (0.0, -15.0, 0.0))
    eyes = []
    for s in (-1, 1):
        p, n = ellipsoid_point((0.5, 0.5, 0.48), (0.75, s * 0.55, 0.3))
        eyes.append((p, n))
    cheeks = [ellipsoid_point((0.5, 0.5, 0.48), (0.6, s * 0.75, -0.05)) for s in (-1, 1)]
    chibi_face('gull', head, coll, c, eyes, 0.15, cheeks)
    for side, name in ((-1, 'WingL'), (1, 'WingR')):
        wing = place(add_empty(name, (0, 0, 0), coll), root, (0.0, side * 0.4, 0.2))
        w = blob(f'gull-{name}', white, coll, wing, (-0.05, side * 0.75, 0.05), (0.55, 0.85, 0.11), (0.0, 0.0, side * -8.0))
        blob(f'gull-{name}-tip', tip, coll, w, (-0.1, side * 0.72, 0.0), (0.38, 0.22, 0.1))


def build_beach_ball(root, coll, c):
    mats = [mat(c['creatureGreen'], 0.25), mat(c['white'], 0.25), mat(c['creatureOrange'], 0.25)]
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=1.0)
    for f in bm.faces:
        cm = f.calc_center_median()
        az = (math.degrees(math.atan2(cm.y, cm.x)) + 360.0) % 360.0
        f.material_index = int(az // BALL_SECTOR_DEG) % 3
    ball = place(mesh_obj('ball-body', bm, mats, coll), root, (0.0, 0.0, 1.0), (0.0, 0.0, -10.0))
    blob('ball-cap', mats[1], coll, ball, (0.0, 0.0, 0.985), (0.2, 0.2, 0.04))


def build_bucket(root, coll, c):
    blue = mat(c['creatureBlue'])
    rim = mat(c['tintButter'])
    r0, r1, h, wall = 0.55, 0.78, 1.15, 0.07
    prof = rounded_profile(r0, 0.0, 0.25, 0.4)[:-1]
    prof += [(r0 + (r1 - r0) * t, 0.25 + (h - 0.25) * t) for t in (0.33, 0.66, 1.0)]
    prof += [(r1 - wall, h), (r1 - wall - (r1 - r0) * 0.8, 0.3), (0.0, 0.3)]
    lathe('bucket-body', prof, blue, coll, root, seg=48)
    torus('bucket-rim', r1 - wall / 2, 0.075, rim, coll, root, (0.0, 0.0, h))
    torus('bucket-band', (r0 + r1) / 2 + 0.02, 0.05, rim, coll, root, (0.0, 0.0, h * 0.45))
    blob('bucket-sand', mat(c['sandLight'], 0.8), coll, root, (0.0, 0.0, h - 0.1), (r1 - 0.09, r1 - 0.09, 0.16))
    torus('bucket-handle', r1 - 0.02, 0.04, rim, coll, root, (0.0, 0.0, h), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    shovel = place(add_empty('Shovel', (0, 0, 0), coll), root, (0.62, -0.35, 0.0), (0.0, 22.0, -20.0))
    green = mat(c['creatureGreen'])
    blob('shovel-blade', green, coll, shovel, (0.0, 0.0, 0.32), (0.26, 0.07, 0.32))
    rod('shovel-handle', (0.0, 0.0, 0.5), (0.0, 0.0, 1.55), 0.06, green, coll, shovel)
    blob('shovel-grip', green, coll, shovel, (0.0, 0.0, 1.58), (0.16, 0.08, 0.1))


def shell_bm(ribs=9, nu=36, nv=12, height=0.28):
    """A scallop fan (hinge at the origin, opening up +z, bulging towards -y): top and back sheets meeting
    on a scalloped rim."""
    bm = bmesh.new()

    def pt(u, v, sign):
        a = math.radians(u * 72.0)
        rib = 0.5 + 0.5 * math.cos(ribs * a)
        r = v * (1.0 + 0.05 * rib * v)
        edge = math.sqrt(max(0.0, 1.0 - u * u)) * math.sin(math.pi * min(v, 0.999)) ** 0.6
        bulge = height * edge * (0.75 + 0.25 * rib) * (1.0 if sign < 0 else 0.35)
        return Vector((r * math.sin(a), sign * bulge, r * math.cos(a)))

    grids = []
    for sign in (-1, 1):
        g = [[bm.verts.new(pt(-1 + 2 * i / nu, j / nv, sign)) for j in range(nv + 1)] for i in range(nu + 1)]
        grids.append(g)
        for i in range(nu):
            for j in range(nv):
                q = (g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1])
                bm.faces.new(q if sign < 0 else tuple(reversed(q)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_shell(root, coll, c):
    pink = mat(c['shell'])
    lean = place(add_empty('shell-lean', (0, 0, 0), coll), root, (0.0, 0.0, 0.12), (-18.0, 0.0, 0.0))
    place(mesh_obj('shell-fan', shell_bm(), pink, coll), lean)
    rbox('shell-hinge', (0.42, 0.16, 0.2), 0.07, pink, coll, lean, (0.0, 0.0, 0.02))
    blob('shell-pearl', mat(c['white'], 0.2), coll, lean, (0.0, -0.2, 0.42), (0.11, 0.11, 0.11))


def build_boat(root, coll, c):
    """A toy boat: a rounded coral hull with a white band, a little cabin, mast and a puffed sail."""
    hull_m = mat(c['boatHull'])
    white = mat(c['white'])

    def hull_shape(d):
        x, y, z = d
        y = y * (1.0 - 0.45 * max(0.0, x) ** 2)
        z = min(z, 0.25) if z > 0 else z * 0.9
        return Vector((x, y, z))

    hull = blob('boat-hull', hull_m, coll, root, (0.0, 0.0, 0.5), (1.45, 0.62, 0.62), seg=(48, 24), shape=hull_shape)
    torus('boat-band', 1.0, 0.06, white, coll, hull, (0.0, 0.0, 0.05), arc=(0.0, 360.0)).scale = (1.33, 0.55, 1.0)
    rbox('boat-deck', (1.9, 0.62, 0.08), 0.04, mat(c['creatureLight']), coll, hull, (-0.1, 0.0, 0.15))
    cabin = rbox('boat-cabin', (0.7, 0.55, 0.45), 0.14, white, coll, hull, (-0.45, 0.0, 0.42))
    rbox('boat-roof', (0.82, 0.66, 0.1), 0.05, mat(c['creatureBlue']), coll, cabin, (0.0, 0.0, 0.26))
    for k, x in enumerate((-0.15, 0.15)):
        blob(f'boat-window-{k}', mat(c['glass'], 0.2), coll, cabin, (x, -0.28, 0.02), (0.1, 0.03, 0.1))
    rod('boat-mast', (0.25, 0.0, 0.1), (0.25, 0.0, 2.0), 0.045, mat(c['hub']), coll, hull)

    def sail_shape(d):
        t = (d.z + 1.0) / 2.0
        return Vector((d.x * (1.0 - t) ** 0.9, d.y, d.z))

    blob('boat-sail', white, coll, hull, (0.62, -0.04, 1.05), (0.42, 0.06, 0.85), seg=(32, 16), shape=sail_shape)
    blob('boat-flag', mat(c['creaturePink']), coll, hull, (0.42, 0.0, 2.0), (0.17, 0.03, 0.1))


def build_parasol(root, coll, c):
    pink = mat(c['creaturePink'])
    white = mat(c['white'])
    tilt = place(add_empty('parasol-tilt', (0, 0, 0), coll), root, (0.0, 0.0, 0.0), (14.0, 0.0, 0.0))
    rod('parasol-pole', (0.0, 0.0, 0.0), (0.0, 0.0, 2.15), 0.06, white, coll, tilt)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=PARASOL_SECTORS * 8, v_segments=20, radius=1.0)
    for v in bm.verts:
        d = v.co.normalized()
        phi = math.atan2(d.y, d.x)
        rim = math.exp(-(d.z / 0.25) ** 2)
        k = 1.0 + 0.05 * rim * math.cos(PARASOL_SECTORS * phi)
        z = d.z if d.z > 0 else d.z * 0.12
        v.co = Vector((d.x * 1.35 * k, d.y * 1.35 * k, z * 0.62))
    for f in bm.faces:
        cm = f.calc_center_median()
        az = (math.degrees(math.atan2(cm.y, cm.x)) + 360.0) % 360.0
        f.material_index = int(az // (360.0 / PARASOL_SECTORS)) % 2
    place(mesh_obj('parasol-canopy', bm, [pink, white], coll), tilt, (0.0, 0.0, 2.05))
    blob('parasol-top', pink, coll, tilt, (0.0, 0.0, 2.7), (0.1, 0.1, 0.1))
    blob('parasol-mound', mat(c['sandLight'], 0.8), coll, root, (0.0, 0.0, 0.0), (0.32, 0.32, 0.1))


def build_coconut(root, coll, c):
    """A green coconut with its top cut, a straw and a little leaf."""
    green = mat(c['coconut'])
    lean = place(add_empty('coconut-lean', (0, 0, 0), coll), root, (0.0, 0.0, 0.0), (-12.0, 0.0, 0.0))

    def nut(d):
        z = d.z if d.z < 0.62 else 0.62 + (d.z - 0.62) * 0.15
        return Vector((d.x * (1.0 - 0.08 * d.z), d.y * (1.0 - 0.08 * d.z), z))

    blob('coconut-body', green, coll, lean, (0.0, 0.0, 0.95), (0.95, 0.95, 1.0), seg=(48, 24), shape=nut)
    blob('coconut-cut', mat(c['creatureLight']), coll, lean, (0.0, 0.0, 1.6), (0.62, 0.62, 0.06))
    rod('coconut-straw', (0.1, 0.0, 1.4), (0.42, -0.1, 2.35), 0.07, mat(c['creaturePink']), coll, lean)
    blob('coconut-leaf', mat(c['creatureGreen']), coll, lean, (-0.4, -0.1, 1.72), (0.32, 0.12, 0.04), (0.0, -20.0, 30.0))


# --- script-built props: the street ---------------------------------------------------------------------------
# Vehicles: length along y, front at -y, axles along x.

# The bus, truck and tractor are shared with Hang tìm bóng (cute.py).


def build_cone(root, coll, c):
    orange = mat(c['creatureOrange'])
    white = mat(c['white'])
    rbox('cone-base', (1.0, 1.0, 0.14), 0.07, orange, coll, root, (0.0, 0.0, 0.07))
    prof = [(0.0, 0.14), (0.44, 0.14)] + [(0.44 - 0.33 * t, 0.14 + 1.15 * t) for t in (0.25, 0.5, 0.75, 1.0)]
    prof += [(0.11 * math.cos(math.pi / 2 * i / 6), 1.29 + 0.11 * math.sin(math.pi / 2 * i / 6)) for i in range(1, 7)]
    bm = lathe_bm(prof, 40)
    for f in bm.faces:
        z = f.calc_center_median().z
        f.material_index = 1 if 0.5 < z < 0.7 or 0.88 < z < 1.04 else 0
    place(mesh_obj('cone-body', bm, [orange, white], coll), root)


# --- script-built props: the kitchen ----------------------------------------------------------------------------

def build_banana(root, coll, c):
    """A plump curved banana (arc in the x/z plane), brown tips and a stem."""
    yellow = mat(c['banana'])
    tipm = mat(c['bananaTip'], 0.6)
    bm = bmesh.new()
    n, ring = 40, 24
    a0, a1 = -62.0, 62.0
    big_r, thick = 1.15, 0.27
    rings = []
    for i in range(n + 1):
        t = i / n
        a = math.radians(a0 + (a1 - a0) * t)
        centre = Vector((big_r * math.sin(a), 0.0, big_r - big_r * math.cos(a)))
        n1 = Vector((0.0, 1.0, 0.0))
        n2 = Vector((-math.sin(a), 0.0, math.cos(a)))
        r = thick * math.sin(math.pi * t) ** 0.55 + 0.02
        if i in (0, n):
            rings.append([bm.verts.new(centre)])
            continue
        rings.append([bm.verts.new(centre + (n1 * math.cos(2 * math.pi * k / ring) + n2 * math.sin(2 * math.pi * k / ring)) * r * (1.0 + 0.05 * math.cos(5 * 2 * math.pi * k / ring))) for k in range(ring)])
    for a, b in zip(rings, rings[1:]):
        for k in range(ring):
            k2 = (k + 1) % ring
            if len(a) == 1:
                bm.faces.new((a[0], b[k], b[k2]))
            elif len(b) == 1:
                bm.faces.new((a[k], b[0], a[k2]))
            else:
                bm.faces.new((a[k], b[k], b[k2], a[k2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    body = place(mesh_obj('banana-body', bm, yellow, coll), root)
    for k, a in enumerate((a0, a1)):
        ar = math.radians(a)
        p = Vector((big_r * math.sin(ar), 0.0, big_r - big_r * math.cos(ar)))
        blob(f'banana-tip-{k}', tipm, coll, body, p, (0.06, 0.06, 0.06))
    ar = math.radians(a1)
    p = Vector((big_r * math.sin(ar), 0.0, big_r - big_r * math.cos(ar)))
    rod('banana-stem', p, p + Vector((0.12, 0.0, 0.2)), 0.06, tipm, coll, body)


def build_egg(root, coll, c):
    def egg(d):
        k = 1.0 - 0.13 * d.z
        return Vector((d.x * k, d.y * k, d.z * (1.18 if d.z > 0 else 0.92)))

    blob('egg-body', mat(c['egg'], 0.32), coll, root, (0.0, 0.0, 0.92), (0.78, 0.78, 1.0), seg=(48, 24), shape=egg)


def build_watermelon(root, coll, c):
    """Half a watermelon: a striped dome with its red cut face (seeds, light rind ring) to the camera."""
    rind = mat(c['melonRind'])
    stripe = mat(c['melonStripe'])
    light = mat(c['melonLight'])
    lean = place(add_empty('melon-lean', (0, 0, 0), coll), root, (0.0, 0.0, 0.0), (-24.0, 0.0, 0.0))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=1.0)
    for v in bm.verts:
        if v.co.y < 0:
            v.co.y = 0.0
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.normal_update()
    for f in bm.faces:
        cm = f.calc_center_median()
        if f.normal.y < -0.9 or cm.y < 0.01:
            f.material_index = 2
            continue
        ang = math.atan2(cm.z, cm.x)
        f.material_index = 1 if math.sin(9 * ang + 2.2 * math.sin(cm.y * 7.0)) > 0.35 else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    dome = place(mesh_obj('melon-dome', bm, [rind, stripe, light], coll), lean, (0.0, 0.0, 1.0))
    flesh = blob('melon-flesh', mat(c['melonFlesh'], 0.45), coll, dome, (0.0, -0.005, 0.0), (0.84, 0.03, 0.84), seg=(48, 12))
    seed = mat(c['iconInk'], 0.3)
    for k in range(9):
        a = 2 * math.pi * k / 9 + 0.3
        r = 0.5 if k % 2 else 0.3
        blob(f'melon-seed-{k}', seed, coll, flesh, (r * math.cos(a), -0.03, r * math.sin(a)), (0.045, 0.02, 0.075), (0.0, math.degrees(-a) + 90.0, 0.0), seg=(12, 6))


# --- script-built props: the bathroom and the picnic (2026-10-21, batch 2) ----------------------------------

def build_soap(root, coll, c):
    """A plump pink soap bar with a heart pressed in its top and a few glossy bubbles."""
    pink = mat(c['tintPink'], 0.3)
    bar = rbox('soap-bar', (1.25, 0.8, 0.5), 0.22, pink, coll, root, (0.0, 0.0, 0.25))
    heart = mat(c['creaturePink'], 0.35)
    for s in (-1, 1):
        blob(f'soap-heart-{s}', heart, coll, bar, (s * 0.1, 0.0, 0.25), (0.14, 0.12, 0.04), (0.0, 0.0, s * -35.0), seg=(20, 10))
    blob('soap-heart-tip', heart, coll, bar, (0.0, 0.08, 0.25), (0.1, 0.1, 0.04), seg=(16, 8))
    bubble = mat(c['white'], 0.15)
    for k, (x, y, z, r) in enumerate(((-0.35, -0.1, 0.62, 0.17), (0.05, 0.05, 0.75, 0.22), (0.42, -0.05, 0.6, 0.13), (-0.1, -0.2, 0.95, 0.1))):
        blob(f'soap-bubble-{k}', bubble, coll, root, (x, y, z), (r, r, r), seg=(24, 12))


def build_potty(root, coll, c):
    """A toddler's potty: a round blue bowl with a white rolled rim, a little handle at the back."""
    blue = mat(c['creatureBlue'])
    white = mat(c['white'])
    prof = rounded_profile(0.55, 0.0, 0.2, 0.4)[:-1]
    prof += [(0.6, 0.35), (0.72, 0.6), (0.8, 0.78), (0.62, 0.8), (0.5, 0.45), (0.0, 0.45)]
    lathe('potty-bowl', prof, blue, coll, root, seg=48)
    torus('potty-rim', 0.74, 0.11, white, coll, root, (0.0, 0.0, 0.8))
    torus('potty-handle', 0.2, 0.07, white, coll, root, (0.0, 0.72, 0.72), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    blob('potty-star', mat(c['tintButter'], 0.4), coll, root, (0.0, -0.66, 0.45), (0.14, 0.05, 0.14), seg=(20, 10))


def build_butterfly(root, coll, c):
    """A chibi butterfly facing the camera (-y): a round head with a face, a little body, two pairs of
    rounded wings on the WingL / WingR pivots (they flap on the react frame) and curly antennae."""
    body_m = mat(c['creaturePurple'])
    light = mat(c['creatureLight'])
    upper = mat(c['tintLilac'])
    lower = mat(c['creaturePink'])
    dot = mat(c['white'], 0.4)
    for side, name in ((-1, 'WingL'), (1, 'WingR')):
        wing = place(add_empty(name, (0, 0, 0), coll), root, (side * 0.12, 0.08, 0.75))
        w1 = blob(f'fly-{name}-upper', upper, coll, wing, (side * 0.62, 0.0, 0.32), (0.62, 0.06, 0.5), (0.0, side * -20.0, 0.0), seg=(32, 12))
        blob(f'fly-{name}-upper-dot', dot, coll, w1, (side * 0.12, -0.06, 0.08), (0.17, 0.02, 0.15), seg=(16, 6))
        w2 = blob(f'fly-{name}-lower', lower, coll, wing, (side * 0.45, 0.01, -0.3), (0.4, 0.05, 0.34), (0.0, side * 25.0, 0.0), seg=(32, 12))
        blob(f'fly-{name}-lower-dot', dot, coll, w2, (side * 0.06, -0.05, -0.04), (0.11, 0.02, 0.1), seg=(16, 6))
    rod('fly-body', (0.0, 0.0, 0.12), (0.0, 0.0, 0.85), 0.16, body_m, coll, root)
    radii = (0.36, 0.33, 0.33)
    head = blob('fly-head', light, coll, root, (0.0, -0.02, 1.12), radii, seg=(40, 20))
    for s in (-1, 1):
        tip = Vector((s * 0.32, 0.0, 0.62))
        rod(f'fly-antenna-{s}', (s * 0.1, 0.0, 0.25), tip, 0.03, body_m, coll, head)
        blob(f'fly-antenna-tip-{s}', lower, coll, head, tip, (0.07, 0.07, 0.07), seg=(16, 8))
    eyes = [on_body(radii, (0, 0, 0), (s * 0.38, -1.0, 0.12)) for s in (-1, 1)]
    cheeks = [on_body(radii, (0, 0, 0), (s * 0.62, -0.9, -0.22)) for s in (-1, 1)]
    smile = on_body(radii, (0, 0, 0), (0.0, -1.0, -0.2))
    chibi_face('fly', head, coll, c, eyes, 0.11, cheeks, (smile[0], smile[1], 0.12))


def apple_leaf(model, coll, c):
    """A soft green leaf by the Tiny Treats apple's stem (it reads as an apple, not a tomato)."""
    top = max(v.co.z for v in model.data.vertices)
    blob('apple-leaf', mat(c['creatureGreen']), coll, model, (0.07, -0.02, top - 0.02), (0.09, 0.035, 0.03), (0.0, -25.0, 20.0), seg=(20, 10))


MODEL_EXTRAS = {'apple': apple_leaf}


SCRIPT_BUILDERS = {
    'fish': build_fish, 'crab': build_crab, 'starfish': build_starfish, 'seagull': build_seagull,
    'beach-ball': build_beach_ball, 'bucket': build_bucket, 'shell': build_shell, 'boat': build_boat,
    'parasol': build_parasol, 'coconut': build_coconut,
    'bus': build_bus, 'truck': build_truck, 'tractor': build_tractor, 'cone': build_cone,
    'banana': build_banana, 'egg': build_egg, 'watermelon': build_watermelon,
    'soap': build_soap, 'potty': build_potty, 'butterfly': build_butterfly,
}


# --- props: building, fitting, posing --------------------------------------------------------------------------

def import_model(stem, pack, coll, name):
    """A Tiny Treats / KayKit model as one joined mesh (cute.import_joined) in `coll`; fails naming it."""
    try:
        path = tt_model(stem, pack)
    except RuntimeError as e:
        fail(str(e))
    o = import_joined(path, name)
    move_to(o, coll)
    return o


def prop_colours(params):
    return {**params['colours'], **params['art']['touchTalk'], 'creatureLight': params['art']['creatureLight']}


def new_sprite(pid, sprites):
    coll = bpy.data.collections.new(f'sprite.{pid}')
    sprites.children.link(coll)
    coll['states'] = json.dumps(STATES, separators=(',', ':'))
    coll['movable'] = 1  # no shadow in the plate
    return coll


def make_prop(pid, kind, src, coll, colours):
    root = add_empty(f'{pid}-root', (0.0, 0.0, 0.0), coll)
    if kind == 'script':
        SCRIPT_BUILDERS[src](root, coll, colours)
    else:
        stem, pack = src
        o = import_model(stem, pack, coll, f'{pid}-model')
        o.parent = root
        recolour(pid, [o], colours)
        if pid in MODEL_EXTRAS:
            MODEL_EXTRAS[pid](o, coll, colours)
    return root


def fit(screen, root, meshes, size_px, at, placement):
    """Scales `root` so the meshes' projected longest side is size_px, then places them at `at`."""
    scene = bpy.context.scene
    for _ in range(FIT_PASSES):
        scene.frame_set(IDLE_FRAME)
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        x0, y0, x1, y1 = screen.rect(pts)
        root.scale = root.scale * (size_px / max(x1 - x0, y1 - y0))
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        bx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
        by = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
        if placement == 'ground':
            dz = at[2] - min(p.z for p in pts)
        else:
            dz = at[2] - (min(p.z for p in pts) + max(p.z for p in pts)) / 2
        root.location += Vector((at[0] - bx, at[1] - by, dz))
    bpy.context.view_layer.update()


def key_pose(pid, root):
    """Frame 1 idle, frame 10 the REACT_POSE (plus the crab's claws / the gull's wings)."""
    (rx, ry, rz), sc = REACT_POSE[pid]
    base_rot = root.rotation_euler.copy()
    base_scale = root.scale.copy()
    root.keyframe_insert('rotation_euler', frame=IDLE_FRAME)
    root.keyframe_insert('scale', frame=IDLE_FRAME)
    root.rotation_euler = (base_rot.x + math.radians(rx), base_rot.y + math.radians(ry), base_rot.z + math.radians(rz))
    root.scale = Vector((base_scale.x * sc[0], base_scale.y * sc[1], base_scale.z * sc[2]))
    root.keyframe_insert('rotation_euler', frame=REACT_FRAME)
    root.keyframe_insert('scale', frame=REACT_FRAME)
    key_constant(root)
    root.rotation_euler = base_rot
    root.scale = base_scale
    if pid == 'starfish':
        body = next(o for o in root.children_recursive if o.name.startswith('starfish-body'))
        body.keyframe_insert('rotation_euler', frame=IDLE_FRAME)
        body.rotation_euler.z += math.radians(STAR_TURN_DEG)
        body.keyframe_insert('rotation_euler', frame=REACT_FRAME)
        key_constant(body)
    subs = {'crab': (('ClawL', 'ClawR'), CRAB_CLAW_DEG, 1), 'seagull': (('WingL', 'WingR'), GULL_WING_DEG, 0), 'butterfly': (('WingL', 'WingR'), FLY_WING_DEG, 2)}
    if pid in subs:
        names, deg, axis = subs[pid]
        for k, name in enumerate(names):
            e = next(o for o in root.children_recursive if o.name.startswith(name))
            side = -1 if k == 0 else 1
            e.keyframe_insert('rotation_euler', frame=IDLE_FRAME)
            r = list(e.rotation_euler)
            r[axis] += math.radians(deg) * (side if axis == 0 else -side)
            e.rotation_euler = r
            e.keyframe_insert('rotation_euler', frame=REACT_FRAME)
            key_constant(e)


def finish_prop(pid, root, coll, layout):
    key_pose(pid, root)
    bpy.context.scene.frame_set(IDLE_FRAME)
    bpy.context.view_layer.update()
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
    hull_object(f'hit.prop-{pid}', [tuple(p) for p in pts], layout)
    return coll


def build_prop(pid, spec, screen, params, sprites, layout):
    kind, src, at, placement, yaw, size_px = spec
    coll = new_sprite(pid, sprites)
    root = make_prop(pid, kind, src, coll, prop_colours(params))
    pitch = FISH_LEAP_DEG if pid == 'fish' else 0.0
    root.rotation_euler = (0.0, -math.radians(pitch), math.radians(yaw))
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    fit(screen, root, meshes, size_px, at, placement)
    return finish_prop(pid, root, coll, layout)


# --- the sea plate ------------------------------------------------------------------------------------------

def beach_z(y):
    if y <= BEACH_FLAT_Y:
        return SAND_Z
    t = min(1.0, (y - BEACH_FLAT_Y) / BEACH_DROP)
    return SAND_Z + (BEACH_LOW - SAND_Z) * (0.5 - 0.5 * math.cos(math.pi * t))


def shore_y():
    lo, hi = BEACH_FLAT_Y, BEACH_FLAT_Y + BEACH_DROP
    for _ in range(40):
        mid = (lo + hi) / 2
        if beach_z(mid) > WATER_Z:
            lo = mid
        else:
            hi = mid
    return lo


def grid_mesh(name, xs, ys, zf, material, coll):
    bm = bmesh.new()
    vs = [[bm.verts.new((x, y, zf(x, y))) for x in xs] for y in ys]
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    return mesh_obj(name, bm, material, coll)


def frange(a, b, step):
    n = max(1, int(round((b - a) / step)))
    return [a + (b - a) * i / n for i in range(n + 1)]


def sky_backdrop(prefix, plate, art, cam_loc, distance, clouds):
    """A far, unlit gradient sky wall facing the camera and puffy clouds in front of it (no shadows)."""
    y = cam_loc[1] + distance
    m = gradient_material(f'{prefix}-sky', 'z', SKY_GRADIENT_Z[0], SKY_GRADIENT_Z[1], art['skyHorizon'], art['skyTop'], emit=True)
    bm = bmesh.new()
    w = distance * 2.0
    bm.faces.new([bm.verts.new(p) for p in ((-w + cam_loc[0], y, -40.0), (w + cam_loc[0], y, -40.0), (w + cam_loc[0], y, 120.0), (-w + cam_loc[0], y, 120.0))])
    sky = mesh_obj(f'{prefix}-sky', bm, m, plate)
    sky.visible_shadow = False
    cloud = flat_material(f'{prefix}-cloud', art['white'], 0.9)
    b = principled(cloud)
    b.inputs['Emission Color'].default_value = hex_to_linear(art['white'])
    b.inputs['Emission Strength'].default_value = 0.35
    puffs = [(-0.9, 0.0, -0.15, 0.55), (-0.35, 0.0, 0.2, 0.75), (0.35, 0.0, 0.15, 0.7), (0.9, 0.0, -0.1, 0.5), (0.0, -0.1, -0.25, 0.6)]
    for i, (x, cy, z, s) in enumerate(clouds):
        for k, (dx, dy, dz, r) in enumerate(puffs):
            o = blob(f'{prefix}-cloud-{i}-{k}', cloud, coll=plate, parent=None, loc=(x + dx * s, cy + dy * s, z + dz * s), size=(r * s, r * s * 0.6, r * s * 0.8), seg=(24, 12))
            o.visible_shadow = False


def build_sea_plate(params, plate):
    art = params['art']['touchTalk']
    # The beach: flat sand sloping under the sea, wet near the water, faintly mottled.
    sand_m = gradient_material('sea-sand', 'z', WATER_Z, SAND_Z - 0.03, art['sandWet'], art['sandLight'], 0.85, noise=(3.0, 0.25))
    ys = frange(BEACH_Y[0], BEACH_FLAT_Y - 1.0, 1.0)[:-1] + frange(BEACH_FLAT_Y - 1.0, BEACH_Y[1], BEACH_STEP[1])
    beach = grid_mesh('sea-beach', frange(BEACH_X[0], BEACH_X[1], BEACH_STEP[0]), ys, lambda x, y: beach_z(y), sand_m, plate)
    beach['cute'] = 1
    for p in beach.data.polygons:
        p.use_smooth = True
    # The sea: near turquoise to far blue, a gentle sheen.
    sea_m = gradient_material('sea-water', 'y', SEA_GRADIENT_Y[0], SEA_GRADIENT_Y[1], art['seaNear'], art['seaFar'], 0.32)
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in ((BEACH_X[0] - 200, BEACH_FLAT_Y, WATER_Z), (BEACH_X[1] + 200, BEACH_FLAT_Y, WATER_Z), (BEACH_X[1] + 200, SEA_FAR_Y, WATER_Z), (BEACH_X[0] - 200, SEA_FAR_Y, WATER_Z))])
    water = mesh_obj('sea-water', bm, sea_m, plate)
    water.visible_shadow = False
    # Foam: a scalloped white line along the water's edge.
    foam = flat_material('sea-foam', art['white'], 0.7)
    sy = shore_y()
    for i in range(FOAM_BLOBS):
        x = -25.0 + 70.0 * i / (FOAM_BLOBS - 1)
        k = 0.8 + 0.35 * math.sin(i * 1.7)
        o = blob(f'sea-foam-{i}', foam, plate, None, (x, sy + 0.05 * math.sin(i * 0.9), WATER_Z + 0.01), (FOAM_SIZE[0] * k, FOAM_SIZE[1] * k, FOAM_SIZE[2]), seg=(20, 8))
        o.visible_shadow = False
    sky_backdrop('sea', plate, art, CAM_SEA_LOC, SKY_Y - CAM_SEA_LOC[1], SEA_CLOUDS)


def build_sea(scene, params):
    scene.name = 'sea'
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    make_camera(scene, 'CamSea', CAM_SEA_LOC, CAM_SEA_TARGET, CAM_SEA_LENS)
    bpy.context.view_layer.update()
    screen = Screen(scene, params)
    plate = bpy.data.collections.new('sea-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites.sea')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout.sea')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_sea_plate(params, plate)
    built = {pid: build_prop(pid, shifted(scene, screen, spec, SEA_SHIFT_PX.get(pid, 0.0)), screen, params, sprites, layout) for pid, spec in SEA_PROPS.items()}
    report(screen, built)


def shifted(scene, screen, spec, dx):
    """`spec` with its anchor moved `dx` design px across the screen, on the anchor's own height."""
    if not dx:
        return spec
    kind, src, at, placement, yaw, size_px = spec
    px, py = screen.project(at)
    p = unproject(scene, px + dx, py, at[2])
    return (kind, src, (p.x, p.y, at[2]), placement, yaw, size_px)


# --- Story 4.6: the street and kitchen plates ----------------------------------------------------------------
# Each is a copy of the `sea` scene's settings (render size, engine, colour management, world) with its
# own geometry, camera and props, built while it is the window's active scene. Their props are fitted
# into PROP_BOXES (design px: x0, y0, x1, y1), a grid whose boxes are 72 px apart (24 px pad each side +
# the 24 px gap) and clear of the edges, the Home/Speaker zones and the two-column bubble area; each prop stands
# on its row's surface (PLATE_ROW_Z) at its box's bottom centre.
# 2026-10-21 (six scenes): the bubbles take two columns, so every box ends by x = 746 (its padded hull
# stays left of the wider bubble keep-out, x ≥ 780); boxes are ≥ 80 px apart.
PROP_BOXES = [
    (150, 100, 290, 226), (378, 100, 518, 226), (606, 100, 746, 226),  # back row
    (56, 302, 196, 432), (331, 302, 471, 432), (606, 302, 746, 432),  # middle row
    (50, 508, 164, 666), (244, 508, 358, 666), (438, 508, 552, 666), (632, 508, 746, 666),  # front row
]
# Props turned towards the camera (degrees about x, then about y: a lean) before the yaw. A positive x
# tilt turns a flat prop's top towards the camera (the cookie, the donut, the waffle, the frisbee).
PROP_TILT = {'spoon': (0.0, -28.0), 'cookie': (62.0, 0.0), 'donut': (50.0, 0.0), 'waffle': (55.0, 0.0), 'frisbee': (35.0, 0.0), 'toothbrush': (30.0, 0.0)}
# Thin props are made chunkier across (x, y) so their tap hull stays wide enough (toddler-style proportions);
# a tuple is (x, y, z) in the model's own axes.
PROP_STRETCH = {'traffic-light': 1.8, 'spoon': 1.5, 'toothbrush': (2.0, 1.0, 2.4)}
BOX_ROW = [0, 0, 0, 1, 1, 1, 2, 2, 2, 2]
PLACE_PASSES = 6
# The same low 3/4 view as the sea, around the origin of an empty scene.
CAM_STREET_LOC = (0.0, -6.4, 1.5)
CAM_STREET_TARGET = (0.0, 0.0, -0.6)
CAM_STREET_LENS = 28.0
CAM_KITCHEN_LOC = (0.0, -6.4, 2.8)
CAM_KITCHEN_TARGET = (0.0, 0.0, 0.4)
CAM_KITCHEN_LENS = 28.0
STREET_ROW_Z = (0.0, 0.0, 0.0)  # every street prop stands on the pavement
KITCHEN_ROW_Z = (1.7, 0.9, 0.0)  # back row on a wall shelf, middle row on the counter, front row on the floor
GROUND_HALF = 60.0  # the pavement / floor plane's half size

# The street: a road band across the screen (design px rows), City Builder tiles scaled to fill it.
ROAD_SCREEN_Y = (430.0, 500.0)  # the road's far and near kerbs (design y at the screen's centre)
ROAD_TILES = 15  # tiles across, the middle one a crossing
SIDEWALK_TILE = 1.4  # the slab grid (m)
VERGE_DEPTH = 1.2  # m: the grass strip behind the back row
VERGE_GAP = 0.9  # m behind the back row's ground line
VERGE_SCREEN_X = [(-8.0, 0.4), (-5.6, 0.75), (-2.65, 0.55), (2.55, 0.55), (6.4, 0.8), (9.0, 0.5)]  # bushes: (x, scale) — between the back-row boxes
STREET_FLOWERS = [-7.0, -4.6, -3.2, 3.4, 5.0, 8.0]
STREETLIGHT_SCREEN_X = [334.0, 562.0]  # design px: the gaps between the back-row boxes
BUILDINGS = ['building_A', 'building_C', 'building_B', 'building_E', 'building_D', 'building_F', 'building_G', 'building_H', 'building_A']
BUILDING_SCALE = 2.6
BUILDING_BACK = 6.5  # metres behind the back row's line
BUILDING_STEP = 5.3
STREET_TREES = [(-14.5, 1.0), (14.0, 1.1)]  # (x, scale) Pretty Park tree_large at the edges
STREET_CLOUDS = [(-36.0, 120.0, 17.0, 5.0), (-10.0, 130.0, 22.0, 4.0), (30.0, 120.0, 19.0, 5.5)]
STREET_HAZE = (0.35, 0.55)  # (blend to haze, saturation) of the buildings
VERGE_HAZE = (0.15, 0.85)

# The kitchen: Tiny Treats Charming Kitchen modules (2 m wide, 1 m counters, 4 m walls) at KITCHEN_SCALE.
KITCHEN_SCALE = 0.9  # the counter's top lands on KITCHEN_ROW_Z[1]
SHELF_DEPTH = 0.42  # m from the back row's ground line to the wall
COUNTER_FRONT = 0.3  # m the counter's front edge stands before the middle row's ground line
WALL_MODULES = 11
COUNTER_MODULES = ['countertop_straight_A', 'countertop_straight_B', 'countertop_straight_C']
COUNTER_HALF = 4  # counter modules each side of the centre one
FRIDGE_X = 9.2
KITCHEN_HAZE = (0.12, 0.85)
RUG_SCALE = (5.2, 1.6)
KITCHEN_LIGHT = 250.0  # area light (W)
KITCHEN_LIGHT_SIZE = 6.0

# propId → (kind, source, yaw°); kind 'model' = (glTF stem, pack substring) via cute.tt_model, 'script' = built here.
STREET_PROPS = {
    'car': ('model', ('car_sedan', 'City-Builder'), -55.0),
    'bus': ('script', 'bus', -60.0),
    'traffic-light': ('model', ('trafficlight_A', 'City-Builder'), 20.0),
    'tree': ('model', ('tree', 'Pretty-Park'), 0.0),
    'house': ('model', ('house', 'Homely-House'), 15.0),
    'police-car': ('model', ('car_police', 'City-Builder'), -55.0),
    'truck': ('script', 'truck', -60.0),
    'tractor': ('script', 'tractor', -60.0),
    'dumpster': ('model', ('dumpster', 'City-Builder'), 15.0),
    'cone': ('script', 'cone', 20.0),
}
KITCHEN_PROPS = {
    'pot': ('model', ('pot', 'Charming-Kitchen'), 0.0),
    'frying-pan': ('model', ('pan', 'Charming-Kitchen'), 90.0),
    'apple': ('model', ('apple', 'Pleasant-Picnic'), 0.0),
    'bread': ('model', ('bread', 'Baked-Goods'), 60.0),
    'banana': ('script', 'banana', 15.0),
    'carrot': ('model', ('food_ingredient_carrot', 'Restaurant'), 20.0),
    'mug': ('model', ('mug_red', 'Charming-Kitchen'), 30.0),
    'spoon': ('model', ('spoon', 'Charming-Kitchen'), 0.0),
    'egg': ('script', 'egg', 0.0),
    'watermelon': ('script', 'watermelon', 15.0),
}
REACT_POSE.update({
    'car': ((0.0, 0.0, 0.0), (1.06, 1.06, 0.92)), 'bus': ((0.0, 0.0, 0.0), (1.06, 1.06, 0.92)),
    'traffic-light': ((5.0, 0.0, 0.0), (1.0, 1.0, 1.0)), 'tree': ((0.0, 6.0, 0.0), (1.0, 1.0, 1.0)),
    'house': ((0.0, 0.0, 0.0), (1.05, 1.05, 0.95)), 'police-car': ((0.0, 0.0, 0.0), (1.06, 1.06, 0.92)),
    'truck': ((0.0, 0.0, 0.0), (1.06, 1.06, 0.92)), 'tractor': ((0.0, 0.0, 0.0), (1.06, 1.06, 0.92)),
    'dumpster': ((0.0, 5.0, 0.0), (1.0, 1.0, 1.0)), 'cone': ((0.0, 8.0, 0.0), (1.0, 1.0, 1.0)),
    'pot': ((0.0, 6.0, 0.0), (1.0, 1.0, 1.0)), 'frying-pan': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)),
    'apple': ((0.0, 10.0, 0.0), (1.0, 1.0, 1.0)), 'bread': ((0.0, 0.0, 0.0), (1.05, 1.05, 0.92)),
    'banana': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)), 'carrot': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)),
    'mug': ((0.0, 8.0, 0.0), (1.0, 1.0, 1.0)), 'spoon': ((0.0, 0.0, 20.0), (1.0, 1.0, 1.0)),
    'egg': ((0.0, 10.0, 0.0), (1.0, 1.0, 1.0)), 'watermelon': ((0.0, 0.0, 0.0), (1.06, 1.06, 0.92)),
})


def unproject(scene, px, py, z):
    """The world point at height `z` seen at design px (px, py) through the scene's camera."""
    cam = scene.camera
    tr, br, bl, tl = [cam.matrix_world @ v for v in cam.data.view_frame(scene=scene)]
    u, v = px / RENDER_DESIGN[0], py / RENDER_DESIGN[1]
    top = tl + (tr - tl) * u
    bot = bl + (br - bl) * u
    d = (top + (bot - top) * v - cam.location).normalized()
    t = (z - cam.location.z) / d.z
    return cam.location + d * t


def screen_x_at(scene, px, py, y):
    """The world x on the ground line y whose screen x is about `px` (the ray through (px, py) at z 0,
    scaled by depth about the camera)."""
    p = unproject(scene, px, py, 0.0)
    cam = scene.camera.location
    return cam.x + (p.x - cam.x) * (y - cam.y) / (p.y - cam.y)


def place_in_box(scene, screen, root, meshes, box, z):
    """Scales the prop to fit `box` (design px) and stands it on height `z` at the box's bottom centre."""
    x0, y0, x1, y1 = box
    target = unproject(scene, (x0 + x1) / 2, y1, z)
    root.location = (target.x, target.y, z)
    for _ in range(PLACE_PASSES):
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        rx0, ry0, rx1, ry1 = screen.rect(pts)
        root.scale = root.scale * min((x1 - x0) / max(rx1 - rx0, 1e-6), (y1 - y0) / max(ry1 - ry0, 1e-6))
        bpy.context.view_layer.update()
        pts = eval_world_verts(meshes, bpy.context.evaluated_depsgraph_get())
        rx0, ry0, rx1, ry1 = screen.rect(pts)
        now = unproject(scene, (rx0 + rx1) / 2, ry1, z)
        root.location += Vector((target.x - now.x, target.y - now.y, z - min(p.z for p in pts)))
    bpy.context.view_layer.update()


def build_box_prop(scene, screen, pid, spec, box, z, params, sprites, layout):
    kind, src, yaw = spec
    coll = new_sprite(pid, sprites)
    inner = make_prop(pid, kind, src, coll, prop_colours(params))
    # The tilt / stretch live on a child pivot so the keyed root keeps a plain rotation.
    tx, ty = PROP_TILT.get(pid, (0.0, 0.0))
    k = PROP_STRETCH.get(pid, 1.0)
    root = add_empty(f'{pid}-place', (0.0, 0.0, 0.0), coll)
    inner.parent = root
    inner.rotation_euler = (math.radians(tx), math.radians(ty), 0.0)
    inner.scale = k if isinstance(k, tuple) else (k, k, 1.0)
    root.rotation_euler = (0.0, 0.0, math.radians(yaw))
    meshes = [o for o in coll.all_objects if o.type == 'MESH']
    place_in_box(scene, screen, root, meshes, box, z)
    return finish_prop(pid, root, coll, layout)


def new_plate(sea, name, cam_loc, cam_target, lens):
    """A scene with the sea's settings and world, nothing in it yet but the Sun; made the active scene."""
    scene = sea.copy()
    scene.name = name
    # Only the window's scene has a user: keep the plate in the saved file.
    scene.use_fake_user = True
    for c in list(scene.collection.children):
        scene.collection.children.unlink(c)
    for o in list(scene.collection.objects):
        scene.collection.objects.unlink(o)
    sun = bpy.data.objects.get('Sun')
    if sun is not None:
        scene.collection.objects.link(sun)
    bpy.context.window_manager.windows[0].scene = scene
    make_camera(scene, f'Cam{name.capitalize()}', cam_loc, cam_target, lens)
    bpy.context.view_layer.update()
    plate = bpy.data.collections.new(f'{name}-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new(f'sprites.{name}')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new(f'layout.{name}')
    scene.collection.children.link(layout)
    layout.hide_render = True
    return scene, plate, sprites, layout


def flat_quad(name, corners, material, coll):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(c) for c in corners])
    return mesh_obj(name, bm, material, coll, smooth=False)


class Kit:
    """Imports each backdrop model once and places linked copies (shared mesh) of it."""

    def __init__(self, coll):
        self.coll = coll
        self.src = {}

    def put(self, stem, pack, name, loc, scale=1.0, yaw=0.0):
        key = (stem, pack)
        if key not in self.src:
            o = import_model(stem, pack, self.coll, name)
            self.src[key] = o
        else:
            o = self.src[key].copy()
            o.name = name
            self.coll.objects.link(o)
        o.location = loc
        o.scale = (scale,) * 3 if isinstance(scale, (int, float)) else scale
        o.rotation_mode = 'XYZ'  # glTF imports come in quaternion mode
        o.rotation_euler = (0.0, 0.0, math.radians(yaw))
        return o


def build_street(sea, params):
    scene, plate, sprites, layout = new_plate(sea, 'street', CAM_STREET_LOC, CAM_STREET_TARGET, CAM_STREET_LENS)
    art = params['art']['touchTalk']
    kit = Kit(plate)
    # The sidewalk everywhere, in soft square slabs.
    flat_quad('street-sidewalk', [(-GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, GROUND_HALF, 0.0), (-GROUND_HALF, GROUND_HALF, 0.0)],
              tile_material('tt-sidewalk', art['pavement'], art['pavementLine'], 1.0 / SIDEWALK_TILE), plate)
    # The road: City Builder tiles whose depth spans ROAD_SCREEN_Y, the middle one a zebra crossing.
    far = unproject(scene, RENDER_DESIGN[0] / 2, ROAD_SCREEN_Y[0], 0.0).y
    near = unproject(scene, RENDER_DESIGN[0] / 2, ROAD_SCREEN_Y[1], 0.0).y
    s = (far - near) / 2.0
    road_y = (far + near) / 2
    for k in range(ROAD_TILES):
        stem = 'road_straight_crossing' if k == ROAD_TILES // 2 else 'road_straight'
        kit.put(stem, 'City-Builder', f'street-road-{k}', ((k - ROAD_TILES // 2) * 2.0 * s, road_y, 0.003), s, 90.0)
    # The verge behind the back row: grass, bushes and flowers between the boxes, two streetlights.
    back = unproject(scene, RENDER_DESIGN[0] / 2, PROP_BOXES[0][3], 0.0).y
    v0 = back + VERGE_GAP
    verge = rbox('street-verge', (2 * GROUND_HALF, VERGE_DEPTH, 0.16), 0.06, mat(art['verge'], 0.8), plate, None, (0.0, v0 + VERGE_DEPTH / 2, 0.08))
    deco = [verge]
    for i, (x, k) in enumerate(VERGE_SCREEN_X):
        deco.append(kit.put('bush', 'Pretty-Park', f'street-bush-{i}', (x, v0 + VERGE_DEPTH / 2, 0.14), k))
    for i, x in enumerate(STREET_FLOWERS):
        deco.append(kit.put('flower_A' if i % 2 else 'flower_B', 'Pretty-Park', f'street-flower-{i}', (x, v0 + 0.3, 0.15), 1.4))
    for i, px in enumerate(STREETLIGHT_SCREEN_X):
        ly = v0 + VERGE_DEPTH - 0.2
        deco.append(kit.put('streetlight', 'City-Builder', f'street-light-{i}', (screen_x_at(scene, px, PROP_BOXES[0][3], ly), ly, 0.14), 3.2, 0.0))
    haze(deco, art['haze'], *VERGE_HAZE)
    # The buildings and two big trees behind, hazed.
    far_objs = []
    by = back + BUILDING_BACK
    for k, stem in enumerate(BUILDINGS):
        x = (k - len(BUILDINGS) // 2) * BUILDING_STEP
        far_objs.append(kit.put(stem, 'City-Builder', f'street-building-{k}', (x, by, 0.0), BUILDING_SCALE, 0.0))
    for i, (x, k) in enumerate(STREET_TREES):
        far_objs.append(kit.put('tree_large', 'Pretty-Park', f'street-tree-{i}', (x, by - 3.0, 0.0), k))
    haze(far_objs, art['haze'], *STREET_HAZE)
    sky_backdrop('street', plate, art, CAM_STREET_LOC, 140.0, STREET_CLOUDS)
    screen = Screen(scene, params)
    built = {pid: build_box_prop(scene, screen, pid, spec, PROP_BOXES[i], STREET_ROW_Z[BOX_ROW[i]], params, sprites, layout) for i, (pid, spec) in enumerate(STREET_PROPS.items())}
    report(screen, built)


def build_kitchen(sea, params):
    scene, plate, sprites, layout = new_plate(sea, 'kitchen', CAM_KITCHEN_LOC, CAM_KITCHEN_TARGET, CAM_KITCHEN_LENS)
    art = params['art']['touchTalk']
    kit = Kit(plate)
    s = KITCHEN_SCALE
    m = 2.0 * s  # one module
    shelf_y = unproject(scene, RENDER_DESIGN[0] / 2, PROP_BOXES[0][3], KITCHEN_ROW_Z[0]).y
    counter_y = unproject(scene, RENDER_DESIGN[0] / 2, PROP_BOXES[3][3], KITCHEN_ROW_Z[1]).y
    wall_y = shelf_y + SHELF_DEPTH
    objs = []
    # Floor tiles from the camera to the wall.
    half = WALL_MODULES // 2
    y = wall_y - m / 2
    j = 0
    while y > CAM_KITCHEN_LOC[1] - m:
        for i in range(-half - 1, half + 2):
            objs.append(kit.put('floor_tiles_kitchen', 'Charming-Kitchen', f'kitchen-floor-{i}-{j}', (i * m, y, -0.5 * s), s))
        y -= m
        j += 1
    # The back wall: tiled modules (the wall models face -y as authored).
    for i in range(-(WALL_MODULES // 2), WALL_MODULES // 2 + 1):
        stem = 'wall_tiles_kitchen_straight'
        objs.append(kit.put(stem, 'Charming-Kitchen', f'kitchen-wall-{i}', (i * m, wall_y + 0.25 * s, 0.0), s, 0.0))
    # The shelf (its top at the back row's height) along the wall.
    for i in range(-(WALL_MODULES // 2), WALL_MODULES // 2 + 1):
        objs.append(kit.put('wall_shelf_kitchen', 'Charming-Kitchen', f'kitchen-shelf-{i}', (i * m, wall_y - 0.35 * s, KITCHEN_ROW_Z[0] - 0.5 * s), s, 0.0))
    # The counter run (top at the middle row's height).
    cy = counter_y - COUNTER_FRONT + 0.75 * s
    for i in range(-COUNTER_HALF, COUNTER_HALF + 1):
        objs.append(kit.put(COUNTER_MODULES[i % len(COUNTER_MODULES)], 'Charming-Kitchen', f'kitchen-counter-{i}', (i * m, cy, 0.0), s, 0.0))
    objs.append(kit.put('fridge', 'Charming-Kitchen', 'kitchen-fridge', (FRIDGE_X, cy - 0.2, 0.0), s, 0.0))
    haze(objs, art['haze'], *KITCHEN_HAZE)
    # A soft striped rug under the front row.
    front = unproject(scene, RENDER_DESIGN[0] / 2, (PROP_BOXES[6][1] + PROP_BOXES[6][3]) / 2, 0.0)
    rug = kit.put('rug_rectangle_stripes_A', 'Furniture', 'kitchen-rug', (0.0, front.y + 0.8, 0.002), (RUG_SCALE[0], RUG_SCALE[1], 1.0))
    haze([rug], art['haze'], *KITCHEN_HAZE)
    light = bpy.data.lights.new('KitchenLight', 'AREA')
    light.energy = KITCHEN_LIGHT
    light.size = KITCHEN_LIGHT_SIZE
    lo = bpy.data.objects.new('KitchenLight', light)
    scene.collection.objects.link(lo)
    lo.location = (0.0, counter_y - 3.0, 4.2)
    screen = Screen(scene, params)
    built = {pid: build_box_prop(scene, screen, pid, spec, PROP_BOXES[i], KITCHEN_ROW_Z[BOX_ROW[i]], params, sprites, layout) for i, (pid, spec) in enumerate(KITCHEN_PROPS.items())}
    report(screen, built)


# --- 2026-10-21 (batch 2): the bathroom, bakery and picnic plates ---------------------------------------------
# Same pattern as the street and the kitchen: a copied scene, a quiet hazed backdrop, the props fitted into
# PROP_BOXES on their row's surface. The bathroom and the bakery use the kitchen's camera, the picnic the street's.
BATHROOM_ROW_Z = (1.7, 0.0, 0.0)  # back row on a wall shelf, middle and front rows on the floor
BAKERY_ROW_Z = (1.7, 0.9, 0.0)  # back row on a wall shelf, middle row on the counter, front row on the display table
PICNIC_ROW_Z = (0.0, 0.0, 0.0)  # everything on the grass
ROOM_SCALE = 0.9  # Tiny Treats modules (2 m wide, 4 m walls) at this scale, as the kitchen
BATH_PLANT_SCREEN_X = [263.0, 538.0]  # design px: potted plants by the wall in the middle row's gaps
BATH_MAT_SCALE = (2.8, 1.3)
BATH_MAT_HAZE = (0.18, 0.8)
BAKERY_FLOOR_Z = -0.6  # the shop floor: the display table's top is at 0, the counter's at 0.9
BAKERY_TABLE_SCREEN_Y = (478.0, 700.0)  # design y of the display table's back and front edges (z 0)
BAKERY_TABLE_HALF = 14.0
AWNING_Z = (3.05, 3.7)  # the striped awning band across the top of the back wall
AWNING_STRIPES = 24
PICNIC_BLANKET_SCALE = (1.0, 0.75)
PICNIC_BLANKET_SCREEN = (398.0, 545.0)  # design px of the blanket's centre (z 0)
PICNIC_GRASS_Y = (-8.0, 20.0)  # grassNear → verge
PICNIC_BUSHES = [(-9.0, 1.0), (-5.6, 0.8), (-2.1, 0.7), (1.6, 0.75), (4.6, 0.9), (8.5, 1.0), (11.5, 0.8)]  # (x, scale) behind the back row
PICNIC_TREES = [(-12.5, 2.6, 'tree_large', 1.2), (-6.5, 4.5, 'tree', 1.1), (3.0, 5.0, 'tree_large', 1.0), (10.5, 3.0, 'tree', 1.2), (15.0, 1.5, 'tree_large', 1.1)]  # (x, y behind, stem, scale)
PICNIC_FLOWERS = 26
PICNIC_TUFTS = 34
PICNIC_SEED = 7
PICNIC_HAZE = (0.3, 0.6)
PICNIC_NEAR_HAZE = (0.1, 0.9)
PICNIC_CLOUDS = [(-34.0, 120.0, 18.0, 5.0), (-6.0, 130.0, 23.0, 4.2), (26.0, 120.0, 19.0, 5.5)]

BATHROOM_PROPS = {
    'toothbrush': ('model', ('toothbrush_blue', 'Bubbly-Bathroom'), 90.0),
    'toothbrush-cup': ('model', ('toothbrush_cup', 'Bubbly-Bathroom'), 20.0),
    'shampoo': ('model', ('container_bathroom_A_pink', 'Bubbly-Bathroom'), 0.0),
    'mirror': ('model', ('mirror', 'Bubbly-Bathroom'), 10.0),
    'bathtub': ('model', ('bath', 'Bubbly-Bathroom'), 90.0),
    'towel': ('model', ('towel_pink', 'Bubbly-Bathroom'), 15.0),
    'rubber-duck': ('model', ('ducky', 'Bubbly-Bathroom'), -30.0),
    'slippers': ('model', ('slippers', 'Bubbly-Bathroom'), 10.0),
    'soap': ('script', 'soap', 15.0),
    'potty': ('script', 'potty', 20.0),
}
BAKERY_PROPS = {
    'cookie': ('model', ('cookie', 'Baked-Goods'), 0.0),
    'croissant': ('model', ('croissant', 'Baked-Goods'), 10.0),
    'cinnamon-roll': ('model', ('cinnamon_roll', 'Baked-Goods'), 0.0),
    'birthday-cake': ('model', ('cake_birthday', 'Baked-Goods'), 0.0),
    'chocolate-cake': ('model', ('cake_chocolate', 'Baked-Goods'), 0.0),
    'apple-pie': ('model', ('pie_apple', 'Baked-Goods'), 0.0),
    'cupcake': ('model', ('cupcake', 'Baked-Goods'), 0.0),
    'donut': ('model', ('donut_pink', 'Baked-Goods'), 0.0),
    'muffin': ('model', ('muffin', 'Baked-Goods'), 0.0),
    'waffle': ('model', ('waffle', 'Baked-Goods'), 0.0),
}
PICNIC_PROPS = {
    'butterfly': ('script', 'butterfly', 0.0),
    'radio': ('model', ('radio', 'Pleasant-Picnic'), 10.0),
    'cooler': ('model', ('cooler', 'Pleasant-Picnic'), -15.0),
    'picnic-basket': ('model', ('picnic_basket_round', 'Pleasant-Picnic'), 15.0),
    'teapot': ('model', ('teapot', 'Pleasant-Picnic'), 0.0),
    'pillow': ('model', ('pillow_small_red', 'Pleasant-Picnic'), 10.0),
    'sandwich': ('model', ('sandwich', 'Pleasant-Picnic'), 20.0),
    'grapes': ('model', ('grapes', 'Pleasant-Picnic'), 0.0),
    'cheese': ('model', ('cheese_A', 'Pleasant-Picnic'), 60.0),
    'frisbee': ('model', ('frisbee', 'Pleasant-Picnic'), 0.0),
}
REACT_POSE.update({
    'toothbrush': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)), 'toothbrush-cup': ((0.0, 8.0, 0.0), (1.0, 1.0, 1.0)),
    'shampoo': ((0.0, 0.0, 0.0), (1.08, 1.08, 0.9)), 'mirror': ((0.0, 5.0, 0.0), (1.0, 1.0, 1.0)),
    'bathtub': ((0.0, 0.0, 0.0), (1.05, 1.05, 0.94)), 'towel': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)),
    'rubber-duck': ((0.0, 12.0, 0.0), (1.0, 1.0, 1.0)), 'slippers': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)),
    'soap': ((0.0, 0.0, 0.0), (1.08, 1.08, 0.86)), 'potty': ((0.0, 8.0, 0.0), (1.0, 1.0, 1.0)),
    'cookie': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)), 'croissant': ((0.0, 8.0, 0.0), (1.0, 1.0, 1.0)),
    'cinnamon-roll': ((0.0, 0.0, 20.0), (1.0, 1.0, 1.0)), 'birthday-cake': ((0.0, 0.0, 0.0), (1.05, 1.05, 0.94)),
    'chocolate-cake': ((0.0, 0.0, 0.0), (1.05, 1.05, 0.94)), 'apple-pie': ((0.0, 6.0, 0.0), (1.0, 1.0, 1.0)),
    'cupcake': ((0.0, 0.0, 0.0), (1.07, 1.07, 0.9)), 'donut': ((0.0, 0.0, 20.0), (1.0, 1.0, 1.0)),
    'muffin': ((0.0, 0.0, 0.0), (1.07, 1.07, 0.9)), 'waffle': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)),
    'butterfly': ((0.0, 0.0, 0.0), (1.0, 1.0, 1.0)), 'radio': ((0.0, 6.0, 0.0), (1.0, 1.0, 1.0)),
    'cooler': ((0.0, 0.0, 0.0), (1.05, 1.05, 0.94)), 'picnic-basket': ((0.0, 7.0, 0.0), (1.0, 1.0, 1.0)),
    'teapot': ((0.0, 10.0, 0.0), (1.0, 1.0, 1.0)), 'pillow': ((0.0, 0.0, 0.0), (1.08, 1.08, 0.88)),
    'sandwich': ((0.0, 0.0, 0.0), (1.06, 1.06, 0.92)), 'grapes': ((0.0, 8.0, 0.0), (1.0, 1.0, 1.0)),
    'cheese': ((0.0, 0.0, 15.0), (1.0, 1.0, 1.0)), 'frisbee': ((0.0, 0.0, 25.0), (1.0, 1.0, 1.0)),
})


def room_light(scene, y):
    light = bpy.data.lights.new(f'{scene.name}-light', 'AREA')
    light.energy = KITCHEN_LIGHT
    light.size = KITCHEN_LIGHT_SIZE
    lo = bpy.data.objects.new(f'{scene.name}-light', light)
    scene.collection.objects.link(lo)
    lo.location = (0.0, y - 3.0, 4.2)


def box_props(scene, params, sprites, layout, props, row_z):
    screen = Screen(scene, params)
    built = {pid: build_box_prop(scene, screen, pid, spec, PROP_BOXES[i], row_z[BOX_ROW[i]], params, sprites, layout) for i, (pid, spec) in enumerate(props.items())}
    report(screen, built)


def room_floor(kit, stem, pack, name, wall_y, z):
    """Floor modules from the wall to behind the camera (their top at z)."""
    s = ROOM_SCALE
    m = 2.0 * s
    half = WALL_MODULES // 2
    out = []
    y = wall_y - m / 2
    j = 0
    while y > CAM_KITCHEN_LOC[1] - m:
        for i in range(-half - 1, half + 2):
            out.append(kit.put(stem, pack, f'{name}-floor-{i}-{j}', (i * m, y, z - 0.5 * s), s))
        y -= m
        j += 1
    return out


def build_bathroom(sea, params):
    scene, plate, sprites, layout = new_plate(sea, 'bathroom', CAM_KITCHEN_LOC, CAM_KITCHEN_TARGET, CAM_KITCHEN_LENS)
    art = params['art']['touchTalk']
    kit = Kit(plate)
    s = ROOM_SCALE
    m = 2.0 * s
    half = WALL_MODULES // 2
    shelf_y = unproject(scene, RENDER_DESIGN[0] / 2, PROP_BOXES[0][3], BATHROOM_ROW_Z[0]).y
    wall_y = shelf_y + SHELF_DEPTH
    objs = room_floor(kit, 'floor_tiled', 'Bubbly-Bathroom', 'bathroom', wall_y, 0.0)
    for i in range(-half, half + 1):
        objs.append(kit.put('wall_tiled_straight', 'Bubbly-Bathroom', f'bathroom-wall-{i}', (i * m, wall_y + 0.25 * s, 0.0), s, 0.0))
        objs.append(kit.put('wall_shelf', 'Bubbly-Bathroom', f'bathroom-shelf-{i}', (i * m, wall_y - 0.35 * s, BATHROOM_ROW_Z[0] - 0.5 * s), s, 0.0))
    for i, px in enumerate(BATH_PLANT_SCREEN_X):
        py = wall_y - 0.55
        objs.append(kit.put('plant', 'Bubbly-Bathroom', f'bathroom-plant-{i}', (screen_x_at(scene, px, PROP_BOXES[3][3], py), py, 0.0), 1.0))
    haze(objs, art['haze'], *KITCHEN_HAZE)
    front = unproject(scene, (PROP_BOXES[6][0] + PROP_BOXES[9][2]) / 2, (PROP_BOXES[6][1] + PROP_BOXES[6][3]) / 2, 0.0)
    rug = kit.put('mat', 'Bubbly-Bathroom', 'bathroom-mat', (front.x, front.y + 0.5, 0.002), (BATH_MAT_SCALE[0], BATH_MAT_SCALE[1], 1.0))
    haze([rug], art['haze'], *BATH_MAT_HAZE)
    room_light(scene, unproject(scene, RENDER_DESIGN[0] / 2, PROP_BOXES[3][3], 0.0).y)
    box_props(scene, params, sprites, layout, BATHROOM_PROPS, BATHROOM_ROW_Z)


def build_bakery(sea, params):
    scene, plate, sprites, layout = new_plate(sea, 'bakery', CAM_KITCHEN_LOC, CAM_KITCHEN_TARGET, CAM_KITCHEN_LENS)
    art = params['art']['touchTalk']
    c = prop_colours(params)
    kit = Kit(plate)
    s = ROOM_SCALE
    m = 2.0 * s
    half = WALL_MODULES // 2
    fz = BAKERY_FLOOR_Z
    shelf_y = unproject(scene, RENDER_DESIGN[0] / 2, PROP_BOXES[0][3], BAKERY_ROW_Z[0]).y
    counter_y = unproject(scene, RENDER_DESIGN[0] / 2, PROP_BOXES[3][3], BAKERY_ROW_Z[1]).y
    wall_y = shelf_y + SHELF_DEPTH
    objs = room_floor(kit, 'floor_tiles_kitchen', 'Charming-Kitchen', 'bakery', wall_y, fz)
    for i in range(-half, half + 1):
        objs.append(kit.put('wall_plain_kitchen_straight', 'Charming-Kitchen', f'bakery-wall-{i}', (i * m, wall_y + 0.25 * s, fz), s, 0.0))
        objs.append(kit.put('wall_shelf_kitchen', 'Charming-Kitchen', f'bakery-shelf-{i}', (i * m, wall_y - 0.35 * s, BAKERY_ROW_Z[0] - 0.5 * s), s, 0.0))
    # The shop counter (its top at the middle row's height) standing on the lower shop floor.
    cy = counter_y - COUNTER_FRONT + 0.75 * s
    for i in range(-COUNTER_HALF - 1, COUNTER_HALF + 2):
        objs.append(kit.put(COUNTER_MODULES[i % len(COUNTER_MODULES)], 'Charming-Kitchen', f'bakery-counter-{i}', (i * m, cy, fz), (s, s, BAKERY_ROW_Z[1] - fz), 0.0))
    haze(objs, art['haze'], *KITCHEN_HAZE)
    # The striped awning across the top of the wall, scalloped along its lower edge.
    stripe = [mat(c['tintPink'], 0.7), mat(c['white'], 0.7)]
    w = 2.0 * half * m / AWNING_STRIPES
    z0, z1 = AWNING_Z
    for k in range(AWNING_STRIPES + 1):
        x = -half * m + k * w
        rbox(f'bakery-awning-{k}', (w, 0.3, z1 - z0), 0.04, stripe[k % 2], plate, None, (x, wall_y - 0.45, (z0 + z1) / 2))
        blob(f'bakery-scallop-{k}', stripe[k % 2], plate, None, (x, wall_y - 0.45, z0), (w / 2, 0.15, w / 2.6), seg=(24, 12))
    # The display table for the front row: a pink cloth with a white scalloped trim on a pink table, top at z 0.
    yb = unproject(scene, RENDER_DESIGN[0] / 2, BAKERY_TABLE_SCREEN_Y[0], 0.0).y
    yf = unproject(scene, RENDER_DESIGN[0] / 2, BAKERY_TABLE_SCREEN_Y[1], 0.0).y
    rbox('bakery-table', (2 * BAKERY_TABLE_HALF, yb - yf, -fz), 0.08, mat(c['counterPink'], 0.6), plate, None, (0.0, (yb + yf) / 2, fz / 2))
    rbox('bakery-cloth', (2 * BAKERY_TABLE_HALF + 0.06, yb - yf + 0.06, 0.06), 0.03, mat(c['tintPink'], 0.75), plate, None, (0.0, (yb + yf) / 2, -0.03))
    trim = mat(c['white'], 0.7)
    for k in range(int(2 * BAKERY_TABLE_HALF / 0.5)):
        blob(f'bakery-trim-{k}', trim, plate, None, (-BAKERY_TABLE_HALF + 0.25 + 0.5 * k, yf - 0.03, -0.1), (0.25, 0.04, 0.12), seg=(16, 8))
    room_light(scene, counter_y)
    box_props(scene, params, sprites, layout, BAKERY_PROPS, BAKERY_ROW_Z)


def build_picnic(sea, params):
    scene, plate, sprites, layout = new_plate(sea, 'picnic', CAM_STREET_LOC, CAM_STREET_TARGET, CAM_STREET_LENS)
    art = params['art']['touchTalk']
    kit = Kit(plate)
    grass_m = gradient_material('picnic-grass', 'y', PICNIC_GRASS_Y[0], PICNIC_GRASS_Y[1], art['grassNear'], art['verge'], 0.85, noise=(2.0, 0.2))
    flat_quad('picnic-grass', [(-GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, -GROUND_HALF, 0.0), (GROUND_HALF, GROUND_HALF, 0.0), (-GROUND_HALF, GROUND_HALF, 0.0)], grass_m, plate)
    back = unproject(scene, RENDER_DESIGN[0] / 2, PROP_BOXES[0][3], 0.0).y
    # The blanket under the middle and front rows.
    bc = unproject(scene, PICNIC_BLANKET_SCREEN[0], PICNIC_BLANKET_SCREEN[1], 0.0)
    blanket = kit.put('picnic_blanket_red', 'Pleasant-Picnic', 'picnic-blanket', (bc.x, bc.y, 0.002), (PICNIC_BLANKET_SCALE[0], PICNIC_BLANKET_SCALE[1], 1.0))
    haze([blanket], art['haze'], *PICNIC_NEAR_HAZE)
    # Grass tufts and flowers scattered on the lawn (seeded; none on the blanket), bushes behind the back row.
    rnd = random.Random(PICNIC_SEED)
    deco = []
    for i in range(PICNIC_TUFTS):
        x, y = rnd.uniform(-9.0, 9.0), rnd.uniform(back - 7.0, back + 1.5)
        yaw = rnd.uniform(0.0, 360.0)
        if abs(x - bc.x) < 2.8 and abs(y - bc.y) < 2.2:
            continue
        deco.append(kit.put('grass_A' if i % 2 else 'grass_B', 'Pretty-Park', f'picnic-tuft-{i}', (x, y, 0.0), 1.0, yaw))
    for i in range(PICNIC_FLOWERS):
        x, y = rnd.uniform(-12.0, 12.0), rnd.uniform(back + 0.6, back + 2.6)
        deco.append(kit.put('flower_A' if i % 2 else 'flower_B', 'Pretty-Park', f'picnic-flower-{i}', (x, y, 0.0), 1.5, rnd.uniform(0.0, 360.0)))
    for i, (x, k) in enumerate(PICNIC_BUSHES):
        deco.append(kit.put('bush', 'Pretty-Park', f'picnic-bush-{i}', (x, back + 3.2, 0.0), k * 1.6))
    haze(deco, art['haze'], *PICNIC_NEAR_HAZE)
    far = []
    for i, (x, dy, stem, k) in enumerate(PICNIC_TREES):
        far.append(kit.put(stem, 'Pretty-Park', f'picnic-tree-{i}', (x, back + 4.0 + dy, 0.0), k * 1.5))
    far.append(kit.put('bench', 'Pretty-Park', 'picnic-bench', (-3.6, back + 5.0, 0.0), 1.5, 10.0))
    haze(far, art['haze'], *PICNIC_HAZE)
    sky_backdrop('picnic', plate, art, CAM_STREET_LOC, 140.0, PICNIC_CLOUDS)
    box_props(scene, params, sprites, layout, PICNIC_PROPS, PICNIC_ROW_Z)


def main():
    args = parse_args('build_touch_talk', required=('out', 'params'))
    params = args['params']
    global RENDER_DESIGN
    RENDER_DESIGN = (params['design']['width'], params['design']['height'])
    sea = bpy.context.scene
    clear_island(sea)
    build_sea(sea, params)
    # Story 4.6: the street and kitchen plates, each built as the active scene; the sea stays the file's default.
    build_street(sea, params)
    build_kitchen(sea, params)
    # 2026-10-21 (batch 2): the bathroom, bakery and picnic plates.
    build_bathroom(sea, params)
    build_bakery(sea, params)
    build_picnic(sea, params)
    # The soft toy look (cute.py) on every plate scene, last so every builder-made mesh gets it.
    for sc in [sea] + [s for s in bpy.data.scenes if s is not sea]:
        bpy.context.window_manager.windows[0].scene = sc
        sc.frame_set(IDLE_FRAME)
        soften_scene(sc)
    bpy.context.window_manager.windows[0].scene = sea
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_touch_talk: saved {args["out"]}')


def report(screen, built):
    """Diagnostics in design px (the rules themselves run in TypeScript on the render)."""
    dg = bpy.context.evaluated_depsgraph_get()
    fmt = lambda r: f'({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}×{r[3] - r[1]:.0f}'  # noqa: E731
    for pid, coll in built.items():
        pts = eval_world_verts([o for o in coll.all_objects if o.type == 'MESH'], dg)
        print(f'build_touch_talk: {screen.scene.name} {pid} {fmt(screen.rect(pts))}')


main()
