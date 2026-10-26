# Builds art/dress-up.blend (Thay đồ cho Shiba, Story 8.2) from the vendored island art/src/map-v3.blend (only its
# render settings, world and Sun are kept).
#
# Run by `npm run art:build -- dress-up` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_dress_up.py -- \
#     --out <tmp>/dress-up.blend --params <tmp>/params.json
# params.json (written by build.ts from Tokens and content): colours, art.dressUp, outfit (the item ids and slots),
# dressUp (icon size, item tap circle, gap, the reflection's scale), design size, the interactive rect.
#
# One plate, 2048×1536, seen through an ORTHOGRAPHIC camera tilted CAM_PITCH degrees down (a shift along world x is a
# shift in design px): a pale blue wardrobe room (dotted wall, wooden floor, a rug). Left: a standing oval mirror (its
# glass is `hit.mirror-glass`, the runtime's reflection mask). Middle: the chibi Shiba (cute.chibi('dog'), the island's
# dog), states idle [1], happy [10, 11] (tongue out, eyes shut, tail wag, a little bounce) and turn [20, 21] (its head
# yawed toward the mirror, then smiling at it). Right: an open pink wardrobe: hats on the top shelf, glasses on the
# middle shelf, shirts on hangers from a rail. Sprites:
#   - shiba (holdout: nothing stands in front of it), and through outfit.dress one `shiba-<item>` overlay per item;
#   - item-<id>: each wardrobe icon where it rests (its longest side dressUp.iconPx design px).
# Layout: hit.shiba (Shiba plus its tallest hat), hit.mirror (frame, glass and stand), hit.mirror-glass (the glass),
# anchor.shiba (Shiba's ground pivot, the overlays' too) and anchor.mirror (the reflection's ground pivot in the glass).
# The tap targets are unpadded (render.ts › SCREEN_SEPARATE): the item circles, Shiba and the mirror keep ≥ gap apart.
import math
import os
import random
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import blob, chibi, chibi_materials, key_chibi, lathe, mat, rbox, rod, soften_scene, torus  # noqa: E402
from common import add_empty, eval_world_verts, hull_object, parse_args  # noqa: E402
from outfit import check_items, dress, icon  # noqa: E402

RENDER_SIZE = (2048, 1536)
DESIGN = (1024, 768)  # set from params in main

# --- the camera: orthographic, looking along +y, tilted down -------------------------------------------------------
ORTHO_PX_PER_M = 100.0
CAM_PITCH = 10.0
CAM_DISTANCE = 40.0
SHIBA_PX = (345.0, 655.0)  # design px: Shiba's ground pivot (the world origin)

# --- Shiba ----------------------------------------------------------------------------------------------------------
SHIBA_SCALE = 1.65  # the chibi is ~2.0 tall at scale 1: ~330 design px
SHIBA_YAW = 0.0
IDLE, HAPPY, TURN = [1], [10, 11], [20, 21]
STATES = {'idle': IDLE, 'happy': HAPPY, 'turn': TURN}
TURN_YAW = -26.0  # degrees: the head turns toward the mirror (screen left)

# --- the room -------------------------------------------------------------------------------------------------------
WALL_Y = 2.4
ROOM_HALF = 8.0
WALL_H = 9.0
BOARD_W = 0.42
SKIRT_H = 0.2
DOTS = 70
SEED = 82

# --- the mirror (design px) -----------------------------------------------------------------------------------------
GLASS_PX = (123.0, 372.0, 150.0, 300.0)  # centre x, centre y, width, height of the oval glass
MIRROR_Y = 0.35  # its depth (a little behind Shiba)
FRAME_TUBE = 0.07  # m: the frame's tube radius
REFLECTION_MARGIN_PX = 22.0  # the reflection's ground pivot sits this far above the glass bottom

# --- the wardrobe (design px; the item rows are derived from the tokens in `grid`) ----------------------------------
WARDROBE_X0 = 470.0  # its left side
WARDROBE_TOP = 238.0
WARDROBE_BOTTOM = 690.0
WARDROBE_BACK_Y = 2.15
WARDROBE_FRONT_Y = 0.85
ICON_Y = 1.5  # the icons' depth on their shelves
HATS_SHELF_PX = 380.0
GLASSES_SHELF_PX = 510.0
RAIL_PX = 575.0


def fail(msg):
    raise RuntimeError(f'build_dress_up: {msg}')


def log(msg):
    print(f'build_dress_up: {msg}')


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
    """The camera target so that the world origin projects to SHIBA_PX."""
    global TX, TZ
    TX = -(SHIBA_PX[0] - DESIGN[0] / 2) / ORTHO_PX_PER_M
    TZ = (SHIBA_PX[1] - DESIGN[1] / 2) / ORTHO_PX_PER_M / math.cos(P)
    data = bpy.data.cameras.new('CamDressUp')
    data.type = 'ORTHO'
    data.ortho_scale = DESIGN[0] / ORTHO_PX_PER_M
    data.clip_start = 0.1
    data.clip_end = 400.0
    cam = bpy.data.objects.new('CamDressUp', data)
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


# --- the plate ------------------------------------------------------------------------------------------------------

def build_room(c, plate):
    fa, fb = mat(c['floor'], 0.7), mat(c['floorDark'], 0.7)
    for k in range(int((WALL_Y + 6.0) / BOARD_W) + 1):
        y1 = WALL_Y - k * BOARD_W
        rbox(f'floor-board-{k}', (2 * ROOM_HALF, BOARD_W - 0.02, 0.1), 0.02, fb if k % 3 == 2 else fa, plate, None, (TX, y1 - BOARD_W / 2, -0.05))
    rbox('wall', (2 * ROOM_HALF, 0.2, WALL_H), 0.02, mat(c['wall'], 0.85), plate, None, (TX, WALL_Y + 0.1, WALL_H / 2))
    rbox('wall-skirting', (2 * ROOM_HALF, 0.06, SKIRT_H), 0.025, mat(c['skirting'], 0.5), plate, None, (TX, WALL_Y - 0.03, SKIRT_H / 2))
    rug = blob('rug', mat(c['rug'], 0.9), plate, None, (0.0, -0.1, 0.005), (1.6, 0.9, 0.02), seg=(48, 8))
    rug.visible_shadow = False
    dot = mat(c['wallDot'], 0.85)
    rnd = random.Random(SEED)
    placed = 0
    for _ in range(DOTS * 8):
        if placed >= DOTS:
            break
        sx, sy = rnd.uniform(0, DESIGN[0]), rnd.uniform(0, DESIGN[1] - 60)
        if sx > WARDROBE_X0 - 30:
            continue
        z = wz(sy, WALL_Y)
        if z < SKIRT_H + 0.15:
            continue
        d = blob(f'wall-dot-{placed}', dot, plate, None, (wx(sx), WALL_Y - 0.005, z), (0.07, 0.012, 0.07), seg=(16, 8))
        d.visible_shadow = False
        placed += 1


def build_mirror(c, plate):
    """The standing oval mirror: a gold tube frame around the glass, two legs and a foot. Returns (glass, every part)."""
    cx, cy, w, h = GLASS_PX
    x, z = wx(cx), wz(cy, MIRROR_Y)
    rx, rz = w / 2 / ORTHO_PX_PER_M, h / 2 / ORTHO_PX_PER_M / math.cos(P)
    glass = blob('mirror-glass', mat(c['mirrorGlass'], 0.08), plate, None, (x, MIRROR_Y, z), (rx, 0.02, rz), seg=(64, 8))
    gold, dark = mat(c['mirrorFrame'], 0.3), mat(c['mirrorFrameDark'], 0.35)
    pts = [(x + (rx + FRAME_TUBE * 0.6) * math.cos(2 * math.pi * k / 64), MIRROR_Y - 0.01, z + (rz + FRAME_TUBE * 0.6) * math.sin(2 * math.pi * k / 64)) for k in range(64)]
    from outfit import tube_loop
    frame = tube_loop('mirror-frame', pts, FRAME_TUBE, gold, plate, None, seg=14)
    shine = blob('mirror-shine', mat(c['mirrorShine'], 0.1), plate, None, (x - rx * 0.4, MIRROR_Y - 0.03, z + rz * 0.45), (0.05, 0.005, rz * 0.35), (0.0, -25.0, 0.0), seg=(24, 8))
    shine.visible_shadow = False
    blob('mirror-top', gold, plate, None, (x, MIRROR_Y - 0.02, z + rz + FRAME_TUBE * 1.6), (0.13, 0.06, 0.1))
    bottom = z - rz - FRAME_TUBE
    legs = []
    for sx in (-1, 1):
        legs.append(rod(f'mirror-leg-{sx}', (x + sx * rx * 0.35, MIRROR_Y, bottom + 0.02), (x + sx * rx * 0.75, MIRROR_Y + 0.05, 0.05), 0.045, dark, plate, None))
        blob(f'mirror-foot-{sx}', dark, plate, None, (x + sx * rx * 0.75, MIRROR_Y + 0.05, 0.04), (0.1, 0.12, 0.04))
    parts = [glass, frame, shine] + legs + [o for o in plate.objects if o.name.startswith(('mirror-top', 'mirror-foot'))]
    return glass, parts


def build_wardrobe(c, plate):
    """The open wardrobe: back, sides, top, base, two shelves and the rail; a door swung open on its left."""
    pink, dark, inside, shelf = mat(c['wardrobe'], 0.5), mat(c['wardrobeDark'], 0.55), mat(c['wardrobeInside'], 0.8), mat(c['shelf'], 0.5)
    x0, x1 = wx(WARDROBE_X0), wx(DESIGN[0] + 40)
    yb, yf = WARDROBE_BACK_Y, WARDROBE_FRONT_Y
    zt, zb = wz(WARDROBE_TOP, yf), 0.0
    cx, w = (x0 + x1) / 2, x1 - x0
    rbox('wardrobe-back', (w, 0.1, zt), 0.03, inside, plate, None, (cx, yb, zt / 2))
    rbox('wardrobe-side', (0.14, yb - yf + 0.1, zt + 0.1), 0.05, pink, plate, None, (x0, (yb + yf) / 2, zt / 2))
    rbox('wardrobe-top', (w + 0.3, yb - yf + 0.3, 0.22), 0.08, pink, plate, None, (cx, (yb + yf) / 2 - 0.05, zt + 0.08))
    rbox('wardrobe-crown', (w + 0.1, 0.12, 0.3), 0.05, dark, plate, None, (cx, yf - 0.12, zt + 0.25))
    base_z = wz(WARDROBE_BOTTOM, yf)
    rbox('wardrobe-base', (w + 0.2, yb - yf + 0.2, base_z + 0.05), 0.05, pink, plate, None, (cx, (yb + yf) / 2, (base_z + 0.05) / 2))
    shelves = {}
    for name, sy in (('hats', HATS_SHELF_PX), ('glasses', GLASSES_SHELF_PX)):
        z = wz(sy, ICON_Y) - 0.05
        rbox(f'wardrobe-shelf-{name}', (w, yb - yf, 0.1), 0.03, shelf, plate, None, (cx, (yb + yf) / 2, z))
        shelves[name] = z + 0.05
    rail_z = wz(RAIL_PX, ICON_Y)
    rod('wardrobe-rail', (x0, ICON_Y, rail_z), (x1, ICON_Y, rail_z), 0.035, mat(c['rail'], 0.3), plate, None)
    # The left door swung open toward the camera (behind Shiba's right side on screen).
    door = rbox('wardrobe-door', (0.1, 1.15, zt - 0.1), 0.04, pink, plate, None, (x0 - 0.1, yf - 0.6, zt / 2), (0.0, 0.0, -20.0))
    blob('wardrobe-knob', mat(c['knob'], 0.3), plate, None, (x0 - 0.26, yf - 1.05, zt / 2), (0.05, 0.05, 0.05))
    door.visible_shadow = False
    return shelves, rail_z


# --- Shiba ----------------------------------------------------------------------------------------------------------

def build_shiba(params, sprites):
    colours = {**params['colours'], 'creatureLight': params['art']['creatureLight']}
    coll = bpy.data.collections.new('sprite.shiba')
    sprites.children.link(coll)
    import json
    coll['states'] = json.dumps(STATES, separators=(',', ':'))
    coll['holdout_occluders'] = 1
    coll['movable'] = 1
    rig = chibi('dog', 'shiba', coll, chibi_materials(colours, colours['creatureOrange'], colours['creatureLight']))
    rig['root'].scale = (SHIBA_SCALE,) * 3
    rig['root'].rotation_euler = (0.0, 0.0, math.radians(SHIBA_YAW))
    key_chibi(rig, IDLE[0], eyes='open')
    for i, f in enumerate(HAPPY):
        side = 1 if i % 2 == 0 else -1
        key_chibi(rig, f, head_pitch=-6.0, head_roll=6.0 * side, tail=22.0 * side, tongue=True, bob=0.05 * i, eyes='shut')
    key_chibi(rig, TURN[0], head_yaw=TURN_YAW, head_roll=-4.0, tail=12.0, eyes='open')
    key_chibi(rig, TURN[1], head_yaw=TURN_YAW - 4.0, head_pitch=-5.0, head_roll=-8.0, tail=-12.0, tongue=True, eyes='shut')
    bpy.context.scene.frame_set(IDLE[0])
    return rig, coll


# --- the icons ------------------------------------------------------------------------------------------------------

def grid(params):
    """The icon spots (design px x, row) from the tokens: four columns ending at the interactive rect's right edge."""
    d = params['dressUp']
    step = d['itemHitPx'] + d['gapPx'] + 1.0
    right = params['rect']['x1'] - d['itemHitPx'] / 2 - 2.0
    cols = [right - k * step for k in (3, 2, 1, 0)]
    mids = [(cols[k] + cols[k + 1]) / 2 for k in range(3)]
    return {'hat': cols, 'glasses': mids, 'shirt': cols}


def place_icon(root, params, sx, bottom_z=None, top_z=None):
    """Scales the icon so its projected longest side is dressUp.iconPx and puts it at design x `sx`: resting on
    `bottom_z` (a shelf) or hanging from `top_z` (the rail)."""
    root.location = (0.0, ICON_Y, 0.0)
    root.scale = (1.0, 1.0, 1.0)
    pts = world_pts(root.children_recursive)
    r = SCREEN.rect(pts)
    k = params['dressUp']['iconPx'] / max(r[2] - r[0], r[3] - r[1])
    root.scale = (k, k, k)
    pts = world_pts(root.children_recursive)
    xs = [p.x for p in pts]
    zs = [p.z for p in pts]
    dx = wx(sx) - (min(xs) + max(xs)) / 2
    dz = (bottom_z - min(zs)) if bottom_z is not None else (top_z - max(zs))
    root.location = (dx, ICON_Y, dz)
    return world_pts(root.children_recursive)


def build_icons(params, sprites, shelves, rail_z):
    c = params['art']['dressUp']
    spots = grid(params)
    used = {'hat': 0, 'glasses': 0, 'shirt': 0}
    rects = {}
    for item in params['outfit']:
        iid, slot = item['id'], item['slot']
        coll = bpy.data.collections.new(f'sprite.item-{iid}')
        sprites.children.link(coll)
        coll['movable'] = 0  # they rest on the shelves: their shadows stay in the plate
        root = icon(iid, c, coll, f'icon-{iid}')
        sx = spots[slot][used[slot]]
        used[slot] += 1
        if slot == 'hat':
            pts = place_icon(root, params, sx, bottom_z=shelves['hats'])
        elif slot == 'glasses':
            pts = place_icon(root, params, sx, bottom_z=shelves['glasses'])
        else:
            pts = place_icon(root, params, sx, top_z=rail_z + 0.03)
        rects[iid] = report(f'item-{iid}', pts)
    return rects


# --- layout ---------------------------------------------------------------------------------------------------------

def build_layout(params, rig, shiba_coll, mirror_parts, glass, layout):
    meshes = [o for o in shiba_coll.all_objects if o.type == 'MESH']
    pts = []
    for f in IDLE + HAPPY + TURN:
        bpy.context.scene.frame_set(f)
        pts += world_pts(meshes)
    bpy.context.scene.frame_set(IDLE[0])
    base = world_pts(meshes)
    tall = bpy.data.collections.get('sprite.shiba-party-hat')
    hat = world_pts(list(tall.all_objects)) if tall else []
    hull_object('hit.shiba', pts + hat, layout)
    report('hit.shiba', pts + hat)
    xs, ys = [p.x for p in base], [p.y for p in base]
    add_empty('anchor.shiba', ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(p.z for p in base)), layout)
    mp = world_pts(mirror_parts)
    hull_object('hit.mirror', mp, layout)
    report('hit.mirror', mp)
    gp = world_pts([glass])
    hull_object('hit.mirror-glass', gp, layout)
    cx, cy, _w, h = GLASS_PX
    add_empty('anchor.mirror', (wx(cx), MIRROR_Y - 0.05, wz(cy + h / 2 - REFLECTION_MARGIN_PX, MIRROR_Y - 0.05)), layout)


def main():
    global DESIGN, SCREEN
    args = parse_args('build_dress_up', required=('out', 'params'))
    params = args['params']
    DESIGN = (params['design']['width'], params['design']['height'])
    check_items(params['outfit'])
    c = params['art']['dressUp']
    scene = bpy.context.scene
    clear_island(scene)
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.frame_set(IDLE[0])
    setup_camera(scene)
    bpy.context.view_layer.update()
    SCREEN = Screen(scene)
    plate = bpy.data.collections.new('dress-up-plate')
    scene.collection.children.link(plate)
    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    build_room(c, plate)
    glass, mirror_parts = build_mirror(c, plate)
    shelves, rail_z = build_wardrobe(c, plate)
    rig, shiba_coll = build_shiba(params, sprites)
    dress(rig, shiba_coll, c, params['outfit'])
    build_icons(params, sprites, shelves, rail_z)
    build_layout(params, rig, shiba_coll, mirror_parts, glass, layout)
    scene.frame_set(IDLE[0])
    soften_scene(scene)
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    log(f'saved {args["out"]}')


if __name__ == '__main__':
    main()
