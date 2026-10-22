# Builds art/shadow-match.blend (Hang tìm bóng, Stories 3.5, 3.6; 2026-10-22: no dinosaur, back to the real
# models, 25 items) from the vendored island art/src/map-v3.blend (only its render settings, world and Sun are kept).
#
# Run by `npm run art:build -- shadow-match` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_shadow_match.py -- \
#     --out <tmp>/shadow-match.blend --params <tmp>/params.json --items dog,cow,horse,…
# params.json (written by build.ts from Tokens and content): colours (hex), art (incl. art.shadowMatch),
# shadowMatch {itemPx, counts}, design size, renderScale, the interactive rect.
# --items: the content catalogue ids (SHAPE_ITEMS); an id without a row in ITEM_MODELS fails the build.
#
# Steps: remove the whole island (only its Sun, turned to light the cave from the front, and the lens of
# `CamGame2` are used); add camera `CamCave` (lens from `CamGame2`) looking level into a script-built rock cave
# that fills the frame (all in the plate collection `cave`). 2026-10-22 (spec-tim-bong-hinh-that-them-vat): the
# pre-restyle rock look is back, scaled up for the bigger shadows:
#   - a lit inner back wall (art.shadowMatch.caveInner, lit by emission so a shadow drawn on it keeps ≥ 5:1
#     against colors.shadowTarget on the real render), gently bowed at the sides, a sandy rock floor
#     (colors.caveMouth);
#   - low-poly rocks (displaced icospheres in colors.caveMouth, as the old cave mouth's arch) framing the top
#     edge and the top corners, and a few boulders on the floor in the bottom corners — never inside a
#     shadow's square or a hint ring's reach;
#   - a round pedestal at the bottom centre (art.shadowMatch.pedestal / pedestalTop; `anchor.pedestal-top` on
#     its top: every held item stands on it; `hit.pedestal` its tap area; `anchor.item-rest` the screen rules'
#     reference centre of a full-height held item).
# Every placement is given in design px (SHADOW_SPOTS, REST_PX, the rocks) and turned into world points by a
# ray from the camera, so the screen layout is exactly what the rules check.
# Each catalogue item (Quaternius animals and cutefish, Kenney car-kit vehicles and food-kit things; source
# colours kept) is posed by its ITEM_MODELS row — animals, fish and vehicles in side profile facing screen
# right, fruit and kitchen things upright at their typical angle — as its own sprite `item-<id>`
# (`silhouette`: the render step derives `item-<id>/shadow/00` from `item-<id>/color/00`,
# tools/render/ghost.ts › silhouetteFrame), fitted to shadowMatch.itemPx (so a horse and a strawberry get the
# same on-screen box). The layout objects go in a hidden `layout` collection; render size; soften; save.
# Every sprite collection here is `movable` (no baked shadow). Every constant is in Blender world units
# (metres) unless its name says otherwise.
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
from cute import lathe, rounded_profile, soften_scene  # noqa: E402
from common import add_empty, eval_world_verts, flat_material, force_opaque, hull_object, key_constant, move_to, parse_args, principled  # noqa: E402

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
LENS_FROM = 'CamGame2'
CAMERA = 'CamCave'
SUN = 'Sun'
SUN_DIRECTION = (0.35, 0.8, -0.65)  # where the light travels: into the cave, down, a little to the right
SUN_ENERGY = 1.4

GROUND_Z = 0.45  # the island's grass
FLOOR_Z = GROUND_Z + 0.02  # the cave floor, a little above the grass

# --- the camera: level, looking north into the cave (the town is behind it) ------------------------------------
CAM_LOCATION = (6.6, 3.4, 1.3)
CAM_TARGET = (6.6, 7.4, 1.42)  # tilted up a touch: the wall/floor seam sits low, under every shadow

# --- the back wall ---------------------------------------------------------------------------------------------
WALL_Y = 7.4  # the wall's centre plane
WALL_HALF_W = 4.2
WALL_TOP_Z = 4.6
WALL_BOW = 0.06  # the wall bows toward the camera by this × (x − centre)² at the sides
WALL_STEPS = (30, 16)  # coarse: the wall reads as cut rock (its vertices jittered by WALL_JITTER)
WALL_JITTER = (0.05, 0.07, 0.05)  # ± x, y (toward the camera), z per vertex (seeded), like the old stones' facets
WALL_SEED = 31
WALL_EMISSION = 0.3  # tuned with the measured-contrast rule (shadowTarget on the wall ≥ 5:1) without blowing the wall out to white
FLOOR_NEAR_Y = 2.0
FLOOR_EMISSION = 0.3
# hit.cave: the bright wall between the shadows (design px corners), never under a shadow or a ring.
CAVE_HIT_PX = [(440, 330), (584, 330), (584, 520), (440, 520)]  # bottom above the held item's hint ring (top ≈ 532)

# --- the shadow slots (design px; Hang tìm bóng 2026-10-22: the rows arc over the pedestal) ---------------------
# Each centre keeps shadowR (≈ itemPx / 2) inside the interactive rect and off the Hud keep-outs, ≥ 2·shadowR +
# gap from its row mates and ≥ shadowR + snapRadius × hintSnapScale + heldR from the pedestal
# (tools/layout/rules.ts › validateShadowMatch).
SHADOW_SPOTS = {
    2: [(225, 330), (799, 330)],
    3: [(160, 410), (512, 190), (864, 410)],
    4: [(140, 445), (372, 205), (652, 205), (884, 445)],
}

# --- the pedestal ----------------------------------------------------------------------------------------------
REST_PX = (512, 618)  # anchor.item-rest: the centre of a full-height held item on the pedestal (rules reference)
PEDESTAL_DIST = 2.45  # metres in front of the camera (along y)
PEDESTAL_TOP_PX = 666  # the screen y of the pedestal top's centre
PEDESTAL_R_PX = 80  # its radius on screen (design px)
PEDESTAL_ROUND = 0.35
PEDESTAL_SEG = 12  # a low-poly drum, like the rocks

# --- the rocks (design px centre, radius px, depth in front of the wall in metres, seed) --------------------------
# The old cave mouth's low-poly stones, around the top edge and the top corners only (never inside a shadow's
# square or a hint ring's reach), and a few boulders on the floor in the bottom corners.
FRAME_ROCKS = [
    (-30, 40, 130, 0.25, 1), (120, -30, 120, 0.3, 2), (265, -50, 105, 0.35, 3),
    (400, -62, 100, 0.4, 4), (530, -68, 100, 0.42, 5), (660, -62, 100, 0.4, 6),
    (800, -45, 112, 0.35, 7), (940, -20, 125, 0.3, 8), (1060, 60, 120, 0.25, 9),
    (20, 150, 100, 0.2, 10), (1010, 185, 95, 0.2, 11),
    (-40, 330, 70, 0.15, 12), (1065, 330, 70, 0.15, 13),
]
# (u, v, radius px, seed) — boulders standing on the floor
FLOOR_ROCKS = [(40, 668, 62, 21), (130, 690, 40, 22), (230, 672, 26, 23), (985, 668, 62, 24), (895, 692, 40, 25), (800, 674, 26, 26)]
STONE_SUBDIV = 2
STONE_JITTER = 0.18  # radial displacement ± this fraction of the radius
STONE_SQUASH_Y = 0.75  # stones are a little flatter front to back
ROCK_EMISSION = 0.45  # the rock never reads black, even on its shaded facets

# --- the items ------------------------------------------------------------------------------------------------
# id → (model under assets/, pose, action name suffix or None). pose: yaw (degrees; the world heading of the
# model's front, 0 = +x = screen right) and tilt (degrees; the top tipped toward the camera, after the yaw, so
# a pan shows its round face). Every id of the content catalogue must have a row.
ANIMALS = os.path.join('quaternius', 'animals')
FISH = os.path.join('quaternius', 'cutefish')
CARS = os.path.join('kenney', 'kenney_car-kit', 'Models', 'GLB format')
FOOD = os.path.join('kenney', 'kenney_food-kit', 'Models', 'GLB format')
SIDE = {'yaw': 0.0}
ITEM_MODELS = {
    'dog': (os.path.join(ANIMALS, 'ShibaInu.fbx'), SIDE, '|Idle'),
    'cow': (os.path.join(ANIMALS, 'Cow.fbx'), SIDE, '|Idle'),
    'horse': (os.path.join(ANIMALS, 'Horse.fbx'), SIDE, '|Idle'),
    # Story 3.6: two more quadrupeds for the same-group level (both files have `AnimalArmature|Idle`).
    'donkey': (os.path.join(ANIMALS, 'Donkey.fbx'), SIDE, '|Idle'),
    'stag': (os.path.join(ANIMALS, 'Stag.fbx'), SIDE, '|Idle'),
    'car': (os.path.join(CARS, 'sedan.glb'), SIDE, None),
    'truck': (os.path.join(CARS, 'truck.glb'), SIDE, None),
    'tractor': (os.path.join(CARS, 'tractor.glb'), SIDE, None),
    # 2026-10-22 (spec-tim-bong-hinh-that-them-vat): 17 more. Dropped under the spec's Fallback (each one's shadow
    # overlapped a group mate's above ui.shadowMaxIoU): bull (cow), taxi (car), ambulance (firetruck). The parent
    # dropped the shark the same day (it read as a generic grey fish).
    # The food-kit "cây kem" is ice-cream.glb (ice-cream-cne.glb is an empty cone) and "cái cốc" is cup.glb (mug.glb
    # is a wooden tankard): the toddler-familiar models of the same items.
    'fox': (os.path.join(ANIMALS, 'Fox.fbx'), SIDE, '|Idle'),
    'goldfish': (os.path.join(FISH, 'Goldfish.fbx'), SIDE, None),
    'puffer': (os.path.join(FISH, 'Puffer.fbx'), SIDE, None),
    'swordfish': (os.path.join(FISH, 'Swordfish.fbx'), SIDE, None),
    'police': (os.path.join(CARS, 'police.glb'), SIDE, None),
    'firetruck': (os.path.join(CARS, 'firetruck.glb'), SIDE, None),
    'garbage-truck': (os.path.join(CARS, 'garbage-truck.glb'), SIDE, None),
    'excavator': (os.path.join(CARS, 'tractor-shovel.glb'), SIDE, None),
    'apple': (os.path.join(FOOD, 'apple.glb'), {'yaw': 0.0, 'tilt': 10.0}, None),
    'banana': (os.path.join(FOOD, 'banana.glb'), {'yaw': 0.0}, None),
    'pineapple': (os.path.join(FOOD, 'pineapple.glb'), {'yaw': 0.0}, None),
    'pear': (os.path.join(FOOD, 'pear.glb'), {'yaw': 0.0, 'tilt': 10.0}, None),
    'strawberry': (os.path.join(FOOD, 'strawberry.glb'), {'yaw': 0.0, 'tilt': 10.0}, None),
    'carrot': (os.path.join(FOOD, 'carrot.glb'), {'yaw': 0.0}, None),
    'mug': (os.path.join(FOOD, 'cup.glb'), {'yaw': 0.0, 'tilt': 10.0}, None),
    'pan': (os.path.join(FOOD, 'frying-pan.glb'), {'yaw': 0.0, 'tilt': 40.0}, None),
    'ice-cream': (os.path.join(FOOD, 'ice-cream.glb'), {'yaw': 0.0, 'tilt': 10.0}, None),
}
# After import every model here faces −y (toward the camera): the Quaternius FBX animals and fish after Blender's
# FBX axis conversion, the Kenney glTF models because glTF +z (their front) becomes −y. MODEL_FRONT_DEG is the extra
# turn (degrees, counter-clockwise about z, added to `yaw`) that brings that front to yaw 0 = +x = screen right:
# +90° for both file types (checked on the renders: every animal, fish and vehicle faces screen right).
MODEL_FRONT_DEG = {'.fbx': 90.0, '.glb': 90.0}
IDLE_FRAME = 1
FIT_PASSES = 6

RENDER_SIZE = (2048, 1536)


def fail(msg):
    raise RuntimeError(f'build_shadow_match: {msg}')


def warn(msg):
    print(f'build_shadow_match: WARNING {msg}')


def prune():
    """Removes the whole island: every object but the Sun and the lens source camera (behind the camera,
    the island's trees and houses would cast shadows into the cave), then every emptied collection."""
    keep = {SUN, LENS_FROM}
    for o in list(bpy.data.objects):
        if o.name not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        if len(c.all_objects) == 0:
            bpy.data.collections.remove(c)


def light_from_front():
    """The island's Sun shines from the north (into the camera here): turned to come from behind the
    camera, high and a little from the left, so the wall, the pedestal and the items face the light."""
    sun = bpy.data.objects.get(SUN)
    if sun is None or sun.type != 'LIGHT':
        fail(f'light "{SUN}" not found')
    sun.rotation_mode = 'QUATERNION'
    sun.rotation_quaternion = Vector(SUN_DIRECTION).normalized().to_track_quat('-Z', 'Y')
    sun.data.energy = SUN_ENERGY


def make_camera(scene):
    src = bpy.data.objects.get(LENS_FROM)
    if src is None:
        fail(f'camera "{LENS_FROM}" not found')
    data = bpy.data.cameras.new(CAMERA)
    data.lens = src.data.lens
    data.sensor_width = src.data.sensor_width
    cam = bpy.data.objects.new(CAMERA, data)
    scene.collection.objects.link(cam)
    cam.location = CAM_LOCATION
    cam.rotation_mode = 'XYZ'
    cam.rotation_euler = (Vector(CAM_TARGET) - Vector(CAM_LOCATION)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    bpy.context.view_layer.update()
    return cam


class Screen:
    """World ↔ design px through the scene camera (same projection as render_screen.py)."""

    def __init__(self, scene, params):
        self.scene = scene
        self.cam = scene.camera
        self.w, self.h = params['design']['width'], params['design']['height']
        # The camera frame's corners in camera space (top-right, bottom-right, bottom-left, top-left).
        self.frame = [Vector(c) for c in self.cam.data.view_frame(scene=scene)]

    def project(self, p):
        v = world_to_camera_view(self.scene, self.cam, Vector(p))
        return (v.x * self.w, (1 - v.y) * self.h)

    def rect(self, pts):
        sp = [self.project(p) for p in pts]
        xs, ys = [p[0] for p in sp], [p[1] for p in sp]
        return (min(xs), min(ys), max(xs), max(ys))

    def ray(self, px):
        """The camera position and the world direction through design point `px`."""
        tr, _br, bl, tl = self.frame
        u, v = px[0] / self.w, px[1] / self.h
        local = tl + (tr - tl) * u + (bl - tl) * v
        d = (self.cam.matrix_world.to_3x3() @ local).normalized()
        return self.cam.matrix_world.translation.copy(), d

    def at_y(self, px, y):
        """The world point on the plane y = `y` seen at design point `px`."""
        o, d = self.ray(px)
        return o + d * ((y - o.y) / d.y)

    def on(self, obj, px):
        """Where the ray through `px` first hits `obj` (world), or fails."""
        o, d = self.ray(px)
        inv = obj.matrix_world.inverted()
        lo = inv @ o
        ld = (inv.to_3x3() @ d).normalized()
        ok, hit, _n, _i = obj.ray_cast(lo, ld)
        if not ok:
            fail(f'design point {px} does not hit "{obj.name}"')
        return obj.matrix_world @ hit

    def metres(self, px_len, y):
        """A length of `px_len` design px seen on the plane y = `y`, in metres."""
        a = self.at_y((self.w / 2, self.h / 2), y)
        b = self.at_y((self.w / 2 + px_len, self.h / 2), y)
        return (b - a).length

    def floor(self, px):
        """The floor point seen at design px (z = FLOOR_Z)."""
        o, d = self.ray(px)
        if d.z >= 0:
            fail(f'design point {px} does not look down at the floor')
        return o + d * ((FLOOR_Z - o.z) / d.z)


# --- materials --------------------------------------------------------------------------------------------------

def glow(name, hex_colour, strength, rough=0.9):
    """A flat material whose colour also glows at `strength` (lit, never black)."""
    m = flat_material(name, hex_colour, roughness=rough)
    b = principled(m)
    b.inputs['Emission Color'].default_value = b.inputs['Base Color'].default_value
    b.inputs['Emission Strength'].default_value = strength
    return m


def no_cast(objs):
    for o in objs:
        o.visible_shadow = False


# --- the cave ---------------------------------------------------------------------------------------------------

def link_bm(name, bm, material, coll, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def build_wall(params, coll):
    """The back wall: a coarse grid bowed toward the camera at the sides, every inner vertex jittered (seeded)
    so it reads as cut rock, triangulated (flat facets); local origin on (centre, WALL_Y, FLOOR_Z)."""
    cx = CAM_LOCATION[0]
    nx, nz = WALL_STEPS
    rng = random.Random(WALL_SEED)
    bm = bmesh.new()
    rows = []
    for k in range(nz + 1):
        z = (WALL_TOP_Z - FLOOR_Z) * k / nz
        row = []
        for i in range(nx + 1):
            x = -WALL_HALF_W + 2 * WALL_HALF_W * i / nx
            edge = k in (0, nz) or i in (0, nx)
            d = (0.0, 0.0, 0.0) if edge else tuple(rng.uniform(-a, a) for a in WALL_JITTER)
            row.append(bm.verts.new((x + d[0], -WALL_BOW * x * x + d[1], z + d[2])))
        rows.append(row)
    for k in range(nz):
        for i in range(nx):
            bm.faces.new((rows[k][i], rows[k][i + 1], rows[k + 1][i + 1], rows[k + 1][i]))
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    wall = link_bm('CaveWall', bm, glow('cave-inner', params['art']['shadowMatch']['caveInner'], WALL_EMISSION), coll)
    wall.location = (cx, WALL_Y, FLOOR_Z)
    no_cast([wall])  # its facets shade by their normals only (no cast patches across the shadows' backdrop)
    bm = bmesh.new()
    lo, hi = (-WALL_HALF_W * 2, FLOOR_NEAR_Y - WALL_Y), (WALL_HALF_W * 2, 0.3)
    bm.faces.new([bm.verts.new((x, y, 0.0)) for x, y in ((lo[0], lo[1]), (hi[0], lo[1]), (hi[0], hi[1]), (lo[0], hi[1]))])
    floor = link_bm('CaveFloor', bm, glow('cave-floor', params['colours']['caveMouth'], FLOOR_EMISSION), coll)
    floor.location = (cx, WALL_Y, FLOOR_Z)
    bpy.context.view_layer.update()
    return wall, floor


def stone(name, centre, radius, seed, mat, coll):
    """A low-poly rock: an icosphere with every vertex pushed in or out by a seeded jitter (the old cave's)."""
    rng = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=STONE_SUBDIV, radius=radius)
    for v in bm.verts:
        v.co *= 1.0 + STONE_JITTER * (2.0 * rng.random() - 1.0)
        v.co.y *= STONE_SQUASH_Y
    o = link_bm(name, bm, mat, coll)
    o.location = centre
    return o


def build_rocks(screen, params, coll):
    """The frame rocks and the floor boulders, each placed from its design px."""
    rock = glow('cave-rock', params['colours']['caveMouth'], ROCK_EMISSION)
    made = []
    for i, (u, v, r_px, depth, seed) in enumerate(FRAME_ROCKS):
        y = WALL_Y - depth
        made.append(stone(f'CaveRock{i + 1}', screen.at_y((u, v), y), screen.metres(r_px, y), seed, rock, coll))
    # The frame rocks cast no shadow on the wall (the shadows' backdrop stays even).
    no_cast(made)
    for i, (u, v, r_px, seed) in enumerate(FLOOR_ROCKS):
        p = screen.floor((u, v))
        r = screen.metres(r_px, p.y)
        made.append(stone(f'CaveBoulder{i + 1}', (p.x, p.y, p.z + r * 0.55), r, seed, rock, coll))
    return made


def soft_disc(r, z0, z1, round_=0.5):
    """cute.rounded_profile with its rim rounding capped at 45 % of the height (a thin disc stays a disc)."""
    return rounded_profile(r, z0, z1, min(round_, 0.45 * (z1 - z0) / r))


def build_pedestal(screen, art, coll):
    """The round pedestal: its top centre seen at (REST_PX.x, PEDESTAL_TOP_PX)."""
    y = CAM_LOCATION[1] + PEDESTAL_DIST
    top = screen.at_y((REST_PX[0], PEDESTAL_TOP_PX), y)
    r = screen.metres(PEDESTAL_R_PX, y)
    h = top.z - FLOOR_Z
    if h <= 0.05:
        fail(f'the pedestal top ({top.z:.2f}) is not above the floor')
    root = add_empty('pedestal-root', (top.x, y, FLOOR_Z), coll)
    base = lathe('Pedestal', soft_disc(r * 0.86, 0.0, h - r * 0.1, PEDESTAL_ROUND), glow('pedestal', art['pedestal'], 0.12, 0.5), coll, root, seg=PEDESTAL_SEG)
    rim = lathe('PedestalTop', soft_disc(r, h - r * 0.09, h), glow('pedestal-top', art['pedestalTop'], 0.15, 0.5), coll, root, seg=PEDESTAL_SEG)
    foot = lathe('PedestalFoot', soft_disc(r * 0.96, 0.0, r * 0.07), glow('pedestal-foot', art['pedestalTop'], 0.12, 0.5), coll, root, seg=PEDESTAL_SEG)
    bpy.context.view_layer.update()
    return {'root': root, 'top': Vector((top.x, y, top.z)), 'objs': [base, rim, foot]}


# --- the items ----------------------------------------------------------------------------------------------------

def import_new(op, **kw):
    before = set(bpy.data.objects)
    op(**kw)
    return [o for o in bpy.data.objects if o not in before]


def find_action(actions, suffix):
    for a in actions:
        # A re-import of a file the scene already holds names its actions `….001`.
        name = a.name.rsplit('.', 1)[0] if a.name.rsplit('.', 1)[-1].isdigit() else a.name
        if name.endswith(suffix) and 'Attack' not in name.rsplit('|', 1)[-1]:
            return a
    warn(f'action "*{suffix}" not found — the pose stays at rest')
    return None


def assign_action(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    if action is not None and hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots) > 0:
        ad.action_slot = action.slots[0]


def capture_pose(scene, arm, action):
    """The pose bones' matrix_basis at the action's first frame (rest pose without an action)."""
    rest_basis = arm.matrix_basis.copy()
    assign_action(arm, action)
    scene.frame_set(int(action.frame_range[0]) if action else 1)
    pose = {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}
    assign_action(arm, None)
    # The FBX actions may key the armature object itself: back to its imported transform.
    arm.matrix_basis = rest_basis
    if arm.animation_data:
        arm.animation_data.action = None
    return pose


def item_rotation(ext, pose):
    """yaw (the front to its heading), then tilt (the top toward the camera, about world x)."""
    yaw = math.radians(pose.get('yaw', 0.0) + MODEL_FRONT_DEG.get(ext, 0.0))
    return Matrix.Rotation(math.radians(pose.get('tilt', 0.0)), 4, 'X') @ Matrix.Rotation(yaw, 4, 'Z')


def build_item(item_id, coll):
    """The item's model under a root empty at the origin, posed by its ITEM_MODELS row. Returns (root, meshes)."""
    path, pose, action_suffix = ITEM_MODELS[item_id]
    full = os.path.join(ASSETS, path)
    if not os.path.isfile(full):
        fail(f'item "{item_id}": {full} is missing')
    ext = os.path.splitext(full)[1].lower()
    before_actions = set(bpy.data.actions)
    if ext == '.fbx':
        new = import_new(bpy.ops.import_scene.fbx, filepath=full)
        force_opaque(new)
    else:
        new = import_new(bpy.ops.import_scene.gltf, filepath=full)
    actions = [a for a in bpy.data.actions if a not in before_actions]
    if not any(o.type == 'MESH' for o in new):
        fail(f'item "{item_id}": {path} has no mesh')
    for o in new:
        move_to(o, coll)
    root = add_empty(f'item-{item_id}-root', (0.0, 0.0, 0.0), coll)
    for o in new:
        if o.parent is None:
            o.parent = root
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    if arm is not None:
        action = find_action(actions, action_suffix) if action_suffix else None
        pose_bones = capture_pose(bpy.context.scene, arm, action)
        assign_action(arm, None)
        for pb in arm.pose.bones:
            pb.matrix_basis = pose_bones[pb.name]
            pb.keyframe_insert('location', frame=IDLE_FRAME)
            pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=IDLE_FRAME)
            pb.keyframe_insert('scale', frame=IDLE_FRAME)
        key_constant(arm)
    root.rotation_mode = 'QUATERNION'
    root.rotation_quaternion = item_rotation(ext, pose).to_quaternion()
    bpy.context.view_layer.update()
    return root, [o for o in new if o.type == 'MESH']


def fit(screen, root, objs, size_px, stand):
    """Scales `root` so the objects' projected longest side is size_px (design px) and stands them with their
    XY bbox centre on `stand` (their lowest point at stand.z)."""
    scene = bpy.context.scene
    for _ in range(FIT_PASSES):
        scene.frame_set(IDLE_FRAME)
        bpy.context.view_layer.update()
        pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
        x0, y0, x1, y1 = screen.rect(pts)
        root.scale = root.scale * (size_px / max(x1 - x0, y1 - y0))
        bpy.context.view_layer.update()
        pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
        bx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
        by = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
        root.location += Vector((stand.x - bx, stand.y - by, stand.z - min(p.z for p in pts)))
    bpy.context.view_layer.update()


# --- main -----------------------------------------------------------------------------------------------------------

def main():
    args = parse_args('build_shadow_match', required=('out', 'params', 'items'))
    params = args['params']
    content = params['shadowMatch']
    art = params['art']['shadowMatch']
    items = [i for i in args['items'].split(',') if i]
    if not items:
        fail('--items is empty')
    for i in items:
        if i not in ITEM_MODELS:
            fail(f'unknown item id "{i}" (ITEM_MODELS has {", ".join(ITEM_MODELS)})')
    counts = [int(n) for n in content['counts']]
    for n in counts:
        if n not in SHADOW_SPOTS or len(SHADOW_SPOTS[n]) != n:
            fail(f'no SHADOW_SPOTS row of {n} shadows')
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100

    prune()
    make_camera(scene)
    light_from_front()
    screen = Screen(scene, params)

    plate = bpy.data.collections.new('cave')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True

    wall, _floor = build_wall(params, plate)
    build_rocks(screen, params, plate)
    pedestal = build_pedestal(screen, art, plate)

    built = {}
    for i in items:
        coll = bpy.data.collections.new(f'sprite.item-{i}')
        sprites.children.link(coll)
        coll['states'] = json.dumps({'color': [IDLE_FRAME]}, separators=(',', ':'))
        coll['movable'] = 1
        coll['silhouette'] = 1
        root, objs = build_item(i, coll)
        fit(screen, root, objs, content['itemPx'], pedestal['top'])
        built[i] = objs

    rest = screen.at_y(REST_PX, pedestal['top'].y)
    add_empty('anchor.item-rest', tuple(rest), layout)
    # The pedestal top's centre (every held item stands on it) and its tap area (Story 5.4 reaction).
    add_empty('anchor.pedestal-top', tuple(pedestal['top']), layout)
    dg = bpy.context.evaluated_depsgraph_get()
    hull_object('hit.pedestal', [tuple(p) for p in eval_world_verts(pedestal['objs'], dg)], layout)
    for n in counts:
        for k, px in enumerate(SHADOW_SPOTS[n]):
            p = screen.on(wall, px)
            add_empty(f'slot.shadow-{n}-{k + 1}', (p.x, p.y - 0.002, p.z), layout)
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(screen.on(wall, px) - Vector((0.0, 0.003, 0.0))) for px in CAVE_HIT_PX])
    hit = bpy.data.meshes.new('hit.cave')
    bm.to_mesh(hit)
    bm.free()
    layout.objects.link(bpy.data.objects.new('hit.cave', hit))

    report(screen, built, pedestal, counts)
    scene.frame_set(IDLE_FRAME)
    soften_scene(bpy.context.scene)  # the soft shading (cute.py), last so every builder-made mesh gets it
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_shadow_match: saved {args["out"]}')


def report(screen, built, pedestal, counts):
    """Diagnostics in design px (the rules themselves run in TypeScript on the render)."""
    fmt = lambda r: f'({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}×{r[3] - r[1]:.0f}'  # noqa: E731
    dg = bpy.context.evaluated_depsgraph_get()
    h = screen.project(bpy.data.objects['anchor.item-rest'].location)
    print(f'build_shadow_match: rest {h[0]:.0f},{h[1]:.0f}')
    print(f'build_shadow_match: pedestal {fmt(screen.rect(eval_world_verts(pedestal["objs"], dg)))}')
    seam = screen.project((CAM_LOCATION[0], WALL_Y, FLOOR_Z))
    print(f'build_shadow_match: wall/floor seam at y {seam[1]:.0f}')
    for i, objs in built.items():
        print(f'build_shadow_match: item-{i} {fmt(screen.rect(eval_world_verts(objs, dg)))}')
    for n in counts:
        for k in range(n):
            s = screen.project(bpy.data.objects[f'slot.shadow-{n}-{k + 1}'].location)
            print(f'build_shadow_match: slot shadow-{n}-{k + 1} {s[0]:.0f},{s[1]:.0f} ({math.dist(s, h):.0f} px from the pedestal)')


main()
