# Makes art/src/map-v3.blend (the soft "cute toy" island, 2026-10-16) from art/src/map-v2.blend.
#
# Run once by hand (the result is the vendored source every builder starts from):
#   blender -b art/src/map-v2.blend --python-exit-code 1 --python make_source_v3.py -- --out art/src/map-v3.blend
#
# Every object keeps its name (builders prune and look objects up by name); only mesh data changes:
# - trees: each trunk (PTr* pine, RTr* round) takes a Tiny Treats tree mesh standing on the ground;
#   the pine tiers (Pine*) and round crowns (Crown*) become empty meshes;
# - flowers (Flower*): Tiny Treats flowers;
# - clouds (Cl*), pond stones (PStone*): subdivided, smooth;
# - volcano, lava, palm trunks: bevelled; palm leaves: smooth;
# - every other mesh: cute.soften (the builders also run cute.soften_scene last).
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector  # noqa: E402

from common import descendants, eval_world_verts, parse_args  # noqa: E402
from cute import chibi, chibi_materials, import_joined, key_chibi, soften, tt_model  # noqa: E402

TREE_MODEL = {'PTr': ('tree_large', 0.45), 'RTr': ('tree', 0.5)}  # (Tiny Treats model, scale)
TREE_PACK = 'Pretty-Park'  # Homely House has its own `tree` / `tree_large`
FLOWER_MODELS = ['flower_A', 'flower_B']
FLOWER_SCALE = 1.2
CLOUD_SUBDIV = 2
STONE_SUBDIV = 2
VOLCANO_BEVEL = 0.35
PALM_TRUNK_BEVEL = 0.03
SEED = 16
# The island Shiba's chibi colours (art/src is vendored art, so they are written here; they mirror
# Tokens colors and build_map.py recolours `Main` anyway).
SHIBA_SOURCE_COLOURS = {'creatureOrange': '#FF9A3C', 'creatureLight': '#FFF8EE', 'iconInk': '#1F2433',
                        'counterTop': '#FFFFFF', 'tintPink': '#FF9EC4', 'creaturePink': '#FF6FA8'}
SHIBA_EXTRA_YAW_DEG = -60.0  # the Quaternius dog stood side-on; the chibi turns its face to the map camera
CHIBI_UNIT_HEIGHT = 2.1  # cute.chibi paws to ear tips at scale 1


def mesh_from(model, store):
    """One shared mesh datablock per model (imported once, the helper object removed)."""
    obj = import_joined(tt_model(model, TREE_PACK), f'tt-{model}')
    me = obj.data
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    bpy.data.objects.remove(obj)
    me['cute'] = 1
    store.append(me)
    return me


def ground_z(obj):
    return obj.matrix_world.translation.z - obj.dimensions.z / 2


def subdivide(obj, levels):
    m = obj.modifiers.new('cute-soft', 'SUBSURF')
    m.levels = m.render_levels = levels
    soften(obj, 180.0)


def bevel(obj, width):
    m = obj.modifiers.new('cute-round', 'BEVEL')
    m.width = width
    m.segments = 5
    m.limit_method = 'ANGLE'
    soften(obj, 60.0)


def bake_modifiers():
    """The builders allow no subdivision modifier (build_map checks): the cute-* modifiers are applied."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.type != 'MESH' or not any(m.name.startswith('cute-') for m in o.modifiers):
            continue
        sharp = o.data.get('softened')
        me = bpy.data.meshes.new_from_object(o.evaluated_get(depsgraph))
        for m in [m for m in o.modifiers if m.name.startswith('cute-')]:
            o.modifiers.remove(m)
        o.data = me
        if sharp:
            me['softened'] = 1


def swap_shiba():
    """The island's Shiba (A_Shiba, Quaternius) becomes the chibi dog: same root name, place and height."""
    old = bpy.data.objects['A_Shiba']
    parts = descendants(old)[1:]
    pts = eval_world_verts(parts, bpy.context.evaluated_depsgraph_get())
    height = max(p.z for p in pts) - min(p.z for p in pts)
    # build_map anchors the ice-cream station on its sprites' XY bounds: the chibi keeps the old dog's
    # front edge (min y) and x centre, so the station anchor and its decoration slots do not move.
    old_front = min(p.y for p in pts)
    old_cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    coll = old.users_collection[0]
    mw = old.matrix_world.copy()
    ground = min(p.z for p in pts)
    for o in reversed(parts):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.objects.remove(old, do_unlink=True)
    rig = chibi('dog', 'shiba', coll, chibi_materials(SHIBA_SOURCE_COLOURS, SHIBA_SOURCE_COLOURS['creatureOrange'],
                                                      SHIBA_SOURCE_COLOURS['creatureLight']))
    root = rig['root']
    root.name = 'A_Shiba'
    loc, rot, _scale = mw.decompose()
    root.location = (loc.x, loc.y, ground)
    root.rotation_euler = (0.0, 0.0, rot.to_euler().z + math.radians(SHIBA_EXTRA_YAW_DEG))
    root.scale = (height / CHIBI_UNIT_HEIGHT,) * 3
    key_chibi(rig, 1)
    bpy.context.view_layer.update()
    new = eval_world_verts(rig['meshes'], bpy.context.evaluated_depsgraph_get())
    root.location.x += old_cx - (min(p.x for p in new) + max(p.x for p in new)) / 2
    root.location.y += old_front - min(p.y for p in new)


def main():
    args = parse_args('make_source_v3', required=('out',))
    random.seed(SEED)
    swap_shiba()
    store = []
    meshes = {key: mesh_from(model, store) for key, (model, _s) in TREE_MODEL.items()}
    flowers = [mesh_from(m, store) for m in FLOWER_MODELS]
    empty = bpy.data.meshes.new('cute-none')
    counts = {'trees': 0, 'tiers': 0, 'flowers': 0, 'clouds': 0, 'stones': 0}
    objs = list(bpy.data.objects)
    # Each new tree's canopy is no wider than the old one (build_map checks decoration slots for clear
    # ground by ray casts, so a wider canopy would cover a slot): canopy radius per trunk suffix.
    canopy = {}
    for o in objs:
        if o.type == 'MESH' and o.name.startswith(('Pine', 'Crown')):
            suffix = o.name[5:] if o.name.startswith('Crown') else o.name[4:-1]
            canopy[suffix] = max(canopy.get(suffix, 0.0), max(o.dimensions.x, o.dimensions.y) / 2)
    radius = {key: max(math.hypot(v.co.x, v.co.y) for v in me.vertices) for key, me in meshes.items()}
    for o in objs:
        if o.type != 'MESH':
            continue
        n = o.name
        if n.startswith(('PTr', 'RTr')):
            key = n[:3]
            z = ground_z(o)
            o.data = meshes[key]
            o.location.z = z
            o.rotation_euler = (0.0, 0.0, random.uniform(0.0, 2 * math.pi))
            fit = canopy[n[3:]] / radius[key] if n[3:] in canopy else TREE_MODEL[key][1]
            o.scale = (min(TREE_MODEL[key][1], fit),) * 3
            o['cute'] = 1
            counts['trees'] += 1
        elif n.startswith(('Pine', 'Crown')):
            o.data = empty
            counts['tiers'] += 1
        elif n.startswith('Flower'):
            z = ground_z(o)
            o.data = flowers[counts['flowers'] % len(flowers)]
            o.location.z = z
            o.rotation_euler = (0.0, 0.0, random.uniform(0.0, 2 * math.pi))
            o.scale = (FLOWER_SCALE,) * 3
            o['cute'] = 1
            counts['flowers'] += 1
        elif n.startswith('Cl') and o.users_collection and o.users_collection[0].name == 'Sky':
            subdivide(o, CLOUD_SUBDIV)
            counts['clouds'] += 1
        elif n.startswith('PStone'):
            subdivide(o, STONE_SUBDIV)
            counts['stones'] += 1
        elif n in ('Volcano', 'Lava'):
            bevel(o, VOLCANO_BEVEL)
        elif n.startswith('PalmT'):
            bevel(o, PALM_TRUNK_BEVEL)
        elif n.startswith('PalmL'):
            soften(o, 180.0)
        else:
            soften(o, 180.0 if any(m.type == 'ARMATURE' for m in o.modifiers) else 45.0)
    bake_modifiers()
    print('make_source_v3: ' + ', '.join(f'{k} {v}' for k, v in counts.items()))
    bpy.ops.file.pack_all()  # the Tiny Treats texture atlas travels inside the source
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)


main()
