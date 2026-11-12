# Builds art/rocket.blend (Tên lửa lên Mặt Trăng, spec-ten-lua, 2026-11-12) from the vendored island art/src/map-v3.blend
# (only its render settings and Sun are kept; the world is replaced). Grown from the art gate's concept script
# (_backup/2026-11-12-ten-lua/concept/concept.py), whose 4 hero frames the parent approved.
#
# Run by `npm run art:build -- rocket` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_rocket.py -- \
#     --out <tmp>/rocket.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens and content): colours, art.rocket, art.creatureLight, rocket (parts,
# colours, surprises, aliens, craters, rocks, the sizes), design size, the interactive rect.
#
# One plate, 2048×1536, seen through Phi công nhí's ORTHOGRAPHIC camera (tilted CAM_PITCH degrees down): space — an
# indigo-violet gradient (never black: art.rocket.spaceDeep is its darkest), soft additive nebulae and tiny stars. The
# sunrise sky is the scene's own runtime gradient over it. Everything else is a sprite rendered where it stands at its
# step (full frame); the scene moves each by its own offset:
#   - the pad world (lit warm, timeline frames 1…99): lawn, hills, sun, launchpad (the pad and its tower), cloud a|b,
#     bird a|b, plane a|b (the cameo: a toy plane, its fox pilot waving), bubble, puff, spark, glow (a white soft disc
#     for runtime additive glows), smoke a|b|c (volumetric: the launch bank growing), astro idle|wave|jump|happy
#     (Shiba in a fishbowl helmet, by the pad), the rocket's parts body|nose|fins-<colour> (on the pad, its nozzle's
#     bottom on anchor.rocket; the fins and the pilot are cut by a holdout copy of the body), pilot
#     empty|idle|wave|happy (the porthole's glass, Shiba's face behind it), flame a|b|c (under the nozzle), parachute
#     (over the nose);
#   - space (lit cool, frames 101…199): earth (the big round Earth below; only its top shows), earthsmall (the Earth
#     seen from the Moon), moonfar (the faceless Moon ahead), star a|b, the surprises comet, ringed, ufo idle|wave,
#     satellite a|b;
#   - the Moon (lit cool, frames 201…299): moon (the ground, its ridges and three craters of one size), alien-<id>
#     peek|wave (in crater 0, its lower half cut by the ground: bhc_holdout_sprites), rock (on rock 0), flag.
# Layout: anchors rocket, fly, moon-rocket, porthole, astro, astro-moon, earth, earth-moon, moonfar, flag, sun,
# choice-<n>, crater-<n>, rock-<n>; hits rocket, moon-rocket, earth, earth-moon, choice-<n>, crater-<n>.
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
from cute import blob, chibi, chibi_face, chibi_materials, key_chibi, lathe, mat, mesh_obj, on_body, rbox, rod, soften_scene, torus, torus_bm  # noqa: E402
from common import add_empty, eval_world_verts, hex_to_linear, hull_object, key_constant, parse_args  # noqa: E402
from build_plane import bird_body, gore_ball, puffs  # noqa: E402  (its main() only runs as a script)

RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main

# --- the camera: orthographic, looking along +y, tilted down (as build_plane.py) ------------------------------------
PPM = 100.0  # design px per metre
CAM_PITCH = 12.0
CAM_DISTANCE = 60.0
GROUND_PX = (512.0, 640.0)  # design px of world (0, 0, 0)

# --- the timeline bands: each band has its own light (the pad's warm sunrise, space, the Moon) ----------------------
F_PAD, F_SPACE, F_MOON = 1, 101, 201
BANDS = {
    F_PAD: {'sun': '#FFE8CF', 'energy': 3.0, 'rot': (55.0, 10.0, -40.0), 'world': '#FFE3D6', 'strength': 0.55},
    F_SPACE: {'sun': '#FFF6EE', 'energy': 3.2, 'rot': (40.0, 0.0, -55.0), 'world': '#B9A8F0', 'strength': 0.6},
    F_MOON: {'sun': '#FFF6EE', 'energy': 3.0, 'rot': (48.0, 0.0, -40.0), 'world': '#B9A8F0', 'strength': 0.7},
}

# --- where things stand (design px) ---------------------------------------------------------------------------------
ROCKET_PX = (300.0, 600.0)  # the nozzle's bottom on the pad
ROCKET_H_PX = 320.0
FLY_PX = (430.0, 500.0)  # the nozzle's bottom while it flies (the scene moves the rocket here)
MOON_ROCKET_PX = (180.0, 612.0)  # the nozzle's bottom on the Moon
ASTRO_PX = (545.0, 655.0)  # Shiba by the pad (ground pivot)
ASTRO_H_PX = 175.0
ASTRO_MOON_PX = (560.0, 645.0)
CHOICE_PX = [(790.0, 320.0), (790.0, 560.0)]
BUBBLE_PX = 176.0
EARTH_PX = (380.0, 1010.0)  # the big Earth's centre (below the screen)
EARTH_R_PX = 470.0
EARTH_TAP_PX = (330.0, 640.0)  # anchor.earth: a point on its visible cap
EARTH_MOON_PX = (800.0, 160.0)
EARTH_MOON_R_PX = 72.0
MOONFAR_PX = (790.0, 175.0)
MOONFAR_R_PX = 82.0
CRATER_PX = [(730.0, 625.0), (912.0, 548.0), (390.0, 672.0)]
CRATER_R = 0.8  # metres
CRATER_HIT_R = 0.75  # metres: a crater's tap area (unpadded; the rim is drawn a little wider)
CRATER_PEEK_PX = 95.0  # a crater's tap area reaches this far above it (where the alien peeks)
ROCK_PX = [(640.0, 560.0), (965.0, 650.0)]
FLAG_PX = (285.0, 655.0)
SUN_PX = (600.0, 430.0)
HIT_PAD_PX = 24.0

# --- free sprites: (centre px, longest side px); placed by their trimmed centre at runtime ---------------------------
FREE = {
    'cloud-a': ((512.0, 200.0), 210.0), 'cloud-b': ((512.0, 200.0), 170.0),
    'bird': ((700.0, 300.0), 62.0), 'plane': ((300.0, 300.0), 220.0),
    'bubble': (CHOICE_PX[0], BUBBLE_PX), 'puff': ((600.0, 400.0), 96.0), 'spark': ((600.0, 400.0), 52.0),
    'glow': ((512.0, 384.0), 240.0), 'star-a': ((512.0, 300.0), 44.0), 'star-b': ((512.0, 300.0), 30.0),
    'comet': ((700.0, 260.0), 240.0), 'ringed': ((700.0, 260.0), 200.0), 'ufo': ((700.0, 260.0), 190.0),
    'satellite': ((700.0, 260.0), 200.0),
}
FREE_Y = -6.0
HIDDEN = (0.0001, 0.0001, 0.0001)
SEED = 7

P = math.radians(CAM_PITCH)
VIEW = Vector((0.0, math.cos(P), -math.sin(P)))
TX = 0.0
TZ = 0.0
C = {}  # art.rocket, set in main
COL = {}  # Tokens.colors (+ white), set in main
PARAMS = {}


def fail(msg):
    raise RuntimeError(f'build_rocket: {msg}')


def log(msg):
    print(f'build_rocket: {msg}')


# --- coordinates ----------------------------------------------------------------------------------------------------

def wx(sx):
    return TX + (sx - DESIGN[0] / 2) / PPM


def wz(sy, y):
    """World z of the point at depth y drawn at design px y."""
    return ((DESIGN[1] / 2 - sy) / PPM - y * math.sin(P)) / math.cos(P) + TZ


def gy(sy, z=0.0):
    """World depth of the point at height z drawn at design px y."""
    return ((DESIGN[1] / 2 - sy) / PPM - (z - TZ) * math.cos(P)) / math.sin(P)


def pt(sx, sy, y):
    return Vector((wx(sx), y, wz(sy, y)))


def screen_shift(dx, dy):
    """The world offset that moves a point by (dx, dy) design px on screen (at any depth)."""
    return Vector((dx / PPM, 0.0, -dy / PPM / math.cos(P)))


def setup_camera(scene):
    global TX, TZ
    TX = -(GROUND_PX[0] - DESIGN[0] / 2) / PPM
    TZ = (GROUND_PX[1] - DESIGN[1] / 2) / PPM / math.cos(P)
    data = bpy.data.cameras.new('CamRocket')
    data.type = 'ORTHO'
    data.ortho_scale = DESIGN[0] / PPM
    data.clip_start = 0.1
    data.clip_end = 400.0
    cam = bpy.data.objects.new('CamRocket', data)
    scene.collection.objects.link(cam)
    cam.location = Vector((TX, 0.0, TZ)) - VIEW * CAM_DISTANCE
    cam.rotation_euler = VIEW.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    global FACING
    from mathutils import Euler
    FACING = Euler((-P, 0.0, 0.0)).to_quaternion()


def project(p):
    scene = bpy.context.scene
    v = world_to_camera_view(scene, scene.camera, Vector(p))
    return (v.x * DESIGN[0], (1 - v.y) * DESIGN[1])


def world_pts(objs):
    bpy.context.view_layer.update()
    return eval_world_verts([o for o in objs if o.type == 'MESH'], bpy.context.evaluated_depsgraph_get())


def rect_pts(pts):
    sp = [project(p) for p in pts]
    xs, ys = [p[0] for p in sp], [p[1] for p in sp]
    return (min(xs), min(ys), max(xs), max(ys))


def fmt_rect(r):
    return f'({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}'


def meshes_of(root):
    return [o for o in root.children_recursive if o.type == 'MESH']


def rect_of(root):
    return rect_pts(world_pts(meshes_of(root)))


def fit(root, at, longest=None, height=None, width=None, bottom=False):
    """Scales `root` and moves it so its drawn centre (or bottom centre) is `at` (design px). Returns its drawn rect."""
    r = rect_of(root)
    w, h = r[2] - r[0], r[3] - r[1]
    k = longest / max(w, h) if longest is not None else height / h if height is not None else width / w
    root.scale = root.scale * k
    for _ in range(3):
        r = rect_of(root)
        root.location.x += (at[0] - (r[0] + r[2]) / 2) / PPM
        root.location.z -= (at[1] - (r[3] if bottom else (r[1] + r[3]) / 2)) / PPM / math.cos(P)
    return rect_of(root)


# --- collections ----------------------------------------------------------------------------------------------------

def empty(name, coll, parent=None, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), scale=1.0):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.2
    coll.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_euler = tuple(math.radians(a) for a in rot)
    e.scale = (scale, scale, scale)
    return e


def billboard(name, coll, loc):
    """A root empty whose local front (-y) faces the camera (its local z is up the screen)."""
    e = empty(name, coll, None, loc)
    e.rotation_euler = (-P, 0.0, 0.0)
    return e


SPRITES = None
RIG = None
LAYOUT = None


def sprite(name, states=None, **props):
    coll = bpy.data.collections.new(f'sprite.{name}')
    SPRITES.children.link(coll)
    coll['movable'] = 1
    if states is not None:
        coll['states'] = json.dumps(states, separators=(',', ':'))
    for k, v in props.items():
        coll[k] = v
    return coll


def show_on(obj, on, frames):
    """Keys the object visible (its scale) on the frames in `on` and hidden on the others."""
    keep = tuple(obj.scale)
    for f in frames:
        obj.scale = keep if f in on else HIDDEN
        obj.keyframe_insert('scale', frame=f)
    key_constant(obj)


def variants(coll, parent, names, frames):
    """One empty per state name, each shown only on its own timeline frame. Returns {name: empty}."""
    out = {}
    for n, f in zip(names, frames):
        e = empty(f'{coll.name}-{n}', coll, parent)
        show_on(e, [f], frames)
        out[n] = e
    return out


# --- materials ------------------------------------------------------------------------------------------------------

def _blended(m):
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = False


def emit(hex_colour, strength=1.0):
    m = bpy.data.materials.new(f'emit-{hex_colour}-{strength}')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_to_linear(hex_colour)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


GLOW_EDGE = 0.9  # a glow quad's radial falloff reaches 0 at this share of its half-size


def _radial(nt, falloff):
    """A node output: 1 at the object's origin, 0 at radius 1, ^falloff."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    ln = nt.nodes.new('ShaderNodeVectorMath')
    ln.operation = 'LENGTH'
    nt.links.new(tc.outputs['Object'], ln.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = 0.0
    mr.inputs['From Max'].default_value = GLOW_EDGE  # clear well inside the quad: no square edge (a runtime ADD blend shows it)
    mr.inputs['To Min'].default_value = 1.0
    mr.inputs['To Max'].default_value = 0.0
    nt.links.new(ln.outputs['Value'], mr.inputs['Value'])
    pw = nt.nodes.new('ShaderNodeMath')
    pw.operation = 'POWER'
    pw.inputs[1].default_value = falloff
    nt.links.new(mr.outputs['Result'], pw.inputs[0])
    return pw.outputs[0]


def add_glow(hex_colour, strength=1.0, falloff=2.0):
    """Additive radial glow (the plate only: an opaque render)."""
    m = bpy.data.materials.new(f'addglow-{hex_colour}')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = strength
    nt.links.new(_radial(nt, falloff), mul.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_to_linear(hex_colour)
    nt.links.new(mul.outputs[0], em.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(tr.outputs[0], add.inputs[0])
    nt.links.new(em.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    _blended(m)
    return m


def soft_glow(hex_colour, alpha=1.0, falloff=2.0):
    """A glow that keeps its alpha in a transparent sprite render: an unlit colour fading to clear at radius 1."""
    m = bpy.data.materials.new(f'softglow-{hex_colour}-{alpha}')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = alpha
    nt.links.new(_radial(nt, falloff), mul.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_to_linear(hex_colour)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(mul.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    _blended(m)
    return m


def veil(hex_colour, alpha):
    m = bpy.data.materials.new(f'veil-{hex_colour}-{alpha}')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_to_linear(hex_colour)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    mix.inputs[0].default_value = alpha
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    _blended(m)
    return m


def gradient(stops, low_z, top_z):
    """Unlit vertical gradient over object z: stops [(t, hex)]."""
    m = bpy.data.materials.new('rocket-space-gradient')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = low_z
    mr.inputs['From Max'].default_value = top_z
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = stops[0][0], hex_to_linear(stops[0][1])
    els[1].position, els[1].color = stops[-1][0], hex_to_linear(stops[-1][1])
    for t, h in stops[1:-1]:
        e = els.new(t)
        e.color = hex_to_linear(h)
    ramp.color_ramp.interpolation = 'EASE'
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def earth_mat(r_m):
    m = bpy.data.materials.new(f'earth-{r_m:.2f}')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord')

    def bands(scale, detail, cut, a, b, seed_off):
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Location'].default_value = (seed_off, seed_off * 0.7, 0.0)
        mp.inputs['Scale'].default_value = (4.6 / r_m,) * 3
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = scale
        nz.inputs['Detail'].default_value = detail
        nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
        rp = nt.nodes.new('ShaderNodeValToRGB')
        rp.color_ramp.interpolation = 'LINEAR'
        e0, e1 = rp.color_ramp.elements
        e0.position, e0.color = cut - 0.012, hex_to_linear(a)
        e1.position, e1.color = cut + 0.012, hex_to_linear(b)
        nt.links.new(nz.outputs['Fac'], rp.inputs['Fac'])
        return rp

    land = bands(0.55, 1.5, 0.53, C['sea'], C['land'], 3.1)
    cloud = bands(1.1, 2.0, 0.66, '#000000', '#FFFFFF', 7.7)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(cloud.outputs['Color'], mix.inputs[0])
    nt.links.new(land.outputs['Color'], mix.inputs[6])
    mix.inputs[7].default_value = hex_to_linear(C['earthCloud'])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.45
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.35
    nt.links.new(lw.outputs['Facing'], bsdf.inputs['Emission Strength'])
    bsdf.inputs['Emission Color'].default_value = hex_to_linear(C['earthRim'])
    return m


def principled(hex_colour, rough=0.35, emission=None, estr=0.0):
    m = mat(hex_colour, rough)
    if emission:
        m = m.copy()
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Emission Color'].default_value = hex_to_linear(emission)
        b.inputs['Emission Strength'].default_value = estr
    return m


_SMOKE = {}


def smoke_mat(density, seed, warm):
    """A soft volumetric puff: noisy density fading to nothing at the unit sphere's rim; self-lit where dense (no grey
    core), no absorption tint; the column's puffs a little warm (the flame's light)."""
    key = (round(density, 2), seed, warm)
    if key in _SMOKE:
        return _SMOKE[key]
    m = bpy.data.materials.new(f'smoke-{len(_SMOKE)}')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    ln = nt.nodes.new('ShaderNodeVectorMath')
    ln.operation = 'LENGTH'
    nt.links.new(tc.outputs['Object'], ln.inputs[0])
    fall = nt.nodes.new('ShaderNodeMapRange')
    fall.interpolation_type = 'SMOOTHSTEP'
    fall.inputs['From Min'].default_value = 0.55
    fall.inputs['From Max'].default_value = 1.0
    fall.inputs['To Min'].default_value = 1.0
    fall.inputs['To Max'].default_value = 0.0
    nt.links.new(ln.outputs['Value'], fall.inputs['Value'])
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (seed * 1.7, seed * 0.9, seed * 2.3)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 2.4
    nz.inputs['Detail'].default_value = 6.0
    nz.inputs['Roughness'].default_value = 0.55
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nr = nt.nodes.new('ShaderNodeMapRange')
    nr.inputs['From Min'].default_value = 0.3
    nr.inputs['From Max'].default_value = 0.6
    nt.links.new(nz.outputs['Fac'], nr.inputs['Value'])
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    nt.links.new(fall.outputs['Result'], mul.inputs[0])
    nt.links.new(nr.outputs['Result'], mul.inputs[1])
    mul2 = nt.nodes.new('ShaderNodeMath')
    mul2.operation = 'MULTIPLY'
    mul2.inputs[1].default_value = density
    nt.links.new(mul.outputs[0], mul2.inputs[0])
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = hex_to_linear(C['smoke'])
    vol.inputs['Anisotropy'].default_value = 0.25
    vol.inputs['Absorption Color'].default_value = hex_to_linear('#FFFFFF')
    nt.links.new(mul2.outputs[0], vol.inputs['Density'])
    lift = nt.nodes.new('ShaderNodeMath')
    lift.operation = 'MULTIPLY'
    lift.inputs[1].default_value = 9.0  # bright like the art gate's smoke over the sky (a lone sprite has no sky behind it)
    nt.links.new(mul.outputs[0], lift.inputs[0])
    vol.inputs['Emission Color'].default_value = hex_to_linear(C['smokeWarm'] if warm else C['smokeLift'])
    nt.links.new(lift.outputs[0], vol.inputs['Emission Strength'])
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    _SMOKE[key] = m
    return m


# --- shapes ---------------------------------------------------------------------------------------------------------

FACING = None  # the camera-facing rotation (set in setup_camera)


def facing(o, parent, loc, scale, ahead=0.0):
    """Puts a flat xz-plane object at `loc` (the parent's space) facing the camera in world space, `scale` × the
    parent's world scale, moved `ahead` (metres, world) toward the camera (negative: away)."""
    bpy.context.view_layer.update()
    pw = parent.matrix_world.copy() if parent is not None else Matrix.Identity(4)
    wloc = pw @ Vector(loc) - VIEW * ahead
    ps = pw.to_scale()
    o.parent = parent
    o.matrix_world = Matrix.LocRotScale(wloc, FACING, Vector((scale[0] * ps.x, 1.0, scale[2] * ps.z)))
    o.visible_shadow = False
    o['cute'] = 1
    return o


def quad(name, w, h, material, coll, loc, parent=None, ahead=0.0):
    """A camera-facing w × h quad (metres), centred at loc."""
    bm = bmesh.new()
    vs = [bm.verts.new((sx * w / 2, 0.0, sz * h / 2)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(vs)
    o = mesh_obj(name, bm, material, coll, smooth=False)
    return facing(o, parent, loc, (1.0, 1.0, 1.0), ahead)


def halo(name, coll, at, r, material, parent=None, ahead=0.6):
    """A camera-facing glow of radius r (metres, × the parent's scale) at `at`, `ahead` in front of it (negative: behind)."""
    bm = bmesh.new()
    vs = [bm.verts.new((sx, 0.0, sz)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(vs)
    o = mesh_obj(name, bm, material, coll, smooth=False)
    return facing(o, parent, at, (r, 1.0, r), ahead)


def disc(name, coll, at, r, material, parent=None, ahead=0.0):
    """A camera-facing round disc of radius r."""
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=1.0, segments=48)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    o = mesh_obj(name, bm, material, coll, smooth=False)
    return facing(o, parent, at, (r, 1.0, r), ahead)


def sparkle(name, coll, at, r, hex_colour, parent=None, strength=2.5, rot=0.0, glow_r=None):
    """A chubby 4-point sparkle, camera-facing, with a soft glow behind it."""
    bm = bmesh.new()
    pts = []
    for i in range(64):
        a = 2 * math.pi * i / 64
        k = 0.42 + 0.58 * abs(math.cos(2 * a)) ** 3
        pts.append(bm.verts.new((math.cos(a + rot) * k, 0.0, math.sin(a + rot) * k)))
    bm.faces.new(pts)
    o = mesh_obj(name, bm, emit(hex_colour, strength), coll, smooth=False)
    facing(o, parent, at, (r, 1.0, r))
    halo(f'{name}-glow', coll, at, glow_r or r * 3.0, soft_glow(hex_colour, 0.8), parent, ahead=-0.05)
    return o


def cloud_shape(name, coll, root, s, top, shade):
    for j, (dx, dz, r) in enumerate([(-0.62, 0.0, 0.32), (-0.2, 0.16, 0.44), (0.3, 0.12, 0.4), (0.72, -0.02, 0.28), (0.05, -0.08, 0.38)]):
        blob(f'{name}-{j}', top, coll, root, (dx * s, 0.0, dz * s), (r * s * 1.15, r * s * 0.7, r * s * 0.85), seg=(32, 16))
    blob(f'{name}-base', shade, coll, root, (0.05 * s, 0.05, -0.18 * s), (0.95 * s, 0.32 * s, 0.22 * s), seg=(32, 12))


def free_root(name, coll):
    at, _size = FREE[name]
    return billboard(f'{name}-root', coll, pt(at[0], at[1], FREE_Y))


def free_fit(name, root, key=None):
    at, size = FREE[key or name]
    r = fit(root, at, longest=size)
    if r[0] < 2 or r[1] < 2 or r[2] > DESIGN[0] - 2 or r[3] > DESIGN[1] - 2:
        fail(f'{name} {fmt_rect(r)} leaves the frame')
    log(f'{name} {fmt_rect(r)}')
    return r


EDGE_CUT_PX = 3.0  # a full-width sprite is cut this far in from each frame edge (≤ 2044 render px: an atlas page minus padding)


def edge_cut(coll):
    """Two thin holdout strips at the frame's left and right edges, in front of everything: a full-width sprite
    (the lawn, the hills, the Moon) trims to ≤ 2044 render px; the scene stretches it back by its trimmed width."""
    m = mat('#000000', 0.5)
    for side, sx in (('l', EDGE_CUT_PX / 2), ('r', DESIGN[0] - EDGE_CUT_PX / 2)):
        q = quad(f'{coll.name}-edge-{side}', EDGE_CUT_PX / PPM, DESIGN[1] / PPM + 2.0, m, coll, pt(sx, DESIGN[1] / 2, -20.0))
        q.is_holdout = True


# --- the lights: one per band ----------------------------------------------------------------------------------------

def setup_lights(scene):
    sun = next((o for o in scene.objects if o.type == 'LIGHT' and o.data.type == 'SUN'), None)
    if sun is None:
        sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
        scene.collection.objects.link(sun)
    if hasattr(sun.data, 'angle'):
        sun.data.angle = math.radians(12)
    w = bpy.data.worlds.new('rocket-world')
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND')
    scene.world = w
    for f, b in BANDS.items():
        for at in (f, f + 98):
            sun.data.color = hex_to_linear(b['sun'])[:3]
            sun.data.energy = b['energy']
            sun.rotation_euler = tuple(math.radians(a) for a in b['rot'])
            sun.data.keyframe_insert('color', frame=at)
            sun.data.keyframe_insert('energy', frame=at)
            sun.keyframe_insert('rotation_euler', frame=at)
            bg.inputs['Color'].default_value = hex_to_linear(b['world'])
            bg.inputs['Strength'].default_value = b['strength']
            bg.inputs['Color'].keyframe_insert('default_value', frame=at)
            bg.inputs['Strength'].keyframe_insert('default_value', frame=at)
    for owner in (sun, sun.data, w.node_tree):
        key_constant(owner)
    ee = scene.eevee
    for attr, v in (('volumetric_start', 1.0), ('volumetric_end', 140.0), ('volumetric_samples', 96), ('volumetric_tile_size', '1'),
                    ('use_volumetric_shadows', True), ('volumetric_shadow_samples', 24)):
        if hasattr(ee, attr):
            try:
                setattr(ee, attr, v)
            except (TypeError, ValueError) as err:
                log(f'volume setting {attr}: {err}')


# --- the plate: space -----------------------------------------------------------------------------------------------

def build_plate(plate):
    top = DESIGN[1] / PPM / 2 + 1.0
    m = gradient([(0.0, C['spaceLow']), (0.4, C['spaceMid']), (1.0, C['spaceDeep'])], -top, top)
    quad('space', DESIGN[0] / PPM + 4.0, DESIGN[1] / PPM + 4.0, m, plate, pt(512, 384, 40.0))
    halo('nebula-1', plate, pt(220, 220, 30.0), 3.6, add_glow(C['nebulaPink'], 0.32, 1.4))
    halo('nebula-2', plate, pt(820, 120, 30.0), 3.0, add_glow(C['nebulaMint'], 0.22, 1.4))
    halo('nebula-3', plate, pt(640, 420, 30.0), 2.6, add_glow(C['nebulaLilac'], 0.25, 1.4))
    rnd = random.Random(3)
    for i in range(150):
        sx, sy = rnd.uniform(0, DESIGN[0]), rnd.uniform(0, DESIGN[1] * 0.9)
        r = rnd.choice([0.014, 0.018, 0.022, 0.026])
        b = blob(f'dot-{i}', emit(C['star'] if rnd.random() < 0.6 else C['starWhite'], 2.4), plate, None, pt(sx, sy, 25.0), (r, r, r), seg=(10, 6))
        b.visible_shadow = False


# --- the rocket -----------------------------------------------------------------------------------------------------

def shade_of(colour):
    return C[f'{colour}Dark']


def trim_of(colour):
    return C['yellow'] if colour == 'white' else C['band']


def body_profile():
    prof = [(0.0, 0.3), (0.3, 0.31), (0.44, 0.37), (0.52, 0.5)]
    for i in range(1, 13):
        t = i / 12
        prof.append((0.52 + 0.07 * math.sin(math.pi * min(1.0, t * 1.1)), 0.5 + t * 1.65))
    prof.append((0.0, 2.15))
    return prof


def nose_profile():
    nose = [(0.0, 2.1)]
    for i in range(14):
        t = i / 13
        nose.append((0.53 * (1 - t ** 1.7) ** 0.62, 2.1 + t * 0.95))
    nose[-1] = (0.0, 3.08)
    return nose


NOZZLE = [(0.0, 0.0), (0.3, 0.0), (0.37, 0.04), (0.33, 0.14), (0.25, 0.34), (0.0, 0.36)]
PORT_Z = 1.5
PORT_R = 0.33


def build_body(coll, root, colour):
    lathe(f'{coll.name}-nozzle', NOZZLE, principled(C['metal'], 0.3), coll, root)
    lathe(f'{coll.name}-shell', body_profile(), principled(C[colour], 0.28), coll, root, seg=48)
    trim = principled(trim_of(colour), 0.3)
    torus(f'{coll.name}-band-low', 0.55, 0.055, trim, coll, root, (0.0, 0.0, 0.62))
    torus(f'{coll.name}-band-top', 0.535, 0.06, trim, coll, root, (0.0, 0.0, 2.12))
    rim = mesh_obj(f'{coll.name}-port-rim', torus_bm(PORT_R, 0.07, seg=40, tube=12), principled(C['white'] if colour != 'white' else C['metal'], 0.3), coll)
    rim.parent = root
    rim.location = (0.0, -0.585, PORT_Z)
    rim.rotation_euler = (math.radians(90), 0.0, 0.0)
    blob(f'{coll.name}-cabin', principled(C['cabin'], 0.5), coll, root, (0.0, -0.56, PORT_Z), (PORT_R * 0.98, 0.06, PORT_R * 0.98), seg=(32, 12))
    for k, z in enumerate((1.05, 1.0)):
        blob(f'{coll.name}-rivet-{k}', trim, coll, root, ((-0.08 + 0.16 * k), -0.6, z), (0.035, 0.02, 0.035), seg=(12, 6))


def build_nose(coll, root, colour):
    lathe(f'{coll.name}-cone', nose_profile(), principled(C[colour], 0.28), coll, root, seg=48)
    blob(f'{coll.name}-tip', principled(trim_of(colour), 0.25), coll, root, (0.0, 0.0, 3.05), (0.07, 0.07, 0.07), seg=(16, 8))


def build_fins(coll, root, colour):
    fm = principled(C[colour], 0.28)
    ball = principled(trim_of(colour), 0.3)
    for k, ang in enumerate((90.0, 270.0, 180.0)):
        piv = empty(f'{coll.name}-piv-{k}', coll, root, (0.0, 0.0, 0.0), (0.0, 0.0, ang))
        blob(f'{coll.name}-fin-{k}', fm, coll, piv, (0.0, -0.62, 0.55), (0.09, 0.36, 0.5), (12.0, 0.0, 0.0),
             shape=lambda d: Vector((d.x, d.y * (1.0 + 0.4 * max(0.0, -d.z)), d.z)))
        blob(f'{coll.name}-ball-{k}', ball, coll, piv, (0.0, -0.93, 0.2), (0.09, 0.09, 0.09), seg=(16, 8))


def holdout_body(coll, root):
    """A copy of the body (shell and nozzle) that cuts this sprite where the body stands in front of it."""
    m = mat('#000000', 0.5)
    for o in (lathe(f'{coll.name}-cut-shell', body_profile(), m, coll, root, seg=48), lathe(f'{coll.name}-cut-nozzle', NOZZLE, m, coll, root)):
        o.is_holdout = True
        o.visible_shadow = False


def drop_shape(d):
    """A teardrop pointing down (-z)."""
    if d.z < 0:
        k = 1.0 - 0.75 * (-d.z) ** 1.2
        return Vector((d.x * k, d.y * k, d.z))
    return d


def build_flame_variant(coll, root, length, wobble, name):
    L = length
    for i, (part, hexc, r, zl, stren) in enumerate((('out', C['flameOut'], 0.36, L, 1.0), ('mid', C['flameMid'], 0.27, L * 0.72, 1.05), ('core', C['flameCore'], 0.17, L * 0.45, 1.2))):
        o = blob(f'{name}-{part}', emit(hexc, stren), coll, root, (wobble * (i - 1) * 0.04, -0.02 * i, -L * 0.42 + (L - zl) * 0.38), (r, r, zl * 0.55), seg=(32, 20), shape=drop_shape)
        o.visible_shadow = False
    for k, (dx, h) in enumerate(((-0.2, 0.45), (0.2, 0.5), (0.0, 0.35))):
        blob(f'{name}-tongue-{k}', emit(C['flameOut'], 1.0), coll, root, (dx + wobble * 0.05 * (k - 1), -0.05, -L * 0.15 - h * 0.3), (0.1, 0.1, h * 0.5 * (1.0 + 0.2 * wobble * (k - 1))), seg=(16, 10), shape=drop_shape).visible_shadow = False
    halo(f'{name}-glow', coll, Vector((0.0, 0.0, -L * 0.45)), 0.9, soft_glow('#FFB25C', 0.55, 1.8), root, ahead=-0.6)


def build_rocket(params, layout):
    """Every part in every colour, the pilot, the flame and the parachute, on one rig root at ROCKET_PX."""
    depth = gy(ROCKET_PX[1] + 40.0)
    root = empty('rocket-root', RIG, None, pt(ROCKET_PX[0], ROCKET_PX[1], depth))
    colours = params['rocket']['colours']
    groups = {}
    for part, fn in (('body', build_body), ('nose', build_nose), ('fins', build_fins)):
        for c in colours:
            coll = sprite(f'{part}-{c}', {'idle': [F_PAD]})
            sub = empty(f'{part}-{c}-root', coll, root)
            fn(coll, sub, c)
            if part == 'fins':
                holdout_body(coll, sub)
            groups[(part, c)] = sub
    # Scale the rig so the built rocket (one colour) is ROCKET_H_PX tall, its nozzle's bottom on ROCKET_PX.
    ref = [groups[(p, colours[0])] for p in ('body', 'nose', 'fins')]

    def ref_rect():
        return rect_pts(world_pts([o for g in ref for o in meshes_of(g) if not o.is_holdout]))

    r = ref_rect()
    root.scale = root.scale * (ROCKET_H_PX / (r[3] - r[1]))
    for _ in range(3):
        r = ref_rect()
        root.location += screen_shift(ROCKET_PX[0] - (r[0] + r[2]) / 2, 0.0)
        bpy.context.view_layer.update()
        base = project(root.matrix_world.translation)
        root.location += screen_shift(ROCKET_PX[0] - base[0], ROCKET_PX[1] - base[1])
    r = ref_rect()
    log(f'rocket {fmt_rect(r)} (nozzle bottom at {project(root.matrix_world.translation)})')
    if r[3] - r[1] < params['rocket']['rocketMinPx']:
        fail(f'the rocket is {r[3] - r[1]:.0f} px tall (min {params["rocket"]["rocketMinPx"]})')
    # Layout: the rocket's anchor (its nozzle's bottom), its tap hull on the pad and on the Moon, the flight anchor.
    add_empty('anchor.rocket', root.matrix_world.translation.copy(), layout)
    pts = world_pts([o for g in ref for o in meshes_of(g) if not o.is_holdout])
    hull_object('hit.rocket', pts, layout)
    shift = screen_shift(MOON_ROCKET_PX[0] - ROCKET_PX[0], MOON_ROCKET_PX[1] - ROCKET_PX[1])
    hull_object('hit.moon-rocket', [p + shift for p in pts], layout)
    add_empty('anchor.moon-rocket', root.matrix_world.translation + shift, layout)
    add_empty('anchor.fly', root.matrix_world.translation + screen_shift(FLY_PX[0] - ROCKET_PX[0], FLY_PX[1] - ROCKET_PX[1]), layout)
    port = root.matrix_world @ Vector((0.0, -0.62, PORT_Z))
    add_empty('anchor.porthole', port, layout)
    # The pilot: the porthole's glass alone, or Shiba's face behind it.
    states = ['empty', 'idle', 'wave', 'happy']
    frames = [F_PAD, F_PAD + 1, F_PAD + 2, F_PAD + 3]
    coll = sprite('pilot', dict(zip(states, [[f] for f in frames])))
    sub = empty('pilot-root', coll, root)
    holdout_body(coll, sub)
    glass = blob('pilot-glass', veil(C['glass'], 0.22), coll, sub, (0.0, -0.62, PORT_Z), (PORT_R * 0.97, 0.14, PORT_R * 0.97), seg=(32, 16))
    glass.visible_shadow = False
    blob('pilot-shine', emit(C['white'], 1.2), coll, sub, (-0.14, -0.75, PORT_Z + 0.14), (0.09, 0.015, 0.04), (0, 35, 0), seg=(16, 8)).visible_shadow = False
    mats = chibi_materials(COL, COL['creatureOrange'], PARAMS['art']['creatureLight'])
    rig = chibi('dog', 'pilot-shiba', coll, mats)
    rig['root'].parent = sub
    rig['root'].scale = (0.36, 0.36, 0.36)
    rig['root'].location = (0.0, -0.46, PORT_Z - 1.33 * 0.36 - 0.03)
    rig['tail'].scale = HIDDEN
    paw = blob('pilot-paw', mats['light'], coll, sub, (0.17, -0.7, PORT_Z + 0.02), (0.08, 0.06, 0.08), seg=(16, 8))
    show_on(paw, [frames[2]], frames)
    show_on(rig['root'], frames[1:], frames)
    key_chibi(rig, frames[0], eyes='open')
    key_chibi(rig, frames[1], head_pitch=-6.0, head_roll=6.0, eyes='open')
    key_chibi(rig, frames[2], head_pitch=-8.0, head_roll=-8.0, eyes='open', tongue=True)
    key_chibi(rig, frames[3], head_pitch=-12.0, head_roll=8.0, eyes='shut', tongue=True)
    # The flame: three hand-shaped toon frames under the nozzle.
    coll = sprite('flame', {'a': [F_PAD], 'b': [F_PAD + 1], 'c': [F_PAD + 2]})
    sub = empty('flame-root', coll, root)
    v = variants(coll, sub, ['a', 'b', 'c'], [F_PAD, F_PAD + 1, F_PAD + 2])
    build_flame_variant(coll, v['a'], 1.7, 0.0, 'flame-a')
    build_flame_variant(coll, v['b'], 1.9, 1.0, 'flame-b')
    build_flame_variant(coll, v['c'], 1.6, -1.0, 'flame-c')
    # The parachute over the nose: a white canopy with pink gores, its lines meeting at the tip.
    coll = sprite('parachute', {'idle': [F_PAD]})
    sub = empty('parachute-root', coll, root)
    tilt = empty('parachute-tilt', coll, sub, (0.0, 0.0, 4.25), (-8.0, 0.0, 0.0))
    gore_ball('parachute-canopy', [principled(C['chute'], 0.5), principled(C['chuteStripe'], 0.5)], 8, (1.25, 1.25, 0.8), coll, tilt, dome=True)
    blob('parachute-inside', principled(C['chuteStripe'], 0.7), coll, tilt, (0.0, 0.0, 0.0), (1.2, 1.2, 0.05), seg=(32, 6))
    for j in range(6):
        a = 2 * math.pi * (j + 0.5) / 6
        rod(f'parachute-line-{j}', (1.18 * math.cos(a), 1.18 * math.sin(a), 0.0), (0.0, 0.0, -1.15), 0.02, principled(C['white'], 0.6), coll, tilt, seg=8)
    return root


# --- the pad world --------------------------------------------------------------------------------------------------

def build_pad_world(params):
    warm = principled(C['cloud'], 0.7, '#FFD9C2', 0.25)
    shade = principled(C['cloudShade'], 0.8)
    # The sun: a soft disc with a halo (alpha), behind the hills.
    coll = sprite('sun', {'idle': [F_PAD]})
    sp = pt(SUN_PX[0], SUN_PX[1], 35.0)
    disc('sun-disc', coll, sp, 0.55, emit(C['sun'], 1.25))
    # Its halo is the scene's runtime glow: the atlas packer clears alpha < 24 and trims at alpha 64, so a wide baked
    # glow would show a square edge.
    # The hills: far lavender, mid mint.
    coll = sprite('hills', {'idle': [F_PAD]})
    edge_cut(coll)
    for k, (sx, w, h) in enumerate(((120, 3.6, 1.6), (520, 4.4, 1.25), (930, 3.4, 1.7))):
        blob(f'hill-far-{k}', principled(C['hillFar'], 0.8, '#FFD9C2', 0.15), coll, None, pt(sx, 585, 20.0), (w, 0.5, h), seg=(48, 20)).visible_shadow = False
    for k, (sx, w, h) in enumerate(((-40, 3.2, 1.15), (380, 3.0, 0.9), (800, 3.8, 1.05))):
        blob(f'hill-mid-{k}', principled(C['hillMid'], 0.7), coll, None, pt(sx, 620, 12.0), (w, 0.5, h), seg=(48, 20)).visible_shadow = False
    # The lawn: a wide soft disc with trees, tufts and flowers.
    coll = sprite('lawn', {'idle': [F_PAD]})
    edge_cut(coll)
    blob('lawn', principled(C['grass'], 0.75), coll, None, (0.0, 2.0, -0.6), (11.0, 8.0, 0.6), seg=(96, 32))
    for k, (sx, sy, s) in enumerate(((60, 560, 1.0), (980, 575, 1.15), (690, 548, 0.7), (150, 545, 0.65))):
        tp = pt(sx, sy, gy(sy))
        rod(f'tree-trunk-{k}', tp, tp + Vector((0, 0, 0.7 * s)), 0.09 * s, principled(C['trunk'], 0.6), coll, None)
        blob(f'tree-top-{k}', principled(C['leaf'], 0.6), coll, None, tp + Vector((0, 0, 1.05 * s)), (0.55 * s, 0.5 * s, 0.55 * s), seg=(32, 16))
        blob(f'tree-top2-{k}', principled(C['leafLight'], 0.6), coll, None, tp + Vector((-0.15 * s, -0.2, 1.3 * s)), (0.35 * s, 0.3 * s, 0.3 * s), seg=(24, 12))
    rnd = random.Random(SEED)
    for i in range(28):
        x, y = rnd.uniform(-5, 5), rnd.uniform(-1.5, 7)
        blob(f'tuft-{i}', principled(C['grassDark'], 0.8), coll, None, (x, y, -0.02), (0.18, 0.12, 0.08), seg=(12, 6))
        if i % 3 == 0:
            blob(f'flower-{i}', principled(rnd.choice([C['flower'], C['flowerYellow'], C['white']]), 0.5), coll, None, (x + 0.15, y, 0.04), (0.06, 0.06, 0.05), seg=(10, 6))
    # The launch pad and its tower (left of the rocket).
    coll = sprite('launchpad', {'idle': [F_PAD]})
    base = pt(ROCKET_PX[0], ROCKET_PX[1] + 40.0, gy(ROCKET_PX[1] + 40.0))
    return coll, warm, shade, base


def finish_launchpad(coll, rocket_root):
    base = rocket_root.matrix_world.translation.copy()
    pad_top = base.z
    ground = Vector((base.x, base.y, pad_top - 0.24))
    lathe('pad', [(0.0, 0.0), (1.25, 0.0), (1.32, 0.08), (1.25, 0.24), (0.0, 0.24)], principled(C['pad'], 0.45), coll, None, ground)
    torus('pad-trim', 1.2, 0.05, principled(C['padTrim'], 0.35), coll, None, ground + Vector((0, 0, 0.24)))
    for k in range(8):
        a = 2 * math.pi * k / 8
        blob(f'pad-light-{k}', emit(C['padTrim'] if k % 2 else C['white'], 2.0), coll, None, ground + Vector((1.18 * math.cos(a), 1.18 * math.sin(a), 0.2)), (0.06, 0.06, 0.04), seg=(12, 6))
    tx = ground + Vector((-1.55, 0.3, 0.0))
    tm, pm = principled(C['tower'], 0.4), principled(C['towerTrim'], 0.4)
    for sx in (-0.32, 0.32):
        rod(f'tower-post-{sx}', tx + Vector((sx, 0, 0)), tx + Vector((sx, 0, 3.6)), 0.09, tm, coll, None)
    for k in range(7):
        z = 0.3 + k * 0.5
        rod(f'tower-bar-{k}', tx + Vector((-0.32, -0.02, z)), tx + Vector((0.32, -0.02, z + 0.4)), 0.055, pm, coll, None)
    rbox('tower-cap', (0.95, 0.6, 0.22), 0.09, pm, coll, None, tx + Vector((0, 0, 3.7)))
    rod('tower-arm', tx + Vector((0.35, 0, 2.9)), tx + Vector((1.05, 0, 2.9)), 0.06, tm, coll, None)
    blob('tower-beacon', emit(C['beacon'], 2.6), coll, None, tx + Vector((0, 0, 3.92)), (0.11, 0.11, 0.11), seg=(16, 8))
    halo('tower-beacon-glow', coll, tx + Vector((0, 0, 3.92)), 0.5, soft_glow(C['beacon'], 0.7))
    return ground


def build_smoke(ground):
    """The launch bank, volumetric: a column from the nozzle down to the pad, then a low bank rolling out both ways.
    Three stages (a: the first breath, b: rolling out, c: the full bank)."""
    coll = sprite('smoke', {'a': [F_PAD], 'b': [F_PAD + 1], 'c': [F_PAD + 2]})
    v = variants(coll, None, ['a', 'b', 'c'], [F_PAD, F_PAD + 1, F_PAD + 2])
    base = ground + Vector((0.0, 0.4, 0.24))
    for stage, reach, count in (('a', 0.35, 5), ('b', 0.7, 10), ('c', 1.0, 14)):
        rnd = random.Random(5)
        parent = v[stage]
        k = 0

        def puff(at, r, density, warm):
            nonlocal k
            bm = bmesh.new()
            bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
            o = mesh_obj(f'smoke-{stage}-{k}', bm, smoke_mat(density * 3.5, k % 5, warm), coll, smooth=False)
            o['cute'] = 1
            o.parent = parent
            o.location = at
            o.scale = r if isinstance(r, tuple) else (r, r, r)
            k += 1

        for i in range(5):
            t = i / 4
            puff(base + Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.2, 0.2), 1.1 - t * 0.6)), (0.4 + 0.8 * t) * (0.7 + 0.3 * reach), 8.0, False)
        for side in (-1, 1):
            for i in range(count):
                t = (i + 0.5) / 14
                x = side * (0.5 + t * 5.0)
                r = 0.95 - 0.35 * t + rnd.uniform(-0.12, 0.12)
                z = 0.55 + 0.35 * t + rnd.uniform(-0.1, 0.15)
                y = rnd.uniform(-0.7, 0.9)
                puff(base + Vector((x, y, z)), (r * 1.25, r, r * 0.9), 6.5 - 3.0 * t, False)
                if i % 2 == 0 or t < 0.4:
                    puff(base + Vector((x + side * 0.25, y + 0.4, z + r * 0.75)), r * 0.72, 4.0 - 1.5 * t, False)
    log('smoke: 3 stages')


def build_astro(params, layout, name, at, frames, states, moon=False):
    """Shiba in a white suit and a round glass helmet: idle, wave (one paw up), jump/happy (both paws up)."""
    coll = sprite(name, dict(zip(states, [[f] for f in frames])))
    mats = chibi_materials(COL, COL['creatureOrange'], PARAMS['art']['creatureLight'])
    rig = chibi('dog', name, coll, mats)
    root = rig['root']
    root.location = (wx(at[0]), gy(at[1]), 0.0)
    root.rotation_euler = (0.0, 0.0, math.radians(-12.0))
    head, body = rig['head'], rig['body']
    suit = principled(C['suit'], 0.4)
    blob(f'{name}-suit', suit, coll, body, (0, 0.04, 0.52), (0.45, 0.46, 0.4), seg=(32, 16))
    torus(f'{name}-collar', 0.36, 0.08, principled(C['collar'], 0.35), coll, body, (0.0, -0.02, 0.86))
    rbox(f'{name}-pack', (0.5, 0.26, 0.5), 0.1, principled(C['pack'], 0.35), coll, body, (0.0, 0.42, 0.62))
    blob(f'{name}-badge', principled(C['badge'], 0.3), coll, body, (0.16, -0.4, 0.62), (0.07, 0.03, 0.07), seg=(16, 8))
    blob(f'{name}-light', emit(C['nebulaMint'], 3.0), coll, body, (-0.16, -0.42, 0.62), (0.05, 0.02, 0.05), seg=(12, 6))
    hz = 1.38 - 0.95
    g = blob(f'{name}-helmet', veil(C['helmet'], 0.16), coll, head, (0.0, -0.06, hz), (0.86, 0.8, 0.84), seg=(48, 24))
    g.visible_shadow = False
    blob(f'{name}-helmet-shine', emit(C['white'], 1.4), coll, head, (-0.42, -0.62, hz + 0.38), (0.16, 0.03, 0.07), (0, 40, -20), seg=(16, 8)).visible_shadow = False
    blob(f'{name}-helmet-shine2', emit(C['white'], 1.2), coll, head, (-0.6, -0.5, hz + 0.12), (0.05, 0.02, 0.05), seg=(12, 6)).visible_shadow = False
    rig['tail'].scale = HIDDEN
    glove = principled(C['collar'], 0.35)
    down = empty(f'{name}-arms-down', coll, body)
    for sx in (-1, 1):
        a, b = (0.34 * sx, -0.05, 0.66), (0.48 * sx, -0.12, 0.38)
        rod(f'{name}-arm-down-{sx}', a, b, 0.09, suit, coll, down, seg=14)
        blob(f'{name}-glove-down-{sx}', glove, coll, down, b, (0.11, 0.1, 0.11), seg=(20, 10))
    wave = empty(f'{name}-arms-wave', coll, body)
    for sx, up in ((-1, False), (1, True)):
        a = (0.34 * sx, -0.05, 0.66)
        b = (0.62 * sx, -0.14, 1.12) if up else (0.48 * sx, -0.12, 0.38)
        rod(f'{name}-arm-wave-{sx}', a, b, 0.09, suit, coll, wave, seg=14)
        blob(f'{name}-glove-wave-{sx}', glove, coll, wave, b, (0.11, 0.1, 0.11), seg=(20, 10))
    upp = empty(f'{name}-arms-up', coll, body)
    for sx in (-1, 1):
        a, b = (0.32 * sx, -0.05, 0.72), (0.62 * sx, -0.12, 1.12)
        rod(f'{name}-arm-up-{sx}', a, b, 0.09, suit, coll, upp, seg=14)
        blob(f'{name}-glove-up-{sx}', glove, coll, upp, b, (0.11, 0.1, 0.11), seg=(20, 10))
    show_on(down, [frames[0]], frames)
    show_on(wave, [frames[1]], frames)
    show_on(upp, frames[2:], frames)
    key_chibi(rig, frames[0], head_pitch=-4.0, head_yaw=10.0, eyes='open')
    key_chibi(rig, frames[1], head_pitch=-6.0, head_roll=6.0, head_yaw=10.0, eyes='open', tongue=True)
    key_chibi(rig, frames[2], head_pitch=-12.0, head_roll=6.0, eyes='shut', tongue=True, bob=0.05)
    key_chibi(rig, frames[3], head_pitch=-14.0, head_roll=-7.0, eyes='shut', tongue=True, bob=0.05)
    scene = bpy.context.scene
    scene.frame_set(frames[0])
    r = fit(root, at, height=ASTRO_H_PX, bottom=True)
    log(f'{name} {fmt_rect(r)}')
    if r[3] - r[1] < params['rocket']['astroMinPx']:
        fail(f'{name} is {r[3] - r[1]:.0f} px tall (min {params["rocket"]["astroMinPx"]})')
    add_empty(f'anchor.{"astro-moon" if moon else "astro"}', pt(at[0], at[1], gy(at[1])), layout)
    return root


def build_free_bits(warm, shade):
    """The pad band's free sprites: clouds, birds, the cameo plane, the bubble, the puff, the spark, the glow."""
    cgroup = sprite('cloud')
    for state, s in (('a', 1.0), ('b', 0.8)):
        child = bpy.data.collections.new(f'state.cloud-{state}')
        child['bhc_state'] = state
        cgroup.children.link(child)
        root = free_root(f'cloud-{state}', child)
        cloud_shape(f'cloud-{state}', child, root, s, warm, shade)
        free_fit(f'cloud-{state}', root)
    # cloud a|b are one sprite `cloud` with two states (rendered at the same frame, by state children).
    group = sprite('bird')
    wing = principled('#A9D9F7', 0.5)
    for state, up in (('a', True), ('b', False)):
        child = bpy.data.collections.new(f'state.bird-{state}')
        child['bhc_state'] = state
        group.children.link(child)
        root = free_root('bird', child)
        bird_body(f'bird-{state}', C, COL, child, root)
        if up:
            blob(f'bird-{state}-wing-near', wing, child, root, (0.06, -0.2, 0.26), (0.15, 0.05, 0.25), (-12.0, 18.0, 0.0), seg=(24, 12))
            blob(f'bird-{state}-wing-far', wing, child, root, (0.1, 0.2, 0.26), (0.14, 0.05, 0.23), (12.0, 30.0, 0.0), seg=(24, 12))
        else:
            blob(f'bird-{state}-wing-near', wing, child, root, (0.07, -0.24, -0.17), (0.15, 0.05, 0.23), (22.0, -20.0, 0.0), seg=(24, 12))
            blob(f'bird-{state}-wing-far', wing, child, root, (0.12, 0.2, -0.2), (0.13, 0.05, 0.2), (-14.0, -32.0, 0.0), seg=(24, 12))
        fit(root, FREE['bird'][0], width=FREE['bird'][1])
    build_cameo_plane()
    # The choice bubble: a soft glass ball with a rim and a shine.
    coll = sprite('bubble', {'idle': [F_PAD]})
    root = free_root('bubble', coll)
    disc('bubble-fill', coll, Vector((0, 0, 0)), 1.0, veil(C['bubble'], 0.42), root)
    halo('bubble-glow', coll, Vector((0.0, 0.0, 0.0)), 1.25, soft_glow(C['bubbleGlow'], 0.55, 1.5), root, ahead=-0.3)
    ring = mesh_obj('bubble-rim', torus_bm(1.0, 0.045, seg=64, tube=10), principled(C['white'], 0.25), coll)
    ring.parent = root
    ring.rotation_euler = (math.radians(90), 0.0, 0.0)
    blob('bubble-shine', emit(C['white'], 1.3), coll, root, (-0.45, -0.1, 0.55), (0.22, 0.03, 0.1), (0, 40, 0), seg=(16, 8))
    blob('bubble-shine2', emit(C['white'], 1.2), coll, root, (-0.68, -0.1, 0.25), (0.06, 0.03, 0.06), seg=(12, 6))
    free_fit('bubble', root)
    # The puff: a small soft cloud (retro puffs, dust, Shiba's landings).
    coll = sprite('puff', {'idle': [F_PAD]})
    root = free_root('puff', coll)
    puffs('puff', [(-0.26, -0.04, 0.26), (0.0, 0.1, 0.33), (0.27, -0.03, 0.25), (0.02, -0.14, 0.26)], principled(C['white'], 0.7), principled(C['smokeLift'], 0.7), coll, root, drop=0.07)
    free_fit('puff', root)
    # The spark: a sparkle (a part's fit, a boost, a star's twinkle).
    coll = sprite('spark', {'idle': [F_PAD]})
    root = free_root('spark', coll)
    sparkle('spark-star', coll, Vector((0, 0, 0)), 0.5, C['star'], root, strength=1.6, glow_r=0.9)
    free_fit('spark', root)
    # The glow: a white soft disc, tinted and added at runtime (the flame's light, the boosts).
    coll = sprite('glow', {'idle': [F_PAD]})
    root = free_root('glow', coll)
    halo('glow-disc', coll, Vector((0, 0, 0)), 1.0, soft_glow(C['white'], 1.0, 1.6), root, ahead=0.0)
    free_fit('glow', root)


def build_cameo_plane():
    """The little plane of Phi công nhí (art.plane colours, from params), its fox pilot waving (b: the paw up)."""
    pc = PARAMS['art']['plane']
    group = sprite('plane')
    for state in ('a', 'b'):
        child = bpy.data.collections.new(f'state.plane-{state}')
        child['bhc_state'] = state
        group.children.link(child)
        root = free_root('plane', child)
        body = principled(pc['body'], 0.35)
        blob(f'plane-{state}-body', body, child, root, (0.0, 0.0, 0.0), (0.95, 0.42, 0.42), seg=(40, 20),
             shape=lambda d: Vector((d.x, d.y * (1 - 0.5 * max(0.0, -d.x) ** 2), d.z * (1 - 0.5 * max(0.0, -d.x) ** 2) + 0.2 * max(0.0, -d.x) ** 2)))
        blob(f'plane-{state}-belly', principled(pc['belly'], 0.4), child, root, (0.1, -0.1, -0.16), (0.7, 0.3, 0.22), seg=(32, 16))
        blob(f'plane-{state}-wing', principled(pc['wing'], 0.35), child, root, (0.05, -0.05, -0.05), (0.42, 1.25, 0.08), seg=(32, 16))
        blob(f'plane-{state}-tail', principled(pc['wing'], 0.35), child, root, (-0.88, 0.0, 0.32), (0.22, 0.06, 0.28), (0, -20, 0), seg=(24, 12))
        blob(f'plane-{state}-nose', principled(pc['nose'], 0.3), child, root, (0.95, 0.0, 0.0), (0.16, 0.2, 0.2), seg=(24, 12))
        blob(f'plane-{state}-prop', veil(pc['propBlur'], 0.34), child, root, (1.1, 0.0, 0.0), (0.02, 0.5, 0.5), seg=(32, 12)).visible_shadow = False
        fox = chibi('fox', f'plane-{state}-fox', child, chibi_materials(COL, COL['creatureOrange'], PARAMS['art']['creatureLight']))
        fox['root'].parent = root
        fox['root'].location = (0.2, 0.0, 0.18)
        fox['root'].scale = (0.36, 0.36, 0.36)
        fox['root'].rotation_euler = (0.0, 0.0, math.radians(60))
        fox['tail'].scale = HIDDEN
        key_chibi(fox, 1, head_pitch=-6.0, head_yaw=-30.0, eyes='open', tongue=state == 'b')
        if state == 'b':
            rod(f'plane-{state}-arm', (0.18, -0.12, 0.6), (0.1, -0.22, 0.95), 0.05, fox['meshes'][0].active_material, child, root, seg=12)
            blob(f'plane-{state}-paw', principled(PARAMS['art']['creatureLight'], 0.5), child, root, (0.1, -0.22, 0.97), (0.07, 0.06, 0.07), seg=(16, 8))
        root.rotation_euler = (-P, 0.0, math.radians(8.0))
        fit(root, FREE['plane'][0], longest=FREE['plane'][1])


# --- space ----------------------------------------------------------------------------------------------------------

def build_space(params, layout):
    # The big Earth below (only its top shows).
    coll = sprite('earth', {'idle': [F_SPACE]})
    r_m = EARTH_R_PX / PPM
    at = pt(EARTH_PX[0], EARTH_PX[1], 10.0)
    blob('earth', earth_mat(r_m), coll, None, at, (r_m, r_m, r_m), (20, 0, 30), seg=(128, 64))
    halo('earth-rim', coll, at, r_m * 1.18, soft_glow(C['earthRim'], 0.7, 1.0), ahead=-(r_m + 0.3))
    add_empty('anchor.earth', pt(EARTH_TAP_PX[0], EARTH_TAP_PX[1], 10.0), layout)
    rect = params['rect']
    cap = []
    for i in range(181):
        a = math.pi * i / 180
        x = EARTH_PX[0] + EARTH_R_PX * math.cos(a)
        y = EARTH_PX[1] - EARTH_R_PX * math.sin(a)
        if y <= rect['y1'] - 4 and rect['x0'] + 4 <= x <= rect['x1'] - 4:
            cap.append((x, y))
    xs = [p[0] for p in cap]
    cap += [(min(xs), rect['y1'] - 4), (max(xs), rect['y1'] - 4)]
    hull_object('hit.earth', [pt(x, y, 10.0) for x, y in cap], layout)
    # The Earth seen from the Moon (small, top right), with its glow.
    coll = sprite('earthsmall', {'idle': [F_SPACE]})
    rs = EARTH_MOON_R_PX / PPM
    at = pt(EARTH_MOON_PX[0], EARTH_MOON_PX[1], 14.0)
    blob('earthsmall', earth_mat(rs), coll, None, at, (rs, rs, rs), (20, 0, 30), seg=(64, 32))
    halo('earthsmall-glow', coll, at, rs * 1.6, soft_glow(C['earthRim'], 0.7, 1.2), ahead=-(rs + 0.3))
    add_empty('anchor.earth-moon', at, layout)
    hull_object('hit.earth-moon', [pt(EARTH_MOON_PX[0] + EARTH_MOON_R_PX * math.cos(2 * math.pi * i / 32), EARTH_MOON_PX[1] + EARTH_MOON_R_PX * math.sin(2 * math.pi * i / 32), 14.0) for i in range(32)], layout)
    # The Moon far ahead: faceless, cream-lavender, its craters spread over it, a soft glow behind it.
    coll = sprite('moonfar', {'idle': [F_SPACE]})
    mr = MOONFAR_R_PX / PPM
    mp = pt(MOONFAR_PX[0], MOONFAR_PX[1], 8.0)
    blob('moonfar', principled(C['moon'], 0.85, '#FFF6D8', 0.18), coll, None, mp, (mr, mr, mr), seg=(64, 32))
    for k, (dx, dz, r) in enumerate(((-0.55, 0.45, 0.17), (0.5, 0.55, 0.1), (0.12, -0.05, 0.13), (0.75, -0.25, 0.14), (-0.7, -0.45, 0.11), (-0.2, -0.85, 0.09), (0.35, -0.9, 0.06), (-0.95, 0.05, 0.07))):
        p, n = on_body((mr, mr, mr), mp, (dx, -1.0, dz))
        c = blob(f'moonfar-crater-{k}', principled(C['crater'], 0.9), coll, None, p, (r, r, 0.03), seg=(32, 10))
        c.rotation_mode = 'QUATERNION'
        c.rotation_quaternion = n.to_track_quat('Z', 'Y')
    halo('moonfar-glow', coll, mp, mr * 1.9, soft_glow(C['moonGlow'], 0.5, 1.6), ahead=-1.6)
    add_empty('anchor.moonfar', mp, layout)
    # The stars: a sparkle and a round dot.
    coll = sprite('star', {'a': [F_SPACE], 'b': [F_SPACE + 1]})
    v = variants(coll, None, ['a', 'b'], [F_SPACE, F_SPACE + 1])
    root = free_root('star-a', coll)
    root.parent = None
    va, vb = v['a'], v['b']
    va.parent = root
    vb.parent = root
    sparkle('star-sparkle', coll, Vector((0, 0, 0)), 0.5, C['star'], va, strength=2.2, glow_r=1.0)
    blob('star-dot', emit(C['starWhite'], 2.0), coll, vb, (0.0, 0.0, 0.0), (0.28, 0.28, 0.28), seg=(16, 8))
    halo('star-dot-glow', coll, Vector((0, 0, 0)), 0.8, soft_glow(C['star'], 0.8), vb, ahead=-0.2)
    bpy.context.scene.frame_set(F_SPACE)
    free_fit('star', root, 'star-a')
    build_surprises()


def star_head(d):
    """A puffy five-point star in the xz plane (never round: it must not read as the Moon)."""
    a = math.atan2(d.z, d.x)
    k = 0.72 + 0.38 * max(0.0, math.cos(5 * (a - math.pi / 2))) ** 1.6
    return Vector((d.x * k, d.y * 0.55, d.z * k))


def build_surprises():
    # The comet: a star-shaped head with a small face and a long rainbow tail (soft glows, alpha).
    coll = sprite('comet', {'idle': [F_SPACE]})
    root = free_root('comet', coll)
    head = blob('comet-head', principled(C['comet'], 0.3, C['comet'], 0.6), coll, root, (0.0, 0.0, 0.0), (0.5, 0.5, 0.5), seg=(64, 32), shape=star_head)
    chibi_face('comet-face', head, coll, COL, [(Vector((0.11 * sx, -0.3, 0.05)), Vector((0, -1, 0))) for sx in (-1, 1)], 0.075,
               cheeks=[(Vector((0.2 * sx, -0.28, -0.06)), Vector((0, -1, 0))) for sx in (-1, 1)], smile=(Vector((0.0, -0.3, -0.07)), Vector((0, -1, 0)), 0.11))
    halo('comet-glow', coll, Vector((0, 0, 0)), 0.85, soft_glow(C['comet'], 0.55), root, ahead=-0.3)
    for k in range(9):
        t = (k + 1) / 9
        q = Vector((0.45 + t * 2.2, 0.2, 0.12 + t * 0.6))
        halo(f'comet-tail-{k}', coll, q, 0.5 - 0.27 * t, soft_glow([C['rainbow1'], C['rainbow2'], C['rainbow3']][k % 3], 0.85 * (1 - t) + 0.15), root, ahead=-0.2 - 0.01 * k)
    free_fit('comet', root)
    # The ringed planet: peach, a lilac ring tilted across it.
    coll = sprite('ringed', {'idle': [F_SPACE]})
    root = free_root('ringed', coll)
    blob('ringed-ball', principled(C['ringed'], 0.5, C['ringed'], 0.15), coll, root, (0.0, 0.0, 0.0), (0.62, 0.62, 0.62), seg=(48, 24))
    blob('ringed-spot', principled('#F2A66B', 0.6), coll, root, (0.15, -0.55, 0.12), (0.12, 0.05, 0.1), seg=(16, 8))
    torus('ringed-ring', 1.0, 0.08, principled(C['ring'], 0.4, C['ring'], 0.3), coll, root, (0.0, 0.0, 0.0), (74, -16, 0))
    halo('ringed-glow', coll, Vector((0, 0, 0)), 1.2, soft_glow('#FFD9B0', 0.35), root, ahead=-0.8)
    free_fit('ringed', root)
    # The ufo: a saucer, a glass dome with a little alien inside (wave: its arm up), rim lights.
    coll = sprite('ufo', {'idle': [F_SPACE], 'wave': [F_SPACE + 1]})
    root = free_root('ufo', coll)
    tilt = empty('ufo-tilt', coll, root, (0.0, 0.0, 0.0), (78.0, 0.0, -8.0))
    lathe('ufo-saucer', [(0.0, -0.12), (0.7, -0.08), (0.95, 0.0), (0.7, 0.1), (0.0, 0.12)], principled(C['ufo'], 0.3), coll, tilt, seg=48)
    for k in range(8):
        a = 2 * math.pi * k / 8
        blob(f'ufo-light-{k}', emit(C['ufoLight'], 2.2), coll, tilt, (0.82 * math.cos(a), 0.82 * math.sin(a), 0.02), (0.07, 0.07, 0.05), seg=(12, 6))
    al = blob('ufo-alien', principled(C['alienMint'], 0.35), coll, tilt, (0.0, 0.0, 0.25), (0.2, 0.2, 0.24), seg=(24, 12))
    chibi_face('ufo-alien-face', al, coll, COL, [(Vector((0.07 * sx, -0.18, 0.05)), Vector((0, -1, 0))) for sx in (-1, 1)], 0.05)
    arm_frames = [F_SPACE, F_SPACE + 1]
    arm = rod('ufo-arm', (0.14, -0.05, 0.3), (0.32, -0.1, 0.52), 0.04, principled(C['alienMint'], 0.35), coll, tilt, seg=10)
    show_on(arm, [F_SPACE + 1], arm_frames)
    dome = blob('ufo-dome', veil(C['ufoDome'], 0.3), coll, tilt, (0.0, 0.0, 0.18), (0.42, 0.42, 0.4), seg=(32, 16), shape=lambda d: Vector((d.x, d.y, max(d.z, -0.05))))
    dome.visible_shadow = False
    halo('ufo-beam', coll, Vector((0.0, 0.0, -0.45)), 0.8, soft_glow(C['ufoLight'], 0.35, 1.4), root, ahead=-0.4)
    bpy.context.scene.frame_set(F_SPACE)
    free_fit('ufo', root)
    # The satellite: a body, a dish, two panels (b: the panels flapped).
    coll = sprite('satellite', {'a': [F_SPACE], 'b': [F_SPACE + 1]})
    root = free_root('satellite', coll)
    rbox('sat-body', (0.5, 0.4, 0.5), 0.1, principled(C['satellite'], 0.35), coll, root)
    blob('sat-dish', principled(C['dish'], 0.3), coll, root, (0, 0, 0.38), (0.18, 0.18, 0.08), seg=(20, 8))
    blob('sat-light', emit(C['nebulaMint'], 2.5), coll, root, (0, -0.22, 0.05), (0.05, 0.03, 0.05), seg=(12, 6))
    for sx in (-1, 1):
        piv = empty(f'sat-hinge-{sx}', coll, root, (0.27 * sx, 0.0, 0.0))
        rbox(f'sat-panel-{sx}', (0.6, 0.04, 0.32), 0.04, principled(C['panel'], 0.25, C['panel'], 0.3), coll, piv, (0.33 * sx, 0, 0))
        for f, deg in ((F_SPACE, 0.0), (F_SPACE + 1, 22.0 * sx)):
            piv.rotation_euler = (0.0, math.radians(deg), 0.0)
            piv.keyframe_insert('rotation_euler', frame=f)
        key_constant(piv)
    root.rotation_euler = (-P, math.radians(15.0), 0.0)
    bpy.context.scene.frame_set(F_SPACE)
    free_fit('satellite', root)


# --- the Moon -------------------------------------------------------------------------------------------------------

def build_moon(params, layout):
    coll = sprite('moon', {'idle': [F_MOON]})
    edge_cut(coll)
    ridge = principled(C['moonShade'], 0.9, C['nebulaLilac'], 0.08)
    for k, (sx, w, h) in enumerate(((150, 3.2, 0.7), (620, 4.0, 0.55), (1000, 2.6, 0.8))):
        blob(f'ridge-{k}', ridge, coll, None, pt(sx, 505, 16.0), (w, 0.6, h), seg=(48, 20)).visible_shadow = False
    blob('moon-ground', principled(C['moon'], 0.85), coll, None, (0.0, 3.0, -0.7), (9.5, 7.0, 0.7), seg=(128, 40))
    rim_m, cr_m, in_m = principled(C['craterRim'], 0.85), principled(C['crater'], 0.9), principled(C['craterIn'], 0.9)

    def crater(name, p, r):
        blob(f'{name}-rim', rim_m, coll, None, p, (r * 1.18, r * 1.18, 0.07), seg=(48, 12))
        blob(f'{name}-dish', cr_m, coll, None, p + Vector((0, 0, 0.035)), (r * 0.92, r * 0.92, 0.04), seg=(48, 12))
        blob(f'{name}-in', in_m, coll, None, p + Vector((0, r * 0.12, 0.05)), (r * 0.7, r * 0.6, 0.03), seg=(40, 10))

    for n, (sx, sy) in enumerate(CRATER_PX):
        p = pt(sx, sy, gy(sy))
        crater(f'crater-{n}', p, CRATER_R)
        add_empty(f'anchor.crater-{n}', p, layout)
        ring = [p + Vector((CRATER_HIT_R * math.cos(2 * math.pi * i / 24), CRATER_HIT_R * math.sin(2 * math.pi * i / 24), 0.0)) for i in range(24)]
        up = screen_shift(0.0, -CRATER_PEEK_PX)
        hull_object(f'hit.crater-{n}', ring + [q + up for q in ring], layout)
    for k, (sx, sy, r) in enumerate(((560, 700, 0.3), (330, 575, 0.24), (840, 680, 0.22), (480, 560, 0.2), (620, 520, 0.18))):
        crater(f'deco-crater-{k}', pt(sx, sy, gy(sy)), r)
    # The rocks (one sprite on rock 0; the scene draws it on rock 1 too).
    rcoll = sprite('rock', {'idle': [F_MOON]})
    p0 = pt(ROCK_PX[0][0], ROCK_PX[0][1], gy(ROCK_PX[0][1]))
    blob('rock', principled(C['moonShade'], 0.8), rcoll, None, p0 + Vector((0, 0, 0.14)), (0.34, 0.28, 0.22), (0, 0, 25), seg=(24, 12))
    blob('rock-top', principled(C['moon'], 0.8), rcoll, None, p0 + Vector((-0.06, -0.04, 0.27)), (0.16, 0.12, 0.06), seg=(16, 8))
    for n, (sx, sy) in enumerate(ROCK_PX):
        add_empty(f'anchor.rock-{n}', pt(sx, sy, gy(sy)), layout)
    # The mango flag.
    fcoll = sprite('flag', {'idle': [F_MOON]})
    root = empty('flag-root', fcoll, None, pt(FLAG_PX[0], FLAG_PX[1], gy(FLAG_PX[1])))
    root.scale = (0.9, 0.9, 0.9)
    rod('flag-pole', (0, 0, 0), (0, 0, 1.6), 0.035, principled(C['pole'], 0.3), fcoll, root)
    blob('flag-knob', principled(C['yellow'], 0.3), fcoll, root, (0, 0, 1.63), (0.06, 0.06, 0.06), seg=(12, 6))
    rbox('flag-cloth', (0.75, 0.04, 0.5), 0.08, principled(C['flagCloth'], 0.5), fcoll, root, (0.4, 0.0, 1.32), (0, 6, 0))
    blob('flag-mango', principled(C['mango'], 0.35), fcoll, root, (0.4, -0.05, 1.3), (0.15, 0.03, 0.18), (0, -30, 0), seg=(20, 10))
    blob('flag-leaf', principled(C['mangoLeaf'], 0.4), fcoll, root, (0.5, -0.06, 1.45), (0.08, 0.02, 0.04), (0, -40, 0), seg=(12, 6))
    add_empty('anchor.flag', pt(FLAG_PX[0], FLAG_PX[1], gy(FLAG_PX[1])), layout)
    # The aliens, each in crater 0, peek (both hands down) or wave (one hand up); the ground cuts their lower half.
    p = pt(CRATER_PX[0][0], CRATER_PX[0][1], gy(CRATER_PX[0][1]))
    for aid in params['rocket']['aliens']:
        colour = C[f'alien{aid[0].upper()}{aid[1:]}']
        frames = [F_MOON, F_MOON + 1]
        acoll = sprite(f'alien-{aid}', {'peek': [frames[0]], 'wave': [frames[1]]}, bhc_holdout_sprites=json.dumps(['moon']))
        root = empty(f'alien-{aid}-root', acoll, None, p + Vector((0.0, 0.05, -0.42)))
        root.scale = (0.8, 0.8, 0.8)
        body_m = principled(colour, 0.35)
        radii, centre = (0.55, 0.5, 0.62), (0.0, 0.0, 0.62)
        blob(f'alien-{aid}-body', body_m, acoll, root, centre, radii, seg=(40, 20), shape=lambda d: Vector((d.x * (1.0 + 0.12 * max(0, -d.z)), d.y, d.z)))
        eyes = [on_body(radii, centre, (0.3 * sx, -1.0, 0.28)) for sx in (-1, 1)]
        cheeks = [on_body(radii, centre, (0.5 * sx, -1.0, -0.05)) for sx in (-1, 1)]
        smile = on_body(radii, centre, (0.0, -1.0, 0.0))
        chibi_face(f'alien-{aid}-face', root, acoll, COL, eyes, 0.17, cheeks=cheeks, smile=(smile[0], smile[1], 0.2))
        tip = Vector((0.08, 0.0, 1.62))
        rod(f'alien-{aid}-antenna', (0.0, 0.0, 1.18), tip, 0.035, body_m, acoll, root, seg=10)
        blob(f'alien-{aid}-ball', emit(C['antenna'], 3.0), acoll, root, tip, (0.11, 0.11, 0.11), seg=(20, 10))
        halo(f'alien-{aid}-ball-glow', acoll, tip, 0.45, soft_glow(C['antenna'], 0.7), root, ahead=-0.2)
        down = empty(f'alien-{aid}-hands-down', acoll, root)
        for sx in (-1, 1):
            blob(f'alien-{aid}-hand-down-{sx}', body_m, acoll, down, (0.62 * sx, -0.1, 0.7), (0.13, 0.12, 0.13), seg=(16, 8))
        wave = empty(f'alien-{aid}-hands-wave', acoll, root)
        for sx in (-1, 1):
            blob(f'alien-{aid}-hand-wave-{sx}', body_m, acoll, wave, (0.66 * sx, -0.1, 1.08 if sx > 0 else 0.7), (0.13, 0.12, 0.13), seg=(16, 8))
        show_on(down, [frames[0]], frames)
        show_on(wave, [frames[1]], frames)


# --- main -----------------------------------------------------------------------------------------------------------

def clear_island(scene):
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


def check_sizes(params, layout):
    """The tap areas' sizes and gaps the builder controls (validateRocket checks them all again)."""
    z = params['rocket']
    for n in range(len(CHOICE_PX)):
        if BUBBLE_PX < z['choiceMinPx']:
            fail(f'the bubble is {BUBBLE_PX} px (min {z["choiceMinPx"]})')
    d = math.dist(CHOICE_PX[0], CHOICE_PX[1]) - BUBBLE_PX
    if d < z['choiceGapPx']:
        fail(f'the bubbles are {d:.0f} px apart (min {z["choiceGapPx"]})')


def main():
    global DESIGN, C, COL, PARAMS, SPRITES, RIG, LAYOUT
    args = parse_args('build_rocket', required=('out', 'params'))
    params = args['params']
    PARAMS = params
    DESIGN = (params['design']['width'], params['design']['height'])
    C = params['art']['rocket']
    COL = {**params['colours'], 'white': '#FFFFFF', 'creatureLight': params['art']['creatureLight']}
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(1)
    setup_camera(scene)
    setup_lights(scene)
    bpy.context.view_layer.update()
    log(f'render engine {scene.render.engine}')
    plate = bpy.data.collections.new('rocket-plate')
    scene.collection.children.link(plate)
    SPRITES = bpy.data.collections.new('sprites')
    scene.collection.children.link(SPRITES)
    RIG = bpy.data.collections.new('rig')
    scene.collection.children.link(RIG)
    LAYOUT = bpy.data.collections.new('layout')
    scene.collection.children.link(LAYOUT)
    LAYOUT.hide_render = True
    check_sizes(params, LAYOUT)
    build_plate(plate)
    pad_coll, warm, shade, _base = build_pad_world(params)
    rocket = build_rocket(params, LAYOUT)
    ground = finish_launchpad(pad_coll, rocket)
    build_smoke(ground)
    add_empty('anchor.sun', pt(SUN_PX[0], SUN_PX[1], 35.0), LAYOUT)
    build_astro(params, LAYOUT, 'astro', ASTRO_PX, [F_PAD, F_PAD + 1, F_PAD + 2, F_PAD + 3], ['idle', 'wave', 'jump', 'happy'])
    add_empty('anchor.astro-moon', pt(ASTRO_MOON_PX[0], ASTRO_MOON_PX[1], gy(ASTRO_MOON_PX[1])), LAYOUT)
    build_free_bits(warm, shade)
    for n, (sx, sy) in enumerate(CHOICE_PX):
        add_empty(f'anchor.choice-{n}', pt(sx, sy, FREE_Y), LAYOUT)
        r = BUBBLE_PX / 2
        hull_object(f'hit.choice-{n}', [pt(sx + r * math.cos(2 * math.pi * i / 32), sy + r * math.sin(2 * math.pi * i / 32), FREE_Y) for i in range(32)], LAYOUT)
    build_space(params, LAYOUT)
    build_moon(params, LAYOUT)
    scene.frame_set(1)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    log(f'saved {args["out"]}')


if __name__ == '__main__':
    main()
