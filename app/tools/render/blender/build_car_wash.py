# Builds art/car-wash.blend (Rửa xe, spec-rua-xe, 2026-10-30) from the vendored island art/src/map-v3.blend (only
# its render settings, world and Sun are kept).
#
# Run by `npm run art:build -- car-wash` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_car_wash.py -- \
#     --out <tmp>/car-wash.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens and content): colours, art.carWash, carWash (vehicles, dirt kinds, spots
# per car, the sizes), design size, the interactive rect.
#
# One plate, 2048×1536, seen through an ORTHOGRAPHIC camera tilted CAM_PITCH degrees down (a shift along world x is a
# shift in design px): a sunny car-wash bay — sky, a cream back wall with a blue stripe and tiles, a pink arch with two
# blue roller brushes and a bubble sign, a light tiled floor with a drain under the car and a puddle at the right. The
# hose (a yellow reel with a green hose and a spray gun) hangs on the wall at the left.
# Sprites:
#   - car-<vehicle>: the Kenney Car Kit model (CC0) joined into one mesh, merged and bevelled a little, smooth shaded,
#     its texture kept with a softer (rougher) finish; turned three-quarter to face screen right; every car stands on
#     the same rest spot (anchor.car). States: clean [1], lights [2] (two glowing headlight discs scaled in);
#   - dirt-<vehicle>: one `state.dirt-<vehicle>-<dirt>-<n>` child per dirt kind and spot (bhc_state `<dirt>-<n>`), the
#     dirt decal on the car's visible side, rendered with the car as a holdout (its edges follow the body);
#   - hose, foam (a, b, c), drop, sparkle, bubble, duck (Tiny Treats Bubbly Bathroom `ducky`), shadow (a soft disc the
#     runtime draws under the moving car, at low alpha) and rainbow (over the puddle, drawn where it was rendered).
# Layout: hit.car-<vehicle> (the hull of each car at rest), anchors car (the cars' ground pivot), nozzle (the spray
# gun's tip), dirt-<vehicle>-<n>, top-<vehicle> (the roof's top centre), front-<vehicle> (the front bumper).
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
from cute import blob, import_joined, lathe, mat, rbox, rod, rounded_profile, soften_scene, torus, tt_model  # noqa: E402
from common import add_empty, eval_world_verts, hex_to_linear, hull_object, key_constant, move_to, parse_args, principled  # noqa: E402
from outfit import flat_shape, star_loop  # noqa: E402

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
CAR_KIT = os.path.join(ASSETS, 'kenney', 'kenney_car-kit', 'Models', 'GLB format')
RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main

# --- the camera: orthographic, looking along +y, tilted down --------------------------------------------------------
ORTHO_PX_PER_M = 100.0
CAM_PITCH = 20.0
CAM_DISTANCE = 60.0
CAR_PX = (520.0, 616.0)  # design px: the cars' ground pivot (world (0, 0, 0))

# --- the bay (design px / metres) -----------------------------------------------------------------------------------
WALL_Y = 3.4  # the back wall's depth
WALL_TOP_PX = 150.0  # the wall's top edge on screen (the sky above)
SKY_Y = 12.0
ARCH_Y = 1.9  # the arch's depth (behind the car)
ARCH_X = 2.7  # its posts at ± this (m)
ARCH_H = 3.1  # its beam's height
FLOOR_TILE = 0.9
SEED = 17

# --- the cars -------------------------------------------------------------------------------------------------------
VEHICLE_FILES = {'firetruck': 'firetruck', 'police': 'police', 'ambulance': 'ambulance', 'taxi': 'taxi', 'garbage-truck': 'garbage-truck', 'tractor': 'tractor'}
# Each car's drawn width (design px; its hull must be ≥ carMinPx wide).
CAR_WIDTH_PX = {'firetruck': 450.0, 'police': 420.0, 'ambulance': 440.0, 'taxi': 410.0, 'garbage-truck': 450.0, 'tractor': 360.0}
CAR_YAW = 64.0  # degrees: the model's front (−y) turned to screen right, a little toward the camera
BEVEL_M = 0.028  # the soft edge (world m, after scaling)
CAR_ROUGHNESS = 0.55
HEADLIGHT = {  # per car: (height share of the body, side share of the half width, radius m)
    'firetruck': (0.32, 0.6, 0.14), 'police': (0.37, 0.6, 0.13), 'ambulance': (0.32, 0.6, 0.14),
    'taxi': (0.37, 0.6, 0.13), 'garbage-truck': (0.32, 0.6, 0.14), 'tractor': (0.62, 0.42, 0.12),
}
STATES = {'clean': [1], 'lights': [2]}
DIRT_KINDS = ('mud', 'leaves', 'cream', 'dust')  # content/games/car-wash.ts DIRT_IDS (checked against params in main)

# --- the dirt spots -------------------------------------------------------------------------------------------------
SPOT_COLS = (0.2, 0.5, 0.8)  # shares of the car's drawn width
SPOT_ROWS = (0.42, 0.72)  # shares of its drawn height from the top
DIRT_PX = 62.0  # one spot's size (design px)

# --- the hose and the particles (design px) -------------------------------------------------------------------------
HOSE_PX = (118.0, 430.0)  # the hose's drawn centre
HOSE_LONGEST_PX = 170.0
FOAM_PX = 66.0
PARTICLE_PX = {'drop': 22.0, 'sparkle': 44.0, 'bubble': 64.0, 'duck': 70.0}
SHADOW_PX = 470.0
PUDDLE_PX = (880.0, 648.0)
RAINBOW_RADIUS = 0.95  # m: the outer band

VIEW_TOWARD = None  # set in setup_camera: the unit vector from the scene toward the camera


def fail(msg):
    raise RuntimeError(f'build_car_wash: {msg}')


def log(msg):
    print(f'build_car_wash: {msg}')


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
    """The camera target so that the ground pivot (0, 0, 0) projects to CAR_PX."""
    global TX, TZ, VIEW_TOWARD
    TX = -(CAR_PX[0] - DESIGN[0] / 2) / ORTHO_PX_PER_M
    TZ = (CAR_PX[1] - DESIGN[1] / 2) / ORTHO_PX_PER_M / math.cos(P)
    data = bpy.data.cameras.new('CamCarWash')
    data.type = 'ORTHO'
    data.ortho_scale = DESIGN[0] / ORTHO_PX_PER_M
    data.clip_start = 0.1
    data.clip_end = 400.0
    cam = bpy.data.objects.new('CamCarWash', data)
    scene.collection.objects.link(cam)
    cam.location = Vector((TX, 0.0, TZ)) - VIEW * CAM_DISTANCE
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = VIEW.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    VIEW_TOWARD = -VIEW
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


def emit_mat(name, hex_colour, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = hex_to_linear(hex_colour)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


def no_shadow(objs):
    for o in objs:
        o.visible_shadow = False


# --- the plate ------------------------------------------------------------------------------------------------------

def build_bay(c, plate):
    rnd = random.Random(SEED)
    front_y = gy(DESIGN[1] + 60)
    # The floor: light tiles with grout lines.
    rbox('floor', (30.0, WALL_Y - front_y + 1.0, 0.4), 0.05, mat(c['floor'], 0.75), plate, None, (TX, (WALL_Y + front_y) / 2, -0.2))
    grout = mat(c['floorGrout'], 0.8)
    x = TX - 12.0
    k = 0
    while x < TX + 12.0:
        rbox(f'grout-x-{k}', (0.035, WALL_Y - front_y, 0.01), 0.004, grout, plate, None, (x, (WALL_Y + front_y) / 2, 0.0))
        x += FLOOR_TILE
        k += 1
    y = WALL_Y - FLOOR_TILE
    k = 0
    while y > front_y:
        rbox(f'grout-y-{k}', (24.0, 0.035, 0.01), 0.004, grout, plate, None, (TX, y, 0.0))
        y -= FLOOR_TILE
        k += 1
    # The drain under the car's rest spot and a soft wet patch.
    rbox('drain', (1.5, 0.5, 0.02), 0.08, mat(c['drain'], 0.6), plate, None, (0.0, 0.25, 0.005))
    for j in range(7):
        rbox(f'drain-slot-{j}', (0.06, 0.36, 0.025), 0.02, mat(c['floorGrout'], 0.7), plate, None, (-0.6 + 0.2 * j, 0.25, 0.01))
    # The puddle at the right (the rainbow surprise rises over it).
    py = gy(PUDDLE_PX[1])
    for j, (dx, dy, rx, ry) in enumerate([(0.0, 0.0, 0.85, 0.45), (0.55, 0.12, 0.4, 0.28), (-0.5, -0.08, 0.35, 0.22)]):
        b = blob(f'puddle-{j}', mat(c['puddle'], 0.08), plate, None, (wx(PUDDLE_PX[0]) + dx, py + dy, 0.005), (rx, ry, 0.012), seg=(40, 8))
        b.visible_shadow = False
    # The back wall: cream, a tile band with a blue stripe at the bottom, the sky above.
    wall_top = wz(WALL_TOP_PX, WALL_Y)
    rbox('wall', (30.0, 0.3, wall_top), 0.04, mat(c['wall'], 0.8), plate, None, (TX, WALL_Y + 0.15, wall_top / 2))
    rbox('wall-tiles', (30.0, 0.05, 1.1), 0.02, mat(c['wallTile'], 0.6), plate, None, (TX, WALL_Y - 0.02, 0.55))
    rbox('wall-stripe', (30.0, 0.08, 0.22), 0.04, mat(c['wallStripe'], 0.5), plate, None, (TX, WALL_Y - 0.05, 1.2))
    rbox('wall-cap', (30.0, 0.4, 0.18), 0.06, mat(c['wallStripe'], 0.5), plate, None, (TX, WALL_Y + 0.1, wall_top))
    sky_top = wz(-40, SKY_Y)
    sky = rbox('sky', (40.0, 0.2, sky_top + 4.0), 0.02, emit_mat('carwash-sky', c['sky']), plate, None, (TX, SKY_Y, (sky_top - 4.0) / 2))
    sky.visible_shadow = False
    white = mat(c['sign'], 0.9)
    for k, (sx, sy, s) in enumerate([(200, 70, 1.0), (620, 50, 1.2), (930, 95, 0.8)]):
        cx, cz = wx(sx), wz(sy, SKY_Y - 0.6)
        for j, (dx, dz, r) in enumerate([(-0.55, 0.0, 0.42), (0.0, 0.18, 0.58), (0.55, 0.02, 0.45)]):
            b = blob(f'cloud-{k}-{j}', white, plate, None, (cx + dx * s, SKY_Y - 0.6, cz + dz * s), (r * s, 0.25, r * s * 0.85), seg=(24, 12))
            b.visible_shadow = False
    # The arch: two pink posts with blue roller brushes, a beam with a bubble sign.
    arch, arch_dark = mat(c['arch'], 0.45), mat(c['archDark'], 0.45)
    brush, brush_dark = mat(c['brush'], 0.7), mat(c['brushDark'], 0.7)
    for sx in (-1, 1):
        x = sx * ARCH_X
        rbox(f'arch-post-{sx}', (0.4, 0.4, ARCH_H), 0.12, arch, plate, None, (x, ARCH_Y, ARCH_H / 2))
        rbox(f'arch-foot-{sx}', (0.6, 0.6, 0.18), 0.08, arch_dark, plate, None, (x, ARCH_Y, 0.09))
        bx = x - sx * 0.62
        lathe(f'brush-{sx}', rounded_profile(0.36, 0.25, ARCH_H - 0.35, 0.4), brush, plate, None, (bx, ARCH_Y, 0.0))
        for j in range(7):
            torus(f'brush-ring-{sx}-{j}', 0.37, 0.035, brush_dark, plate, None, (bx, ARCH_Y, 0.55 + 0.33 * j))
        rod(f'brush-axle-{sx}', (bx, ARCH_Y, ARCH_H - 0.4), (bx, ARCH_Y, ARCH_H), 0.06, arch_dark, plate, None)
    beam = rbox('arch-beam', (2 * ARCH_X + 0.6, 0.45, 0.5), 0.15, arch, plate, None, (0.0, ARCH_Y, ARCH_H + 0.2))
    beam.visible_shadow = False
    for o in plate.objects:
        if o.name.startswith(('arch-post', 'brush')):
            o.visible_shadow = False
    for sx in (-1, 1):
        b = blob(f'arch-floor-shadow-{sx}', mat(c['floorGrout'], 0.9), plate, None, (sx * ARCH_X - sx * 0.3, ARCH_Y - 0.1, 0.004), (0.9, 0.45, 0.01), seg=(32, 6))
        b.visible_shadow = False
    sign = rbox('arch-sign', (2.2, 0.12, 0.8), 0.3, white, plate, None, (0.0, ARCH_Y - 0.25, ARCH_H + 0.62))
    # Bubbles on the sign (no words: a toy sign).
    bubble = mat(c['wallStripe'], 0.25)
    for j, (dx, dz, r) in enumerate([(-0.6, -0.05, 0.2), (-0.2, 0.08, 0.26), (0.25, -0.02, 0.22), (0.62, 0.1, 0.16)]):
        blob(f'sign-bubble-{j}', bubble, plate, None, (dx, ARCH_Y - 0.33, ARCH_H + 0.62 + dz), (r, 0.05, r), seg=(24, 10))
    sign.visible_shadow = False
    # A few pebbles of foam on the floor by the brushes (the bay is used).
    for j in range(8):
        x = rnd.uniform(-3.4, 3.4)
        y = rnd.uniform(0.9, 1.6)
        if abs(x) < 2.2:
            continue
        blob(f'floor-foam-{j}', mat(c['foam'], 0.6), plate, None, (x, y, 0.03), (0.12, 0.1, 0.06), seg=(16, 8))


# --- the hose -------------------------------------------------------------------------------------------------------

def build_hose(sprites, c, layout):
    coll = sprite(sprites, 'hose', movable=1)
    root = billboard('hose-root', coll)
    reel, reel_dark = mat(c['reel'], 0.45), mat(c['reelDark'], 0.45)
    hose, hose_dark = mat(c['hose'], 0.4), mat(c['hoseDark'], 0.4)
    nozzle, nozzle_dark = mat(c['nozzle'], 0.35), mat(c['nozzleDark'], 0.35)
    # The reel: a back plate, a drum with the coiled hose, a hub.
    rbox('hose-plate', (0.5, 0.06, 0.62), 0.08, reel_dark, coll, root, (0.0, 0.12, 0.42))
    torus('hose-rim-back', 0.42, 0.06, reel, coll, root, (0.0, 0.03, 0.45), (90.0, 0.0, 0.0))
    for k in range(3):
        torus(f'hose-coil-{k}', 0.34 - 0.06 * k, 0.07, hose if k % 2 == 0 else hose_dark, coll, root, (0.0, -0.04 - 0.02 * k, 0.45), (90.0, 0.0, 0.0))
    blob('hose-hub', reel, coll, root, (0.0, -0.12, 0.45), (0.12, 0.06, 0.12), seg=(24, 10))
    # The hose hangs from the reel to the spray gun below it.
    rod('hose-hang-0', (0.28, -0.05, 0.25), (0.34, -0.08, -0.1), 0.06, hose, coll, root)
    rod('hose-hang-1', (0.34, -0.08, -0.1), (0.18, -0.1, -0.38), 0.06, hose, coll, root)
    # The spray gun: a grip, a trigger, a barrel pointing right.
    rbox('gun-grip', (0.16, 0.14, 0.3), 0.06, nozzle_dark, coll, root, (0.12, -0.12, -0.5), (0.0, -20.0, 0.0))
    rbox('gun-body', (0.42, 0.16, 0.16), 0.07, nozzle, coll, root, (0.28, -0.12, -0.36))
    rod('gun-barrel', (0.45, -0.12, -0.36), (0.72, -0.12, -0.36), 0.045, nozzle_dark, coll, root)
    blob('gun-tip', nozzle, coll, root, (0.75, -0.12, -0.36), (0.06, 0.07, 0.07), seg=(20, 10))
    rbox('gun-trigger', (0.05, 0.08, 0.12), 0.02, reel_dark, coll, root, (0.24, -0.12, -0.48))
    root.location = pt(HOSE_PX[0], HOSE_PX[1], WALL_Y - 0.4)
    r = fit(root, HOSE_LONGEST_PX, HOSE_PX)
    bpy.context.view_layer.update()
    tip = root.matrix_world @ Vector((0.8, -0.12, -0.36))
    add_empty('anchor.nozzle', tip, layout)
    log(f'hose ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}x{r[3] - r[1]:.0f}; anchor.nozzle {fmt_px(SCREEN.project(tip))}')
    return r


# --- the cars -------------------------------------------------------------------------------------------------------

def import_car(path, name, coll):
    """A Kenney car as ONE mesh (transforms applied, doubles merged), origin at the world origin."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    if not meshes:
        fail(f'{path} has no mesh')
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    with bpy.context.temp_override(active_object=meshes[0], selected_editable_objects=meshes, object=meshes[0]):
        if len(meshes) > 1:
            bpy.ops.object.join()
    obj = meshes[0]
    obj.data.transform(obj.matrix_world)
    obj.matrix_world.identity()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(obj.data)
    bm.free()
    obj.name = name
    obj.data.name = name
    move_to(obj, coll)
    # A softer toy finish: the Kenney palette texture kept, rougher, less specular.
    for m in obj.data.materials:
        if m is None or not m.use_nodes:
            continue
        b = principled(m)
        b.inputs['Roughness'].default_value = CAR_ROUGHNESS
        for key in ('Specular IOR Level', 'Specular'):
            if key in b.inputs:
                b.inputs[key].default_value = 0.3
                break
        if 'Metallic' in b.inputs:
            b.inputs['Metallic'].default_value = 0.0
    return obj


def bake(obj, matrix):
    obj.data.transform(matrix)
    obj.data.update()


def model_bounds(obj):
    vs = [v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi


def place_car(obj, width_px):
    """Turns the car (front to screen right), scales it to `width_px` drawn wide, stands it on the rest spot."""
    lo, hi = model_bounds(obj)
    bake(obj, Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))))
    bake(obj, Matrix.Rotation(math.radians(CAR_YAW), 4, 'Z'))
    for _ in range(3):
        r = SCREEN.rect([v.co for v in obj.data.vertices])
        bake(obj, Matrix.Scale(width_px / (r[2] - r[0]), 4))
    r = SCREEN.rect([v.co for v in obj.data.vertices])
    bake(obj, Matrix.Translation(Vector(((CAR_PX[0] - (r[0] + r[2]) / 2) / ORTHO_PX_PER_M, 0.0, 0.0))))
    lo, hi = model_bounds(obj)
    bake(obj, Matrix.Translation(Vector((0.0, 0.0, -lo.z))))


def model_frame(yaw_deg):
    """The car's own axes after placing: forward (its front), left, up (world)."""
    a = math.radians(yaw_deg)
    # The model's front was −y; turned by yaw about z.
    fwd = Vector((math.sin(a), -math.cos(a), 0.0))
    left = Vector((math.cos(a), math.sin(a), 0.0))
    return fwd, left, Vector((0.0, 0.0, 1.0))


def hit_from_camera(obj, sx, sy):
    """The car surface point drawn at design (sx, sy) (a ray along the view), with its normal, or None."""
    origin = pt(sx, sy, -30.0)
    ok, loc, normal, _ = obj.ray_cast(origin, VIEW, distance=200.0)
    if not ok:
        return None
    return loc, normal


def build_car(v, path, c, sprites, layout):
    coll = sprite(sprites, f'car-{v}', states=json.dumps(STATES, separators=(',', ':')), movable=1)
    obj = import_car(path, f'car-{v}', coll)
    place_car(obj, CAR_WIDTH_PX[v])
    bpy.context.view_layer.update()
    # Headlights: two glowing discs on the front face, scaled in only in the `lights` frame.
    fwd, left, up = model_frame(CAR_YAW)
    lo, hi = model_bounds(obj)
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0.0))
    hz, side, rad = HEADLIGHT[v]
    half = 0.0
    for p in obj.data.vertices:
        half = max(half, abs((p.co - centre).dot(left)))
    glow = emit_mat(f'headlight-{v}', c['headlight'], 2.2)
    halo = emit_mat(f'headlight-halo-{v}', c['sparkle'], 1.2)
    lights = []
    for s in (-1, 1):
        start = centre + left * (s * side * half) + up * (hz * hi.z) + fwd * 10.0
        ok, loc, normal, _ = obj.ray_cast(start, -fwd, distance=30.0)
        if not ok:
            fail(f'car {v}: no front face for a headlight')
        d = blob(f'car-{v}-light-{s}', glow, coll, None, loc + normal * 0.02, (rad, rad, rad), seg=(20, 10))
        d.rotation_mode = 'QUATERNION'
        X, Y, Z = basis(left, normal)
        d.rotation_quaternion = Matrix((X, Y, Z)).transposed().to_quaternion()
        d.scale = (1.0, 1.0, 0.35)
        d['cute'] = 1
        lights.append(d)
        ring = blob(f'car-{v}-halo-{s}', halo, coll, None, loc + normal * 0.01, (rad * 1.7, rad * 1.7, rad * 1.7), seg=(24, 10))
        ring.rotation_mode = 'QUATERNION'
        ring.rotation_quaternion = d.rotation_quaternion
        ring['cute'] = 1
        lights.append(ring)
    for f in (1, 2):
        for d in lights:
            d.scale = (1.0, 1.0, 0.3) if f == 2 else (0.0001, 0.0001, 0.0001)
            d.keyframe_insert('scale', frame=f)
    for d in lights:
        key_constant(d)
    bpy.context.scene.frame_set(1)
    mod = obj.modifiers.new('soft-edge', 'BEVEL')
    mod.width = BEVEL_M
    mod.segments = 3
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(40.0)
    pts = world_pts([obj])
    r = report(f'car-{v}', pts)
    hull_object(f'hit.car-{v}', pts, layout)
    if r[2] - r[0] < 300:
        fail(f'car {v} is only {r[2] - r[0]:.0f} px wide')
    # The roof's top centre and the front bumper.
    top = max(pts, key=lambda p: SCREEN.project(p)[1] * -1)
    roof = pt((r[0] + r[2]) / 2, r[1] + 6.0, top.y)
    add_empty(f'anchor.top-{v}', roof, layout)
    ok, front, _n, _ = obj.ray_cast(centre + up * (0.35 * hi.z) + fwd * 10.0, -fwd, distance=30.0)
    if not ok:
        fail(f'car {v}: no front bumper')
    add_empty(f'anchor.front-{v}', front, layout)
    log(f'anchor.top-{v} {fmt_px(SCREEN.project(roof))}, anchor.front-{v} {fmt_px(SCREEN.project(front))}')
    return obj, r


# --- the dirt -------------------------------------------------------------------------------------------------------

def dirt_spots(v, obj, r):
    """DIRT_SPOTS points on the car's visible side (a 3 × 2 grid over its drawn rect, nudged onto the body)."""
    spots = []
    w, h = r[2] - r[0], r[3] - r[1]
    for fy in SPOT_ROWS:
        for fx in SPOT_COLS:
            best = None
            for dx, dy in [(0, 0), (0.05, 0), (-0.05, 0), (0, 0.06), (0, -0.06), (0.08, 0.06), (-0.08, 0.06)]:
                sx, sy = r[0] + (fx + dx) * w, r[1] + (fy + dy) * h
                hit = hit_from_camera(obj, sx, sy)
                if hit and hit[1].dot(VIEW_TOWARD) > 0.25:
                    best = hit
                    break
            if not best:
                fail(f'car {v}: no body under the dirt spot ({fx}, {fy})')
            spots.append(best)
    return spots


def dirt_decal(kind, c, coll, loc, normal, n):
    """One dirt spot of `kind` on the surface at `loc` (facing `normal`), about DIRT_PX across."""
    # X: across the surface (horizontal), Y: up the surface, Z: out of it.
    across = Vector((0.0, 0.0, 1.0)).cross(normal)
    X, Y, Z = basis(across if across.length > 1e-3 else Vector((1.0, 0.0, 0.0)), normal)
    pivot = empty(f'{coll.name}-pivot', coll, None, loc + normal * 0.012)
    pivot.rotation_mode = 'QUATERNION'
    pivot.rotation_quaternion = Matrix((X, Y, Z)).transposed().to_quaternion()
    s = DIRT_PX / ORTHO_PX_PER_M / 2.0  # the spot's radius (m)
    rnd = random.Random(SEED * 100 + DIRT_KINDS.index(kind) * 10 + n)
    name = coll.name
    if kind == 'mud':
        mud, dark = mat(c['mud'], 0.55), mat(c['mudDark'], 0.6)

        def splat(d):
            phi = math.atan2(d.y, d.x)
            k = 1.0 + 0.16 * math.sin(5 * phi + n) + 0.08 * math.sin(9 * phi)
            return Vector((d.x * k, d.y * k, d.z))
        blob(f'{name}-mud', mud, coll, pivot, (0.0, 0.0, 0.0), (s * 0.9, s * 0.72, 0.035), shape=splat, seg=(40, 10))
        blob(f'{name}-mud-dark', dark, coll, pivot, (s * 0.12, -s * 0.05, 0.01), (s * 0.45, s * 0.35, 0.04), shape=splat, seg=(32, 10))
        for j in range(4):
            a = 2 * math.pi * j / 4 + rnd.uniform(-0.4, 0.4)
            rr = s * rnd.uniform(1.05, 1.25)
            blob(f'{name}-drop-{j}', mud, coll, pivot, (math.cos(a) * rr, math.sin(a) * rr * 0.8, 0.0), (s * 0.13, s * 0.13, 0.03), seg=(16, 8))
    elif kind == 'leaves':
        greens = [mat(c['leaf'], 0.5), mat(c['leafAutumn'], 0.5), mat(c['leafRed'], 0.5)]
        vein = mat(c['mudDark'], 0.6)

        def lens(d):
            return Vector((d.x, d.y * math.sqrt(max(0.0, 1.0 - d.x * d.x)) * 1.6, d.z))
        for j, (ang, dx, dy, k) in enumerate([(25.0, -0.25, 0.1, 1.0), (-35.0, 0.3, -0.1, 0.85)]):
            m = greens[(j + n) % 3]
            leaf_pivot = empty(f'{name}-leaf-pivot-{j}', coll, pivot, (dx * s, dy * s, 0.0))
            leaf_pivot.rotation_euler = (0.0, 0.0, math.radians(ang + rnd.uniform(-15, 15)))
            blob(f'{name}-leaf-{j}', m, coll, leaf_pivot, (0.0, 0.0, 0.0), (s * 0.85 * k, s * 0.42 * k, 0.03), shape=lens, seg=(32, 10))
            rod(f'{name}-vein-{j}', (-s * 0.75 * k, 0.0, 0.02), (s * 0.95 * k, 0.0, 0.02), 0.012, vein, coll, leaf_pivot)
    elif kind == 'cream':
        pink, mint = mat(c['cream'], 0.35), mat(c['creamMint'], 0.35)
        cone = mat(c['creamCone'], 0.6)
        m = pink if n % 2 == 0 else mint
        blob(f'{name}-cream', m, coll, pivot, (0.0, s * 0.2, 0.0), (s * 0.7, s * 0.5, 0.045), seg=(32, 12))
        for j, (dx, length) in enumerate([(-0.35, 0.9), (0.1, 1.25), (0.42, 0.7)]):
            x = dx * s
            blob(f'{name}-drip-{j}', m, coll, pivot, (x, s * 0.2 - length * s * 0.5, 0.0), (s * 0.12, length * s * 0.5, 0.04), seg=(16, 10))
            blob(f'{name}-drip-end-{j}', m, coll, pivot, (x, s * 0.2 - length * s, 0.0), (s * 0.17, s * 0.17, 0.05), seg=(16, 10))
        blob(f'{name}-sprinkle', cone, coll, pivot, (s * 0.25, s * 0.38, 0.03), (s * 0.12, s * 0.08, 0.03), seg=(16, 8))
    elif kind == 'dust':
        dust, dark = mat(c['dust'], 1.0), mat(c['dustDark'], 1.0)
        for j in range(6):
            a = 2 * math.pi * j / 6 + rnd.uniform(-0.3, 0.3)
            rr = s * (0.0 if j == 0 else rnd.uniform(0.35, 0.65))
            k = rnd.uniform(0.32, 0.45)
            blob(f'{name}-dust-{j}', dust if j % 2 == 0 else dark, coll, pivot, (math.cos(a) * rr, math.sin(a) * rr, 0.0), (s * k, s * k * 0.85, 0.03), seg=(20, 8))
    else:
        fail(f'unknown dirt "{kind}"')


def build_dirt(v, obj, r, c, dirts, sprites, layout):
    spots = dirt_spots(v, obj, r)
    group = sprite(sprites, f'dirt-{v}', movable=1, bhc_holdout_sprites=json.dumps([f'car-{v}']))
    for n, (loc, normal) in enumerate(spots):
        add_empty(f'anchor.dirt-{v}-{n}', loc, layout)
        for kind in dirts:
            child = bpy.data.collections.new(f'state.dirt-{v}-{kind}-{n}')
            child['bhc_state'] = f'{kind}-{n}'
            group.children.link(child)
            dirt_decal(kind, c, child, loc, normal, n)
    log(f'dirt-{v}: ' + ', '.join(fmt_px(SCREEN.project(loc)) for loc, _ in spots))


# --- foam, particles, surprises -------------------------------------------------------------------------------------

def build_foam(sprites, c):
    group = sprite(sprites, 'foam', movable=1)
    white, shade = mat(c['foam'], 0.55), mat(c['foamShade'], 0.55)
    layouts = {
        'a': [(0.0, 0.0, 0.42), (-0.38, -0.12, 0.3), (0.38, -0.1, 0.32), (-0.12, 0.3, 0.28), (0.22, 0.28, 0.24)],
        'b': [(0.0, 0.05, 0.38), (-0.32, 0.15, 0.32), (0.34, 0.12, 0.27), (-0.2, -0.28, 0.26), (0.2, -0.26, 0.3), (0.45, -0.2, 0.18)],
        'c': [(0.0, 0.0, 0.36), (-0.36, 0.0, 0.3), (0.36, 0.02, 0.3), (0.0, 0.34, 0.28), (0.0, -0.32, 0.26), (-0.28, 0.3, 0.16), (0.3, -0.3, 0.17)],
    }
    x = 120.0
    for k, (state, bubbles) in enumerate(layouts.items()):
        child = bpy.data.collections.new(f'state.foam-{state}')
        child['bhc_state'] = state
        group.children.link(child)
        root = billboard(f'foam-{state}-root', child)
        for j, (dx, dz, rr) in enumerate(bubbles):
            blob(f'foam-{state}-{j}', white if j % 3 else shade, child, root, (dx, -0.05 * j, dz), (rr, rr * 0.9, rr), seg=(28, 14))
            blob(f'foam-{state}-shine-{j}', mat(c['bubble'], 0.2), child, root, (dx - rr * 0.35, -rr * 0.85 - 0.05 * j, dz + rr * 0.35), (rr * 0.18, 0.02, rr * 0.13), seg=(12, 8))
        root.location = pt(x, 110.0, -4.0)
        fit(root, FOAM_PX, (x, 110.0))
        x += 90.0


def drop_shape(d):
    """A teardrop, its point up."""
    t = (d.z + 1.0) / 2.0
    k = 1.0 - 0.85 * t ** 2.2
    return Vector((d.x * k, d.y * k, d.z * 1.25))


def build_particles(sprites, c):
    xs = iter([420.0, 500.0, 590.0, 690.0])
    # The water drop.
    coll = sprite(sprites, 'drop', movable=1)
    root = billboard('drop-root', coll)
    blob('drop-body', mat(c['drop'], 0.15), coll, root, (0.0, 0.0, 0.0), (0.5, 0.5, 0.5), shape=drop_shape, seg=(32, 16))
    blob('drop-shine', mat(c['foam'], 0.2), coll, root, (-0.17, -0.42, -0.05), (0.09, 0.05, 0.14), seg=(16, 8))
    p = (next(xs), 110.0)
    root.location = pt(p[0], p[1], -4.0)
    fit(root, PARTICLE_PX['drop'], p)
    # The sparkle: a puffy four-point star.
    coll = sprite(sprites, 'sparkle', movable=1)
    root = billboard('sparkle-root', coll)
    flat_shape('sparkle-body', star_loop(0.5, 0.15, points=4), 0.14, mat(c['sparkle'], 0.3), coll, root)
    blob('sparkle-shine', mat(c['foam'], 0.2), coll, root, (-0.06, -0.09, 0.12), (0.07, 0.02, 0.05), seg=(12, 8))
    p = (next(xs), 110.0)
    root.location = pt(p[0], p[1], -4.0)
    fit(root, PARTICLE_PX['sparkle'], p)
    # The soap bubble: a pale sphere, a rim ring, two shines.
    coll = sprite(sprites, 'bubble', movable=1)
    root = billboard('bubble-root', coll)
    blob('bubble-body', mat(c['bubble'], 0.08), coll, root, (0.0, 0.0, 0.0), (0.5, 0.5, 0.5), seg=(40, 20))
    torus('bubble-rim', 0.47, 0.03, mat(c['wallStripe'], 0.2), coll, root, (0.0, -0.05, 0.0), (90.0, 0.0, 0.0))
    blob('bubble-shine', mat(c['foam'], 0.1), coll, root, (-0.2, -0.46, 0.2), (0.11, 0.03, 0.07), (0.0, 40.0, 0.0), seg=(16, 8))
    blob('bubble-shine-2', mat(c['foam'], 0.1), coll, root, (0.18, -0.47, -0.2), (0.05, 0.02, 0.04), seg=(12, 8))
    p = (next(xs), 110.0)
    root.location = pt(p[0], p[1], -4.0)
    fit(root, PARTICLE_PX['bubble'], p)
    # The rubber duck (Tiny Treats Bubbly Bathroom `ducky`).
    coll = sprite(sprites, 'duck', movable=1)
    root = empty('duck-root', coll)
    duck = import_joined(tt_model('ducky', 'Bubbly'), 'duck-model')
    move_to(duck, coll)
    duck.parent = root
    duck.rotation_euler = (0.0, 0.0, math.radians(-60.0))
    p = (next(xs), 110.0)
    root.location = pt(p[0], p[1], -4.0)
    fit(root, PARTICLE_PX['duck'], p)


def build_shadow(sprites, c):
    coll = sprite(sprites, 'shadow', movable=1)
    root = empty('shadow-root', coll)
    blob('shadow-disc', mat(c['drain'], 1.0), coll, root, (0.0, 0.0, 0.0), (1.0, 0.45, 0.01), seg=(48, 6))
    root.location = (0.0, 0.0, 0.0)
    r = SCREEN.rect(world_pts(meshes_of(root)))
    k = SHADOW_PX / (r[2] - r[0])
    root.scale = (k, k, k)
    report('shadow', world_pts(meshes_of(root)))


def build_rainbow(sprites, c):
    coll = sprite(sprites, 'rainbow', movable=1)
    root = billboard('rainbow-root', coll)
    bands = [c[f'rainbow{k}'] for k in range(1, 7)]
    minor = 0.05
    for k, colour in enumerate(bands):
        torus(f'rainbow-band-{k}', RAINBOW_RADIUS - minor - k * 2 * minor * 0.98, minor, mat(colour, 0.45), coll, root, (0.0, 0.0, 0.0), (90.0, 0.0, 0.0), arc=(0.0, 180.0))
    white = mat(c['sign'], 0.8)
    mid = RAINBOW_RADIUS - 6 * minor
    for sx in (-1, 1):
        for j, (dx, dz, r) in enumerate([(-0.14, 0.0, 0.13), (0.0, 0.05, 0.17), (0.14, 0.0, 0.13)]):
            blob(f'rainbow-cloud-{sx}-{j}', white, coll, root, (sx * mid + dx, -0.1, dz + 0.02), (r, 0.1, r * 0.85), seg=(24, 12))
    root.location = pt(PUDDLE_PX[0], PUDDLE_PX[1] - 12.0, gy(PUDDLE_PX[1]) - 0.3)
    report('rainbow', world_pts(meshes_of(root)))


def main():
    global DESIGN, SCREEN
    args = parse_args('build_car_wash', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    cw = params['carWash']
    if tuple(cw['dirts']) != DIRT_KINDS:
        fail(f'dirt kinds {cw["dirts"]} do not match DIRT_KINDS')
    for v in cw['vehicles']:
        if v not in VEHICLE_FILES:
            fail(f'no Kenney model for vehicle "{v}"')
    c = params['art']['carWash']
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(1)
    setup_camera(scene)
    bpy.context.view_layer.update()
    SCREEN = Screen(scene)
    plate = bpy.data.collections.new('car-wash-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_bay(c, plate)
    hose = build_hose(sprites, c, layout)
    add_empty('anchor.car', (0.0, 0.0, 0.0), layout)
    for v in cw['vehicles']:
        obj, r = build_car(v, os.path.join(CAR_KIT, f'{VEHICLE_FILES[v]}.glb'), c, sprites, layout)
        if r[0] - hose[2] < cw['gapPx']:
            log(f'WARNING: car {v} comes within {r[0] - hose[2]:.0f} px of the hose')
        build_dirt(v, obj, r, c, cw['dirts'], sprites, layout)
    build_foam(sprites, c)
    build_particles(sprites, c)
    build_shadow(sprites, c)
    build_rainbow(sprites, c)
    scene.frame_set(1)
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    log(f'saved {args["out"]}')


if __name__ == '__main__':
    main()
