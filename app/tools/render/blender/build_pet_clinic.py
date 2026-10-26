# Builds art/pet-clinic.blend (Bác sĩ thú cưng, Story 8.1) from the vendored island art/src/map-v3.blend (only its
# render settings, world and Sun are kept).
#
# Run by `npm run art:build -- pet-clinic` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_pet_clinic.py -- \
#     --out <tmp>/pet-clinic.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens): colours, art (art.petClinic for the room, the cart, the tools, the
# overlays and the particles), design size, renderScale.
#
# One plate, 2048×1536, seen through an ORTHOGRAPHIC camera tilted a little down, so a shift along world x is the
# same shift on screen (the patient's walk from the door to the exam spot). A cosy clinic room in the cute-toy
# style: a mint wall with soft dots, a wooden floor and a white skirting board, an open door at the left edge, a
# window with a day sky, a round plaque with a teal cross (never red), KayKit / Bubbly Bathroom props (a plant, a
# towel stack, a picture frame), the round blue exam mat where the patient stands and a pink two-shelf tool cart at
# the bottom right. Sprites (`sprite.<id>`, none casts a shadow into the plate):
#   - patient-<id> for the seven pen animals, the REAL models of build_animal_pens.ANIMALS (Quaternius / Poly by
#     Google, source colours, the Idle pose): each stands on the mat at the exam spot, turned three-quarter toward
#     the camera and facing +x (it walks in from the left), all at about one on-screen size. One `state.*` child
#     per layer (`bhc_state` = the layer, collection names are global): `base` (with a soft contact shadow),
#     `tilt` (rigged patients: the Head bone rolled ~20°, a curious tilt) and the overlays mud, scrape, plaster,
#     blanket, bottle — each with a holdout copy of the posed animal, so only the overlay's visible parts show.
#     The mud, scrape, plaster and blanket stay off the head (they fit the tilt frame too); the bottle is at the mouth.
#   - tool-<id>: shower (a hand shower with a short hose), bottle (a milk bottle with a teat), plaster (a chunky
#     band-aid), blanket (a folded lavender blanket), each resting in its place on the cart (movable);
#   - drop, wave, z, sparkle, heart: detached particles (never in the plate), placed at runtime.
# The hidden `layout` collection holds hit.patient (the convex hull of every patient frame and the mat),
# anchor.patient (the ground pivot under the patients), anchor.door (the same row, at the room's left edge) and per
# patient anchor.<back|mouth|scrape|belly|head>-<id>.
# Every constant is in Blender world units (metres) unless its name says otherwise; ORTHO_PX_PER_M design px per metre.
import math
import os
import random
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, import_joined, lathe, mat, mesh_obj, rbox, rod, rounded_profile, soften_scene, torus, tt_model  # noqa: E402
from common import add_empty, eval_world_verts, hex_to_linear, hull_object, key_constant, move_to, parse_args, principled  # noqa: E402
import build_animal_pens as pens  # noqa: E402  (ANIMALS, import_model, pose_idle; its main() runs only as a script)

RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main
IDLE_FRAME = 1

# --- the camera: orthographic, looking along +y, tilted CAM_PITCH degrees down ---------------------------------
ORTHO_PX_PER_M = 200.0
CAM_PITCH = 15.0
CAM_DISTANCE = 40.0
SPOT_PX = (380.0, 610.0)  # design px: where the exam spot (world origin, the patients' ground pivot) is drawn
DOOR_PX_X = 32.0  # anchor.door: the walk starts here (the room's left edge), on the patients' row

# --- the room ---------------------------------------------------------------------------------------------------
WALL_Y = 1.6  # the back wall's face
ROOM_HALF = 6.0
WALL_H = 4.0
FLOOR_FRONT = -4.5
BOARD_W = 0.3
SKIRT_H = 0.12
DOTS = 38
DOT_R = 0.05
SEED = 81
MAT_R = 0.95
WINDOW_PX = (720.0, 205.0, 250.0, 205.0)  # centre x, centre y, width, height (design px, on the wall)
PLAQUE_PX = (300.0, 150.0, 52.0)  # the teal-cross plaque: centre x, y, radius (design px)
DOOR_PX = (8.0, 140.0, 132.0)  # the doorway: left x, right x, top y (design px)
PICTURE_PX = (505.0, 165.0)
PLANT_PX = (180.0, 0.9)  # the plant by the wall: x (design px), world y in front of the wall (m)
# --- the cart (bottom right): x from CART_X0 to CART_X1 (world), its front at CART_Y0 ----------------------------
CART_PX_X = (655.0, 1010.0)
CART_Y = (-2.35, -1.6)
SHELF_Z = (0.31, 1.04)  # the tops of the two shelves
CART_WHEEL_R = 0.07
# Tools: their trimmed centres x (design px) and the SHELF_Z index each rests on (1 = top, 0 = bottom).
TOOL_AT = {'shower': (742.0, 1), 'bottle': (912.0, 1), 'plaster': (742.0, 0), 'blanket': (912.0, 0)}
TOOL_PX = 112.0  # each tool's longest side on screen (design px)

# --- the patients -------------------------------------------------------------------------------------------------
PATIENT_YAW = 52.0  # degrees from facing the camera toward +x (the source front faces −y)
SIZE_PX = {'dog': 295, 'cat': 270, 'pig': 285, 'sheep': 290, 'rooster': 265, 'cow': 305, 'horse': 305}
TILT_DEG = 20.0  # the Head bone rolls this much (a curious tilt) …
TILT_TURN = 8.0  # … and turns this much toward the camera
# Per patient: the torso's share of the body length (0 = tail end, 1 = nose) and the spots on it, in torso shares:
# mud = [(s, t)] (s along the torso, t from the belly line 0 to the back 1), scrape (s, t) on the shoulder,
# blanket (s0, s1) along the torso.
BODY = {
    'dog': {'torso': (0.13, 0.68), 'mud': [(0.3, 0.5), (0.62, 0.62), (0.48, 0.18)], 'scrape': (0.9, 0.3), 'blanket': (0.2, 1.0)},
    'cat': {'torso': (0.17, 0.78), 'mud': [(0.25, 0.5), (0.58, 0.62), (0.45, 0.18)], 'scrape': (0.74, 0.38), 'blanket': (0.05, 0.95)},
    'pig': {'torso': (0.06, 0.7), 'mud': [(0.25, 0.5), (0.6, 0.62), (0.45, 0.18)], 'scrape': (0.9, 0.3), 'blanket': (0.08, 0.95)},
    'sheep': {'torso': (0.08, 0.68), 'mud': [(0.25, 0.5), (0.6, 0.62), (0.45, 0.18)], 'scrape': (0.9, 0.3), 'blanket': (0.08, 0.95)},
    'rooster': {'torso': (0.3, 0.75), 'mud': [(0.35, 0.42), (0.62, 0.55), (0.5, 0.15)], 'scrape': (0.88, 0.3), 'blanket': (0.32, 0.82), 'mud_light': True},
    'cow': {'torso': (0.1, 0.68), 'mud': [(0.25, 0.5), (0.6, 0.62), (0.45, 0.18)], 'scrape': (0.9, 0.3), 'blanket': (0.12, 0.98)},
    'horse': {'torso': (0.1, 0.64), 'mud': [(0.25, 0.5), (0.6, 0.62), (0.45, 0.18)], 'scrape': (0.9, 0.3), 'blanket': (0.15, 1.0)},
}
OVERLAYS = ('mud', 'scrape', 'plaster', 'blanket', 'bottle')
SHADOW_ALPHA = 0.14
# The detached particles stand here (screen px; the runtime places them by their frame's centre).
PARTICLE_PX = {'drop': (250.0, 230.0), 'wave': (380.0, 230.0), 'z': (510.0, 230.0), 'sparkle': (640.0, 230.0), 'heart': (770.0, 230.0)}
PARTICLE_Y = -3.0
PARTICLE_SCALE = {'drop': 1.35, 'z': 1.4}  # about 50–80 design px each


def fail(msg):
    raise RuntimeError(f'build_pet_clinic: {msg}')


def log(msg):
    print(f'build_pet_clinic: {msg}')


# --- scene helpers ------------------------------------------------------------------------------------------------

def clear_island(scene):
    for coll in list(scene.collection.children):
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        for c in list(coll.children_recursive):
            bpy.data.collections.remove(c)
        bpy.data.collections.remove(coll)


P = math.radians(CAM_PITCH)
VIEW = Vector((0.0, math.cos(P), -math.sin(P)))  # the camera looks along this
UP = Vector((0.0, math.sin(P), math.cos(P)))  # the screen's up
TX = 0.0  # the camera target (set in setup_camera)
TZ = 0.0


def setup_camera(scene):
    """The camera target so that the world origin projects to SPOT_PX."""
    global TX, TZ
    TX = -(SPOT_PX[0] - DESIGN[0] / 2) / ORTHO_PX_PER_M
    TZ = (SPOT_PX[1] - DESIGN[1] / 2) / ORTHO_PX_PER_M / math.cos(P)
    data = bpy.data.cameras.new('CamClinic')
    data.type = 'ORTHO'
    data.ortho_scale = DESIGN[0] / ORTHO_PX_PER_M
    data.clip_start = 0.1
    data.clip_end = 400.0
    cam = bpy.data.objects.new('CamClinic', data)
    scene.collection.objects.link(cam)
    target = Vector((TX, 0.0, TZ))
    cam.location = target - VIEW * CAM_DISTANCE
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = VIEW.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


def wx(sx):
    """World x drawn at design px x."""
    return TX + (sx - DESIGN[0] / 2) / ORTHO_PX_PER_M


def screen_up(sy):
    return (DESIGN[1] / 2 - sy) / ORTHO_PX_PER_M


def floor_y(sy):
    """World y of the floor point (z 0) drawn at design px y."""
    return (screen_up(sy) + TZ * math.cos(P)) / math.sin(P)


def wall_z(sy, y=WALL_Y):
    """World z of the point at depth y drawn at design px y."""
    return (screen_up(sy) - y * math.sin(P)) / math.cos(P) + TZ


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


def report(name, pts):
    r = SCREEN.rect(pts)
    log(f'{name} ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}')
    return r


def world_pts(objs):
    """Every evaluated vertex of the meshes and curves (the hose, the wavy lines) in world space."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = eval_world_verts([o for o in objs if o.type == 'MESH'], dg)
    for o in objs:
        if o.type in ('CURVE', 'FONT') and not o.hide_render:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            pts.extend(ev.matrix_world @ v.co for v in me.vertices)
            ev.to_mesh_clear()
    return pts


def all_pts(coll):
    return world_pts(list(coll.all_objects))


def emissive(name, hex_colour, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_to_linear(hex_colour)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def glow(hex_colour, strength, rough=0.4):
    """A plain material that also glows a little (particles read on any background)."""
    m = mat(hex_colour, rough).copy()
    b = principled(m)
    b.inputs['Emission Color'].default_value = hex_to_linear(hex_colour)
    b.inputs['Emission Strength'].default_value = strength
    return m


def kit(stem, pack, name, coll, loc, scale=1.0, yaw=0.0):
    """One Tiny Treats / KayKit model as a single mesh (origin at its bottom centre)."""
    o = import_joined(tt_model(stem, pack), name)
    move_to(o, coll)
    o.location = loc
    o.scale = (scale,) * 3
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0.0, 0.0, math.radians(yaw))
    return o


def no_shadow(objs):
    for o in objs:
        o.visible_shadow = False


def state_coll(parent, group, state):
    """A `state.<group>-<state>` child of a sprite group (collection names are global), its `bhc_state` = `state`."""
    sc = bpy.data.collections.new(f'state.{group}-{state}')
    sc['bhc_state'] = state
    parent.children.link(sc)
    return sc


def sprite_coll(sprites, name, movable=True):
    c = bpy.data.collections.new(f'sprite.{name}')
    sprites.children.link(c)
    if movable:
        c['movable'] = 1
    return c


def flat_shape(name, outline, depth, material, coll, bevel=0.35):
    """An extruded rounded tile from a 2D outline in the x/z plane (facing −y), its edges bevelled."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((front[k], front[j], back[j], back[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=depth * bevel, segments=3, affect='EDGES', clamp_overlap=True)
    return mesh_obj(name, bm, material, coll, smooth=True)


def tube(name, pts, r, material, coll, parent=None):
    """A smooth round tube through `pts` (a bevelled poly curve with capped ends)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS')
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (q[0], q[1], q[2], 1.0)
    sp.order_u = 4
    sp.use_endpoint_u = True
    sp.resolution_u = 12
    sp.use_smooth = True
    o = bpy.data.objects.new(name, cu)
    coll.objects.link(o)
    o.data.materials.append(material)
    o.parent = parent
    return o


def transparent(name, hex_colour, alpha):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = principled(m)
    b.inputs['Base Color'].default_value = hex_to_linear(hex_colour)
    b.inputs['Alpha'].default_value = alpha
    b.inputs['Roughness'].default_value = 1.0
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    if hasattr(m, 'blend_method'):
        try:
            m.blend_method = 'BLEND'
        except (TypeError, AttributeError):
            pass
    return m


# --- the room (plate) ---------------------------------------------------------------------------------------------

def build_room(c, plate):
    fa, fb = mat(c['floor'], 0.7), mat(c['floorDark'], 0.7)
    n = int((WALL_Y - FLOOR_FRONT) / BOARD_W) + 1
    for k in range(n):
        y1 = WALL_Y - k * BOARD_W
        rbox(f'floor-board-{k}', (2 * ROOM_HALF, BOARD_W - 0.02, 0.1), 0.02, fb if k % 3 == 2 else fa, plate, None, (TX, y1 - BOARD_W / 2, -0.05))
    wall = mat(c['wall'], 0.85)
    rbox('wall', (2 * ROOM_HALF, 0.2, WALL_H), 0.02, wall, plate, None, (TX, WALL_Y + 0.1, WALL_H / 2))
    skirt = mat(c['skirting'], 0.5)
    rbox('wall-skirting', (2 * ROOM_HALF, 0.06, SKIRT_H), 0.025, skirt, plate, None, (TX, WALL_Y - 0.03, SKIRT_H / 2))
    keep = []
    keep.append(build_window(c, plate))
    keep.append(build_door(c, plate))
    keep.append(build_plaque(c, plate))
    # A picture frame (KayKit) with a little sun-and-hill painting.
    fr = kit('pictureframe_medium', 'Furniture', 'wall-frame', plate, (wx(PICTURE_PX[0]), 0.0, 0.0), 0.9)
    fp = world_pts([fr])
    h = max(p.z for p in fp) - min(p.z for p in fp)
    fr.location = (wx(PICTURE_PX[0]), WALL_Y - 0.02 - max(p.y for p in fp), wall_z(PICTURE_PX[1]) - h / 2)
    fp = world_pts([fr])
    w = max(p.x for p in fp) - min(p.x for p in fp)
    cz = (min(p.z for p in fp) + max(p.z for p in fp)) / 2
    y = min(p.y for p in fp) + 0.05
    cx = wx(PICTURE_PX[0])
    rbox('paint-canvas', (w * 0.66, 0.02, h * 0.7), 0.01, mat(c['sky'], 0.8), plate, None, (cx, y, cz))
    blob('paint-sun', mat(c['sparkle'], 0.6), plate, None, (cx + w * 0.12, y - 0.02, cz + h * 0.12), (w * 0.12, 0.01, w * 0.12), seg=(24, 8))
    blob('paint-hill', mat(c['cap'], 0.7), plate, None, (cx - w * 0.06, y - 0.015, cz - h * 0.3), (w * 0.4, 0.01, h * 0.22), seg=(24, 8))
    keep.append((PICTURE_PX[0], PICTURE_PX[1], 75.0, 70.0))
    # Soft wallpaper dots, clear of the window, the door, the plaque and the frame.
    dot = mat(c['wallDot'], 0.85)
    rnd = random.Random(SEED)
    placed = 0
    for _ in range(DOTS * 8):
        if placed >= DOTS:
            break
        sx, sy = rnd.uniform(-20.0, DESIGN[0] + 20.0), rnd.uniform(20.0, 480.0)
        if any(abs(sx - kx) < hx + 18 and abs(sy - ky) < hy + 18 for (kx, ky, hx, hy) in keep):
            continue
        blob(f'wall-dot-{placed}', dot, plate, None, (wx(sx), WALL_Y - 0.005, wall_z(sy)), (DOT_R, 0.01, DOT_R), seg=(16, 8))
        placed += 1
    no_shadow([o for o in plate.objects if o.name.startswith(('wall-dot', 'paint-', 'wall-frame'))])


def build_window(c, plate):
    sx, sy, sw, sh = WINDOW_PX
    cx, cz = wx(sx), wall_z(sy)
    w, h = sw / ORTHO_PX_PER_M, sh / ORTHO_PX_PER_M / math.cos(P)
    y = WALL_Y - 0.01
    sky = emissive('clinic-sky', c['sky'], 1.0)
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in ((-w / 2, 0.0, -h / 2), (w / 2, 0.0, -h / 2), (w / 2, 0.0, h / 2), (-w / 2, 0.0, h / 2))])
    pane = mesh_obj('window-sky', bm, sky, plate, smooth=False)
    pane.location = (cx, y, cz)
    cloud = emissive('clinic-cloud', c['milk'], 1.05)
    for i, (u, v, k) in enumerate([(-0.2, 0.18, 0.13), (0.24, -0.16, 0.11)]):
        for j, (dx, dz, r) in enumerate(((-0.9, 0.0, 0.55), (0.0, 0.25, 0.8), (0.9, 0.0, 0.6))):
            blob(f'window-cloud-{i}-{j}', cloud, plate, None, (cx + u * w + dx * k, y - 0.01 - 0.001 * j, cz + v * h + dz * k), (r * k, 0.005, r * k * 0.7), seg=(24, 8))
    frame = mat(c['windowFrame'], 0.45)
    t = 0.07
    rbox('window-frame-top', (w + 2 * t, 0.12, t), 0.025, frame, plate, None, (cx, y - 0.05, cz + h / 2 + t / 2))
    rbox('window-frame-bottom', (w + 2 * t, 0.12, t), 0.025, frame, plate, None, (cx, y - 0.05, cz - h / 2 - t / 2))
    for side in (-1, 1):
        rbox(f'window-frame-{side}', (t, 0.12, h + 2 * t), 0.025, frame, plate, None, (cx + side * (w / 2 + t / 2), y - 0.05, cz))
    rbox('window-mullion-v', (t * 0.7, 0.08, h), 0.02, frame, plate, None, (cx, y - 0.04, cz))
    rbox('window-mullion-h', (w, 0.08, t * 0.7), 0.02, frame, plate, None, (cx, y - 0.04, cz))
    rbox('window-sill', (w + 0.36, 0.24, 0.07), 0.03, frame, plate, None, (cx, y - 0.12, cz - h / 2 - t - 0.03))
    # A little plant on the sill (Bubbly Bathroom).
    kit('plant', 'Bubbly', 'window-plant', plate, (cx + w * 0.3, y - 0.12, cz - h / 2 - t + 0.005), 0.55)
    no_shadow([o for o in plate.objects if o.name.startswith('window-') and o.name != 'window-plant'])
    return (sx, sy, sw / 2 + 25, sh / 2 + 25)


def build_door(c, plate):
    x0s, x1s, top = DOOR_PX
    x0, x1 = wx(x0s), wx(x1s)
    zt = wall_z(top)
    y = WALL_Y - 0.01
    frame = mat(c['windowFrame'], 0.45)
    t = 0.08
    # The opening shows the bright hall beyond; the door leaf stands open into the room on its left hinge.
    hall = emissive('clinic-hall', c['plasterPad'], 0.95)
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in ((x0, 0.0, 0.0), (x1, 0.0, 0.0), (x1, 0.0, zt), (x0, 0.0, zt))])
    o = mesh_obj('door-hall', bm, hall, plate, smooth=False)
    o.location = (0.0, y, 0.0)
    rbox('door-frame-top', (x1 - x0 + 2 * t, 0.14, t), 0.03, frame, plate, None, ((x0 + x1) / 2, y - 0.05, zt + t / 2))
    for side, x in ((-1, x0 - t / 2), (1, x1 + t / 2)):
        rbox(f'door-frame-{side}', (t, 0.14, zt + t), 0.03, frame, plate, None, (x, y - 0.05, (zt + t) / 2))
    leaf = mat(c['mat'], 0.6)
    w = x1 - x0
    hinge = add_empty('door-hinge', (x0, y - 0.1, 0.0), plate)
    hinge.rotation_euler = (0.0, 0.0, math.radians(-62.0))
    rbox('door-leaf', (w, 0.07, zt - 0.03), 0.03, leaf, plate, hinge, (w / 2, -0.04, (zt - 0.03) / 2 + 0.01))
    win = mat(c['windowFrame'], 0.4)
    blob('door-leaf-window', emissive('clinic-door-glass', c['sky'], 0.9), plate, hinge, (w / 2, -0.09, zt * 0.72), (w * 0.24, 0.02, w * 0.24), seg=(24, 10))
    torus('door-leaf-ring', w * 0.25, 0.025, win, plate, hinge, (w / 2, -0.09, zt * 0.72), (90.0, 0.0, 0.0))
    blob('door-knob', mat(c['chrome'], 0.3), plate, hinge, (w * 0.86, -0.12, zt * 0.45), (0.05, 0.05, 0.05))
    return ((x0s + x1s) / 2, (top + 527) / 2, (x1s - x0s) / 2 + 60, 260)


def build_plaque(c, plate):
    sx, sy, r_px = PLAQUE_PX
    r = r_px / ORTHO_PX_PER_M
    at = (wx(sx), WALL_Y - 0.04, wall_z(sy))
    lathe('plaque', rounded_profile(r, 0.0, 0.06, 0.4), mat(c['matTrim'], 0.5), plate, None, at, (90.0, 0.0, 0.0))
    cross = mat(c['cross'], 0.5)
    arm_w, arm_l = r * 0.42, r * 1.3
    rbox('plaque-cross-v', (arm_w, 0.05, arm_l), arm_w * 0.3, cross, plate, None, (at[0], at[1] - 0.06, at[2]))
    rbox('plaque-cross-h', (arm_l, 0.05, arm_w), arm_w * 0.3, cross, plate, None, (at[0], at[1] - 0.065, at[2]))
    no_shadow([o for o in plate.objects if o.name.startswith('plaque')])
    return (sx, sy, r_px + 10, r_px + 10)


def build_mat(c, plate):
    lathe('exam-mat', [(0.0, 0.0), (MAT_R - 0.03, 0.0), (MAT_R, 0.012), (MAT_R - 0.006, 0.028), (MAT_R - 0.03, 0.035), (0.0, 0.035)], mat(c['mat'], 0.75), plate, None, (0.0, 0.0, 0.0))
    torus('exam-mat-trim', MAT_R - 0.1, 0.02, mat(c['matTrim'], 0.6), plate, None, (0.0, 0.0, 0.035))
    # Four soft paw prints around the rim (white).
    paw = mat(c['matTrim'], 0.7)
    for i, a in enumerate((200.0, 240.0, 300.0, 340.0)):
        r = MAT_R - 0.32
        px, py = r * math.cos(math.radians(a)), r * math.sin(math.radians(a))
        blob(f'exam-mat-paw-{i}', paw, plate, None, (px, py, 0.036), (0.07, 0.06, 0.006), seg=(20, 6))
        for k in range(3):
            b = math.radians(a) + (k - 1) * 0.55
            blob(f'exam-mat-paw-{i}-{k}', paw, plate, None, (px + 0.1 * math.cos(b), py + 0.1 * math.sin(b), 0.036), (0.03, 0.03, 0.006), seg=(16, 6))


def build_props(c, plate):
    # A potted plant against the wall, left of the mat, and a little KayKit cabinet with towels and a duck on it.
    kit('plant', 'Bubbly', 'prop-plant', plate, (wx(PLANT_PX[0]), WALL_Y - PLANT_PX[1], 0.0), 0.95)
    stool = kit('cabinet_small', 'Furniture', 'prop-cabinet', plate, (wx(610.0), WALL_Y - 0.3, 0.0), 0.75)
    sp = world_pts([stool])
    stool.location.y = WALL_Y - 0.03 - max(p.y for p in sp)
    sp = world_pts([stool])
    top = max(p.z for p in sp)
    yc = (min(p.y for p in sp) + max(p.y for p in sp)) / 2
    kit('towel_stacked', 'Bubbly', 'prop-towels', plate, (wx(590.0), yc, top), 0.55)
    kit('ducky', 'Bubbly', 'prop-ducky', plate, (wx(638.0), yc, top), 0.8, -30.0)
    report('cabinet', world_pts([stool]))


def cart_frame():
    x0, x1 = wx(CART_PX_X[0]), wx(CART_PX_X[1])
    y0, y1 = CART_Y
    return x0, x1, y0, y1


def build_cart(c, plate):
    """A pink two-shelf trolley: two trays with raised rims, four posts, little wheels and a teal cross."""
    body, dark, cross = mat(c['cart'], 0.6), mat(c['cartDark'], 0.6), mat(c['cross'], 0.5)
    chrome = mat(c['chrome'], 0.35)
    x0, x1, y0, y1 = cart_frame()
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    w, d = x1 - x0, y1 - y0
    zw = 2 * CART_WHEEL_R
    for i, z in enumerate(SHELF_Z):
        rbox(f'cart-tray-{i}', (w, d, 0.06), 0.025, body, plate, None, (xc, yc, z - 0.03))
        rim = 0.07
        rbox(f'cart-rim-front-{i}', (w, 0.05, rim), 0.02, dark, plate, None, (xc, y0 + 0.025, z + rim / 2 - 0.03))
        rbox(f'cart-rim-back-{i}', (w, 0.05, rim), 0.02, dark, plate, None, (xc, y1 - 0.025, z + rim / 2 - 0.03))
        for side, x in ((-1, x0 + 0.025), (1, x1 - 0.025)):
            rbox(f'cart-rim-{side}-{i}', (0.05, d, rim), 0.02, dark, plate, None, (x, yc, z + rim / 2 - 0.03))
    for i, (x, y) in enumerate(((x0 + 0.05, y0 + 0.05), (x1 - 0.05, y0 + 0.05), (x0 + 0.05, y1 - 0.05), (x1 - 0.05, y1 - 0.05))):
        rod(f'cart-post-{i}', (x, y, zw), (x, y, SHELF_Z[1] + 0.02), 0.035, body, plate, None)
        blob(f'cart-wheel-{i}', chrome, plate, None, (x, y, CART_WHEEL_R), (CART_WHEEL_R * 0.6, CART_WHEEL_R, CART_WHEEL_R))
    # The teal cross on the top tray's front rim (a little white disc behind it).
    at = (xc, y0 - 0.005, SHELF_Z[1] - 0.17)
    lathe('cart-badge', rounded_profile(0.12, 0.0, 0.03, 0.4), mat(c['matTrim'], 0.5), plate, None, at, (90.0, 0.0, 0.0))
    rbox('cart-badge-front', (w * 0.98, 0.04, 0.26), 0.03, body, plate, None, (xc, y0 + 0.02, SHELF_Z[1] - 0.17))
    rbox('cart-cross-v', (0.06, 0.03, 0.17), 0.02, cross, plate, None, (at[0], at[1] - 0.035, at[2]))
    rbox('cart-cross-h', (0.17, 0.03, 0.06), 0.02, cross, plate, None, (at[0], at[1] - 0.04, at[2]))
    # A push handle on the right.
    rod('cart-handle', (x1 + 0.02, y0 + 0.1, SHELF_Z[1] + 0.12), (x1 + 0.02, y1 - 0.1, SHELF_Z[1] + 0.12), 0.03, chrome, plate, None)
    for y in (y0 + 0.1, y1 - 0.1):
        rod(f'cart-handle-arm-{y:.2f}', (x1 - 0.03, y, SHELF_Z[1]), (x1 + 0.02, y, SHELF_Z[1] + 0.12), 0.022, chrome, plate, None)
    # The badge sits in front of the front rim: lift it out a little.
    bpy.data.objects['cart-badge'].location.y = y0 - 0.025
    bpy.data.objects['cart-cross-v'].location.y = y0 - 0.06
    bpy.data.objects['cart-cross-h'].location.y = y0 - 0.065


def build_plate(c, plate):
    build_room(c, plate)
    build_mat(c, plate)
    build_props(c, plate)
    build_cart(c, plate)


# --- the tools (also the overlay bottle) --------------------------------------------------------------------------

def make_bottle(prefix, c, coll, parent):
    """A milk bottle along +z from its base (origin) to the teat's tip (≈ 1.0 tall); returns the tip's height."""
    body = mat(c['milk'], 0.3)
    glass = mat(c['bottle'], 0.15)
    lathe(f'{prefix}-body', [(0.0, 0.0), (0.26, 0.0), (0.3, 0.04), (0.31, 0.1), (0.31, 0.5), (0.3, 0.56), (0.27, 0.6), (0.0, 0.6)], body, coll, parent)
    lathe(f'{prefix}-glass-top', [(0.0, 0.58), (0.28, 0.58), (0.3, 0.6), (0.29, 0.64), (0.0, 0.64)], glass, coll, parent)
    for k, z in enumerate((0.2, 0.32, 0.44)):
        torus(f'{prefix}-mark-{k}', 0.312, 0.008, mat(c['showerDark'], 0.4), coll, parent, (0.0, 0.0, z))
    lathe(f'{prefix}-cap', rounded_profile(0.25, 0.62, 0.74, 0.35), mat(c['cap'], 0.5), coll, parent)
    lathe(f'{prefix}-teat', [(0.0, 0.73), (0.15, 0.73), (0.15, 0.78), (0.1, 0.82), (0.08, 0.88), (0.085, 0.94), (0.06, 0.99), (0.0, 1.0)], mat(c['teat'], 0.45), coll, parent)
    return 1.0


def make_shower(prefix, c, coll, parent):
    """A hand shower: a round head (its spray face toward −y) on a handle going down-left, with a short hose loop."""
    blue, dark, chrome = mat(c['shower'], 0.4), mat(c['showerDark'], 0.45), mat(c['chrome'], 0.3)
    head_at = Vector((0.14, 0.0, 0.62))
    # Rx(90°) turns the lathe's +z toward −y: the head's back is at y 0, its spray face at y −0.13 (toward the camera).
    lathe(f'{prefix}-head', rounded_profile(0.27, -0.13, 0.0, 0.5), blue, coll, parent, tuple(head_at), (-90.0, 0.0, 0.0))
    face_y = -0.135
    lathe(f'{prefix}-face', rounded_profile(0.2, -0.02, 0.0, 0.5), chrome, coll, parent, tuple(head_at + Vector((0.0, face_y + 0.012, 0.0))), (-90.0, 0.0, 0.0))
    for k in range(7):
        a = 2 * math.pi * k / 6 + math.pi / 6
        r = 0.0 if k == 6 else 0.115
        blob(f'{prefix}-hole-{k}', dark, coll, parent, tuple(head_at + Vector((r * math.cos(a), face_y - 0.008, r * math.sin(a)))), (0.03, 0.012, 0.03), seg=(12, 6))
    grip_a = head_at + Vector((-0.1, -0.06, -0.2))
    grip_b = Vector((-0.2, -0.06, 0.12))
    rod(f'{prefix}-handle', tuple(grip_b), tuple(grip_a), 0.075, blue, coll, parent)
    torus(f'{prefix}-collar', 0.08, 0.03, chrome, coll, parent, tuple(grip_b + Vector((0.0, 0.0, 0.03))), (0.0, 0.0, 0.0))
    # The hose: a short soft loop curling from the handle's end.
    hose = [(-0.2, -0.06, 0.1), (-0.24, -0.06, 0.0), (-0.34, -0.04, -0.06), (-0.44, -0.02, 0.0), (-0.42, 0.0, 0.12), (-0.32, 0.02, 0.14), (-0.3, 0.04, 0.04), (-0.38, 0.05, -0.08)]
    tube(f'{prefix}-hose', hose, 0.035, chrome, coll, parent)


def make_plaster(prefix, c, coll, parent, size=(1.0, 0.36), thick=0.05):
    """A chunky band-aid lying in the x/z plane facing −y: rounded strip, pale pad, little holes."""
    w, h = size
    band = mat(c['plaster'], 0.6)
    pad = mat(c['plasterPad'], 0.7)
    rbox(f'{prefix}-band', (w, thick, h), h * 0.48, band, coll, parent, (0.0, 0.0, 0.0))
    rbox(f'{prefix}-pad', (w * 0.36, thick * 0.6, h * 0.72), h * 0.18, pad, coll, parent, (0.0, -thick * 0.45, 0.0))
    for side in (-1, 1):
        for k, (dx, dz) in enumerate(((0.3, 0.1), (0.3, -0.1), (0.4, 0.0))):
            blob(f'{prefix}-hole-{side}-{k}', mat(c['plasterPad'], 0.7), coll, parent, (side * w * dx, -thick / 2 - 0.003, dz * h), (h * 0.05, 0.006, h * 0.05), seg=(12, 6))


def make_folded_blanket(prefix, c, coll, parent):
    """A folded blanket: three soft layers and a white patch stripe (≈ 1.0 wide, 0.45 tall)."""
    lav = mat(c['blanket'], 0.85)
    patch = mat(c['blanketPatch'], 0.85)
    for k in range(3):
        z = 0.08 + k * 0.15
        rbox(f'{prefix}-layer-{k}', (1.0 - k * 0.03, 0.6, 0.16), 0.075, lav, coll, parent, (0.0, 0.0, z))
    rbox(f'{prefix}-stripe', (1.0, 0.04, 0.05), 0.02, patch, coll, parent, (0.0, -0.305, 0.31))
    for k, x in enumerate((-0.3, 0.0, 0.3)):
        blob(f'{prefix}-dot-{k}', patch, coll, parent, (x, -0.305, 0.15), (0.06, 0.01, 0.05), seg=(16, 6))
        blob(f'{prefix}-topdot-{k}', patch, coll, parent, (x + 0.15, -0.1, 0.47), (0.07, 0.07, 0.01), seg=(16, 6))


def fit_on_shelf(root, coll, sx, shelf):
    """Scales `root` so the tool's longest screen side is TOOL_PX, stands it on its shelf, centres it at sx."""
    _x0, _x1, y0, y1 = cart_frame()
    pts = all_pts(coll)
    r = SCREEN.rect(pts)
    k = TOOL_PX / max(r[2] - r[0], r[3] - r[1])
    root.scale = (k,) * 3
    pts = all_pts(coll)
    z0 = min(p.z for p in pts)
    yc = (y0 + y1) / 2 + (0.05 if shelf == 1 else 0.0)
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    root.location += Vector((0.0, yc - cy, SHELF_Z[shelf] - z0 + 0.002))
    pts = all_pts(coll)
    r = SCREEN.rect(pts)
    root.location.x += (sx - (r[0] + r[2]) / 2) / ORTHO_PX_PER_M
    pts = all_pts(coll)
    return report(f'tool at {sx:.0f}', pts)


def build_tools(c, sprites):
    out = {}
    for tid, (sx, shelf) in TOOL_AT.items():
        coll = sprite_coll(sprites, f'tool-{tid}')
        root = add_empty(f'tool-{tid}-root', (wx(sx), 0.0, 0.0), coll)
        if tid == 'shower':
            make_shower('tool-shower', c, coll, root)
            root.rotation_euler = (math.radians(-10.0), 0.0, math.radians(-8.0))
        elif tid == 'bottle':
            make_bottle('tool-bottle', c, coll, root)
            root.rotation_euler = (0.0, math.radians(-8.0), 0.0)
        elif tid == 'plaster':
            make_plaster('tool-plaster', c, coll, root)
            # Leaning back on the shelf, its face toward the camera, a little askew.
            root.rotation_euler = (math.radians(-35.0), math.radians(-14.0), 0.0)
            for o in coll.objects:
                if o.parent is root:
                    o.location.z += 0.2
        else:
            make_folded_blanket('tool-blanket', c, coll, root)
            root.rotation_euler = (0.0, 0.0, math.radians(-6.0))
        no_shadow(list(coll.objects))
        out[tid] = fit_on_shelf(root, coll, sx, shelf)
    return out


# --- the patients ---------------------------------------------------------------------------------------------------

class Body:
    """The posed patient in world space: its facing frame, a ray-cast tree and measures."""

    def __init__(self, meshes, yaw):
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        verts, polys = [], []
        for o in meshes:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            base = len(verts)
            mw = ev.matrix_world
            verts.extend(mw @ v.co for v in me.vertices)
            polys.extend([base + i for i in p.vertices] for p in me.polygons)
            ev.to_mesh_clear()
        self.pts = verts
        self.bvh = BVHTree.FromPolygons(verts, polys)
        a = math.radians(yaw)
        self.f = Vector((math.sin(a), -math.cos(a), 0.0))  # its facing
        self.l = Vector((-math.cos(a), -math.sin(a), 0.0))  # its side toward the camera
        self.up = Vector((0.0, 0.0, 1.0))
        ss = [p.dot(self.f) for p in verts]
        ls = [p.dot(self.l) for p in verts]
        self.s0, self.s1 = min(ss), max(ss)
        self.l0, self.l1 = min(ls), max(ls)
        self.lc = (self.l0 + self.l1) / 2
        self.h = max(p.z for p in verts)
        self.length = self.s1 - self.s0
        self.u = max(self.h, 0.8 * self.length)  # the decals' size unit (the long, low pig gets big enough ones)

    def at(self, s_frac, z, lat=0.0):
        """The world point at body-length share s_frac, height z, lateral offset lat (toward the camera)."""
        s = self.s0 + s_frac * self.length
        return self.f * s + self.l * (self.lc + lat) + self.up * z

    def ray(self, origin, d):
        loc, n, _i, _dist = self.bvh.ray_cast(origin, d)
        return (loc, n) if loc is not None else (None, None)

    def from_camera(self, p):
        """The first surface the camera sees through world point p (its screen spot)."""
        loc, n = self.ray(p - VIEW * 20.0, VIEW)
        if loc is not None and n.dot(VIEW) > 0:
            n = -n
        return loc, n

    def top(self, s_frac, lat=0.0):
        p = self.at(s_frac, self.h + 2.0, lat)
        loc, n = self.ray(p, Vector((0.0, 0.0, -1.0)))
        return loc, n

    def bottom(self, s_frac, lat=0.0):
        p = self.at(s_frac, 0.005, lat)
        loc, n = self.ray(p, Vector((0.0, 0.0, 1.0)))
        return loc, n

    def torso(self, spec, s_t):
        """The body-length share of torso share s_t."""
        a, b = spec['torso']
        return a + s_t * (b - a)

    def band(self, s_frac):
        """(belly z, back z) at s_frac on the mid plane (falls back to shares of the height)."""
        t, _ = self.top(s_frac)
        b, _ = self.bottom(s_frac)
        zt = t.z if t is not None else 0.75 * self.h
        zb = b.z if b is not None and b.z < zt else 0.35 * self.h
        return zb, zt


def import_patient(aid, coll):
    rel = pens.ANIMALS[aid][0]
    new, actions = pens.import_model(rel, coll)
    root = add_empty(f'patient-{aid}-root-{len(coll.objects)}', (0.0, 0.0, 0.0), coll)
    for o in new:
        if o.parent is None:
            o.parent = root
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    if arm is not None:
        pens.pose_idle(arm, actions)
    meshes = [o for o in new if o.type == 'MESH']
    if not meshes:
        fail(f'{rel} has no mesh')
    return root, arm, meshes, new


def place_patient(aid, root, meshes):
    """Turns, scales and grounds the patient so its footprint centre is at the origin."""
    root.rotation_euler = (0.0, 0.0, math.radians(pens.SOURCE_FRONT_DEG + PATIENT_YAW))
    root.scale = (1.0, 1.0, 1.0)
    pts = world_pts(meshes)
    r = SCREEN.rect(pts)
    k = SIZE_PX[aid] / max(r[2] - r[0], r[3] - r[1])
    root.scale = (k, k, k)
    pts = world_pts(meshes)
    root.location = (-(min(p.x for p in pts) + max(p.x for p in pts)) / 2, -(min(p.y for p in pts) + max(p.y for p in pts)) / 2, -min(p.z for p in pts) + 0.035)
    bpy.context.view_layer.update()


def key_pose(arm):
    for pb in arm.pose.bones:
        pb.keyframe_insert('location', frame=IDLE_FRAME)
        pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=IDLE_FRAME)
        pb.keyframe_insert('scale', frame=IDLE_FRAME)
    key_constant(arm)


def tilt_head(arm, body):
    """The Head bone rolls TILT_DEG about the facing and turns TILT_TURN toward the camera (armature space)."""
    if 'Head' not in arm.pose.bones:
        return False
    inv = arm.matrix_world.inverted().to_3x3()
    f = (inv @ body.f).normalized()
    up = (inv @ Vector((0.0, 0.0, 1.0))).normalized()
    pb = arm.pose.bones['Head']
    m = pb.matrix.copy()
    p = m.translation.copy()
    r = Matrix.Rotation(math.radians(TILT_DEG), 4, f) @ Matrix.Rotation(math.radians(-TILT_TURN), 4, up)
    pb.matrix = Matrix.Translation(p) @ r @ Matrix.Translation(-p) @ m
    bpy.context.view_layer.update()
    key_pose(arm)
    return True


def frame_basis(n, hint):
    n = n.normalized()
    t = (hint - n * hint.dot(n))
    if t.length < 1e-4:
        t = Vector((1.0, 0.0, 0.0)) - n * n.x
    t.normalize()
    return n, t, n.cross(t)


def decal(name, body, loc, n, hint, size, radius_fn, lift, dome, material, coll, rings=6, segs=40, bvh=None, mix=0.5):
    """A soft patch hugging the surface at `loc` (normal n): a polar grid of size (a, b) along (t, n × t), each vertex
    ray-cast back onto the surface and lifted `lift` + `dome` × (1 − r²) along its normal."""
    tree = bvh or body.bvh
    n, t, b = frame_basis(n, hint)
    bm = bmesh.new()
    reach = 2.5 * max(size)
    grid = []
    for i in range(rings + 1):
        rr = i / rings
        ring = []
        for j in range(segs if i else 1):
            a = 2 * math.pi * j / segs
            k = radius_fn(a) * rr
            q = loc + t * (math.cos(a) * size[0] * k) + b * (math.sin(a) * size[1] * k)
            hit, hn, _i, _d = tree.ray_cast(q + n * reach, -n)
            if hit is None or abs((hit - q).dot(n)) > 0.6 * max(size):
                hit, hn = q, n
            if hn.dot(n) < 0:
                hn = -hn
            off = lift + dome * (1 - rr * rr)
            ring.append(bm.verts.new(hit + (hn * mix + n * (1 - mix)).normalized() * off))
        grid.append(ring)
    for j in range(segs):
        bm.faces.new((grid[0][0], grid[1][j], grid[1][(j + 1) % segs]))
    for i in range(1, rings):
        for j in range(segs):
            k = (j + 1) % segs
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][k], grid[i][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_obj(name, bm, material, coll, smooth=True)
    return o


def splat_fn(seed):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 2 * math.pi) for _ in range(3)]
    return lambda a: 1.0 + 0.2 * math.sin(3 * a + ph[0]) + 0.12 * math.sin(5 * a + ph[1]) + 0.06 * math.sin(7 * a + ph[2])


def superellipse(p=4.0):
    return lambda a: 1.0 / ((abs(math.cos(a)) ** p + abs(math.sin(a)) ** p) ** (1.0 / p))


def oval(a):
    return 1.0


def side_spot(body, s_frac, t):
    zb, zt = body.band(s_frac)
    p = body.at(s_frac, zb + t * (zt - zb), body.l1 - body.lc)
    loc, n = body.from_camera(p)
    if loc is None:
        loc, n = body.from_camera(body.at(s_frac, zb + t * (zt - zb), 0.0))
    return loc, n


def build_mud(aid, body, spec, c, coll):
    H = body.u
    # Wet, glossy dark splats (they read on the brown coats too) with a lighter smear in each.
    dark, light = mat(c['mudDark'], 0.28), mat(c['mud'], 0.35)
    if spec.get('mud_light'):  # on a black coat the light mud is the splat, the dark one the smear
        dark, light = light, dark
    for i, (s_t, t) in enumerate(spec['mud']):
        loc, n = side_spot(body, body.torso(spec, s_t), t)
        if loc is None:
            log(f'WARNING {aid}: mud {i} missed the body')
            continue
        r = H * (0.095 if i != 2 else 0.07)
        decal(f'mud-{aid}-{i}', body, loc, n, body.f, (r, r * 0.85), splat_fn(sum(map(ord, aid)) + i), 0.008 * H, 0.01 * H, dark, coll)
        decal(f'mud-{aid}-{i}-smear', body, loc + body.f * r * 0.2 + body.up * r * 0.15, n, body.f, (r * 0.4, r * 0.28), splat_fn(i + 5), 0.017 * H, 0.004 * H, light, coll, rings=4, segs=28)
        # two little drops beside the splat
        for k, (dx, dz) in enumerate(((1.4, 0.6), (-1.2, -0.8))):
            q = loc + body.f * (dx * r) + Vector((0.0, 0.0, dz * r))
            hit, hn = body.from_camera(q)
            if hit is not None and abs(hit.dot(body.f) - loc.dot(body.f)) < 2.5 * r:
                decal(f'mud-{aid}-{i}-drop-{k}', body, hit, hn, body.f, (r * 0.2, r * 0.18), oval, 0.008 * H, 0.006 * H, dark, coll, rings=3, segs=20)


def scrape_spot(body, spec):
    """On the shoulder, low on the camera's side (a broad, flat spot: the plaster lies flat on it)."""
    s_t, t = spec['scrape']
    loc, n = side_spot(body, body.torso(spec, s_t), t)
    if loc is None:
        fail(f'scrape spot misses the body ({spec["scrape"]})')
    return loc, n


def patch_size(body, spec):
    """The scrape's and the plaster's size: a share of the size unit, at most a share of the torso's depth there."""
    zb, zt = body.band(body.torso(spec, spec['scrape'][0]))
    return min(body.u * 0.08, 0.27 * (zt - zb))


PATCH_AXIS = Vector((0.0, 0.0, 0.5))  # + the facing: the plaster (and the scrape under it) lie along this


def build_scrape(aid, body, spec, c, coll, loc, n):
    """A pink graze with three darker scratch lines across it, along the plaster's axis (the plaster covers it)."""
    H = body.u
    r = patch_size(body, spec)
    hint = PATCH_AXIS + body.f
    decal(f'scrape-{aid}', body, loc, n, hint, (r * 1.15, r * 0.6), oval, 0.006 * H, 0.008 * H, mat(c['scrape'], 0.7), coll, mix=0.3)
    nn, t, b = frame_basis(n, hint)
    for k in range(3):
        q = loc + t * ((k - 1) * r * 0.45)
        hit, hn, _i, _d = body.bvh.ray_cast(q + nn * r, -nn)
        if hit is None:
            hit, hn = q, nn
        decal(f'scrape-{aid}-line-{k}', body, hit, nn, b + t * 0.35, (r * 0.42, r * 0.07), oval, 0.017 * H, 0.003 * H, mat(c['scrapeDark'], 0.7), coll, rings=3, segs=20, mix=0.3)


def build_plaster(aid, body, spec, c, coll, loc, n):
    H = body.u
    r = patch_size(body, spec)
    hint = PATCH_AXIS + body.f
    decal(f'plaster-{aid}', body, loc, n, hint, (r * 2.0, r * 0.75), superellipse(3.0), 0.012 * H, 0.01 * H, mat(c['plaster'], 0.6), coll, rings=8, segs=48, mix=0.15)
    decal(f'plaster-{aid}-pad', body, loc, n, hint, (r * 0.62, r * 0.52), superellipse(4.0), 0.027 * H, 0.004 * H, mat(c['plasterPad'], 0.7), coll, mix=0.15)
    nn, t, b = frame_basis(n, hint)
    for side in (-1, 1):
        for k, (dx, dy) in enumerate(((1.25, 0.25), (1.25, -0.25), (1.55, 0.0))):
            q = loc + t * (side * dx * r) + b * (dy * r)
            hit, hn, _i, _d = body.bvh.ray_cast(q + nn * r * 2, -nn)
            if hit is not None:
                decal(f'plaster-{aid}-hole-{side}-{k}', body, hit, nn, t, (r * 0.08, r * 0.08), oval, 0.026 * H, 0.002 * H, mat(c['plasterPad'], 0.7), coll, rings=2, segs=12, mix=0.15)


def build_blanket(aid, body, spec, c, coll):
    """A soft blanket draped over the torso: an arc of rays toward the torso's axis, lifted off the fur."""
    H = body.h
    a, b = spec['blanket']
    ns, nt = 26, 30
    lift = 0.03 * H
    bm = bmesh.new()
    grid = []
    for i in range(ns + 1):
        st = a + (b - a) * i / ns
        s = body.torso(spec, st)
        zb, zt = body.band(s)
        axis = body.at(s, (zb + zt) / 2, 0.0)
        row = []
        for j in range(nt + 1):
            th = math.radians(-82.0 + 164.0 * j / nt)
            d = (body.up * math.cos(th) + body.l * math.sin(th)).normalized()
            o = axis + d * (2.0 * H)
            hit, hn, _i, _d = body.bvh.ray_cast(o, -d)
            if hit is None or (hit - axis).length > 0.8 * H or not all(math.isfinite(v) for v in hn) or hn.length < 0.5:
                hit, hn = (hit if hit is not None and (hit - axis).length <= 0.8 * H else axis + d * (0.3 * H)), d
            if hn.dot(d) < 0:
                hn = -hn
            # The edges hang a little looser (lower) than the middle hugs.
            edge = max(abs(th) / math.radians(82.0), abs(2 * i / ns - 1)) ** 4
            p = hit + (hn * 0.5 + d * 0.5).normalized() * (lift * (1.0 + 0.6 * edge)) - body.up * (0.02 * H * edge)
            row.append(bm.verts.new(p))
        grid.append(row)
    for i in range(ns):
        for j in range(nt):
            bm.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me_obj = mesh_obj(f'blanket-{aid}', bm, mat(c['blanket'], 0.85), coll, smooth=True)
    sol = me_obj.modifiers.new('thick', 'SOLIDIFY')
    sol.thickness = 0.03 * H
    sol.offset = -1.0
    sol.use_even_offset = False
    # Make sure the outside faces point away from the body.
    bpy.context.view_layer.update()
    # White patches on the blanket (a tree of the blanket itself).
    verts = [v.co.copy() for v in me_obj.data.vertices]
    polys = [list(p.vertices) for p in me_obj.data.polygons]
    tree = BVHTree.FromPolygons(verts, polys)
    patch = mat(c['blanketPatch'], 0.85)
    for k, (st, th) in enumerate(((0.25, 30.0), (0.6, 55.0), (0.75, 10.0), (0.45, -10.0))):
        s = body.torso(spec, a + (b - a) * st)
        zb, zt = body.band(s)
        axis = body.at(s, (zb + zt) / 2, 0.0)
        d = (body.up * math.cos(math.radians(th)) + body.l * math.sin(math.radians(th))).normalized()
        hit, hn, _i, _d = tree.ray_cast(axis + d * 2 * H, -d)
        if hit is None:
            continue
        if hn.dot(d) < 0:
            hn = -hn
        decal(f'blanket-{aid}-patch-{k}', body, hit, hn, body.f, (0.055 * H, 0.05 * H), oval, 0.006 * H, 0.004 * H, patch, coll, rings=3, segs=24, bvh=tree)
    return me_obj


def mouth_point(body):
    """The front of the snout, a little below its middle (where a teat goes)."""
    tip = [p for p in body.pts if p.dot(body.f) > body.s1 - 0.05 * body.length and p.z > 0.35 * body.h]
    if not tip:
        tip = [p for p in body.pts if p.dot(body.f) > body.s1 - 0.08 * body.length]
    z0, z1 = min(p.z for p in tip), max(p.z for p in tip)
    low = [p for p in tip if p.z < z0 + 0.5 * (z1 - z0)] or tip
    c = sum(low, Vector()) / len(low)
    return c


def head_top(body):
    head = [p for p in body.pts if p.dot(body.f) > body.s1 - 0.3 * body.length and p.z > 0.5 * body.h]
    top = max(head, key=lambda p: p.z)
    near = [p for p in head if p.z > top.z - 0.04 * body.h]
    c = sum(near, Vector()) / len(near)
    return Vector((c.x, c.y, top.z))


def build_bottle_overlay(aid, body, c, coll, mouth):
    root = add_empty(f'bottle-{aid}-root', (0.0, 0.0, 0.0), coll)
    tip = make_bottle(f'bottle-{aid}', c, coll, root)
    k = 0.36 * body.h
    a = math.radians(32.0)
    # Seen side on (its axis in the screen plane): the base rises to the right of the mouth, the teat in the mouth.
    d = -(Vector((1.0, 0.0, 0.0)) * math.cos(a) + UP * math.sin(a))
    d.normalize()
    root.rotation_mode = 'QUATERNION'
    root.rotation_quaternion = d.to_track_quat('Z', 'Y')
    root.scale = (k, k, k)
    # The teat's tip sits a little inside the snout (the holdout hides it); the bottle comes a bit toward the camera.
    root.location = mouth - d * (tip * k * 0.9) - VIEW * 0.04 * body.h
    no_shadow(list(coll.objects))


def holdout_copy(meshes, coll):
    out = []
    for o in meshes:
        h = o.copy()
        h.name = f'{o.name}-holdout-{coll.name[6:]}'
        coll.objects.link(h)
        h.is_holdout = True
        h.visible_shadow = False
        out.append(h)
    return out


def contact_shadow(aid, body, coll, c):
    feet = [p for p in body.pts if p.z < 0.08 * body.h]
    xs, ys = [p.x for p in feet], [p.y for p in feet]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    rx, ry = (max(xs) - min(xs)) / 2 + 0.04, (max(ys) - min(ys)) / 2 + 0.06
    m = transparent(f'shadow-{aid}', c['mudDark'], SHADOW_ALPHA)
    o = blob(f'shadow-{aid}', m, coll, None, (cx, cy, 0.04), (rx, ry, 0.003), seg=(40, 8))
    o.visible_shadow = False
    return o


def build_patient(aid, c, sprites):
    group = f'patient-{aid}'
    coll = sprite_coll(sprites, group)
    spec = BODY[aid]
    base = state_coll(coll, group, 'base')
    root, arm, meshes, new = import_patient(aid, coll)
    for o in meshes:
        move_to(o, base)
    place_patient(aid, root, meshes)
    body = Body(meshes, PATIENT_YAW)
    contact_shadow(aid, body, base, c)
    for o in meshes:
        o.visible_shadow = False
    out = {'body': body, 'frames': {'base': list(base.all_objects)}}
    # The tilt: a second import posed the same, its Head rolled.
    if arm is not None:
        tilt = state_coll(coll, group, 'tilt')
        r2, a2, m2, _n2 = import_patient(aid, tilt)
        r2.rotation_euler = root.rotation_euler.copy()
        r2.scale = root.scale.copy()
        r2.location = root.location.copy()
        bpy.context.view_layer.update()
        if tilt_head(a2, body):
            contact_shadow(f'{aid}-tilt', body, tilt, c)
            for o in m2:
                o.visible_shadow = False
            out['frames']['tilt'] = list(tilt.all_objects)
            out['tilt_pts'] = world_pts(m2)
        else:
            log(f'WARNING {aid}: no Head bone — no tilt frame')
            for o in list(tilt.all_objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(tilt)
    sloc, sn = scrape_spot(body, spec)
    mouth = mouth_point(body)
    for ov in OVERLAYS:
        sc = state_coll(coll, group, ov)
        holdout_copy(meshes, sc)
        if ov == 'mud':
            build_mud(aid, body, spec, c, sc)
        elif ov == 'scrape':
            build_scrape(aid, body, spec, c, sc, sloc, sn)
        elif ov == 'plaster':
            build_plaster(aid, body, spec, c, sc, sloc, sn)
        elif ov == 'blanket':
            build_blanket(aid, body, spec, c, sc)
        else:
            build_bottle_overlay(aid, body, c, sc, mouth)
        for o in sc.objects:
            o.visible_shadow = False
        out['frames'][ov] = [o for o in sc.all_objects if not o.is_holdout]
        report(f'{group}/{ov}', world_pts(out['frames'][ov]))
    if 'tilt_pts' in out:
        report(f'{group}/tilt', out['tilt_pts'])
    # The spots.
    s_mid = body.torso(spec, 0.5)
    back, _ = body.top(s_mid)
    if back is None:
        back = body.at(s_mid, 0.75 * body.h)
    belly, _ = side_spot(body, s_mid, 0.25)
    out['spots'] = {'back': back, 'mouth': mouth, 'scrape': sloc, 'belly': belly, 'head': head_top(body)}
    report(f'{group}/base', body.pts)
    for k, v in out['spots'].items():
        x, y = SCREEN.project(v)
        log(f'{group} spot {k} ({x:.0f},{y:.0f})')
    return out


# --- the particles ----------------------------------------------------------------------------------------------------

def particle_at(pid):
    sx, sy = PARTICLE_PX[pid]
    return Vector((wx(sx), PARTICLE_Y, wall_z(sy, PARTICLE_Y)))


def star_outline(points, r_out, r_in, steps=6):
    out = []
    n = 2 * points
    for k in range(n):
        a0 = math.pi / 2 + k * math.pi / points
        r = r_out if k % 2 == 0 else r_in
        out.append((r * math.cos(a0), r * math.sin(a0)))
    return out


def sparkle_outline(r_out, r_in, steps=8):
    """A 4-point sparkle with concave (curved) sides."""
    out = []
    tips = [(0.0, r_out), (r_out, 0.0), (0.0, -r_out), (-r_out, 0.0)]
    for k in range(4):
        a, b = Vector(tips[k]), Vector(tips[(k + 1) % 4])
        ctrl = Vector((0.0, 0.0))
        mid_dir = (a + b).normalized() * r_in
        for i in range(steps):
            t = i / steps
            # a quadratic curve from a to b bending toward the centre
            p = (1 - t) ** 2 * a + 2 * (1 - t) * t * (ctrl + mid_dir * 0.6) + t ** 2 * b
            out.append((p.x, p.y))
    return out


def heart_outline(r, steps=48):
    out = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        out.append((x * r / 16, y * r / 16))
    return out


def build_particles(c, sprites):
    for pid in PARTICLE_PX:
        coll = sprite_coll(sprites, pid, movable=False)
        coll['bhc_detached'] = 1
        at = particle_at(pid)
        if pid == 'drop':
            m = glow(c['drop'], 0.35, 0.15)
            prof = []
            for i in range(13):
                a = math.pi * i / 12
                prof.append((0.1 * math.sin(a), 0.1 - 0.1 * math.cos(a)))
            prof += [(0.075, 0.17), (0.04, 0.24), (0.0, 0.29)]
            prof[0] = (0.0, 0.0)
            lathe('drop', prof, m, coll, None, tuple(at - Vector((0.0, 0.0, 0.14))))
            blob('drop-shine', emissive('clinic-shine', c['milk'], 1.2), coll, None, tuple(at + Vector((-0.035, -0.1, -0.02))), (0.022, 0.01, 0.035), seg=(16, 8))
        elif pid == 'wave':
            m = mat(c['wave'], 0.5)
            for row in range(2):
                pts = []
                for i in range(25):
                    t = i / 24
                    pts.append(at + Vector((-0.17 + 0.34 * t, 0.0, 0.07 - row * 0.14 + 0.035 * math.sin(t * 2 * math.pi * 1.5))))
                tube(f'wave-{row}', [tuple(p) for p in pts], 0.024, m, coll)
        elif pid == 'z':
            cu = bpy.data.curves.new('z-text', 'FONT')
            cu.body = 'z'
            cu.size = 0.36
            cu.extrude = 0.03
            cu.bevel_depth = 0.014
            cu.align_x = 'CENTER'
            cu.align_y = 'CENTER'
            t = bpy.data.objects.new('z-text', cu)
            coll.objects.link(t)
            t.data.materials.append(glow(c['z'], 0.25))
            t.location = at
            t.rotation_euler = (math.radians(90.0 - CAM_PITCH), 0.0, 0.0)
        elif pid == 'sparkle':
            o = flat_shape('sparkle', sparkle_outline(0.17, 0.05), 0.05, glow(c['sparkle'], 0.6, 0.35), coll)
            o.location = at
            o.rotation_euler = (math.radians(-CAM_PITCH), 0.0, 0.0)
        else:
            o = flat_shape('heart', heart_outline(0.15), 0.07, glow(c['heart'], 0.3, 0.4), coll, bevel=0.45)
            o.location = at
            o.rotation_euler = (math.radians(-CAM_PITCH), 0.0, 0.0)
        k = PARTICLE_SCALE.get(pid, 1.0)
        for o in coll.all_objects:
            if o.parent is None:
                o.location = at + (o.location - at) * k
                o.scale = o.scale * k
        no_shadow(list(coll.all_objects))


# --- the layout -----------------------------------------------------------------------------------------------------

def build_layout(patients, layout):
    pts = []
    for aid, p in patients.items():
        pts += p['body'].pts
        pts += p.get('tilt_pts', [])
        for ov in OVERLAYS:
            pts += world_pts(p['frames'][ov])
    # The exam spot's mat, its front half (the patients stand over it).
    for k in range(24):
        a = 2 * math.pi * k / 24
        pts.append(Vector((MAT_R * 0.7 * math.cos(a), MAT_R * 0.7 * math.sin(a), 0.03)))
    hull_object('hit.patient', [tuple(p) for p in pts], layout)
    report('hit.patient', pts)
    add_empty('anchor.patient', (0.0, 0.0, 0.0), layout)
    add_empty('anchor.door', (wx(DOOR_PX_X), 0.0, 0.0), layout)
    log(f'anchor.patient {SCREEN.project((0.0, 0.0, 0.0))} anchor.door {SCREEN.project((wx(DOOR_PX_X), 0.0, 0.0))}')
    for aid, p in patients.items():
        for spot, at in p['spots'].items():
            add_empty(f'anchor.{spot}-{aid}', tuple(at), layout)


def main():
    global DESIGN, SCREEN
    args = parse_args('build_pet_clinic', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    c = dict(params['art']['petClinic'])
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(IDLE_FRAME)
    setup_camera(scene)
    bpy.context.view_layer.update()
    SCREEN = Screen(scene)
    plate = bpy.data.collections.new('clinic-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_plate(c, plate)
    build_tools(c, sprites)
    patients = {}
    for aid in pens.ANIMALS:
        patients[aid] = build_patient(aid, c, sprites)
    build_particles(c, sprites)
    scene.frame_set(IDLE_FRAME)
    bpy.context.view_layer.update()
    build_layout(patients, layout)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    log(f'saved {args["out"]}')


if __name__ == '__main__':
    main()
