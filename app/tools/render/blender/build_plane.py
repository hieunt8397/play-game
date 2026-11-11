# Builds art/plane.blend (Phi công nhí, spec-phi-cong-nhi, 2026-11-11) from the vendored island art/src/map-v3.blend
# (only its render settings, world and Sun are kept).
#
# Run by `npm run art:build -- plane` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_plane.py -- \
#     --out <tmp>/plane.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens and content): colours, art.plane, art.animalPens (the friends),
# art.creatureLight, plane (friends, colours, surprises, gifts, the sizes, the flight band), design size, the
# interactive rect.
#
# One plate, 2048×1536, seen through an ORTHOGRAPHIC camera tilted CAM_PITCH degrees down (a shift along world x is a
# shift in design px): ONLY a still sky — a soft vertical gradient, a soft sun and three faint far clouds. Everything
# that scrolls is a sprite (all script-built from cute.py shapes; every sprite renders alone):
#   - plane: a chunky toy propeller plane, nose to screen right, flown by the chibi Shiba (cute.chibi('dog')) in pilot
#     goggles and a scarf. States: idle [1] (blades still), prop [10, 11] (a soft blur disc, its streaks turned a
#     little), waggle [20, 21] (rolled toward / away from the camera), happy [30] (the pilot cheers, paws up). Every
#     frame has the plane's centre on anchor.plane; anchor.plane-ground is the same x, parked on the grass;
#     anchor.cargo-<n>: three spots on the cargo deck behind the cockpit;
#   - balloon-<colour> (balloon, knot, string and gift box), gift-<colour> (the box alone), parachute, pop, puff,
#     cloud (states a, b, heart), bird (states a, b: wings up / down, flying left), rainbow (a tall arch on two little
#     clouds), hot-air: rendered anywhere, placed by their trimmed centre;
#   - hill (states a, b: their bases at HILL_BOTTOM_PX), ground (a strip as wide as the frame, a uniform cross-section
#     so it tiles; its details stay off the left and right edges): the scene keeps their rendered y;
#   - friend-<id> (idle [1], happy [20]) on the ground pivot anchor.friend; house-<id> on anchor.house.
# Layout: hit.friend-<id>, hit.house-<id> (the hulls at rest), anchors plane, plane-ground, cargo-<n>, friend, house,
# gifts.
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
from cute import blob, chibi, chibi_materials, key_chibi, lathe, mat, mesh_obj, on_body, place, rbox, rod, rounded_profile, soften_scene, torus, torus_bm  # noqa: E402
from common import add_empty, eval_world_verts, hex_to_linear, hull_object, key_constant, parse_args  # noqa: E402
from build_animal_pens import PEN_CHIBIS, chibi_mats  # noqa: E402  (its main() only runs as a script)

RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main

# --- the camera: orthographic, looking along +y, tilted down --------------------------------------------------------
ORTHO_PX_PER_M = 100.0
CAM_PITCH = 12.0
CAM_DISTANCE = 60.0
FRIEND_PX = (640.0, 664.0)  # design px: the friends' ground pivot (world (0, 0, 0))

# --- the sky plate (design px) --------------------------------------------------------------------------------------
SKY_Y = 30.0
SKY_LOW_PX = 620.0  # the gradient reaches skyLow here (the ground strip covers what is below)
SUN_PX = (792.0, 150.0)
SUN_CORE_PX = 44.0
SUN_HALO_PX = 150.0
SUN_HALO = 0.42  # the halo's strength at the sun's rim
FAR_CLOUDS = [(236.0, 104.0, 1.0), (548.0, 196.0, 0.72), (930.0, 318.0, 0.6)]  # centre px, scale
FAR_CLOUD_FADE = 0.42  # how far the far clouds blend from the sky towards the cloud colour

# --- the plane (design px) ------------------------------------------------------------------------------------------
PLANE_PX = (290.0, 315.0)  # anchor.plane: the plane's drawn centre (idle)
PLANE_GROUND_PX = (290.0, 585.0)  # anchor.plane-ground
PLANE_WIDTH_PX = 214.0
PLANE_Y = -3.0  # its depth
PLANE_YAW = -24.0  # the nose (local +x) turned a little toward the camera
PILOT_SCALE = 0.38
PILOT_X = 0.2
PILOT_Z = 0.08
ROLL_DEG = 15.0
P_IDLE, P_PROP, P_WAGGLE, P_HAPPY = [1], [10, 11], [20, 21], [30]
PLANE_STATES = {'idle': P_IDLE, 'prop': P_PROP, 'waggle': P_WAGGLE, 'happy': P_HAPPY}
PLANE_FRAMES = P_IDLE + P_PROP + P_WAGGLE + P_HAPPY
CARGO = [(-0.2, 0.0, 0.47), (-0.43, 0.0, 0.45), (-0.66, 0.0, 0.43)]  # the cargo spots (the plane's own frame)
PROP_ALPHA = 0.34
STREAK_ALPHA = 0.3

# --- the friends and their houses (design px) -----------------------------------------------------------------------
F_IDLE, F_HAPPY = [1], [20]
FRIEND_STATES = {'idle': F_IDLE, 'happy': F_HAPPY}
FRIEND_YAW = -36.0  # three-quarter: toward the camera and the plane (screen left)
FRIEND_HEAD_UP = -6.0
FRIEND_HEIGHT_PX = {'cat': 168.0, 'pig': 160.0, 'sheep': 168.0, 'cow': 178.0, 'horse': 184.0, 'rooster': 168.0}
HOUSE_PX = (850.0, 650.0)  # anchor.house: the houses' ground pivot (bottom centre)
HOUSE_BOX_PX = (228.0, 245.0)
HOUSE_YAW = -20.0  # the front (local -y) turned a little toward the friend
HOUSE_MAX_X = 965.0
HOUSE_MIN_Y = 400.0
GIFTS_PX = (545.0, 650.0)
FRIEND_MIN_LEFT_PX = 540.0  # the padded hulls stay right of this (the flying plane keeps its gap)
HIT_PAD_PX = 24.0  # Tokens.spacing.hitPad (the pipeline pads the hulls)

# --- the ground, hills (design px) ----------------------------------------------------------------------------------
GROUND_TOP_PX = 612.0
GROUND_LIP_PX = 732.0  # the grass's front edge (a darker lip, the soil under it)
GROUND_W_PX = 1021.0  # ≤ 2044 render px with its soft right edge: a 2048 atlas page minus the packer's padding (2 a side)
GROUND_OVER_PX = 30.0  # the strip runs this far past the frame's left edge
GROUND_EDGE_PX = 48.0  # the details keep this far from the left and right frame edges
HILL_BOTTOM_PX = 640.0
HILL_BOX_PX = {'a': (540.0, 205.0), 'b': (450.0, 168.0)}
HILL_Y = 9.0
SEED = 41

# --- the free sprites: (centre px, longest side px); placed by their trimmed centre at runtime -----------------------
BALLOON_PX = 162.0
GIFT_PX = 52.0
FREE = {
    'parachute': ((500.0, 340.0), 74.0), 'pop': ((600.0, 340.0), 82.0), 'puff': ((700.0, 340.0), 62.0),
    'cloud-a': ((512.0, 250.0), 210.0), 'cloud-b': ((512.0, 250.0), 178.0), 'cloud-heart': ((512.0, 250.0), 172.0),
    'bird': ((850.0, 340.0), 66.0), 'rainbow': ((512.0, 360.0), 332.0), 'hot-air': ((880.0, 180.0), 190.0),
}
FREE_Y = -6.0

HIDDEN = (0.0001, 0.0001, 0.0001)


def fail(msg):
    raise RuntimeError(f'build_plane: {msg}')


def log(msg):
    print(f'build_plane: {msg}')


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
    """The camera target so that the friends' ground pivot (0, 0, 0) projects to FRIEND_PX."""
    global TX, TZ
    TX = -(FRIEND_PX[0] - DESIGN[0] / 2) / ORTHO_PX_PER_M
    TZ = (FRIEND_PX[1] - DESIGN[1] / 2) / ORTHO_PX_PER_M / math.cos(P)
    data = bpy.data.cameras.new('CamPlane')
    data.type = 'ORTHO'
    data.ortho_scale = DESIGN[0] / ORTHO_PX_PER_M
    data.clip_start = 0.1
    data.clip_end = 400.0
    cam = bpy.data.objects.new('CamPlane', data)
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


def fmt_rect(r):
    return f'({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}'


def fmt_px(p):
    return f'({p[0]:.0f}, {p[1]:.0f})'


def empty(name, coll, parent=None, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.2
    coll.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_euler = tuple(math.radians(a) for a in rot)
    return e


def meshes_of(root):
    return [o for o in root.children_recursive if o.type == 'MESH']


def rect_of(root):
    return SCREEN.rect(world_pts(meshes_of(root)))


def fit(root, at, longest=None, height=None, width=None, box=None, bottom=False):
    """Scales `root` (to a drawn longest side, height, width or into a box) and moves it so its drawn centre (or its
    bottom centre) is `at` (design px). Returns its drawn rect."""
    r = rect_of(root)
    w, h = r[2] - r[0], r[3] - r[1]
    if longest is not None:
        k = longest / max(w, h)
    elif height is not None:
        k = height / h
    elif width is not None:
        k = width / w
    else:
        k = min(box[0] / w, box[1] / h)
    root.scale = root.scale * k
    for _ in range(2):
        r = rect_of(root)
        root.location.x += (at[0] - (r[0] + r[2]) / 2) / ORTHO_PX_PER_M
        root.location.z -= (at[1] - (r[3] if bottom else (r[1] + r[3]) / 2)) / ORTHO_PX_PER_M / math.cos(P)
    return rect_of(root)


def billboard(name, coll, loc=(0.0, 0.0, 0.0)):
    """A root empty whose local front (-y) faces the camera (its local z is up the screen)."""
    e = empty(name, coll, None, loc)
    e.rotation_euler = (-P, 0.0, 0.0)
    return e


def sprite(sprites, name, **props):
    coll = bpy.data.collections.new(f'sprite.{name}')
    sprites.children.link(coll)
    coll['movable'] = 1
    for k, v in props.items():
        coll[k] = v
    return coll


def state_child(group, sprite_name, state):
    child = bpy.data.collections.new(f'state.{sprite_name}-{state}')
    child['bhc_state'] = state
    group.children.link(child)
    return child


def free_root(name, coll):
    at, _size = FREE[name]
    return billboard(f'{name}-root', coll, pt(at[0], at[1], FREE_Y))


def free_fit(name, root):
    at, size = FREE[name]
    r = fit(root, at, longest=size)
    if r[0] < 4 or r[1] < 4 or r[2] > DESIGN[0] - 4 or r[3] > DESIGN[1] - 4:
        fail(f'{name} {fmt_rect(r)} leaves the frame')
    log(f'{name} {fmt_rect(r)}')
    return r


def show_on(obj, on, frames, scale=(1.0, 1.0, 1.0)):
    """Keys the object visible (its scale) on the frames in `on` and hidden on the others."""
    for f in frames:
        obj.scale = scale if f in on else HIDDEN
        obj.keyframe_insert('scale', frame=f)
    key_constant(obj)


def key_rot(obj, by_frame):
    """Keys rotation_euler (degrees) per frame, constant."""
    for f, rot in by_frame.items():
        obj.rotation_euler = tuple(math.radians(a) for a in rot)
        obj.keyframe_insert('rotation_euler', frame=f)
    key_constant(obj)


# --- materials ------------------------------------------------------------------------------------------------------

def mix_hex(a, b, t):
    """The sRGB hex between two token colours (t = 0: a, 1: b)."""
    pa, pb = a.lstrip('#'), b.lstrip('#')
    out = [round(int(pa[i:i + 2], 16) * (1 - t) + int(pb[i:i + 2], 16) * t) for i in (0, 2, 4)]
    return '#' + ''.join(f'{v:02X}' for v in out)


def emit_mat(name, hex_colour, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_to_linear(hex_colour)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


def veil_mat(name, hex_colour, alpha):
    """An unlit, see-through colour (the propeller's blur): low contrast, never a hard edge of light."""
    m = bpy.data.materials.new(name)
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
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    if hasattr(m, 'blend_method'):
        try:
            m.blend_method = 'BLEND'
        except (TypeError, AttributeError):
            pass
    return m


def _socket(sockets, identifier):
    return next(s for s in sockets if s.identifier == identifier)


def sky_material(c, low_z, top_z, sun, core, halo):
    """Unlit: skyLow at object z = low_z blending to sky at top_z; a soft sun disc with a halo at `sun` (object x, z)."""
    m = bpy.data.materials.new('plane-sky')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Object'], sep.inputs[0])

    def ramp(value, v0, v1, t0, t1):
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.interpolation_type = 'SMOOTHSTEP'
        mr.inputs['From Min'].default_value = v0
        mr.inputs['From Max'].default_value = v1
        mr.inputs['To Min'].default_value = t0
        mr.inputs['To Max'].default_value = t1
        nt.links.new(value, mr.inputs['Value'])
        return mr.outputs['Result']

    def mix(fac, a, b):
        node = nt.nodes.new('ShaderNodeMix')
        node.data_type = 'RGBA'
        nt.links.new(fac, _socket(node.inputs, 'Factor_Float'))
        for key, v in (('A_Color', a), ('B_Color', b)):
            if isinstance(v, str):
                _socket(node.inputs, key).default_value = hex_to_linear(v)
            else:
                nt.links.new(v, _socket(node.inputs, key))
        return _socket(node.outputs, 'Result_Color')

    grad = mix(ramp(sep.outputs['Z'], low_z, top_z, 0.0, 1.0), c['skyLow'], c['sky'])
    dist = nt.nodes.new('ShaderNodeVectorMath')
    dist.operation = 'DISTANCE'
    nt.links.new(coord.outputs['Object'], dist.inputs[0])
    dist.inputs[1].default_value = (sun[0], 0.0, sun[1])
    d = dist.outputs['Value']
    disc = ramp(d, core * 0.9, core * 1.08, 1.0, 0.0)
    glow = ramp(d, core * 0.6, halo, SUN_HALO, 0.0)
    fac = nt.nodes.new('ShaderNodeMath')
    fac.operation = 'MAXIMUM'
    nt.links.new(disc, fac.inputs[0])
    nt.links.new(glow, fac.inputs[1])
    colour = mix(fac.outputs[0], grad, c['sun'])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(colour, em.inputs['Color'])
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


# --- shapes ---------------------------------------------------------------------------------------------------------

def quad(name, w, h, material, coll, parent, loc=(0.0, 0.0, 0.0)):
    """A flat w × h quad in the local xz plane."""
    bm = bmesh.new()
    vs = [bm.verts.new((sx * w / 2, 0.0, sz * h / 2)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(vs)
    o = mesh_obj(name, bm, material, coll, smooth=False)
    o['cute'] = 1
    return place(o, parent, loc)


def prism(name, profile, depth, material, coll, parent, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), bevel=0.05):
    """A roof: the (x, z) profile (counter-clockwise) swept `depth` along y, its edges rounded."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in profile]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in profile]
    n = len(profile)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=bevel, segments=3, profile=0.5, affect='EDGES', clamp_overlap=True)
    return place(mesh_obj(name, bm, material, coll), parent, loc, rot)


def gore_ball(name, mats, gores, size, coll, parent, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), shape=None, dome=False):
    """A ball (or its upper half: `dome`) in `gores` wedges alternating between the two materials."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=gores * 4, v_segments=20, radius=1.0)
    if dome:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
    for f in bm.faces:
        c = f.calc_center_median()
        a = math.atan2(c.y, c.x) % (2 * math.pi)
        f.material_index = int(a / (2 * math.pi / gores)) % 2
    for v in bm.verts:
        d = v.co.normalized() if v.co.length > 1e-6 else v.co.copy()
        p = shape(d) if shape else d
        v.co = Vector((p.x * size[0], p.y * size[1], p.z * size[2]))
    return place(mesh_obj(name, bm, list(mats), coll), parent, loc, rot)


def puffs(name, spec, front, back, coll, parent, depth=0.3, drop=0.13):
    """A toy cloud: round puffs [(dx, dz, r)], a shade puff behind and under each."""
    for j, (dx, dz, r) in enumerate(spec):
        blob(f'{name}-{j}', front, coll, parent, (dx, -0.04 * j, dz), (r, depth, r * 0.88), seg=(32, 16))
        if back is not None:
            blob(f'{name}-shade-{j}', back, coll, parent, (dx, 0.3, dz - drop), (r * 1.02, depth, r * 0.88), seg=(32, 16))


def flower(name, coll, parent, at, size, petal, heart, n=5):
    """A little flower lying on the grass, facing up and a little toward the camera."""
    pivot = empty(f'{name}-pivot', coll, parent, at, (25.0, 0.0, 0.0))
    for i in range(n):
        a = 2 * math.pi * i / n + 0.3
        blob(f'{name}-petal-{i}', petal, coll, pivot, (math.cos(a) * size * 0.5, math.sin(a) * size * 0.5, 0.0), (size * 0.42, size * 0.42, size * 0.14), seg=(16, 8))
    blob(f'{name}-heart', heart, coll, pivot, (0.0, 0.0, size * 0.08), (size * 0.3, size * 0.3, size * 0.2), seg=(16, 8))


def round_window(name, c, coll, parent, at, r, yaw=0.0):
    """A round window on a wall facing local -y (turned `yaw` about z)."""
    pivot = empty(f'{name}-pivot', coll, parent, at, (0.0, 0.0, yaw))
    blob(f'{name}-glass', mat(c['window'], 0.15), coll, pivot, (0.0, 0.0, 0.0), (r, 0.035, r), seg=(24, 12))
    torus(f'{name}-trim', r, r * 0.24, mat(c['trim'], 0.5), coll, pivot, (0.0, 0.0, 0.0), (90.0, 0.0, 0.0))
    rbox(f'{name}-bar-x', (2 * r, 0.03, r * 0.16), 0.012, mat(c['trim'], 0.5), coll, pivot, (0.0, -0.03, 0.0))
    rbox(f'{name}-bar-z', (r * 0.16, 0.03, 2 * r), 0.012, mat(c['trim'], 0.5), coll, pivot, (0.0, -0.03, 0.0))


def square_window(name, c, coll, parent, at, w, h):
    rbox(f'{name}-trim', (w + 0.12, 0.07, h + 0.12), 0.04, mat(c['trim'], 0.5), coll, parent, at)
    rbox(f'{name}-glass', (w, 0.1, h), 0.03, mat(c['window'], 0.15), coll, parent, at)
    rbox(f'{name}-bar-x', (w, 0.12, 0.04), 0.012, mat(c['trim'], 0.5), coll, parent, at)
    rbox(f'{name}-bar-z', (0.04, 0.12, h), 0.012, mat(c['trim'], 0.5), coll, parent, at)


def door(name, c, coll, parent, at, w, h, knob=True):
    """An arched door on a wall facing local -y, its foot at `at`."""
    x, y, z = at
    rbox(f'{name}-frame', (w + 0.12, 0.07, h + 0.06), min(w / 2, 0.3), mat(c['trim'], 0.5), coll, parent, (x, y, z + (h + 0.06) / 2))
    rbox(f'{name}-leaf', (w, 0.1, h), min(w / 2 - 0.02, 0.26), mat(c['door'], 0.5), coll, parent, (x, y, z + h / 2))
    if knob:
        blob(f'{name}-knob', mat(c['trim'], 0.3), coll, parent, (x + w * 0.28, y - 0.06, z + h * 0.45), (0.04, 0.04, 0.04), seg=(12, 8))


# --- the plate ------------------------------------------------------------------------------------------------------

def build_sky(c, plate):
    root = billboard('sky-root', plate, pt(DESIGN[0] / 2, DESIGN[1] / 2, SKY_Y))
    ppm = ORTHO_PX_PER_M
    low = (DESIGN[1] / 2 - SKY_LOW_PX) / ppm
    top = DESIGN[1] / 2 / ppm
    sun = ((SUN_PX[0] - DESIGN[0] / 2) / ppm, (DESIGN[1] / 2 - SUN_PX[1]) / ppm)
    sky = quad('sky', DESIGN[0] / ppm + 6.0, DESIGN[1] / ppm + 6.0, sky_material(c, low, top, sun, SUN_CORE_PX / ppm, SUN_HALO_PX / ppm), plate, root)
    sky.visible_shadow = False
    # Faint far clouds: unlit, most of the way to the sky's colour (one flat tone each, no overlaps showing).
    for k, (sx, sy, s) in enumerate(FAR_CLOUDS):
        t = max(0.0, min(1.0, (sy - 0.0) / SKY_LOW_PX))
        here = mix_hex(c['sky'], c['skyLow'], t * t * (3 - 2 * t))
        m = emit_mat(f'plane-far-cloud-{k}', mix_hex(here, c['cloud'], FAR_CLOUD_FADE))
        x, z = (sx - DESIGN[0] / 2) / ppm, (DESIGN[1] / 2 - sy) / ppm
        for j, (dx, dz, r) in enumerate([(-0.62, 0.0, 0.3), (-0.2, 0.12, 0.42), (0.3, 0.1, 0.38), (0.72, -0.02, 0.26), (0.05, -0.1, 0.36)]):
            b = blob(f'far-cloud-{k}-{j}', m, plate, root, (x + dx * s, -0.5, z + dz * s), (r * s * 1.25, 0.1, r * s * 0.72), seg=(32, 12))
            b.visible_shadow = False


# --- the plane ------------------------------------------------------------------------------------------------------

def fuselage(d):
    """A chunky body: round at the nose, tapering and rising a little toward the tail."""
    if d.x < 0:
        t = -d.x
        k = 1.0 - 0.5 * t * t
        return Vector((d.x, d.y * k, d.z * k + 0.2 * t * t))
    return d


def build_pilot(params, c, coll, roll):
    colours = {**params['colours'], 'creatureLight': params['art']['creatureLight']}
    mats = chibi_materials(colours, colours['creatureOrange'], colours['creatureLight'])
    rig = chibi('dog', 'pilot', coll, mats)
    root = rig['root']
    root.parent = roll
    root.location = (PILOT_X, 0.0, PILOT_Z)
    root.rotation_euler = (0.0, 0.0, math.radians(90.0))  # its front (-y) to the plane's nose (+x)
    root.scale = (PILOT_SCALE, PILOT_SCALE, PILOT_SCALE)
    rig['tail'].scale = HIDDEN  # the curl would poke through the cargo deck
    head, body = rig['head'], rig['body']
    # The goggles, pushed up on the forehead (the eyes stay free): two round lenses, a bridge, a strap.
    strap_m, glass = mat(c['goggles'], 0.5), mat(c['gogglesGlass'], 0.12)
    skull_c, skull_r = (0.0, -0.03, 0.38), (0.62, 0.55, 0.55)
    lens_at = []
    for sx in (-1, 1):
        p, n = on_body(skull_r, skull_c, (0.36 * sx, -0.66, 0.66))
        q = n.to_track_quat('Z', 'Y')
        lens_at.append(p + n * 0.05)
        rim = mesh_obj(f'pilot-goggle-rim-{sx}', torus_bm(0.15, 0.045, seg=28, tube=10), strap_m, coll)
        lens = blob(f'pilot-goggle-lens-{sx}', glass, coll, head, size=(0.14, 0.14, 0.05), seg=(24, 10))
        shine = blob(f'pilot-goggle-shine-{sx}', mat(c['trim'], 0.15), coll, head, size=(0.045, 0.03, 0.02), seg=(12, 8))
        for o, off in ((rim, 0.035), (lens, 0.05), (shine, 0.1)):
            o.parent = head
            o.rotation_mode = 'QUATERNION'
            o.rotation_quaternion = q
            o.location = p + n * off
            o['cute'] = 1
        shine.location = p + n * 0.1 + (q @ Vector((-0.05, 0.05, 0.0)))
    rod('pilot-goggle-bridge', lens_at[0], lens_at[1], 0.035, strap_m, coll, head, seg=10)['cute'] = 1
    strap = mesh_obj('pilot-goggle-strap', torus_bm(0.52, 0.04, seg=48, tube=10), strap_m, coll)
    strap.parent = head
    strap.location = (0.0, 0.0, skull_c[2] + 0.3)
    strap.scale = (1.0, 0.9, 1.0)
    strap.rotation_euler = (math.radians(-18.0), 0.0, 0.0)
    strap['cute'] = 1
    # The scarf: a ring at the neck and two tails streaming back.
    scarf = mat(c['scarf'], 0.5)
    torus('pilot-scarf', 0.3, 0.1, scarf, coll, body, (0.0, -0.02, 0.9))['cute'] = 1
    blob('pilot-scarf-tail-0', scarf, coll, body, (0.1, 0.52, 0.98), (0.09, 0.3, 0.04), (14.0, 0.0, -8.0), seg=(20, 10))['cute'] = 1
    blob('pilot-scarf-tail-1', scarf, coll, body, (-0.06, 0.48, 0.88), (0.08, 0.24, 0.04), (4.0, 0.0, 10.0), seg=(20, 10))['cute'] = 1
    # The cheer (the happy frame only): two paws up, built in the plane's own frame so they read side-on — the near
    # one waving up behind the head, the far one peeking over it.
    arms = empty('pilot-arms', coll, roll)
    for name, a, b in (('near', (PILOT_X - 0.06, -0.15, PILOT_Z + 0.42), (PILOT_X - 0.26, -0.19, PILOT_Z + 0.84)),
                       ('far', (PILOT_X + 0.02, 0.15, PILOT_Z + 0.42), (PILOT_X + 0.1, 0.17, PILOT_Z + 0.98))):
        rod(f'pilot-arm-{name}', a, b, 0.058, mats['fur'], coll, arms, seg=14)['cute'] = 1
        blob(f'pilot-paw-{name}', mats['light'], coll, arms, b, (0.072, 0.065, 0.072), seg=(20, 10))['cute'] = 1
    show_on(arms, P_HAPPY, PLANE_FRAMES)
    turn = -18.0  # the head turned toward the camera
    key_chibi(rig, P_IDLE[0], head_pitch=-4.0, head_yaw=turn, eyes='open')
    for f in P_PROP:
        key_chibi(rig, f, head_pitch=-4.0, head_yaw=turn, eyes='open')
    key_chibi(rig, P_WAGGLE[0], head_pitch=-6.0, head_yaw=turn, head_roll=6.0, eyes='open')
    key_chibi(rig, P_WAGGLE[1], head_pitch=-6.0, head_yaw=turn, head_roll=-6.0, eyes='open')
    key_chibi(rig, P_HAPPY[0], head_pitch=-16.0, head_yaw=turn - 8.0, head_roll=7.0, tongue=True, eyes='shut', bob=0.08)
    return rig


def build_plane(params, c, sprites, layout):
    coll = sprite(sprites, 'plane', states=json.dumps(PLANE_STATES, separators=(',', ':')))
    root = empty('plane-root', coll, None, pt(PLANE_PX[0], PLANE_PX[1], PLANE_Y), (0.0, 0.0, PLANE_YAW))
    roll = empty('plane-roll', coll, root)
    body, dark = mat(c['body'], 0.32), mat(c['bodyDark'], 0.4)
    belly = mat(c['belly'], 0.4)
    wing, wing_dark = mat(c['wing'], 0.35), mat(c['wingDark'], 0.4)
    wood = mat(c['prop'], 0.45)
    tyre = mat(c['wheel'], 0.6)
    # The body: a two-tone hull (yellow over a cream belly), a blue nose cowl, a brown spinner.
    blob('plane-body', body, coll, roll, (0.0, 0.0, 0.0), (0.94, 0.4, 0.39), shape=fuselage, seg=(56, 28))
    blob('plane-belly', belly, coll, roll, (0.03, 0.0, -0.1), (0.84, 0.42, 0.34), shape=fuselage, seg=(56, 28))
    blob('plane-cowl', mat(c['nose'], 0.3), coll, roll, (0.7, 0.0, -0.01), (0.27, 0.285, 0.28), seg=(40, 20))
    torus('plane-cowl-ring', 0.255, 0.035, dark, coll, roll, (0.6, 0.0, -0.01), (0.0, 90.0, 0.0))
    blob('plane-spinner', wood, coll, roll, (0.97, 0.0, -0.01), (0.1, 0.1, 0.1), seg=(24, 12))
    # The propeller: two still blades (idle) or a soft blur disc with two faint streaks (every other frame).
    hub = (1.0, 0.0, -0.01)
    blades = empty('plane-blades', coll, roll, hub, (24.0, 0.0, 0.0))
    for s in (-1, 1):
        blob(f'plane-blade-{s}', wood, coll, blades, (0.0, 0.0, 0.24 * s), (0.03, 0.085, 0.24), seg=(24, 12))
    show_on(blades, P_IDLE, PLANE_FRAMES)
    blur = empty('plane-blur', coll, roll, hub)
    disc = blob('plane-blur-disc', veil_mat('plane-prop-blur', c['propBlur'], PROP_ALPHA), coll, blur, (0.0, 0.0, 0.0), (0.012, 0.47, 0.47), seg=(48, 12))
    disc.visible_shadow = False
    streaks = empty('plane-streaks', coll, blur, (0.012, 0.0, 0.0))
    streak_m = veil_mat('plane-prop-streak', c['propBlur'], STREAK_ALPHA)
    for s in (-1, 1):
        b = blob(f'plane-streak-{s}', streak_m, coll, streaks, (0.0, 0.0, 0.23 * s), (0.008, 0.13, 0.22), seg=(24, 10))
        b.visible_shadow = False
    spinning = [f for f in PLANE_FRAMES if f not in P_IDLE]
    show_on(blur, spinning, PLANE_FRAMES)
    key_rot(streaks, {f: ((20.0 if i % 2 == 0 else 62.0), 0.0, 0.0) for i, f in enumerate(PLANE_FRAMES)})
    # The wings (one low wing through the body), the tail plane and the fin.
    blob('plane-wing', wing, coll, roll, (0.14, 0.0, -0.14), (0.31, 1.08, 0.065), seg=(48, 16))
    for s in (-1, 1):
        blob(f'plane-wing-tip-{s}', wing_dark, coll, roll, (0.14, 0.86 * s, -0.14), (0.25, 0.235, 0.072), seg=(32, 12))
        blob(f'plane-wing-dot-{s}', belly, coll, roll, (0.14, 0.58 * s, -0.085), (0.11, 0.11, 0.03), seg=(24, 8))
    blob('plane-tailplane', wing, coll, roll, (-0.78, 0.0, 0.15), (0.17, 0.44, 0.05), seg=(40, 12))
    blob('plane-fin', wing, coll, roll, (-0.83, 0.0, 0.36), (0.19, 0.05, 0.27), (0.0, -14.0, 0.0), seg=(40, 16))
    blob('plane-fin-tip', wing_dark, coll, roll, (-0.895, 0.0, 0.52), (0.13, 0.056, 0.12), (0.0, -14.0, 0.0), seg=(32, 12))
    # The wheels: two under the wing on short struts, a tiny one under the tail.
    for s in (-1, 1):
        rod(f'plane-strut-{s}', (0.26, 0.24 * s, -0.24), (0.3, 0.37 * s, -0.41), 0.045, dark, coll, roll, seg=12)
        blob(f'plane-wheel-{s}', tyre, coll, roll, (0.3, 0.4 * s, -0.42), (0.145, 0.07, 0.145), seg=(32, 12))
        blob(f'plane-wheel-hub-{s}', belly, coll, roll, (0.3, 0.44 * s, -0.42), (0.065, 0.05, 0.065), seg=(20, 10))
    rod('plane-tail-strut', (-0.62, 0.0, -0.1), (-0.66, 0.0, -0.24), 0.03, dark, coll, roll, seg=10)
    blob('plane-tail-wheel', tyre, coll, roll, (-0.66, 0.0, -0.25), (0.07, 0.04, 0.07), seg=(20, 10))
    # The open cockpit (a soft rim, a little windshield) and the cargo deck behind it.
    torus('plane-cockpit', 0.215, 0.055, dark, coll, roll, (PILOT_X, 0.0, 0.36))
    blob('plane-windshield', mat(c['gogglesGlass'], 0.1), coll, roll, (PILOT_X + 0.4, 0.0, 0.36), (0.04, 0.17, 0.085), (0.0, 30.0, 0.0), seg=(24, 12))
    rbox('plane-deck', (0.66, 0.4, 0.1), 0.045, dark, coll, roll, (-0.44, 0.0, 0.3), (0.0, -5.0, 0.0))
    for k, x in enumerate((-0.12, -0.76)):
        rbox(f'plane-deck-rail-{k}', (0.05, 0.42, 0.11), 0.022, wing_dark, coll, roll, (x, 0.0, 0.36 + 0.055 * (0 if k else 1) - 0.03))
    build_pilot(params, c, coll, roll)
    key_rot(roll, {f: ((ROLL_DEG if f == P_WAGGLE[0] else -ROLL_DEG if f == P_WAGGLE[1] else 0.0), 0.0, 0.0) for f in PLANE_FRAMES})
    scene = bpy.context.scene
    scene.frame_set(P_IDLE[0])
    idle = fit(root, PLANE_PX, width=PLANE_WIDTH_PX)
    log(f'plane idle {fmt_rect(idle)}')
    lo, hi = idle[1], idle[3]
    for f in PLANE_FRAMES[1:]:
        scene.frame_set(f)
        r = rect_of(root)
        lo, hi = min(lo, r[1]), max(hi, r[3])
        log(f'plane frame {f} {fmt_rect(r)}')
    scene.frame_set(P_IDLE[0])
    bpy.context.view_layer.update()
    add_empty('anchor.plane', pt(PLANE_PX[0], PLANE_PX[1], PLANE_Y), layout)
    add_empty('anchor.plane-ground', pt(PLANE_GROUND_PX[0], PLANE_GROUND_PX[1], PLANE_Y), layout)
    cargo = []
    for n, at in enumerate(CARGO):
        w = roll.matrix_world @ Vector(at)
        add_empty(f'anchor.cargo-{n}', w, layout)
        px = SCREEN.project(w)
        cargo.append(px)
        if not (idle[0] < px[0] < idle[2] and idle[1] < px[1] < idle[3]):
            fail(f'cargo-{n} {fmt_px(px)} is not on the plane {fmt_rect(idle)}')
    log('anchor.plane ' + fmt_px(PLANE_PX) + ', anchor.plane-ground ' + fmt_px(PLANE_GROUND_PX) + ', cargo ' + ', '.join(fmt_px(p) for p in cargo))
    # The plane at the top and bottom of its band and parked stays inside the interactive rect.
    rect = params['rect']
    pl = params['plane']
    spots = (('top', pl['topY']), ('bottom', pl['bottomY']), ('parked', PLANE_GROUND_PX[1]))
    for name, y in spots:
        dy = y - PLANE_PX[1]
        if lo + dy < rect['y0'] or hi + dy > rect['y1']:
            fail(f'the plane {name} spans y {lo + dy:.0f}…{hi + dy:.0f}, outside {rect["y0"]}…{rect["y1"]}')
    log(f'plane parked: wheels at y {idle[3] + PLANE_GROUND_PX[1] - PLANE_PX[1]:.0f} (the grass starts at {GROUND_TOP_PX:.0f})')
    return idle


# --- balloons, gifts, particles -------------------------------------------------------------------------------------

def gift_box(name, coll, parent, at, s, box, lid, ribbon):
    """A wrapped gift box (side s), its bottom centre at `at`, turned so its top and two sides show."""
    tilt = empty(f'{name}-tilt', coll, parent, at, (22.0, 0.0, 0.0))
    turn = empty(f'{name}-turn', coll, tilt, (0.0, 0.0, 0.0), (0.0, 0.0, 32.0))
    h = s * 0.78
    rbox(f'{name}-box', (s, s, h), s * 0.1, box, coll, turn, (0.0, 0.0, h / 2))
    rbox(f'{name}-lid', (s * 1.1, s * 1.1, s * 0.24), s * 0.08, lid, coll, turn, (0.0, 0.0, h + s * 0.06))
    top = h + s * 0.18
    rbox(f'{name}-band-x', (s * 1.14, s * 0.2, top + s * 0.02), s * 0.04, ribbon, coll, turn, (0.0, 0.0, (top + s * 0.02) / 2))
    rbox(f'{name}-band-y', (s * 0.2, s * 1.14, top + s * 0.02), s * 0.04, ribbon, coll, turn, (0.0, 0.0, (top + s * 0.02) / 2))
    for sx in (-1, 1):
        blob(f'{name}-bow-{sx}', ribbon, coll, turn, (s * 0.2 * sx, 0.0, top + s * 0.1), (s * 0.22, s * 0.11, s * 0.13), (0.0, -28.0 * sx, 0.0), seg=(20, 10))
    blob(f'{name}-knot', ribbon, coll, turn, (0.0, 0.0, top + s * 0.07), (s * 0.1, s * 0.1, s * 0.09), seg=(16, 8))
    return top + s * 0.2


def balloon_shape(d):
    if d.z < 0:
        k = 1.0 - 0.2 * d.z * d.z
        return Vector((d.x * k, d.y * k, d.z * 1.08))
    return d


def build_balloons(params, c, sprites):
    white = mat(c['ribbon'], 0.4)
    for k, colour in enumerate(params['plane']['colours']):
        key = 'balloon' + colour.capitalize()
        if key not in c or f'{key}Dark' not in c:
            fail(f'Tokens.art.plane.{key}(Dark) is missing')
        main, dark = mat(c[key], 0.16), mat(c[f'{key}Dark'], 0.3)
        box, lid = mat(c[key], 0.4), mat(c[f'{key}Dark'], 0.4)
        # The balloon with its gift.
        coll = sprite(sprites, f'balloon-{colour}')
        at = (110.0 + 105.0 * k, 190.0)
        root = billboard(f'balloon-{colour}-root', coll, pt(at[0], at[1], FREE_Y))
        blob(f'balloon-{colour}-body', main, coll, root, (0.0, 0.0, 0.0), (0.47, 0.45, 0.54), shape=balloon_shape, seg=(48, 24))
        blob(f'balloon-{colour}-shine', mat(c['string'], 0.1), coll, root, (-0.19, -0.37, 0.22), (0.085, 0.03, 0.15), (0.0, 28.0, 0.0), seg=(16, 8))
        blob(f'balloon-{colour}-shine-2', mat(c['string'], 0.1), coll, root, (-0.27, -0.33, 0.0), (0.035, 0.02, 0.045), seg=(12, 8))
        lathe(f'balloon-{colour}-knot', [(0.0, 0.0), (0.085, -0.02), (0.06, 0.06), (0.03, 0.1), (0.0, 0.11)], dark, coll, root, (0.0, 0.0, -0.66), seg=20)
        s = 0.42
        gift_top = gift_box(f'balloon-{colour}-gift', coll, root, (0.0, 0.0, -1.36), s, box, lid, white)
        rod(f'balloon-{colour}-string', (0.0, 0.0, -0.64), (0.0, -0.1, -1.36 + gift_top * 0.9), 0.014, mat(c['string'], 0.6), coll, root, seg=8)
        r = fit(root, at, longest=BALLOON_PX)
        log(f'balloon-{colour} {fmt_rect(r)}')
        if max(r[2] - r[0], r[3] - r[1]) < params['plane']['balloonMinPx']:
            fail(f'balloon {colour} is under {params["plane"]["balloonMinPx"]} px')
        # The gift alone.
        coll = sprite(sprites, f'gift-{colour}')
        at = (110.0 + 105.0 * k, 340.0)
        root = billboard(f'gift-{colour}-root', coll, pt(at[0], at[1], FREE_Y))
        gift_box(f'gift-{colour}', coll, root, (0.0, 0.0, 0.0), s, box, lid, white)
        r = fit(root, at, longest=GIFT_PX)
        log(f'gift-{colour} {fmt_rect(r)}')


def build_particles(c, sprites):
    # The parachute: a white canopy with pink gores, its strings meeting under it.
    coll = sprite(sprites, 'parachute')
    root = free_root('parachute', coll)
    tilt = empty('parachute-tilt', coll, root, (0.0, 0.0, 0.0), (-10.0, 0.0, 0.0))
    gore_ball('parachute-canopy', [mat(c['parachute'], 0.5), mat(c['parachuteStripe'], 0.5)], 8, (0.5, 0.5, 0.36), coll, tilt, dome=True)
    blob('parachute-inside', mat(c['parachuteStripe'], 0.7), coll, tilt, (0.0, 0.0, 0.0), (0.48, 0.48, 0.03), seg=(32, 6))
    line = mat(c['string'], 0.6)
    for j in range(6):
        a = 2 * math.pi * (j + 0.5) / 6
        rod(f'parachute-line-{j}', (0.47 * math.cos(a), 0.47 * math.sin(a), 0.0), (0.0, 0.0, -0.52), 0.014, line, coll, tilt, seg=8)
    blob('parachute-knot', mat(c['parachuteStripe'], 0.5), coll, tilt, (0.0, 0.0, -0.53), (0.05, 0.05, 0.05), seg=(12, 8))
    free_fit('parachute', root)
    # The pop: a ring of soft petals and dots.
    coll = sprite(sprites, 'pop')
    root = free_root('pop', coll)
    m = mat(c['pop'], 0.55)
    for j in range(8):
        a = 360.0 * j / 8
        ar = math.radians(a)
        blob(f'pop-petal-{j}', m, coll, root, (0.36 * math.sin(ar), 0.0, 0.36 * math.cos(ar)), (0.075, 0.05, 0.16), (0.0, a, 0.0), seg=(20, 10))
        b = math.radians(a + 22.5)
        blob(f'pop-dot-{j}', m, coll, root, (0.5 * math.sin(b), 0.0, 0.5 * math.cos(b)), (0.045, 0.04, 0.045), seg=(12, 8))
    free_fit('pop', root)
    # The puff: a small round cloud.
    coll = sprite(sprites, 'puff')
    root = free_root('puff', coll)
    puffs('puff', [(-0.26, -0.04, 0.26), (0.0, 0.1, 0.33), (0.27, -0.03, 0.25), (0.02, -0.14, 0.26)], mat(c['cloud'], 0.7), mat(c['cloudShade'], 0.7), coll, root, drop=0.07)
    free_fit('puff', root)


# --- clouds, hills, ground, birds -----------------------------------------------------------------------------------

def heart_point(t):
    return (16 * math.sin(t) ** 3 / 17.0, (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 17.0)


HEART_CZ = -0.1  # the heart outline's centre (its polar origin)


def _heart_polar(n=720):
    """The heart outline as radius by angle (from HEART_CZ), sampled at n angles."""
    pts = [heart_point(2 * math.pi * i / 2000) for i in range(2000)]
    table = [0.0] * n
    for x, z in pts:
        a = math.atan2(z - HEART_CZ, x) % (2 * math.pi)
        k = int(a / (2 * math.pi) * n) % n
        table[k] = max(table[k], math.hypot(x, z - HEART_CZ))
    for k in range(n):  # fill any empty bins from the neighbours
        if table[k] == 0.0:
            table[k] = max(table[(k - 1) % n], table[(k + 1) % n])
    # A soft toy heart: the tip and the top notch rounded (a circular moving average over ±HEART_SOFT_DEG).
    w = int(n * HEART_SOFT_DEG / 360)
    for _ in range(2):
        table = [sum(table[(k + j) % n] for j in range(-w, w + 1)) / (2 * w + 1) for k in range(n)]
    return table


HEART_SOFT_DEG = 14.0


HEART_R = None


def heart_pillow(d):
    """A unit sphere pushed out to a puffy heart (tip down): the xz outline follows the heart, y stays round."""
    global HEART_R
    if HEART_R is None:
        HEART_R = _heart_polar()
    n = len(HEART_R)
    a = math.atan2(d.z, d.x) % (2 * math.pi)
    f = a / (2 * math.pi) * n
    k = int(f) % n
    t = f - int(f)
    r = HEART_R[k] * (1 - t) + HEART_R[(k + 1) % n] * t
    return Vector((d.x * r, d.y, d.z * r))


def build_clouds(c, sprites):
    group = sprite(sprites, 'cloud')
    white, shade = mat(c['cloud'], 0.75), mat(c['cloudShade'], 0.75)
    specs = {
        'a': [(-0.82, -0.06, 0.4), (-0.36, 0.2, 0.52), (0.26, 0.27, 0.6), (0.82, -0.02, 0.42), (0.02, -0.12, 0.48), (-0.48, -0.16, 0.36), (0.5, -0.16, 0.38)],
        'b': [(-0.62, 0.0, 0.42), (-0.06, 0.26, 0.56), (0.5, 0.1, 0.46), (0.9, -0.1, 0.3), (-0.2, -0.14, 0.4), (0.36, -0.16, 0.36)],
    }
    for state, spec in specs.items():
        child = state_child(group, 'cloud', state)
        root = free_root(f'cloud-{state}', child)
        puffs(f'cloud-{state}', spec, white, shade, child, root)
        free_fit(f'cloud-{state}', root)
    # The heart: a ring of pink puffs along a heart, filled.
    child = state_child(group, 'cloud', 'heart')
    root = free_root('cloud-heart', child)
    pink, pink_shade = mat(c['heart'], 0.7), mat(c['heartShade'], 0.7)
    blob('cloud-heart-body', pink, child, root, (0.0, 0.0, 0.0), (1.0, 0.3, 1.0), shape=heart_pillow, seg=(96, 32))
    blob('cloud-heart-shade', pink_shade, child, root, (0.06, 0.18, -0.08), (1.0, 0.28, 1.0), shape=heart_pillow, seg=(96, 32))
    # Soft puffs along the lobes' tops (a cloud, not a cushion).
    for j, t in enumerate((0.62, 1.12, 5.16, 5.66)):
        x, z = heart_point(t)
        blob(f'cloud-heart-puff-{j}', pink, child, root, (x * 0.8, -0.05, z * 0.8 + 0.02), (0.3, 0.24, 0.27), seg=(32, 16))
    free_fit('cloud-heart', root)


def flat_bottom(d):
    return Vector((d.x, d.y, max(d.z, 0.0)))


def tree(name, c, coll, parent, at, s):
    x, y, z = at
    rod(f'{name}-trunk', (x, y, z - 0.05), (x, y, z + 0.34 * s), 0.05 * s, mat(c['soil'], 0.7), coll, parent, seg=10)
    blob(f'{name}-crown', mat(c['grassDark'], 0.7), coll, parent, (x, y, z + 0.52 * s), (0.27 * s, 0.24 * s, 0.3 * s), seg=(24, 12))
    blob(f'{name}-crown-2', mat(c['grass'], 0.7), coll, parent, (x - 0.07 * s, y - 0.1 * s, z + 0.6 * s), (0.16 * s, 0.14 * s, 0.17 * s), seg=(20, 10))


def build_hills(c, sprites):
    group = sprite(sprites, 'hill')
    green, dark = mat(c['hill'], 0.85), mat(c['hillDark'], 0.85)
    # state → the domes (x, depth offset, radius x, radius z, material) and the trees (dome index, share across, size).
    specs = {
        'a': ([(-0.5, 0.0, 2.3, 1.9, green), (1.55, 0.5, 1.75, 1.3, dark), (-2.0, 0.4, 1.2, 0.8, dark)], [(0, 0.42, 1.0), (0, 0.6, 0.72), (1, 0.55, 0.8)]),
        'b': ([(0.6, 0.0, 1.95, 1.55, green), (-1.2, 0.5, 1.65, 1.15, dark), (1.9, 0.4, 0.9, 0.62, dark)], [(1, -0.3, 0.85), (0, -0.5, 0.7)]),
    }
    for state, (domes, trees) in specs.items():
        child = state_child(group, 'hill', state)
        root = empty(f'hill-{state}-root', child, None, (wx(DESIGN[0] / 2), HILL_Y, wz(HILL_BOTTOM_PX, HILL_Y)))
        for j, (x, dy, rx, rz, m) in enumerate(domes):
            blob(f'hill-{state}-{j}', m, child, root, (x, dy, 0.0), (rx, 0.55, rz), shape=flat_bottom, seg=(64, 24))
        for j, (dome, share, s) in enumerate(trees):
            x, dy, rx, rz, _m = domes[dome]
            tree(f'hill-{state}-tree-{j}', c, child, root, (x + share * rx, dy - 0.1, rz * math.sqrt(1 - share * share) - 0.04), s)
        r = fit(root, (DESIGN[0] / 2, HILL_BOTTOM_PX), box=HILL_BOX_PX[state], bottom=True)
        log(f'hill-{state} {fmt_rect(r)}')


def build_ground(c, sprites):
    coll = sprite(sprites, 'ground')
    back, front = gy(GROUND_TOP_PX), gy(GROUND_LIP_PX)
    # The strip spans exactly GROUND_W_PX (the widest frame a 2048 atlas page takes with its padding); its ends are
    # square (tiny bevels) so two copies butt without a seam.
    # The left end runs past the frame (the frame cuts it crisply); the right end stops at GROUND_W_PX (its soft
    # anti-aliased edge stays inside the page limit).
    wide = (GROUND_W_PX + GROUND_OVER_PX) / ORTHO_PX_PER_M
    cx = wx((GROUND_W_PX - GROUND_OVER_PX) / 2)
    grass, dark = mat(c['grass'], 0.85), mat(c['grassDark'], 0.85)
    slabs = [rbox('ground-grass', (wide, back - front, 0.6), 0.004, grass, coll, None, (cx, (back + front) / 2, -0.3)),
             rbox('ground-lip', (wide, 0.3, 0.36), 0.004, dark, coll, None, (cx, front + 0.1, -0.16)),
             rbox('ground-soil', (wide, 0.5, 2.4), 0.004, mat(c['soil'], 0.9), coll, None, (cx, front + 0.3, -1.4))]
    for o in slabs:  # flat faces: smooth normals would drift across the long quads (one end lighter: a seam when tiled)
        for poly in o.data.polygons:
            poly.use_smooth = False
        o['cute'] = 1
    sr = SCREEN.rect(world_pts([o for o in coll.all_objects if o.type == 'MESH']))
    log(f'ground strip {fmt_rect(sr)}')
    rnd = random.Random(SEED)
    petals = [mat(c['flower'], 0.6), mat(c['trim'], 0.6), mat(c['flowerCentre'], 0.6)]
    hearts = [mat(c['flowerCentre'], 0.5), mat(c['flowerCentre'], 0.5), mat(c['flower'], 0.5)]
    placed = []
    for i in range(400):
        if len(placed) >= 30:
            break
        sx = rnd.uniform(GROUND_EDGE_PX + 22, DESIGN[0] - GROUND_EDGE_PX - 22)
        sy = rnd.uniform(GROUND_TOP_PX + 14, GROUND_LIP_PX - 12)
        if any(abs(sx - px) < 52 and abs(sy - py) < 22 for px, py in placed):
            continue
        k = len(placed)
        placed.append((sx, sy))
        x, y = wx(sx), gy(sy)
        if k % 3 == 0:
            flower(f'ground-flower-{k}', coll, None, (x, y, 0.05), rnd.uniform(0.11, 0.15), petals[(k // 3) % 3], hearts[(k // 3) % 3])
        else:
            t = blob(f'ground-tuft-{k}', dark, coll, None, (x, y, 0.0), (rnd.uniform(0.16, 0.3), rnd.uniform(0.1, 0.16), 0.03), seg=(20, 8))
            t.visible_shadow = False
    r = SCREEN.rect(world_pts([o for o in coll.all_objects if o.name.startswith(('ground-flower', 'ground-tuft'))]))
    log(f'ground: grass y {GROUND_TOP_PX:.0f}…{GROUND_LIP_PX:.0f}, details {fmt_rect(r)}')
    if r[0] < GROUND_EDGE_PX - 8 or r[2] > DESIGN[0] - GROUND_EDGE_PX + 8:
        fail('the ground details come too close to the frame edges (the strip must tile)')


def bird_body(name, c, colours, coll, root):
    blue, white = mat(c['bird'], 0.5), mat(c['birdBelly'], 0.5)
    blob(f'{name}-body', blue, coll, root, (0.0, 0.0, 0.0), (0.3, 0.26, 0.26), seg=(32, 16))
    blob(f'{name}-belly', white, coll, root, (-0.05, -0.01, -0.07), (0.25, 0.245, 0.2), seg=(32, 16))
    lathe(f'{name}-beak', [(0.0, 0.0), (0.075, 0.0), (0.05, 0.08), (0.0, 0.16)], mat(c['birdBeak'], 0.45), coll, root, (-0.25, -0.03, 0.02), (0.0, -90.0, 0.0), seg=16)
    blob(f'{name}-tail', blue, coll, root, (0.32, 0.0, 0.07), (0.15, 0.07, 0.065), (0.0, -22.0, 0.0), seg=(20, 10))
    blob(f'{name}-eye', mat(colours['iconInk'], 0.2), coll, root, (-0.15, -0.215, 0.08), (0.04, 0.025, 0.05), seg=(16, 8))
    blob(f'{name}-eye-shine', mat(c['birdBelly'], 0.2), coll, root, (-0.165, -0.235, 0.1), (0.014, 0.01, 0.017), seg=(10, 6))
    blob(f'{name}-cheek', mat(c['flower'], 0.6), coll, root, (-0.1, -0.235, -0.02), (0.045, 0.02, 0.03), seg=(12, 6))


def build_birds(c, colours, sprites):
    group = sprite(sprites, 'bird')
    wing = mat(mix_hex(c['bird'], c['birdBelly'], 0.3), 0.5)
    for state, up in (('a', True), ('b', False)):
        child = state_child(group, 'bird', state)
        root = free_root('bird', child)
        bird_body(f'bird-{state}', c, colours, child, root)
        if up:
            blob(f'bird-{state}-wing-near', wing, child, root, (0.06, -0.2, 0.26), (0.15, 0.05, 0.25), (-12.0, 18.0, 0.0), seg=(24, 12))
            blob(f'bird-{state}-wing-far', wing, child, root, (0.1, 0.2, 0.26), (0.14, 0.05, 0.23), (12.0, 30.0, 0.0), seg=(24, 12))
        else:
            blob(f'bird-{state}-wing-near', wing, child, root, (0.07, -0.24, -0.17), (0.15, 0.05, 0.23), (22.0, -20.0, 0.0), seg=(24, 12))
            blob(f'bird-{state}-wing-far', wing, child, root, (0.12, 0.2, -0.2), (0.13, 0.05, 0.2), (-14.0, -32.0, 0.0), seg=(24, 12))
        at, size = FREE['bird']
        r = fit(root, at, width=size)
        log(f'bird-{state} {fmt_rect(r)}')


# --- the friends ----------------------------------------------------------------------------------------------------

def build_friend(fid, params, sprites, layout):
    kind, colour_keys = PEN_CHIBIS[fid][0], PEN_CHIBIS[fid][1]
    coll = sprite(sprites, f'friend-{fid}', states=json.dumps(FRIEND_STATES, separators=(',', ':')))
    rig = chibi(kind, f'friend-{fid}', coll, chibi_mats(params, colour_keys))
    root = rig['root']
    root.location = (wx(FRIEND_PX[0]), gy(FRIEND_PX[1]), 0.0)
    root.rotation_euler = (0.0, 0.0, math.radians(FRIEND_YAW))
    key_chibi(rig, F_IDLE[0], head_pitch=FRIEND_HEAD_UP, head_yaw=8.0, eyes='open')
    key_chibi(rig, F_HAPPY[0], head_pitch=FRIEND_HEAD_UP - 13.0, head_roll=11.0, head_yaw=14.0, tail=26.0, tongue=True, bob=0.07, eyes='shut')
    scene = bpy.context.scene
    scene.frame_set(F_IDLE[0])
    r = fit(root, FRIEND_PX, height=FRIEND_HEIGHT_PX[fid], bottom=True)
    pts = world_pts(meshes_of(root))
    hull_object(f'hit.friend-{fid}', pts, layout)
    scene.frame_set(F_HAPPY[0])
    happy = rect_of(root)
    scene.frame_set(F_IDLE[0])
    log(f'friend-{fid} idle {fmt_rect(r)}, happy {fmt_rect(happy)}')
    rect = params['rect']
    if max(r[2] - r[0], r[3] - r[1]) < params['plane']['friendMinPx'] + 4:
        fail(f'friend {fid} is under {params["plane"]["friendMinPx"]} px')
    if r[0] - HIT_PAD_PX < FRIEND_MIN_LEFT_PX or r[3] + HIT_PAD_PX > rect['y1'] or r[2] + HIT_PAD_PX > rect['x1']:
        fail(f'friend {fid} {fmt_rect(r)}: its padded hull leaves its place')
    return r


# --- the houses (each built facing local -y, its floor at z 0) -------------------------------------------------------

GABLE = [(-1.0, 0.0), (1.0, 0.0), (0.0, 1.0)]


def scaled(profile, w, h):
    return [(x * w / 2, z * h) for x, z in profile]


def house_cat(c, coll, root):
    """A lilac cottage: a pointed roof with two cat ears, a round window, whiskers by the door."""
    wall, roof = mat(c['houseCat'], 0.5), mat(c['houseCatRoof'], 0.45)
    rbox('house-cat-plinth', (1.72, 1.42, 0.14), 0.05, mat(c['trim'], 0.6), coll, root, (0.0, 0.0, 0.07))
    rbox('house-cat-wall', (1.6, 1.3, 1.25), 0.12, wall, coll, root, (0.0, 0.0, 0.7))
    prism('house-cat-roof', scaled(GABLE, 2.0, 1.02), 1.56, roof, coll, root, (0.0, 0.0, 1.22), bevel=0.07)
    prism('house-cat-gable', scaled(GABLE, 1.5, 0.76), 0.08, wall, coll, root, (0.0, -0.78, 1.3), bevel=0.02)
    for sx in (-1, 1):  # the ears on the roof's slopes
        ear = lathe(f'house-cat-ear-{sx}', [(0.0, 0.0), (0.24, 0.0), (0.2, 0.12), (0.04, 0.46), (0.0, 0.48)], roof, coll, root, (0.56 * sx, -0.5, 1.72), (0.0, 16.0 * sx, 0.0), seg=24)
        ear.scale = (1.0, 0.55, 1.0)
        inner = lathe(f'house-cat-ear-in-{sx}', [(0.0, 0.0), (0.13, 0.0), (0.1, 0.1), (0.02, 0.3), (0.0, 0.31)], mat(c['flower'], 0.5), coll, root, (0.56 * sx, -0.6, 1.76), (0.0, 16.0 * sx, 0.0), seg=20)
        inner.scale = (1.0, 0.4, 1.0)
    round_window('house-cat-window', c, coll, root, (0.0, -0.83, 1.62), 0.2)
    door('house-cat-door', c, coll, root, (0.0, -0.66, 0.14), 0.5, 0.78)
    for sx in (-1, 1):
        square_window(f'house-cat-win-{sx}', c, coll, root, (0.53 * sx, -0.65, 0.78), 0.28, 0.3)


def house_pig(c, coll, root):
    """A pink round hut: a domed roof with a curly tail on top, a snout sign, a mud-brown doormat."""
    wall, roof = mat(c['housePig'], 0.5), mat(c['housePigRoof'], 0.45)
    lathe('house-pig-wall', rounded_profile(0.88, 0.0, 1.3, 0.22), wall, coll, root, seg=48)
    lathe('house-pig-roof', [(0.0, 1.08), (1.02, 1.08), (1.06, 1.16), (1.0, 1.3), (0.84, 1.52), (0.58, 1.74), (0.28, 1.88), (0.0, 1.92)], roof, coll, root, seg=48)
    lathe('house-pig-chimney', rounded_profile(0.13, 0.0, 0.36, 0.35), wall, coll, root, (0.42, 0.1, 1.62), seg=24)
    torus('house-pig-chimney-rim', 0.13, 0.04, roof, coll, root, (0.42, 0.1, 1.97))
    blob('house-pig-mat', mat(c['door'], 0.8), coll, root, (0.0, -1.08, 0.02), (0.42, 0.24, 0.03), seg=(24, 6))
    rbox('house-pig-door-frame', (0.62, 0.1, 0.82), 0.3, mat(c['trim'], 0.5), coll, root, (0.0, -0.84, 0.43))
    rbox('house-pig-door', (0.5, 0.14, 0.74), 0.24, mat(c['door'], 0.5), coll, root, (0.0, -0.84, 0.39))
    blob('house-pig-snout', roof, coll, root, (0.0, -0.9, 1.0), (0.2, 0.06, 0.14), seg=(24, 10))
    for sx in (-1, 1):
        blob(f'house-pig-nostril-{sx}', mat(c['door'], 0.5), coll, root, (0.07 * sx, -0.95, 1.0), (0.035, 0.02, 0.055), seg=(12, 8))
        a = math.radians(47.0 * sx)
        round_window(f'house-pig-window-{sx}', c, coll, root, (0.89 * math.sin(a), -0.89 * math.cos(a), 0.74), 0.17, yaw=47.0 * sx)


def house_sheep(c, coll, root):
    """A cream cottage under a blue roof with a fluffy, cloud-like trim."""
    wall, roof = mat(c['houseSheep'], 0.55), mat(c['houseSheepRoof'], 0.45)
    fluff = mat(c['trim'], 0.75)
    rbox('house-sheep-wall', (1.6, 1.3, 1.25), 0.12, wall, coll, root, (0.0, 0.0, 0.625))
    prism('house-sheep-roof', scaled(GABLE, 2.0, 0.92), 1.5, roof, coll, root, (0.0, 0.0, 1.18), bevel=0.07)
    prism('house-sheep-gable', scaled(GABLE, 1.5, 0.68), 0.08, wall, coll, root, (0.0, -0.75, 1.25), bevel=0.02)
    for sx in (-1, 1):  # woolly puffs along the gable's edges
        for j in range(6):
            t = (j + 0.4) / 6
            blob(f'house-sheep-fluff-{sx}-{j}', fluff, coll, root, (sx * 1.02 * (1 - t), -0.8, 1.2 + 0.92 * t), (0.15, 0.13, 0.14), seg=(20, 10))
    blob('house-sheep-fluff-top', fluff, coll, root, (0.0, -0.8, 2.13), (0.19, 0.15, 0.17), seg=(20, 10))
    door('house-sheep-door', c, coll, root, (-0.32, -0.66, 0.0), 0.5, 0.82)
    square_window('house-sheep-win', c, coll, root, (0.42, -0.65, 0.68), 0.36, 0.36)
    round_window('house-sheep-window', c, coll, root, (0.0, -0.8, 1.52), 0.15)
    for j, (x, r) in enumerate([(0.7, 0.16), (0.48, 0.12), (-0.72, 0.13)]):  # wool tufts at the foot of the wall
        blob(f'house-sheep-tuft-{j}', fluff, coll, root, (x, -0.72, r * 0.7), (r, r * 0.8, r * 0.8), seg=(16, 8))


def house_cow(c, coll, root):
    """A small red barn: a gambrel roof, a double door with a white X, a round loft window."""
    wall, roof = mat(c['houseCow'], 0.5), mat(c['houseCowRoof'], 0.5)
    white = mat(c['trim'], 0.5)
    rbox('house-cow-wall', (1.8, 1.35, 1.15), 0.1, wall, coll, root, (0.0, 0.0, 0.575))
    gambrel = [(-1.0, 0.0), (1.0, 0.0), (0.66, 0.6), (0.0, 1.0), (-0.66, 0.6)]
    prism('house-cow-roof', scaled(gambrel, 2.14, 1.0), 1.55, roof, coll, root, (0.0, 0.0, 1.08), bevel=0.07)
    prism('house-cow-gable', scaled(gambrel, 1.72, 0.8), 0.08, wall, coll, root, (0.0, -0.775, 1.13), bevel=0.02)
    rbox('house-cow-door-frame', (0.96, 0.08, 0.92), 0.06, white, coll, root, (0.0, -0.68, 0.48))
    rbox('house-cow-door', (0.82, 0.12, 0.8), 0.04, wall, coll, root, (0.0, -0.68, 0.46))
    for sx in (-1, 1):
        rod(f'house-cow-x-{sx}', (-0.36 * sx, -0.75, 0.1), (0.36 * sx, -0.75, 0.82), 0.04, white, coll, root, seg=8)
    rbox('house-cow-door-split', (0.05, 0.14, 0.8), 0.015, white, coll, root, (0.0, -0.69, 0.46))
    round_window('house-cow-window', c, coll, root, (0.0, -0.83, 1.55), 0.18)
    for sx in (-1, 1):
        rbox(f'house-cow-corner-{sx}', (0.1, 0.1, 1.1), 0.03, white, coll, root, (0.86 * sx, -0.65, 0.58))


def house_horse(c, coll, root):
    """A tan stable: a long green roof, a half door (the top open), a horseshoe over it."""
    wall, roof = mat(c['houseHorse'], 0.55), mat(c['houseHorseRoof'], 0.5)
    white = mat(c['trim'], 0.5)
    rbox('house-horse-wall', (1.9, 1.25, 1.3), 0.1, wall, coll, root, (0.0, 0.0, 0.65))
    prism('house-horse-roof', scaled(GABLE, 1.75, 0.8), 2.2, roof, coll, root, (0.0, 0.0, 1.24), (0.0, 0.0, 90.0), bevel=0.07)
    for j in range(5):  # plank lines on the roof's front slope
        rbox(f'house-horse-plank-{j}', (0.04, 0.9, 0.03), 0.01, mat(c['grass'], 0.6), coll, root, (-0.8 + 0.4 * j, -0.47, 1.66), (42.4, 0.0, 0.0))
    rbox('house-horse-door-frame', (0.78, 0.08, 1.06), 0.06, white, coll, root, (-0.38, -0.63, 0.55))
    rbox('house-horse-door-dark', (0.66, 0.1, 0.96), 0.04, mat(c['wheel'], 0.8), coll, root, (-0.38, -0.63, 0.52))
    rbox('house-horse-door-half', (0.66, 0.14, 0.5), 0.04, mat(c['door'], 0.5), coll, root, (-0.38, -0.64, 0.29))
    rbox('house-horse-door-top', (0.7, 0.16, 0.07), 0.025, white, coll, root, (-0.38, -0.65, 0.55))
    for sx in (-1, 1):
        rod(f'house-horse-x-{sx}', (-0.38 - 0.27 * sx, -0.72, 0.08), (-0.38 + 0.27 * sx, -0.72, 0.48), 0.03, white, coll, root, seg=8)
    torus('house-horse-shoe', 0.14, 0.04, white, coll, root, (-0.38, -0.65, 1.14), (90.0, 0.0, 0.0), arc=(-200.0, 20.0))
    square_window('house-horse-win', c, coll, root, (0.5, -0.62, 0.72), 0.42, 0.4)
    blob('house-horse-hay', mat(c['flowerCentre'], 0.8), coll, root, (0.62, -0.78, 0.14), (0.28, 0.18, 0.16), seg=(20, 10))


def house_rooster(c, coll, root):
    """A yellow coop on short stilts: a red roof, a round door, a little ladder."""
    wall, roof = mat(c['houseRooster'], 0.5), mat(c['houseRoosterRoof'], 0.45)
    wood, white = mat(c['door'], 0.6), mat(c['trim'], 0.5)
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(f'house-rooster-stilt-{sx}-{sy}', (0.6 * sx, 0.42 * sy, 0.0), (0.6 * sx, 0.42 * sy, 0.62), 0.075, wood, coll, root, seg=12)
    rbox('house-rooster-floor', (1.66, 1.3, 0.14), 0.05, wood, coll, root, (0.0, 0.0, 0.55))
    rbox('house-rooster-wall', (1.5, 1.15, 1.0), 0.12, wall, coll, root, (0.0, 0.0, 1.1))
    prism('house-rooster-roof', scaled(GABLE, 1.92, 0.86), 1.42, roof, coll, root, (0.0, 0.0, 1.52), bevel=0.07)
    prism('house-rooster-gable', scaled(GABLE, 1.42, 0.62), 0.08, wall, coll, root, (0.0, -0.71, 1.59), bevel=0.02)
    blob('house-rooster-hole', mat(c['wheel'], 0.8), coll, root, (0.0, -0.585, 1.02), (0.25, 0.05, 0.3), seg=(24, 10))
    hole = torus('house-rooster-hole-trim', 0.26, 0.05, white, coll, root, (0.0, -0.6, 1.02), (90.0, 0.0, 0.0))
    hole.scale = (1.0, 1.2, 1.0)
    for j in range(3):  # a little comb on the ridge
        blob(f'house-rooster-comb-{j}', roof, coll, root, (0.0, -0.6 + 0.16 * j, 2.42 - 0.02 * j), (0.07, 0.1, 0.13), seg=(16, 8))
    blob('house-rooster-heart', mat(c['flower'], 0.5), coll, root, (0.0, -0.76, 1.9), (0.1, 0.04, 0.1), seg=(16, 8))
    foot, top = Vector((0.0, -1.36, 0.02)), Vector((0.0, -0.64, 0.6))
    for sx in (-1, 1):
        rod(f'house-rooster-rail-{sx}', foot + Vector((0.17 * sx, 0, 0)), top + Vector((0.17 * sx, 0, 0)), 0.035, wood, coll, root, seg=8)
    for j in range(4):
        p = foot.lerp(top, (j + 0.6) / 4.4)
        rod(f'house-rooster-rung-{j}', p + Vector((-0.2, 0, 0)), p + Vector((0.2, 0, 0)), 0.03, white, coll, root, seg=8)


HOUSES = {'cat': house_cat, 'pig': house_pig, 'sheep': house_sheep, 'cow': house_cow, 'horse': house_horse, 'rooster': house_rooster}


def build_house(fid, params, c, sprites, layout):
    coll = sprite(sprites, f'house-{fid}')
    root = empty(f'house-{fid}-root', coll, None, (wx(HOUSE_PX[0]), gy(HOUSE_PX[1]) + 1.0, 0.0), (0.0, 0.0, HOUSE_YAW))
    HOUSES[fid](c, coll, root)
    r = fit(root, HOUSE_PX, box=HOUSE_BOX_PX, bottom=True)
    hull_object(f'hit.house-{fid}', world_pts(meshes_of(root)), layout)
    log(f'house-{fid} {fmt_rect(r)}')
    rect = params['rect']
    if max(r[2] - r[0], r[3] - r[1]) < params['plane']['friendMinPx'] + 4:
        fail(f'house {fid} is under {params["plane"]["friendMinPx"]} px')
    if r[2] > HOUSE_MAX_X or r[1] < HOUSE_MIN_Y or r[3] + HIT_PAD_PX > rect['y1']:
        fail(f'house {fid} {fmt_rect(r)} leaves its place (x ≤ {HOUSE_MAX_X:.0f}, y ≥ {HOUSE_MIN_Y:.0f})')
    return r


# --- the surprises --------------------------------------------------------------------------------------------------

def build_rainbow(c, sprites):
    coll = sprite(sprites, 'rainbow')
    root = free_root('rainbow', coll)
    radius, minor, legs = 1.5, 0.046, 1.5
    for k in range(6):
        m = mat(c[f'rainbow{k + 1}'], 0.45)
        rk = radius - minor - k * 2 * minor * 0.97
        torus(f'rainbow-band-{k}', rk, minor, m, coll, root, (0.0, 0.0, 0.0), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
        for sx in (-1, 1):
            rod(f'rainbow-leg-{k}-{sx}', (rk * sx, 0.0, 0.02), (rk * sx, 0.0, -legs), minor, m, coll, root, seg=14)
    white, shade = mat(c['cloud'], 0.75), mat(c['cloudShade'], 0.75)
    mid = radius - 6 * minor
    for sx in (-1, 1):
        foot = empty(f'rainbow-foot-{sx}', coll, root, (sx * mid, -0.2, -legs))
        puffs(f'rainbow-cloud-{sx}', [(-0.3, -0.02, 0.22), (0.0, 0.08, 0.3), (0.3, -0.02, 0.22), (0.0, -0.1, 0.24)], white, shade, coll, foot, depth=0.2, drop=0.06)
    free_fit('rainbow', root)


def envelope(d):
    """A hot-air balloon: round on top, narrowing to its mouth."""
    if d.z < 0:
        t = -d.z
        k = 1.0 - 0.5 * t ** 1.6
        return Vector((d.x * k, d.y * k, d.z * 1.22))
    return d


def build_hot_air(c, colours, sprites):
    coll = sprite(sprites, 'hot-air')
    root = free_root('hot-air', coll)
    pink, yellow = mat(c['hotAir'], 0.4), mat(c['hotAirStripe'], 0.4)
    gore_ball('hot-air-envelope', [pink, yellow], 10, (0.74, 0.74, 0.76), coll, root, (0.0, 0.0, 1.0), shape=envelope)
    lathe('hot-air-mouth', rounded_profile(0.2, 0.0, 0.16, 0.3), pink, coll, root, (0.0, 0.0, 0.0), seg=24)
    torus('hot-air-band', 0.69, 0.045, yellow, coll, root, (0.0, 0.0, 0.6))
    basket = mat(c['basket'], 0.7)
    rbox('hot-air-basket', (0.44, 0.38, 0.3), 0.08, basket, coll, root, (0.0, 0.0, -0.5))
    rbox('hot-air-basket-rim', (0.5, 0.44, 0.08), 0.035, mat(c['door'], 0.6), coll, root, (0.0, 0.0, -0.35))
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(f'hot-air-rope-{sx}-{sy}', (0.2 * sx, 0.17 * sy, -0.35), (0.17 * sx, 0.15 * sy, 0.04), 0.014, mat(c['string'], 0.6), coll, root, seg=8)
    # A little bird rides in the basket and looks out.
    rider = empty('hot-air-rider', coll, root, (0.02, -0.02, -0.22), (0.0, 0.0, 0.0))
    rider.scale = (0.56, 0.56, 0.56)
    bird_body('hot-air-bird', c, colours, coll, rider)
    free_fit('hot-air', root)


def main():
    global DESIGN, SCREEN
    args = parse_args('build_plane', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    pl = params['plane']
    c = params['art']['plane']
    if list(pl['friends']) != list(HOUSES) or any(f not in PEN_CHIBIS or f not in FRIEND_HEIGHT_PX for f in pl['friends']):
        fail(f'the friends {pl["friends"]} do not match the houses {list(HOUSES)}')
    if pl['gifts'] != len(CARGO):
        fail(f'{pl["gifts"]} gifts per flight but {len(CARGO)} cargo spots')
    for s in pl['surprises']:
        if s not in ('rainbow', 'flock', 'hot-air', 'heart'):
            fail(f'no art for the surprise "{s}"')
    if not (pl['topY'] < PLANE_PX[1] < pl['bottomY']):
        fail(f'anchor.plane y {PLANE_PX[1]} is outside the band {pl["topY"]}…{pl["bottomY"]}')
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(1)
    setup_camera(scene)
    bpy.context.view_layer.update()
    SCREEN = Screen(scene)
    log(f'render engine {scene.render.engine}')
    plate = bpy.data.collections.new('plane-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_sky(c, plate)
    plane = build_plane(params, c, sprites, layout)
    build_balloons(params, c, sprites)
    build_particles(c, sprites)
    build_clouds(c, sprites)
    build_hills(c, sprites)
    build_ground(c, sprites)
    build_birds(c, params['colours'], sprites)
    add_empty('anchor.friend', pt(FRIEND_PX[0], FRIEND_PX[1], gy(FRIEND_PX[1])), layout)
    add_empty('anchor.house', pt(HOUSE_PX[0], HOUSE_PX[1], gy(HOUSE_PX[1])), layout)
    add_empty('anchor.gifts', pt(GIFTS_PX[0], GIFTS_PX[1], gy(GIFTS_PX[1])), layout)
    gap_from = plane[2]
    for fid in pl['friends']:
        r = build_friend(fid, params, sprites, layout)
        build_house(fid, params, c, sprites, layout)
        if r[0] - HIT_PAD_PX - gap_from < 24:
            fail(f'friend {fid} comes within {r[0] - HIT_PAD_PX - gap_from:.0f} px of the plane')
    build_rainbow(c, sprites)
    build_hot_air(c, params['colours'], sprites)
    log(f'anchor.friend {fmt_px(FRIEND_PX)}, anchor.house {fmt_px(HOUSE_PX)}, anchor.gifts {fmt_px(GIFTS_PX)}')
    scene.frame_set(1)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    log(f'saved {args["out"]}')


if __name__ == '__main__':
    main()
