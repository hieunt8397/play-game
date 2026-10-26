# Builds art/map.blend from the vendored reference scene art/src/map-v3.blend (Story 1.4).
#
# Run by `npm run art:build -- map` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_map.py -- \
#     --out <tmp>/map.blend --params <tmp>/params.json --decorations <tmp>/decorations.json \
#     --icons <tmp>/icons.json
# params.json (written by build.ts from Tokens): creature colours (hex), hitPad, renderScale,
# design size and the interactive rect (design px) used to keep slots on screen; Story 2.2 adds
# decorationMin. decorations.json (Story 2.2): the catalogue [{id, stationId, model (absolute path)}].
# icons.json (Story 2.4): the play-again icons [{id (GameId), model (absolute path), creature (colour token)}];
# params gain iconMin (ui.playAgainIconPx).
#
# Steps: fail on SUBSURF; prune the Tiệm kem preview; regroup station objects into
# `sprite.<id>` collections; recolour creatures; create the layout objects (`hit.*`, `anchor.*`,
# `slot.*`, `path.road`) in a `layout` collection with hide_render; Story 2.2: 1-2 slots per station (10 in total)
# from SLOT_OFFSETS and the detached `sprite.decoration` group (one `state.<id>` per catalogue item,
# built at its station's slot 1, the render pivot); Story 2.4: the detached `sprite.icon` group (one
# `state.<gameId>` per play-again icon, rendered as frame `icon/<gameId>/00`); Story 5.6: recolour the
# road from params.art.map, assert the five existing station landmarks and build the ice-cream cone and
# the pizza chimney into their station sprites (hull, not anchor), the fountain and whale sprites (frame
# states, `anchor.fountain` / `anchor.whale`), the plate swim ring and the detached `sprite.ambient`
# (`state.cloud`, `state.wave`, `anchor.cloud-1..3`, `anchor.wave-1..5`; the other clouds are removed),
# then `dressing_check` fails on any dressing near a station / guide hit or over a slot footprint;
# set the render size; save.
# Story 7.1: the home station "Nhà Xoài" (`sprite.home`, HOME below): the Tiny Treats Homely House house with
# a mailbox, built on the clear grass south of the road between the pizza and race stations (the plate pine
# that stood there is removed); its hull, anchor and kart stop come from the station loop like the others; it
# has no decoration slot (NO_SLOTS), and the pizza station keeps one slot (its second gave the house its ground).
# Every constant below is in Blender world units (metres), read off the reference scene.
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import _keyframes, _part, import_joined, key_chibi, soften_scene, tt_model  # noqa: E402
from outfit import dress  # noqa: E402
from common import add_empty, descendants, eval_world_verts, flat_material, force_opaque, hex_to_linear, hull_object, key_constant, move_to, principled, recolor_creature, sphere  # noqa: E402
from common import parse_args as common_args  # noqa: E402

# --- the station table ---------------------------------------------------------------------------
# sprite: collections (`C:`) or root objects (`O:`; the object and all its children) drawn as the
# station sprite. area: objects that stay in the plate but count toward the hit hull.
STATIONS = {
    'ice-cream': {'sprite': ['C:IceCream'], 'area': []},
    'pizza': {'sprite': ['C:Pizza'], 'area': []},
    'race': {'sprite': ['C:Race', 'C:RaceCars'], 'area': []},
    'fishing': {'sprite': ['O:A_FishGold', 'O:A_FishClown', 'O:A_FishKoi', 'O:A_Dock', 'O:A_Rod'], 'area': ['Pond', 'PStone*']},
    'touch-talk': {'sprite': ['C:Town'], 'area': []},
    'dino-puzzle': {'sprite': ['O:A_DinoNeck', 'O:A_DinoTri', 'O:A_DinoSteg'], 'area': ['Fence*', 'FenceRail']},
    'shadow-match': {'sprite': ['C:Cave'], 'area': []},
    # Story 7.1: built by build_home_station (no reference objects).
    'home': {'sprite': [], 'area': []},
}
KART = {'sprite': ['C:Car']}

# --- the guide Shiba (Story 5.2) --------------------------------------------------------------------
# The island dog beside the ice-cream truck (`A_Shiba`, a cute.chibi() rig in the reference scene)
# leaves the ice-cream sprite and becomes its own sprite `sprite.<id>` with its own `hit.<id>` and
# `anchor.<id>` (ground pivot). Its points still count toward the station's anchor, so the station's
# slots and kart stop do not move; the station's hit hull no longer holds the dog.
GUIDE = {'id': 'shiba', 'root': 'A_Shiba', 'station': 'ice-cream'}
# Rendered frames: idle at the plate frame, the wave on 4 frames (content/assets.ts › MAP_GUIDE).
GUIDE_STATES = {'idle': [1], 'wave': [20, 21, 22, 23]}
# Rig parts the wave keys (cute.py chibi() names); the builder fails when one is missing.
GUIDE_PARTS = {
    'body': 'shiba-body', 'head': 'shiba-head', 'tail': 'shiba-tail', 'tongue': 'shiba-tongue',
    'leg': 'shiba-legR', 'paw': 'shiba-pawR',
}
# The wave pivot (map-builder-local, never cute.chibi()): `shiba-arm` on the torso surface at the
# right shoulder, in shiba-body space. The leg and paw are re-parented onto it (world kept).
GUIDE_ARM = 'shiba-arm'
GUIDE_SHOULDER = (0.36, -0.2, 0.45)
# Per wave frame: arm euler XYZ (degrees) and arm scale, head roll and tail swing (degrees). The map
# camera looks down on the dog, whose big head hides a short paw raised straight up, so the paw swings
# out beside its right cheek (high) and out to the side (mid), the leg stretched GUIDE_ARM_SCALE (a toy
# pose read at ~50 design px; chosen from scratch test renders). Paw high, mid, high, mid; head ±8; tail ±20.
GUIDE_ARM_HIGH = (60.0, 100.0, 0.0)
GUIDE_ARM_MID = (110.0, 120.0, 0.0)
GUIDE_ARM_SCALE = 1.4
GUIDE_HEAD_ROLL = 8.0
GUIDE_TAIL = 20.0

# The Tiệm kem preview of the reference (Story 1.8 builds its own scene).
PRUNE_COLLECTIONS = ['GameIce']
PRUNE_OBJECTS = ['CamGame2', 'HintRing']

# Rule fixes (spec: edge pieces may stay in the plate; a station may shift ≤ 0.6 m in XY).
# Objects listed here stay in the plate even though their collection is a station sprite.
KEEP_IN_PLATE = {
    # The outer race flags sit on the island's right edge; in the sprite they push the race hit
    # polygon past the right dead zone. They stay in the plate (decor), the arch and car stay tappable.
    'race': ['FlagPole-1', 'Flag-1', 'FlagPole1', 'Flag1'],
    # The stop sign and traffic light stand at the road edge in front of the town; in the sprite they
    # pull the touch-talk polygon down onto the road and the pizza sign.
    'touch-talk': ['A_StopSign', 'road-sign-stop', 'A_TrafficLight', 'traffic-light',
                   # The tall right-hand building (building-g) stands right in front of the cave on
                   # screen; as plate scenery it no longer hides the cave's tap area.
                   'A_House3', 'building-g'],
}
# Station shifts in metres (world XY), each at most 0.6.
STATION_SHIFT = {
    'pizza': (0.0, -0.6),  # toward the camera: the pizza sign no longer reaches into the town
    'dino-puzzle': (0.0, 0.6),  # away from the pond (the fence and the jumping fish overlap on screen)
    'shadow-match': (0.6, 0.0),  # right, away from the town's buildings
}
MAX_SHIFT = 0.6

# Creature recolour: (root object, material base name, colour token).
RECOLOUR = [
    ('A_Shiba', 'Main', 'creatureOrange'),  # Main_Light (white face and belly) is kept
    ('A_DinoTri', 'Purple', 'creatureGreen'),  # Triceratops (its Tìm bóng role)
    ('A_DinoSteg', 'DarkBrown', 'creaturePink'),  # Stegosaurus
    ('A_DinoNeck', 'Brown', 'creatureBlue'),  # long-neck
    ('A_FishGold', 'Goldfish_Main', 'creatureOrange'),
    ('A_FishClown', 'Clownfish_Main', 'creaturePurple'),
    ('A_FishKoi', 'Koi_Main', 'creatureGreen'),
]

# Story 5.6: the toy-coloured map road (map art only: Tokens.colors.road stays for the race screen).
# (material name, Tokens.art.map key); a missing material fails the build.
ROAD_RECOLOUR = [('Road', 'road'), ('RoadEdge', 'roadEdge'), ('Dash', 'roadDash')]

# The road: centreline of the `Road` mesh strip (midpoints of its 225 vertex pairs, simplified with
# Douglas-Peucker at 0.03 m), read once from map-v2.blend. Width 1.45 m, top at z 0.46 + 0.07.
ROAD_CENTRE = [
    (-9.00, -5.00), (-6.71, -4.81), (-5.50, -4.60), (-4.84, -4.37), (-3.09, -3.49), (-2.22, -3.22),
    (-1.78, -3.20), (-1.14, -3.32), (0.37, -3.93), (1.04, -4.14), (1.50, -4.20), (2.24, -4.21),
    (3.56, -4.11), (4.59, -3.91), (5.50, -3.60), (6.34, -3.13), (7.12, -2.51), (7.60, -2.01),
    (7.91, -1.51), (8.00, -1.04), (7.85, -0.53), (7.38, 0.19), (6.71, 0.81), (6.35, 1.04),
    (6.00, 1.20), (5.63, 1.26), (5.23, 1.24), (3.18, 0.69), (2.50, 0.60), (1.62, 0.66),
    (-0.12, 0.97), (-1.00, 1.00), (-1.87, 0.79), (-3.62, 0.10), (-4.06, 0.01), (-4.50, 0.00),
    (-4.97, 0.07), (-5.76, 0.27), (-6.56, 0.57), (-7.05, 0.81), (-7.48, 1.07), (-7.80, 1.33),
    (-8.00, 1.60), (-8.07, 1.89), (-8.04, 2.23), (-7.91, 2.60), (-7.72, 2.97), (-7.32, 3.52),
    (-6.84, 3.97), (-6.50, 4.20), (-6.12, 4.36), (-5.68, 4.48), (-4.38, 4.62), (-2.25, 4.58),
    (-1.50, 4.46), (0.50, 3.99), (1.50, 3.90), (2.03, 3.94), (2.88, 4.09), (5.50, 4.80),
]
ROAD_HALF_WIDTH = 0.725
ROAD_TOP_Z = 0.53

# Decoration slots (Story 2.2, review loop 1b): ground points beside each station, in fill order.
# Each entry is a world XY offset in metres from the station's anchor (the XY centre of its sprite
# group, after the shifts). tools/layout/rules.ts › validateDecorations checks every slot: within
# 170 design px of its station's anchor (dino-puzzle: 240, DECO_STATION_DIST_OVERRIDE), within 110 px
# of the station's slot 1 (the render pivot), every item's footprint clear of every station polygon
# and of every other slot's footprint (any station), and the tap rect inside the interactive rect.
# The padded station polygons leave little clear ground, so a station gets a second slot only where
# one fits: ice-cream, pizza and race have 2; fishing, touch-talk, dino-puzzle and shadow-match have
# 1 (content/stations.ts must match). dino-puzzle stands by the volcano (its only clear spot that does
# not take touch-talk's or shadow-match's pocket). The table came from a scratch search over clear
# ground points that mirrors those rules.
SLOT_OFFSETS = {
    'ice-cream': [(1.315, -3.712), (2.715, -3.112)],
    'pizza': [(-1.362, -3.225)],  # Story 7.1: its second slot's ground is the home station's
    'race': [(-1.830, -3.535), (0.070, -3.335)],
    'fishing': [(0.309, -3.968)],
    'touch-talk': [(-2.360, 5.344)],
    'dino-puzzle': [(-4.918, -2.083)],
    'shadow-match': [(-2.262, -6.488)],
}
# Story 7.1: stations without decoration slots (content/stations.ts › SLOT_COUNT 0).
NO_SLOTS = ('home',)
SLOT_ROAD_CLEARANCE = 0.3  # beyond the road edge
SLOT_FOOTPRINT = 0.35  # radius around a slot point that must be clear ground
SLOT_Z = 0.45  # island ground (used when the downward ray misses)
# Meshes a slot may stand on: the grass and the beach (the beach band is the only clear ground
# south of the road under the pizza and race stations).
GROUND = ('Grass', 'Sand')
# The scratch slot search (outside the project) sets this to False to get warnings instead of failures.
STRICT_SLOTS = True

# Decorations (Story 2.2): each catalogue model (content/decorations.ts, passed in as JSON by
# build.ts) is imported, normalised to DECO_SIZE_M on its largest dimension (times DECO_SCALE[id]),
# turned by DECO_YAW_DEG toward the camera and stood on the ground at its station's slot 1 (the
# render pivot), with a flat dark blob shadow. Each is a `state.<id>` collection under the detached
# `sprite.decoration` group: excluded from the plate, rendered one state at a time.
DECO_SIZE_M = 1.85
# Per-item scale so every item shows about 84-110 px on its longest side at its station's pivot
# (smaller where the space beside a station is tight; the rules need >= 80). Every catalogue id has
# an entry; the builder fails on a missing or unknown key (check_deco_scale).
DECO_SCALE = {
    'parasol': 0.76, 'giant-cone': 0.92, 'popsicle': 1.01, 'sundae': 1.04,
    'pizza-pie': 0.98, 'tomato': 0.92, 'cheese': 0.97, 'pizza-box': 0.90,
    'cone': 0.84, 'traffic-light': 1.29, 'race-car': 0.98, 'barrier': 0.85,
    'boat': 1.26, 'puffer': 1.17, 'koi': 0.95, 'butterfly-fish': 0.94,
    'fire-truck': 1.64, 'ambulance': 1.64, 'taxi': 1.70, 'street-lamp': 1.32,
    'parasaurolophus': 1.78, 'pineapple': 1.41, 'dino-egg': 1.33, 'coconut': 1.25,
    'mushroom': 0.86, 'pumpkin': 0.99, 'lamp-post': 0.99, 'alpaca': 1.23,
}
DECO_YAW_DEG = 30.0
# The curved street lamp's arm points at the camera at DECO_YAW_DEG, so its footprint is too thin for
# an 80 px tap rect (footprint + 2 x 24 px pad); turned to 270 degrees, the arm reaches sideways.
DECO_YAW_OVERRIDE_DEG = {'street-lamp': 270.0}
BLOB_COLOUR = 'iconInk'
BLOB_ALPHA = 0.25
BLOB_RADIUS = 0.42  # times the item's largest XY extent
BLOB_LIFT = 0.01  # above the ground, against z-fighting
BLOB_SEGMENTS = 32

# Play-again icons (Story 2.4): each model of content/game-icons.ts › GAME_ICONS (passed in as
# JSON by build.ts) is imported, recoloured with recolor_creature (its `Main` material to the creature
# token; `Main_Light`, the white face and belly, is kept), forced opaque (FBX alpha 0), normalised to
# ICON_SIZE_M on its largest dimension, turned by ICON_YAW_DEG toward the camera and stood on the ground
# at ICON_AT (any visible point: the group is detached and rendered alone). Each is a `state.<id>`
# collection under `sprite.icon`. ICON_SIZE_M keeps the trimmed longest side / renderScale above
# ui.playAgainIconPx (112), with headroom so the runtime only scales it down.
ICON_SIZE_M = 3.4
ICON_AT = (0.0, -1.0)
ICON_YAW_DEG = 60.0  # a three-quarter side view: the face and the orange back both read at 112 px
ICON_MATERIAL = 'Main'
# Story 3.3: models whose creature colour sits on another material (the long-neck's body is `Brown`).
# Story 3.5: the triceratops' body is `Purple` (as A_DinoTri on the island).
ICON_MATERIAL_BY_MODEL = {'Apatosaurus.fbx': 'Brown', 'Triceratops.fbx': 'Purple', 'Koi.fbx': 'Koi_Main'}  # Story 4.3: the koi's body
ICON_REST_POSE = {'Apatosaurus.fbx', 'Triceratops.fbx'}  # Stories 3.3/3.5: drawn in their rest pose (see build_icons)

RENDER_SIZE = (2048, 1536)

# --- station landmarks (Story 5.6, FR37) --------------------------------------------------------------
# One big far-readable landmark per station. Five already exist in the reference scene and are only
# asserted (each pattern must match at least one object of the station's sprite, else the build fails).
# The ice-cream giant cone and the pizza chimney are built here from cute.py parts as members of their
# station sprite: tappable, and counted in the station's hit hull and decoration-check polygon, but NOT in
# its anchor (the anchor places the label, the kart stop and the decoration slots, which must not move).
LANDMARKS_PRESENT = {
    'race': ['ArchPost*', 'Chk*'],
    'fishing': ['A_FishGold'],
    'dino-puzzle': ['A_DinoNeck'],
    'shadow-match': ['CaveMouth'],
    'touch-talk': ['A_House0'],
}
LANDMARKS_NEW = ('ice-cream', 'pizza')

# --- the home station (Story 7.1) ---------------------------------------------------------------------
# The Homely House house (its front toward the camera) and its mailbox, as `sprite.home`. `at` is the
# house's ground centre (world XY, m); the house is scaled so its projected width is `width_px` (design px);
# the mailbox stands at `mailbox_at` (house-local metres before the scale is applied, at the house's scale).
HOME = {
    'id': 'home',
    'house': ('house', 'Homely-House'),
    'mailbox': ('mailbox', 'Homely-House'),
    'at': (3.2, -6.05),  # between the decoration footprints of slots pizza-1 (x ≤ 594) and race-1 (x ≥ 783)
    'yaw_deg': 0.0,
    'width_px': 118.0,
    'mailbox_at': (2.2, -2.0),  # in front of the right corner (the house model is ~5.9 units wide)
    'mailbox_scale': 1.6,
}
HOME_FIT_PASSES = 4
# Plate scenery on the home station's ground (a pine of the reference scene), removed.
HOME_PRUNE = ['Pine3.6-5.4', 'PTr3.6-5.4']
# The giant cone stands on the parasol side of the truck (away from the fishing hull), world XY (m).
CONE_AT = (-8.2, -2.7)
CONE_SCALE = 0.66
# Unit cone parts (before CONE_SCALE): the waffle cone (tip down) on a small round foot, two scoops and a cherry.
CONE_FOOT = (0.32, 0.32, 0.12)  # radii of the flattened foot sphere
CONE_TIP_Z = 0.12
CONE_HALF_DEPTH = 0.8  # the waffle cone is 2 x this tall
CONE_RADIUS = 0.55
CONE_SCOOP_R = 0.6
CONE_SCOOP_TOP_R = 0.48
CONE_CHERRY_R = 0.16
# The chimney stands on the left of the pizza shop roof (`building-c`): fractions of the roof's XY bbox
# from its min corner, sunk CHIMNEY_SINK into the roof; a round brick column, a cream cap ring and soot.
CHIMNEY_ROOF = 'building-c'
CHIMNEY_AT = (0.08, 0.3)
CHIMNEY_RADIUS = 0.22
CHIMNEY_HEIGHT = 1.15
CHIMNEY_SINK = 0.3
CHIMNEY_CAP = (0.3, 0.3, 0.3)  # scale of the cap torus (cute.py torus: major radius 1, minor 0.34)

# --- island dressing (Story 5.6, FR37) ----------------------------------------------------------------
# From the approved v4 trial (scratch map_trial.py). The fountain and the whale are their own map sprites
# with frame states (occlude 1); the swim ring stays in the plate. Each sprite adds `anchor.<id>` at its
# ground (fountain) or water (whale) pivot. No hit: a tap on them is a background tap (Story 5.4 ripple).
FOUNTAIN = {'id': 'fountain', 'model': 'fountain', 'at': (-1.2, -6.05), 'scale': 0.5}
FOUNTAIN_STATES = {'spray': [1, 2, 3]}
# Jets: FOUNTAIN_JETS arcs from the top of the fountain into its basin; each arc holds
# FOUNTAIN_DROPS_PER_FRAME droplets per frame, shifted along the arc frame by frame (a flowing loop).
FOUNTAIN_JETS = 6
FOUNTAIN_DROPS_PER_FRAME = 3
FOUNTAIN_JET_RISE = 0.4  # apex above the top (m, world)
FOUNTAIN_JET_REACH = 0.42  # landing radius as a fraction of the fountain's half width
FOUNTAIN_BASIN = 0.35  # landing height as a fraction of the fountain's height
FOUNTAIN_DROP_R = 0.07
FOUNTAIN_COLUMN = [0.1, 0.25, 0.4]  # the centre column's droplet heights above the top, one per frame
RING = {'at': (1.0, -7.45, 0.33), 'major': 0.42, 'minor': 0.17, 'tilt_deg': 12.0, 'yaw_rad': 0.3, 'stripes': 8}
WHALE = {'id': 'whale', 'at': (7.3, -8.2, -0.15), 'yaw_deg': -25.0, 'scale': 0.8}
WHALE_STATES = {'idle': [1], 'spout': [2, 3, 4, 5]}
# Whale parts in its root space (unit whale, facing -Y): (name, material, location, scale[, rotation deg]).
WHALE_PARTS = [
    ('whale-body', 'blue', (0.0, 0.0, 0.35), (1.0, 0.75, 0.62)),
    ('whale-belly', 'belly', (0.0, -0.42, 0.22), (0.72, 0.38, 0.38)),
    ('whale-tail', 'blue', (0.0, 0.72, 0.5), (0.25, 0.35, 0.22), (-35.0, 0.0, 0.0)),
]
WHALE_SIDE_PARTS = [  # mirrored on x
    ('whale-eye', 'ink', (0.42, -0.62, 0.55), (0.09, 0.06, 0.11)),
    ('whale-shine', 'shine', (0.39, -0.67, 0.6), (0.03, 0.02, 0.035)),
    ('whale-cheek', 'blush', (0.62, -0.5, 0.4), (0.1, 0.04, 0.07)),
    ('whale-fluke', 'blue', (0.32, 0.95, 0.75), (0.32, 0.12, 0.14), (-30.0, 25.0, 0.0)),
]
# The spout: (x, z, radius) per sphere at full height; per spout frame, a (scale, z lift, x spread) per
# sphere (scale 0 = hidden): it grows, crowns, then falls. The idle frame hides every sphere.
WHALE_SPOUT = [(0.0, 1.05, 0.11), (0.0, 1.3, 0.13), (-0.2, 1.5, 0.12), (0.2, 1.5, 0.12), (-0.38, 1.42, 0.1), (0.38, 1.42, 0.1)]
WHALE_SPOUT_Y = -0.05
WHALE_SPOUT_FRAMES = [
    [(0.75, 0.0, 1.0), (0.55, -0.05, 1.0), (0, 0, 1.0), (0, 0, 1.0), (0, 0, 1.0), (0, 0, 1.0)],
    [(1.0, 0.0, 1.0), (1.0, 0.0, 1.0), (0.8, -0.1, 1.0), (0.8, -0.1, 1.0), (0, 0, 1.0), (0, 0, 1.0)],
    [(1.0, 0.0, 1.0), (1.0, 0.0, 1.0), (1.0, 0.0, 1.0), (1.0, 0.0, 1.0), (1.0, 0.0, 1.0), (1.0, 0.0, 1.0)],
    [(0, 0, 1.0), (0.6, -0.15, 1.0), (0.8, -0.25, 1.3), (0.8, -0.25, 1.3), (0.7, -0.35, 1.4), (0.7, -0.35, 1.4)],
]
HIDDEN_SCALE = 0.001  # a "hidden" keyed part (a zero scale would make a degenerate matrix)
# The detached `sprite.ambient` group: `state.cloud` (one reference cloud cluster, re-centred at
# CLOUD_AT; every other `Cl*` cluster is removed, so the plate loses the cloud shadows) and
# `state.wave` (a small foam crescent built at the first wave anchor). Anchors: `anchor.cloud-1..3` in
# the top sea band (cloud-1 = CLOUD_AT, the render pivot) and `anchor.wave-1..5` on the visible sea
# (wave-1 = the render pivot). World points read off the camera (scratch unprojection of design px).
CLOUD_PREFIX = 'Cl'
CLOUD_CLUSTER = 'Cl5.5'  # the reference cluster (4 spheres: Cl5.50..Cl5.53)
CLOUD_AT = (-5.49, 9.26, 4.0)
CLOUD_ANCHORS = [CLOUD_AT, (3.67, 9.62, 4.0), (10.52, 8.92, 4.0)]
CLOUD_SCALE = 0.7
WAVE_Z = -0.1  # just above the shallow water
WAVE_ANCHORS = [(-11.12, 10.98), (5.25, 12.3), (13.18, 10.69), (-12.63, 6.26), (-7.69, -8.17)]
# The crescent: WAVE_PUFFS flattened spheres on an arc of WAVE_ARC_DEG (radius WAVE_ARC_R, m), the
# middle ones larger; the arc opens away from the camera.
WAVE_PUFFS = 5
WAVE_ARC_R = 0.55
WAVE_ARC_DEG = 120.0
WAVE_PUFF = (0.2, 0.11, 0.05)  # puff radii (x along the arc, y across, z)


def fail(msg):
    raise RuntimeError(f'build_map: {msg}')


def parse_args():
    return common_args('build_map')


def match(name, pattern):
    return name.startswith(pattern[:-1]) if pattern.endswith('*') else name == pattern


def resolve_members(spec):
    objs = []
    for item in spec:
        kind, name = item.split(':', 1)
        if kind == 'C':
            coll = bpy.data.collections.get(name)
            if coll is None:
                fail(f'collection "{name}" not found')
            objs.extend(coll.all_objects)
        else:
            obj = bpy.data.objects.get(name)
            if obj is None:
                fail(f'object "{name}" not found')
            objs.extend(descendants(obj))
    seen = []
    for o in objs:
        if o not in seen:
            seen.append(o)
    return seen


def area_objects(patterns):
    out = [o for o in bpy.data.objects if any(match(o.name, p) for p in patterns)]
    if patterns and not out:
        fail(f'area objects {patterns} not found')
    return sorted(out, key=lambda o: o.name)


def check_no_subsurf():
    for o in bpy.data.objects:
        for m in o.modifiers:
            if m.type == 'SUBSURF':
                fail(f'object "{o.name}" has a subdivision modifier (not allowed)')


def prune():
    for name in PRUNE_COLLECTIONS:
        coll = bpy.data.collections.get(name)
        if coll is None:
            fail(f'collection "{name}" to prune not found')
        for o in list(coll.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
    for name in PRUNE_OBJECTS:
        o = bpy.data.objects.get(name)
        if o is not None:
            bpy.data.objects.remove(o, do_unlink=True)


def recolour(colours):
    for root_name, mat_base, token in RECOLOUR:
        root = bpy.data.objects.get(root_name)
        if root is None:
            fail(f'recolour root "{root_name}" not found')
        if recolor_creature(root, mat_base, colours[token]) == 0:
            fail(f'recolour: no material "{mat_base}" under "{root_name}"')


def roots(objs):
    s = set(objs)
    return [o for o in objs if o.parent not in s]


def nearest_on_road(p):
    best = None
    for (ax, ay), (bx, by) in zip(ROAD_CENTRE, ROAD_CENTRE[1:]):
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
        q = (ax + t * dx, ay + t * dy)
        d = math.dist(p, q)
        if best is None or d < best[0]:
            best = (d, q)
    return best


class Screen:
    """Projects world points to design px with the scene camera (same as render_screen.py)."""

    def __init__(self, scene, params):
        self.scene = scene
        self.cam = scene.camera
        self.w, self.h = params['design']['width'], params['design']['height']

    def project(self, p):
        v = world_to_camera_view(self.scene, self.cam, Vector(p))
        return (v.x * self.w, (1 - v.y) * self.h)


def hull_2d(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def point_in_poly(p, poly):
    inside = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > p[1]) != (by > p[1]) and p[0] < (bx - ax) * (p[1] - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def dist_to_poly(p, poly):
    best = math.inf
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
        best = min(best, math.dist(p, (ax + t * dx, ay + t * dy)))
    return best


def is_ground(scene, depsgraph, x, y):
    hit, _loc, _n, _i, obj, _m = scene.ray_cast(depsgraph, Vector((x, y, 50.0)), Vector((0, 0, -1)))
    return hit and obj.original.name in GROUND


def ground_z(scene, depsgraph, x, y):
    hit, loc, _n, _i, _obj, _m = scene.ray_cast(depsgraph, Vector((x, y, 50.0)), Vector((0, 0, -1)))
    return loc.z if hit else SLOT_Z


def slot_problems(scene, depsgraph, p):
    """Why a slot point is not a clear ground point away from the road (empty = fine)."""
    out = []
    road_d = nearest_on_road(p)[0]
    if road_d < ROAD_HALF_WIDTH + SLOT_ROAD_CLEARANCE + SLOT_FOOTPRINT:
        out.append(f'{road_d:.2f} m from the road centre')
    ring = [(p[0] + SLOT_FOOTPRINT * math.cos(math.radians(a)), p[1] + SLOT_FOOTPRINT * math.sin(math.radians(a))) for a in range(0, 360, 45)]
    if not all(is_ground(scene, depsgraph, x, y) for x, y in [p] + ring):
        out.append('not clear ground')
    return out


def place_slots(scene, depsgraph, centres):
    """World points of every station's slots from SLOT_OFFSETS: {sid: [(x, y, z), ...]}."""
    slots = {}
    for sid in STATIONS:
        if sid in NO_SLOTS:
            continue
        offsets = SLOT_OFFSETS.get(sid, [])
        if not offsets:
            fail(f'station "{sid}" has no SLOT_OFFSETS entry')
        cx, cy = centres[sid]
        pts = []
        for n, (dx, dy) in enumerate(offsets, 1):
            p = (round(cx + dx, 3), round(cy + dy, 3))
            why = slot_problems(scene, depsgraph, p)
            if why:
                msg = f'slot.{sid}-{n} at {p}: ' + ', '.join(why)
                if STRICT_SLOTS:
                    fail(msg)
                print(f'build_map: WARNING {msg}')
            pts.append((p[0], p[1], ground_z(scene, depsgraph, p[0], p[1])))
        slots[sid] = pts
    return slots


# --- decorations (Story 2.2) ---------------------------------------------------------------------

def load_decorations(path):
    with open(path, encoding='utf8') as f:
        items = json.load(f)
    for it in items:
        if it['stationId'] not in STATIONS:
            fail(f'decoration "{it["id"]}": unknown station "{it["stationId"]}"')
        if not os.path.isfile(it['model']):
            fail(f'decoration "{it["id"]}": model {it["model"]} is missing')
    return items


def import_model(path):
    """Imports a GLB (from its own folder, so Textures/colormap.png resolves) or an FBX; returns the new objects."""
    before = set(bpy.data.objects)
    images = set(bpy.data.images)
    if path.lower().endswith('.glb'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif path.lower().endswith('.fbx'):
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        fail(f'unsupported model {path}')
    new = [o for o in bpy.data.objects if o not in before]
    if not any(o.type == 'MESH' for o in new):
        fail(f'model {path} has no mesh')
    if path.lower().endswith('.fbx'):
        force_opaque(new)  # FBX imports leave Alpha 0: every material becomes Alpha 1 / opaque
    # Pack new textures: art/map.blend must render without the asset folders.
    for img in bpy.data.images:
        if img not in images and img.source == 'FILE' and img.packed_file is None and img.filepath:
            img.pack()
    return new


def blob_material(colours):
    m = flat_material('deco-blob', colours[BLOB_COLOUR], roughness=1.0)
    bsdf = principled(m)
    bsdf.inputs['Alpha'].default_value = BLOB_ALPHA
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    if hasattr(m, 'blend_method'):
        m.blend_method = 'BLEND'
    return m


def add_blob(name, centre, radius, mat, coll):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=BLOB_SEGMENTS, radius=radius)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    o.location = centre
    o.visible_shadow = False
    coll.objects.link(o)
    return o


def check_deco_scale(items):
    """Every catalogue id has a DECO_SCALE entry and every key is a catalogue id (review loop 1)."""
    ids = [it['id'] for it in items]
    missing = [i for i in ids if i not in DECO_SCALE]
    extra = sorted(k for k in DECO_SCALE if k not in ids)
    if missing:
        fail(f'DECO_SCALE has no entry for {", ".join(missing)}')
    if extra:
        fail(f'DECO_SCALE keys not in the catalogue: {", ".join(extra)}')


def build_decorations(items, slots, colours, sprite_parent):
    """sprite.decoration (detached) with one state.<id> per item, built at its station's slot 1."""
    group = bpy.data.collections.new('sprite.decoration')
    sprite_parent.children.link(group)
    group['bhc_detached'] = 1  # never in the plate (no image, no shadow), rendered one state at a time
    group['occlude'] = 0  # placed anywhere at runtime: renders alone, like the kart
    blob_mat = blob_material(colours)
    built = {}
    for it in items:
        did, sid = it['id'], it['stationId']
        px, py, pz = slots[sid][0]
        coll = bpy.data.collections.new(f'state.{did}')
        group.children.link(coll)
        new = import_model(it['model'])
        root = add_empty(f'deco.{did}', (0.0, 0.0, 0.0), coll)
        for o in new:
            move_to(o, coll)
        for o in roots(new):
            o.parent = root
        root.rotation_euler = (0.0, 0.0, math.radians(DECO_YAW_OVERRIDE_DEG.get(did, DECO_YAW_DEG)))
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        pts = eval_world_verts(new, depsgraph)
        if not pts:
            fail(f'decoration "{did}" has no visible mesh')
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        size = max(h - l for h, l in zip(hi, lo))
        s = DECO_SIZE_M * DECO_SCALE.get(did, 1.0) / size
        root.scale = (s, s, s)
        root.location = (px - (lo[0] + hi[0]) / 2 * s, py - (lo[1] + hi[1]) / 2 * s, pz - lo[2] * s)
        extent = max(hi[0] - lo[0], hi[1] - lo[1]) * s
        add_blob(f'deco-blob.{did}', (px, py, pz + BLOB_LIFT), BLOB_RADIUS * extent, blob_mat, coll)
        built[did] = {'station': sid, 'objects': list(coll.all_objects)}
    bpy.context.view_layer.update()
    return built


# --- play-again icons (Story 2.4) -----------------------------------------------------------------

def load_icons(path):
    with open(path, encoding='utf8') as f:
        items = json.load(f)
    for it in items:
        if it['id'] not in STATIONS:
            fail(f'icon "{it["id"]}": not a station')
        if not os.path.isfile(it['model']):
            fail(f'icon "{it["id"]}": model {it["model"]} is missing')
    return items


def build_icons(items, colours, sprite_parent):
    """sprite.icon (detached) with one state.<id> per play-again icon."""
    scene = bpy.context.scene
    group = bpy.data.collections.new('sprite.icon')
    sprite_parent.children.link(group)
    group['bhc_detached'] = 1  # never in the plate, rendered one state at a time
    group['occlude'] = 0  # renders alone, like the kart
    built = {}
    # Story 3.3: the ground under ICON_AT is measured once, before any icon stands there (a later
    # icon would otherwise stand on the earlier ones and, with a third, leave the frame).
    bpy.context.view_layer.update()
    icon_ground = ground_z(scene, bpy.context.evaluated_depsgraph_get(), ICON_AT[0], ICON_AT[1])
    for it in items:
        gid = it['id']
        if it['creature'] is not None and it['creature'] not in colours:
            fail(f'icon "{gid}": unknown colour token "{it["creature"]}"')
        coll = bpy.data.collections.new(f'state.{gid}')
        group.children.link(coll)
        new = import_model(it['model'])
        force_opaque(new)
        if os.path.basename(it['model']) in ICON_REST_POSE:
            # Never the importer's active action (it may be an attack pose): the gentle rest pose.
            for o in new:
                if o.type == 'ARMATURE':
                    o.animation_data_clear()
                    for pb in o.pose.bones:
                        pb.matrix_basis = Matrix.Identity(4)
        root = add_empty(f'icon.{gid}', (0.0, 0.0, 0.0), coll)
        for o in new:
            move_to(o, coll)
        for o in roots(new):
            o.parent = root
        mat = ICON_MATERIAL_BY_MODEL.get(os.path.basename(it['model']), ICON_MATERIAL)
        if it['creature'] is not None and recolor_creature(root, mat, colours[it['creature']]) == 0:  # Story 4.1: None keeps the source colours
            fail(f'icon "{gid}": no material "{mat}" to recolour')
        root.rotation_euler = (0.0, 0.0, math.radians(ICON_YAW_DEG))
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        pts = eval_world_verts(new, depsgraph)
        if not pts:
            fail(f'icon "{gid}" has no visible mesh')
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        s = ICON_SIZE_M / max(h - l for h, l in zip(hi, lo))
        gz = icon_ground
        root.scale = (s, s, s)
        root.location = (ICON_AT[0] - (lo[0] + hi[0]) / 2 * s, ICON_AT[1] - (lo[1] + hi[1]) / 2 * s, gz - lo[2] * s)
        built[gid] = list(coll.all_objects)
    bpy.context.view_layer.update()
    return built


def icon_report(screen, params, built):
    """Estimated trimmed size (design px) of every icon; flags one under params['iconMin']."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    problems = []
    for gid, objs in built.items():
        pts = [screen.project(p) for p in eval_world_verts(objs, depsgraph)]
        w = max(p[0] for p in pts) - min(p[0] for p in pts)
        h = max(p[1] for p in pts) - min(p[1] for p in pts)
        print(f'build_map: icon "{gid}": {w:.0f}x{h:.0f} px')
        if max(w, h) < params['iconMin']:
            problems.append(f'icon "{gid}" is under {params["iconMin"]} px')
    for p in problems:
        print(f'build_map: CHECK {p}')
    return problems


def footprint_report(screen, params, built, slots, station_polys, unions_out=None):
    """Estimated screen footprints (design px) of every item at every slot of its station; prints the
    rule breaches the TS gate will report after the render (bbox of the projected vertices). Story 5.6:
    `unions_out` (a dict) receives every slot's union footprint by slot id (`<station>-<n>`)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    rect = params['rect']
    pad = params['hitPad']
    problems = []
    per_station = {}
    for did, b in built.items():
        sid = b['station']
        pts = [screen.project(p) for p in eval_world_verts(b['objects'], depsgraph)]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        pivot = screen.project(slots[sid][0])
        box = (min(xs) - pivot[0], min(ys) - pivot[1], max(xs) - pivot[0], max(ys) - pivot[1])
        print(f'build_map: decoration "{did}" ({sid}): {box[2] - box[0]:.0f}x{box[3] - box[1]:.0f} px')
        if max(box[2] - box[0], box[3] - box[1]) < params['decorationMin']:
            problems.append(f'decoration "{did}" is under {params["decorationMin"]} px')
        per_station.setdefault(sid, []).append((did, box))
    for sid, boxes in per_station.items():
        unions = []
        for n, p in enumerate(slots[sid], 1):
            sx, sy = screen.project(p)
            u = None
            for did, (x0, y0, x1, y1) in boxes:
                fp = (sx + x0, sy + y0, sx + x1, sy + y1)
                u = fp if u is None else (min(u[0], fp[0]), min(u[1], fp[1]), max(u[2], fp[2]), max(u[3], fp[3]))
                if fp[0] - pad < rect['x0'] or fp[1] - pad < rect['y0'] or fp[2] + pad > rect['x1'] or fp[3] + pad > rect['y1']:
                    problems.append(f'"{did}" at slot {sid}-{n}: tap rect leaves the interactive rect')
                corners = [(fp[0], fp[1]), (fp[2], fp[1]), (fp[2], fp[3]), (fp[0], fp[3])]
                for other, poly in station_polys.items():
                    if any(point_in_poly(c, poly) or dist_to_poly(c, poly) < pad for c in corners) or any(fp[0] <= v[0] <= fp[2] and fp[1] <= v[1] <= fp[3] for v in poly):
                        problems.append(f'"{did}" at slot {sid}-{n}: footprint near station "{other}"')
            unions.append(u)
            if unions_out is not None and u is not None:
                unions_out[f'{sid}-{n}'] = u
        for i in range(len(unions)):
            for j in range(i + 1, len(unions)):
                a, b2 = unions[i], unions[j]
                if a[0] < b2[2] and b2[0] < a[2] and a[1] < b2[3] and b2[1] < a[3]:
                    problems.append(f'slots {sid}-{i + 1} and {sid}-{j + 1}: footprints overlap')
    for p in problems:
        print(f'build_map: CHECK {p}')
    return problems


def guide_part(key):
    o = bpy.data.objects.get(GUIDE_PARTS[key])
    if o is None:
        fail(f'guide part "{GUIDE_PARTS[key]}" not found (cute.chibi() names changed?)')
    return o


def key_guide_wave(scene, coll):
    """Story 5.2: the wave pivot and keys of the guide Shiba (idle at frame 1, wave on GUIDE_STATES)."""
    body, leg, paw = guide_part('body'), guide_part('leg'), guide_part('paw')
    rig = {'root': bpy.data.objects[GUIDE['root']], 'body': body, 'head': guide_part('head'),
           'tail': guide_part('tail'), 'tongue': guide_part('tongue')}
    scene.frame_set(1)
    arm = bpy.data.objects.new(GUIDE_ARM, None)
    arm.empty_display_type = 'PLAIN_AXES'
    arm.empty_display_size = 0.2
    coll.objects.link(arm)
    arm.parent = body
    arm.location = GUIDE_SHOULDER
    bpy.context.view_layer.update()
    for part in (leg, paw):
        mw = part.matrix_world.copy()
        part.parent = arm
        part.matrix_parent_inverse = Matrix.Identity(4)
        part.matrix_world = mw  # keeps the world transform
    bpy.context.view_layer.update()

    def key_arm(frame, deg, scale):
        arm.rotation_euler = tuple(math.radians(d) for d in deg)
        arm.scale = (scale, scale, scale)
        arm.keyframe_insert('rotation_euler', frame=frame)
        arm.keyframe_insert('scale', frame=frame)

    for f in GUIDE_STATES['idle']:
        key_arm(f, (0.0, 0.0, 0.0), 1.0)  # the rig parts keep their reference keys at rest
    for n, f in enumerate(GUIDE_STATES['wave']):
        sign = 1.0 if n % 2 == 0 else -1.0
        key_arm(f, GUIDE_ARM_HIGH if n % 2 == 0 else GUIDE_ARM_MID, GUIDE_ARM_SCALE)
        key_chibi(rig, f, head_roll=sign * GUIDE_HEAD_ROLL, tail=sign * GUIDE_TAIL)
    for kp in _keyframes(arm):
        kp.interpolation = 'CONSTANT'
    scene.frame_set(1)
    bpy.context.view_layer.update()


# --- Story 5.6: road, landmarks, dressing ---------------------------------------------------------

def art_map(params):
    am = params.get('art', {}).get('map')
    if not am:
        fail('params.art.map is missing (tools/render/build.ts › buildParams)')
    return am


def recolour_road(params):
    am = art_map(params)
    for mat_name, key in ROAD_RECOLOUR:
        m = bpy.data.materials.get(mat_name)
        if m is None:
            fail(f'road material "{mat_name}" not found')
        if key not in am:
            fail(f'params.art.map has no "{key}"')
        principled(m).inputs['Base Color'].default_value = hex_to_linear(am[key])


def dressing_materials(params):
    """Every Story 5.6 material, from Tokens colours (params): nothing hard-coded."""
    c, art, am = params['colours'], params['art'], art_map(params)

    def mat(name, hex_colour, roughness):
        return flat_material(f'map-{name}', hex_colour, roughness)

    return {
        'blue': mat('whale-blue', c['creatureBlue'], 0.45),
        'belly': mat('whale-belly', art['creatureLight'], 0.5),
        'ink': mat('whale-ink', c['iconInk'], 0.25),
        'shine': mat('whale-shine', am['foam'], 0.2),
        'blush': mat('whale-blush', c['tintPink'], 0.6),
        'water': mat('water', am['water'], 0.2),
        'ring-a': mat('ring-pink', c['creaturePink'], 0.35),
        'ring-b': mat('ring-white', art['creatureLight'], 0.35),
        'foam': mat('foam', am['foam'], 0.4),
        'waffle': mat('cone-waffle', am['coneWaffle'], 0.6),
        'scoop': mat('cone-scoop', am['coneScoop'], 0.45),
        'scoop-top': mat('cone-scoop-top', am['coneScoopTop'], 0.45),
        'cherry': mat('cone-cherry', am['coneCherry'], 0.3),
        'brick': mat('chimney-brick', am['chimneyBrick'], 0.7),
        'cap': mat('chimney-cap', am['chimneyCap'], 0.6),
        'soot': mat('chimney-soot', am['chimneySoot'], 0.9),
    }


def ball(name, mat, loc, scale, parent, coll, rot_deg=(0.0, 0.0, 0.0)):
    return _part(name, mat, loc, scale, parent, kind='sphere', rot=tuple(math.radians(r) for r in rot_deg), coll=coll)


def check_landmarks(groups):
    """The five existing landmarks must still be in their station sprites."""
    for sid, patterns in LANDMARKS_PRESENT.items():
        names = [o.name for o in groups[sid]]
        for p in patterns:
            if not any(match(n, p) for n in names):
                fail(f'landmark "{p}" of station "{sid}" is not in sprite.{sid}')


def build_cone(scene, coll, mats):
    """The ice-cream giant cone (tip down on a little foot, two scoops and a cherry)."""
    x, y = CONE_AT
    gz = ground_z(scene, bpy.context.evaluated_depsgraph_get(), x, y)
    root = add_empty('landmark.ice-cream', (x, y, gz), coll)
    root.scale = (CONE_SCALE,) * 3
    ball('cone-foot', mats['waffle'], (0.0, 0.0, CONE_FOOT[2]), CONE_FOOT, root, coll)
    _part('cone-waffle', mats['waffle'], (0.0, 0.0, CONE_TIP_Z + CONE_HALF_DEPTH), (CONE_RADIUS, CONE_RADIUS, CONE_HALF_DEPTH),
          root, kind='cone', rot=(math.pi, 0.0, 0.0), coll=coll)
    rim = CONE_TIP_Z + 2 * CONE_HALF_DEPTH
    z1 = rim + CONE_SCOOP_R * 0.45
    ball('cone-scoop', mats['scoop'], (0.0, 0.0, z1), (CONE_SCOOP_R,) * 3, root, coll)
    z2 = z1 + CONE_SCOOP_R * 0.75 + CONE_SCOOP_TOP_R * 0.3
    ball('cone-scoop-top', mats['scoop-top'], (0.0, 0.0, z2), (CONE_SCOOP_TOP_R,) * 3, root, coll)
    ball('cone-cherry', mats['cherry'], (0.0, 0.0, z2 + CONE_SCOOP_TOP_R * 0.95 + CONE_CHERRY_R * 0.5), (CONE_CHERRY_R,) * 3, root, coll)
    return descendants(root)


def build_chimney(coll, mats):
    """The pizza chimney on the left of the shop roof (a round brick column, cap ring, soot)."""
    roof = bpy.data.objects.get(CHIMNEY_ROOF)
    if roof is None:
        fail(f'chimney roof "{CHIMNEY_ROOF}" not found')
    bpy.context.view_layer.update()
    pts = eval_world_verts([roof], bpy.context.evaluated_depsgraph_get())
    if not pts:
        fail(f'chimney roof "{CHIMNEY_ROOF}" has no visible mesh')
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    x = lo[0] + CHIMNEY_AT[0] * (hi[0] - lo[0])
    y = lo[1] + CHIMNEY_AT[1] * (hi[1] - lo[1])
    root = add_empty('landmark.pizza', (x, y, hi[2] - CHIMNEY_SINK), coll)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=CHIMNEY_RADIUS, radius2=CHIMNEY_RADIUS, depth=CHIMNEY_HEIGHT)
    me = bpy.data.meshes.new('chimney-brick')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mats['brick'])
    col = bpy.data.objects.new('chimney-brick', me)
    coll.objects.link(col)
    col.parent = root
    col.location = (0.0, 0.0, CHIMNEY_HEIGHT / 2)
    _part('chimney-cap', mats['cap'], (0.0, 0.0, CHIMNEY_HEIGHT), CHIMNEY_CAP, root, kind='torus', coll=coll)
    ball('chimney-soot', mats['soot'], (0.0, 0.0, CHIMNEY_HEIGHT), (CHIMNEY_RADIUS * 0.85, CHIMNEY_RADIUS * 0.85, 0.03), root, coll)
    return descendants(root)


def build_home_station(scene, screen, coll):
    """Story 7.1: the home station sprite — the Homely House house (fitted to HOME['width_px']) and its mailbox."""
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE  # the projection needs the final aspect
    for o in list(bpy.data.objects):
        if any(o.name.startswith(p) for p in HOME_PRUNE):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.context.view_layer.update()
    x, y = HOME['at']
    gz = ground_z(scene, bpy.context.evaluated_depsgraph_get(), x, y)
    root = add_empty('landmark.home', (x, y, gz), coll)
    root.rotation_euler = (0.0, 0.0, math.radians(HOME['yaw_deg']))
    house = import_joined(tt_model(*HOME['house']), 'home-house')
    move_to(house, coll)
    house.parent = root
    mailbox = import_joined(tt_model(*HOME['mailbox']), 'home-mailbox')
    move_to(mailbox, coll)
    mailbox.parent = root
    mailbox.location = (HOME['mailbox_at'][0], HOME['mailbox_at'][1], 0.0)
    mailbox.scale = (HOME['mailbox_scale'],) * 3
    objs = [house, mailbox]
    for _ in range(HOME_FIT_PASSES):
        bpy.context.view_layer.update()
        x0, _y0, x1, _y1 = projected_box(screen, objs)
        root.scale = root.scale * (HOME['width_px'] / max(x1 - x0, 1e-6))
    bpy.context.view_layer.update()
    return [o for o in descendants(root)]


def projected_box(screen, objs, scene=None, frames=None):
    """Design-px bbox (x0, y0, x1, y1) of the objects' evaluated vertices, unioned over `frames`."""
    pts = []
    for f in frames or [None]:
        if f is not None:
            scene.frame_set(int(f))
        bpy.context.view_layer.update()
        pts.extend(screen.project(p) for p in eval_world_verts(objs, bpy.context.evaluated_depsgraph_get()))
    if frames:
        scene.frame_set(1)
        bpy.context.view_layer.update()
    if not pts:
        fail('dressing: an item has no visible mesh')
    return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))


def landmark_report(screen, params, landmarks):
    for sid, objs in landmarks.items():
        x0, y0, x1, y1 = projected_box(screen, objs)
        print(f'build_map: landmark "{sid}": {x1 - x0:.0f}x{y1 - y0:.0f} px at ({x0:.0f}, {y0:.0f})')
        if y1 - y0 < params['landmarkMin']:
            fail(f'landmark of "{sid}" is {y1 - y0:.0f} px tall (min {params["landmarkMin"]})')


def key_scale_loc(o, frame, scale, loc=None):
    o.scale = scale
    o.keyframe_insert('scale', frame=frame)
    if loc is not None:
        o.location = loc
        o.keyframe_insert('location', frame=frame)


def new_sprite(sprite_parent, sid, states=None, detached=False):
    coll = bpy.data.collections.new(f'sprite.{sid}')
    sprite_parent.children.link(coll)
    if detached:
        coll['bhc_detached'] = 1
        coll['occlude'] = 0
    else:
        coll['occlude'] = 1
    if states is not None:
        coll['states'] = json.dumps(states, separators=(',', ':'))
    return coll


def build_fountain(scene, sprite_parent, layout, mats):
    """sprite.fountain: the Tiny Treats fountain with looping jets (droplets keyed by CONSTANT scale)."""
    coll = new_sprite(sprite_parent, FOUNTAIN['id'], FOUNTAIN_STATES)
    x, y = FOUNTAIN['at']
    gz = ground_z(scene, bpy.context.evaluated_depsgraph_get(), x, y)
    obj = import_joined(tt_model(FOUNTAIN['model']), 'fountain')
    move_to(obj, coll)
    obj.location = (x, y, gz)
    obj.scale = (FOUNTAIN['scale'],) * 3
    bpy.context.view_layer.update()
    pts = eval_world_verts([obj], bpy.context.evaluated_depsgraph_get())
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    top, half = hi[2], (hi[0] - lo[0]) / 2
    basin = lo[2] + FOUNTAIN_BASIN * (hi[2] - lo[2])
    frames = FOUNTAIN_STATES['spray']
    n = len(frames)
    drops = []
    per_jet = FOUNTAIN_DROPS_PER_FRAME * n
    for j in range(FOUNTAIN_JETS):
        a = 2 * math.pi * j / FOUNTAIN_JETS
        for k in range(per_jet):
            t = (k + 0.5) / per_jet
            r = FOUNTAIN_JET_REACH * half * t
            z = top + FOUNTAIN_JET_RISE * 4 * t * (1 - t) + (basin - top) * t
            d = sphere(f'fountain-drop-{j}-{k}', FOUNTAIN_DROP_R, mats['water'], coll, segments=12, rings=8)
            d.location = (x + r * math.cos(a), y + r * math.sin(a), z)
            drops.append((d, k % n))
    for i, h in enumerate(FOUNTAIN_COLUMN):
        d = sphere(f'fountain-column-{i}', FOUNTAIN_DROP_R * 1.3, mats['water'], coll, segments=12, rings=8)
        d.location = (x, y, top + h)
        drops.append((d, i % n))
    for d, shown in drops:
        d.visible_shadow = False
        for fi, f in enumerate(frames):
            key_scale_loc(d, f, (1.0,) * 3 if fi == shown else (HIDDEN_SCALE,) * 3)
        key_constant(d)
    add_empty(f'anchor.{FOUNTAIN["id"]}', (x, y, gz), layout)
    scene.frame_set(1)
    return list(coll.all_objects)


def build_whale(scene, sprite_parent, layout, mats):
    """sprite.whale: the chibi whale of the v4 trial; idle at frame 1, the spout on WHALE_STATES."""
    coll = new_sprite(sprite_parent, WHALE['id'], WHALE_STATES)
    root = add_empty('whale', WHALE['at'], coll)
    root.rotation_euler = (0.0, 0.0, math.radians(WHALE['yaw_deg']))
    root.scale = (WHALE['scale'],) * 3
    for name, m, loc, scale, *rot in WHALE_PARTS:
        ball(name, mats[m], loc, scale, root, coll, rot[0] if rot else (0.0, 0.0, 0.0))
    for name, m, loc, scale, *rot in WHALE_SIDE_PARTS:
        for side, sx in (('l', -1.0), ('r', 1.0)):
            r = rot[0] if rot else (0.0, 0.0, 0.0)
            ball(f'{name}-{side}', mats[m], (loc[0] * sx, loc[1], loc[2]), scale, root, coll, (r[0], r[1] * sx, r[2]))
    idle = WHALE_STATES['idle']
    spout = WHALE_STATES['spout']
    if len(spout) != len(WHALE_SPOUT_FRAMES):
        fail('WHALE_SPOUT_FRAMES must have one entry per spout frame')
    for i, (sx, sz, rad) in enumerate(WHALE_SPOUT):
        o = ball(f'whale-spout-{i}', mats['water'], (sx, WHALE_SPOUT_Y, sz), (rad, rad, rad * 1.2), root, coll)
        o.visible_shadow = False
        for f in idle:
            key_scale_loc(o, f, (HIDDEN_SCALE,) * 3, (sx, WHALE_SPOUT_Y, sz))
        for f, row in zip(spout, WHALE_SPOUT_FRAMES):
            s, lift, spread = row[i]
            scale = (rad * s, rad * s, rad * s * 1.2) if s > 0 else (HIDDEN_SCALE,) * 3
            key_scale_loc(o, f, scale, (sx * spread, WHALE_SPOUT_Y, sz + lift))
        key_constant(o)
    add_empty(f'anchor.{WHALE["id"]}', WHALE['at'], layout)
    scene.frame_set(1)
    return list(coll.all_objects)


def build_ring(mats):
    """The striped swim ring on the beach (plate scenery)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=RING['major'], minor_radius=RING['minor'], major_segments=48, minor_segments=20, location=RING['at'])
    ring = bpy.context.object
    ring.name = ring.data.name = 'swim-ring'
    move_to(ring, bpy.data.collections['World'])
    ring.data.materials.append(mats['ring-a'])
    ring.data.materials.append(mats['ring-b'])
    step = 2 * math.pi / RING['stripes']
    for p in ring.data.polygons:
        a = math.atan2(p.center.y, p.center.x)
        p.material_index = int((a + math.pi) / step) % 2
        p.use_smooth = True
    ring.rotation_euler = (math.radians(RING['tilt_deg']), 0.0, RING['yaw_rad'])
    return [ring]


def is_cloud_name(name):
    """`Cl` + a cluster id (`Cl5.50`, `Cl-13.02`): a non-empty suffix starting with a digit or a minus."""
    suffix = name[len(CLOUD_PREFIX):]
    return name.startswith(CLOUD_PREFIX) and suffix != '' and suffix[0] in '-0123456789'


def build_ambient(sprite_parent, layout, mats):
    """sprite.ambient (detached): state.cloud and state.wave, plus the cloud and wave anchors."""
    group = new_sprite(sprite_parent, 'ambient', detached=True)
    cloud_coll = bpy.data.collections.new('state.cloud')
    wave_coll = bpy.data.collections.new('state.wave')
    group.children.link(cloud_coll)
    group.children.link(wave_coll)
    sky = bpy.data.collections.get('Sky')
    if sky is None:
        fail('collection "Sky" (the clouds) not found')
    clouds = [o for o in sky.all_objects if o.type == 'MESH' and is_cloud_name(o.name)]
    ref = [o for o in clouds if o.name.startswith(CLOUD_CLUSTER)]
    if not ref:
        fail(f'cloud cluster "{CLOUD_CLUSTER}*" not found')
    for o in clouds:
        if o not in ref:
            bpy.data.objects.remove(o, do_unlink=True)
    cx = sum(o.location.x for o in ref) / len(ref)
    cy = sum(o.location.y for o in ref) / len(ref)
    cz = sum(o.location.z for o in ref) / len(ref)
    for o in ref:
        o.location = (CLOUD_AT[0] + (o.location.x - cx) * CLOUD_SCALE, CLOUD_AT[1] + (o.location.y - cy) * CLOUD_SCALE,
                      CLOUD_AT[2] + (o.location.z - cz) * CLOUD_SCALE)
        o.scale = tuple(s * CLOUD_SCALE for s in o.scale)
        move_to(o, cloud_coll)
    px, py = WAVE_ANCHORS[0]
    mid = (WAVE_PUFFS - 1) / 2
    for i in range(WAVE_PUFFS):
        a = math.radians(-WAVE_ARC_DEG / 2 + WAVE_ARC_DEG * i / (WAVE_PUFFS - 1))
        f = 1.0 - 0.35 * abs(i - mid) / mid
        loc = (px + WAVE_ARC_R * math.sin(a), py + WAVE_ARC_R * (1 - math.cos(a)), WAVE_Z)
        o = ball(f'wave-puff-{i}', mats['foam'], loc, (WAVE_PUFF[0] * f, WAVE_PUFF[1] * f, WAVE_PUFF[2]), None, wave_coll, (0.0, 0.0, math.degrees(a)))
        o.visible_shadow = False
    for n, p in enumerate(CLOUD_ANCHORS, 1):
        add_empty(f'anchor.cloud-{n}', p, layout)
    for n, (x, y) in enumerate(WAVE_ANCHORS, 1):
        add_empty(f'anchor.wave-{n}', (x, y, WAVE_Z), layout)
    return list(cloud_coll.all_objects), list(wave_coll.all_objects)


def segments_cross(a, b, c, d):
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return orient(a, b, c) * orient(a, b, d) < 0 and orient(c, d, a) * orient(c, d, b) < 0


def box_poly_dist(box, poly):
    """Distance (design px) between a bbox and a polygon; 0 when they touch or overlap."""
    x0, y0, x1, y1 = box
    rect = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    if any(point_in_poly(c, poly) for c in rect) or any(x0 <= v[0] <= x1 and y0 <= v[1] <= y1 for v in poly):
        return 0.0
    edges_r = list(zip(rect, rect[1:] + rect[:1]))
    edges_p = list(zip(poly, poly[1:] + poly[:1]))
    if any(segments_cross(a, b, c, d) for a, b in edges_r for c, d in edges_p):
        return 0.0
    return min(min(dist_to_poly(c, poly) for c in rect), min(dist_to_poly(v, rect) for v in poly))


def dressing_check(screen, params, items, polys, unions):
    """Every dressing bbox stays >= hitPad from every station polygon and the guide's, and clear of every
    slot union footprint; any problem fails the build (naming the item and what it hits)."""
    pad = params['hitPad']
    problems = []
    for name, box in items:
        print(f'build_map: dressing "{name}": ({box[0]:.0f}, {box[1]:.0f})-({box[2]:.0f}, {box[3]:.0f}) px')
        for pid, poly in polys.items():
            d = box_poly_dist(box, poly)
            if d < pad:
                problems.append(f'"{name}" is {d:.0f} px from the hit of "{pid}" (min {pad})')
        for slot, u in unions.items():
            if box[0] < u[2] and u[0] < box[2] and box[1] < u[3] and u[1] < box[3]:
                problems.append(f'"{name}" overlaps the footprint of slot {slot} ({u[0]:.0f}, {u[1]:.0f})-({u[2]:.0f}, {u[3]:.0f})')
    if problems:
        fail('dressing: ' + '; '.join(problems))


def dressing_items(screen, scene, fountain, whale, ring, cloud, wave):
    """(name, bbox) of every dressing item: the fountain and the whale over all their frames, every
    wave at its anchor, every cloud over its whole drift band (x from -width to the design width + width)."""
    items = [
        ('fountain', projected_box(screen, fountain, scene, FOUNTAIN_STATES['spray'])),
        ('whale', projected_box(screen, whale, scene, WHALE_STATES['idle'] + WHALE_STATES['spout'])),
        ('ring', projected_box(screen, ring)),
    ]
    wb = projected_box(screen, wave)
    w0 = screen.project((WAVE_ANCHORS[0][0], WAVE_ANCHORS[0][1], WAVE_Z))
    for n, (x, y) in enumerate(WAVE_ANCHORS, 1):
        p = screen.project((x, y, WAVE_Z))
        dx, dy = p[0] - w0[0], p[1] - w0[1]
        items.append((f'wave-{n}', (wb[0] + dx, wb[1] + dy, wb[2] + dx, wb[3] + dy)))
    cb = projected_box(screen, cloud)
    c0 = screen.project(CLOUD_AT)
    w = cb[2] - cb[0]
    for n, p in enumerate(CLOUD_ANCHORS, 1):
        dy = screen.project(p)[1] - c0[1]
        items.append((f'cloud-{n}', (-w, cb[1] + dy, screen.w + w, cb[3] + dy)))
    return items


def build(args):
    params = args['params']
    scene = bpy.context.scene

    check_no_subsurf()
    prune()

    # Regroup into sprite.<id> collections.
    sprite_parent = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprite_parent)
    groups = {}
    emptied = set()
    guide_root = bpy.data.objects.get(GUIDE['root'])
    if guide_root is None:
        fail(f'guide root "{GUIDE["root"]}" not found')
    guide_objs = descendants(guide_root)
    for sid, spec in list(STATIONS.items()) + [('kart', KART)]:
        members = [o for o in resolve_members(spec['sprite']) if o not in guide_objs]
        for c in spec['sprite']:
            if c.startswith('C:'):
                emptied.add(c[2:])
        keep = set(KEEP_IN_PLATE.get(sid, []))
        coll = bpy.data.collections.new(f'sprite.{sid}')
        sprite_parent.children.link(coll)
        coll['occlude'] = 0 if sid == 'kart' else 1
        sprite_objs = []
        for o in members:
            if o.name in keep:
                continue
            move_to(o, coll)
            sprite_objs.append(o)
        groups[sid] = sprite_objs
    guide_coll = bpy.data.collections.new(f'sprite.{GUIDE["id"]}')
    sprite_parent.children.link(guide_coll)
    guide_coll['occlude'] = 1
    guide_coll['states'] = json.dumps(GUIDE_STATES, separators=(',', ':'))
    for o in guide_objs:
        move_to(o, guide_coll)
    groups[GUIDE['id']] = guide_objs
    for name in sorted(emptied):
        coll = bpy.data.collections.get(name)
        if coll is not None and len(coll.all_objects) == 0:
            bpy.data.collections.remove(coll)
        elif coll is not None:
            # Plate leftovers (kept edge pieces) move to the plate's World collection.
            for o in list(coll.all_objects):
                move_to(o, bpy.data.collections['World'])
            bpy.data.collections.remove(coll)

    # Rule-fix shifts.
    for sid, (dx, dy) in STATION_SHIFT.items():
        if math.hypot(dx, dy) > MAX_SHIFT + 1e-9:
            fail(f'shift of "{sid}" exceeds {MAX_SHIFT} m')
        for o in roots(groups[sid] + area_objects(STATIONS[sid]['area'])):
            o.location.x += dx
            o.location.y += dy

    recolour(params['colours'])
    recolour_road(params)

    # Story 7.1: the home station (its sprite is built, not regrouped from the reference scene).
    home_coll = bpy.data.collections['sprite.home']
    groups['home'] = build_home_station(scene, Screen(scene, params), home_coll)

    # Story 5.6: the station landmarks (the new ones join their station sprite, never its anchor).
    check_landmarks(groups)
    mats = dressing_materials(params)
    landmarks = {
        'ice-cream': build_cone(scene, bpy.data.collections['sprite.ice-cream'], mats),
        'pizza': build_chimney(bpy.data.collections['sprite.pizza'], mats),
    }
    if set(landmarks) != set(LANDMARKS_NEW):
        fail('LANDMARKS_NEW and the built landmarks differ')
    for sid, objs in landmarks.items():
        groups[sid] = groups[sid] + objs

    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True
    screen = Screen(scene, params)

    guide_pts = eval_world_verts(groups[GUIDE['id']], depsgraph)
    if not guide_pts:
        fail(f'guide "{GUIDE["id"]}" has no visible mesh')
    centres = {}
    station_polys = {}
    for sid, spec in STATIONS.items():
        sprite_pts = eval_world_verts(groups[sid], depsgraph)
        area_pts = eval_world_verts(area_objects(spec['area']), depsgraph)
        if not sprite_pts:
            fail(f'station "{sid}" has no visible mesh')
        hull_object(f'hit.{sid}', sprite_pts + area_pts, layout)
        # Story 5.2: the guide's points still place the station's anchor (slots and stop unchanged)
        # and its polygon for the decoration checks (the old, larger hull: conservative).
        # Story 5.6: a new landmark grows the hull and that polygon, never the anchor.
        mark = landmarks.get(sid, [])
        mark_pts = eval_world_verts(mark, depsgraph)
        base_pts = eval_world_verts([o for o in groups[sid] if o not in mark], depsgraph) if mark else sprite_pts
        anchor_pts = base_pts + (guide_pts if sid == GUIDE['station'] else [])
        xs = [p.x for p in anchor_pts]
        ys = [p.y for p in anchor_pts]
        zmin = min(p.z for p in anchor_pts)
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        add_empty(f'anchor.{sid}', (cx, cy, zmin), layout)
        centres[sid] = (cx, cy)
        _d, (sx, sy) = nearest_on_road((cx, cy))
        add_empty(f'anchor.{sid}-stop', (sx, sy, ROAD_TOP_Z), layout)
        station_polys[sid] = hull_2d([screen.project(p) for p in anchor_pts + area_pts + mark_pts])

    hull_object(f'hit.{GUIDE["id"]}', guide_pts, layout)
    gx = (min(p.x for p in guide_pts) + max(p.x for p in guide_pts)) / 2
    gy = (min(p.y for p in guide_pts) + max(p.y for p in guide_pts)) / 2
    add_empty(f'anchor.{GUIDE["id"]}', (gx, gy, min(p.z for p in guide_pts)), layout)

    kart_pts = eval_world_verts(groups['kart'], depsgraph)
    kx = (min(p.x for p in kart_pts) + max(p.x for p in kart_pts)) / 2
    ky = (min(p.y for p in kart_pts) + max(p.y for p in kart_pts)) / 2
    _d, (sx, sy) = nearest_on_road((kx, ky))
    add_empty('anchor.kart-start', (sx, sy, ROAD_TOP_Z), layout)

    curve = bpy.data.curves.new('path.road', 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    spline.points.add(len(ROAD_CENTRE) - 1)
    for pt, (x, y) in zip(spline.points, ROAD_CENTRE):
        pt.co = (x, y, ROAD_TOP_Z, 1.0)
    layout.objects.link(bpy.data.objects.new('path.road', curve))

    slots = place_slots(scene, depsgraph, centres)
    for sid, pts in slots.items():
        for n, p in enumerate(pts, 1):
            add_empty(f'slot.{sid}-{n}', p, layout)

    # Story 5.6: the island dressing (after the slots: their ground rays never see it).
    fountain = build_fountain(scene, sprite_parent, layout, mats)
    whale = build_whale(scene, sprite_parent, layout, mats)
    ring = build_ring(mats)
    cloud, wave = build_ambient(sprite_parent, layout, mats)

    decorations = load_decorations(args['decorations']) if 'decorations' in args else []
    if decorations:
        check_deco_scale(decorations)
    built = build_decorations(decorations, slots, params['colours'], sprite_parent) if decorations else {}
    check_no_subsurf()
    unions = {}
    report = footprint_report(screen, params, built, slots, station_polys, unions) if built else []
    icons = load_icons(args['icons']) if 'icons' in args else []
    built_icons = build_icons(icons, params['colours'], sprite_parent) if icons else {}
    check_no_subsurf()
    report += icon_report(screen, params, built_icons) if built_icons else []

    key_guide_wave(scene, bpy.data.collections[f'sprite.{GUIDE["id"]}'])
    # Story 8.2: the guide's outfit overlays (one sprite.shiba-<item> per item over its idle and wave frames), after
    # its hull and anchor (they never grow them) and after the wave pivot (sleeves follow the waving leg).
    dress({'head': guide_part('head'), 'body': guide_part('body')}, bpy.data.collections[f'sprite.{GUIDE["id"]}'], params['art']['dressUp'], params['outfit'])

    landmark_report(screen, params, landmarks)
    polys = dict(station_polys)
    polys[GUIDE['id']] = hull_2d([screen.project(p) for p in guide_pts])
    dressing_check(screen, params, dressing_items(screen, scene, fountain, whale, ring, cloud, wave), polys, unions)
    check_no_subsurf()

    if args.get('out'):
        soften_scene(bpy.context.scene)  # the soft toy look (cute.py), last so every builder-made mesh gets it
        bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
        print(f'build_map: saved {args["out"]}')
    return {'scene': scene, 'screen': screen, 'centres': centres, 'station_polys': station_polys, 'slots': slots, 'built': built, 'report': report}


if __name__ == '__main__':
    build(parse_args())

