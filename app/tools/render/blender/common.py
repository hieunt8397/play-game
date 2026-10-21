# Helpers shared by the Blender builders (Stories 1.4, 1.8; Story 3.5 adds the dino dressing). Imported
# by build_<screen>.py, which put this folder on sys.path first. Pure bpy/bmesh; nothing here reads
# design values on its own (colours are passed in).
import json
import sys

import bmesh
import bpy
from mathutils import Vector


def parse_args(tool, required=('out', 'params')):
    """`-- --out <path> --params <json>` → dict; `params` is parsed."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = {}
    for i in range(0, len(argv) - 1, 2):
        args[argv[i].lstrip('-')] = argv[i + 1]
    for key in required:
        if key not in args:
            raise RuntimeError(f'{tool}: missing --{key}')
    if 'params' in args:
        with open(args['params'], encoding='utf8') as f:
            args['params'] = json.load(f)
    return args


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_colour):
    h = hex_colour.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def descendants(obj):
    out = [obj]
    for child in obj.children:
        out.extend(descendants(child))
    return out


def principled(material):
    if material is None or material.node_tree is None:
        return None
    return next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


def recolor_creature(root, mat_base, hex_colour):
    """Sets the base colour of every material named `mat_base` (any .NNN suffix) under `root`.
    Returns how many material slots were changed (0 = nothing matched)."""
    hit = 0
    for o in descendants(root):
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.name.split('.')[0] != mat_base:
                continue
            bsdf = principled(m)
            if bsdf is None:
                continue
            bsdf.inputs['Base Color'].default_value = hex_to_linear(hex_colour)
            hit += 1
    return hit


def force_opaque(objs):
    """FBX imports leave Alpha = 0: every material becomes Alpha 1 and opaque."""
    for o in objs:
        for slot in getattr(o, 'material_slots', []):
            m = slot.material
            bsdf = principled(m)
            if bsdf is not None:
                bsdf.inputs['Alpha'].default_value = 1.0
            if m is not None:
                if hasattr(m, 'surface_render_method'):
                    m.surface_render_method = 'DITHERED'
                if hasattr(m, 'blend_method'):
                    m.blend_method = 'OPAQUE'


def flat_material(name, hex_colour, roughness=0.6):
    """A plain Principled material with the given sRGB hex base colour."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = principled(m)
    bsdf.inputs['Base Color'].default_value = hex_to_linear(hex_colour)
    bsdf.inputs['Roughness'].default_value = roughness
    return m


def eval_world_verts(objs, depsgraph):
    pts = []
    for o in objs:
        if o.type != 'MESH' or o.hide_render:
            continue
        ev = o.evaluated_get(depsgraph)
        me = ev.to_mesh()
        mw = ev.matrix_world
        pts.extend(mw @ v.co for v in me.vertices)
        ev.to_mesh_clear()
    return pts


def add_empty(name, loc, coll):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.3
    coll.objects.link(e)
    return e


def hull_object(name, pts, coll):
    bm = bmesh.new()
    verts = [bm.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=verts)
    junk = list({g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)})
    bmesh.ops.delete(bm, geom=junk, context='VERTS')
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def move_to(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


# --- Story 3.5: the shared dino dressing (moved from build_dino_puzzle.py, Story 3.3) -----------------
# The gentle Quaternius dinosaurs (never a meat-eater): recoloured by material name and given
# builder-made eyes (the FBX have none). Used by build_dino_puzzle.py and build_shadow_match.py.

# Material name (without .NNN) → colour role, per species (FBX materials, inspected 2026-10-08).
MATERIAL_ROLES = {
    'apatosaurus': {'Brown': 'body', 'Material': 'belly'},
    'triceratops': {'Purple': 'body', 'LightBrown': 'belly', 'Brown': 'accent'},
    'stegosaurus': {'DarkBrown': 'body', 'LightBrown': 'belly', 'Brown': 'accent'},
}
# Role → (colour table, token) per species: 'colours' = Tokens.colors, 'dino' = Tokens.art.dino.
ROLE_COLOURS = {
    'apatosaurus': {'body': ('colours', 'creatureBlue'), 'belly': ('dino', 'apatosaurusBelly')},
    'triceratops': {'body': ('colours', 'creatureGreen'), 'belly': ('dino', 'triceratopsBelly'), 'accent': ('dino', 'horn')},
    'stegosaurus': {'body': ('colours', 'creatureOrange'), 'belly': ('dino', 'stegosaurusBelly'), 'accent': ('colours', 'creaturePink')},
}

# Builder-made eyes, placed on the head's surface in the rest pose and parented to the `Head` bone.
# Fractions of the head's extent (vertices whose dominant bone is `Head`) along the facing (0 = back of
# the head, 1 = snout) and up; `radius` is a fraction of the head's height; the eye sinks `sink` × radius
# into the surface.
EYES = {
    'apatosaurus': {'along': 0.55, 'up': 0.62, 'radius': 0.3, 'sink': 0.45},
    'triceratops': {'along': 0.55, 'up': 0.6, 'radius': 0.085, 'sink': 0.45},
    'stegosaurus': {'along': 0.55, 'up': 0.62, 'radius': 0.24, 'sink': 0.45},
}
PUPIL_SCALE = 0.55  # of the eye radius
PUPIL_OUT = 0.62  # pupil centre, outwards from the eye centre (× eye radius)
PUPIL_FORWARD = 0.3  # and towards the snout (× eye radius)
LID_SCALE = 1.08  # the blink lid covers the white
LID_FLAT = 0.55  # the lid disc's thickness along the lateral axis (× its radius)
LID_OUT = 0.35  # the lid sits this far out (× eye radius)


def key_constant(owner):
    """Every keyframe of the owner's action becomes CONSTANT (frames never blend)."""
    ad = owner.animation_data
    if ad is None or ad.action is None:
        return
    for fc in getattr(ad.action, 'fcurves', []):
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT'
    # Blender 5 layered actions keep their curves in channelbags.
    for layer in getattr(ad.action, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                for fc in bag.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation = 'CONSTANT'


def sphere(name, radius, mat, coll, segments=16, rings=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    for poly in me.polygons:
        poly.use_smooth = True
    return o


def dominant_bones(mesh_obj):
    """Vertex index → name of its highest-weight bone group (None when unweighted)."""
    names = {g.index: g.name for g in mesh_obj.vertex_groups}
    out = []
    for v in mesh_obj.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        out.append(names.get(best.group) if best is not None and best.weight > 0 else None)
    return out


def key_scale(obj, frames_factor):
    """Keys the object's scale × factor (per axis) at each frame; its current scale is the 1×."""
    base = obj.scale.copy()
    for f, k in frames_factor:
        obj.scale = Vector((base.x * k.x, base.y * k.y, base.z * k.z))
        obj.keyframe_insert('scale', frame=f)
    key_constant(obj)


def dino_materials(species, meshes, colours, warn):
    """Every material slot becomes a flat material of its MATERIAL_ROLES role (unknown → body, warned
    once per material); plus the eye white and pupil materials. `colours` = {'colours': Tokens.colors
    hex, 'dino': Tokens.art.dino hex}."""
    roles = MATERIAL_ROLES[species]
    mats = {}
    for role, (where, token) in ROLE_COLOURS[species].items():
        mats[role] = flat_material(f'dino-{species}-{role}', colours[where][token])
    warned = set()
    for o in meshes:
        for slot in o.material_slots:
            base = slot.material.name.split('.')[0] if slot.material else ''
            role = roles.get(base)
            if role is None:
                role = 'body'
                if base not in warned:
                    warned.add(base)
                    warn(f'{species}: material "{base}" is not in MATERIAL_ROLES — body colour')
            slot.material = mats[role]
    mats['white'] = flat_material(f'dino-{species}-eye', colours['colours']['counterTop'], roughness=0.3)
    mats['pupil'] = flat_material(f'dino-{species}-pupil', colours['colours']['iconInk'], roughness=0.3)
    return mats


def dino_eyes(species, arm, mesh, forward, lateral, mats, coll, frames, blink_frame=None):
    """Two eyes (white + pupil + blink lid) on the head, parented to the Head bone. Every frame of
    `frames` is keyed: the pupils hide and the lids show at `blink_frame` only (None: never). Returns
    the eye objects visible outside a blink (whites and pupils) and every eye object."""
    spec = EYES[species]
    dom = dominant_bones(mesh)
    mw = mesh.matrix_world
    pts = [mw @ mesh.data.vertices[i].co for i, b in enumerate(dom) if b == 'Head']
    if len(pts) < 4:
        raise RuntimeError(f'dress_dino: {species}: too few Head vertices for the eyes')
    up = Vector((0.0, 0.0, 1.0))
    fs = [p.dot(forward) for p in pts]
    us = [p.dot(up) for p in pts]
    f0, f1, u0, u1 = min(fs), max(fs), min(us), max(us)
    fa = f0 + spec['along'] * (f1 - f0)
    ua = u0 + spec['up'] * (u1 - u0)
    r = spec['radius'] * (u1 - u0)
    near = [p for p in pts if abs(p.dot(forward) - fa) < 0.25 * (f1 - f0) and abs(p.dot(up) - ua) < 0.3 * (u1 - u0)] or pts
    centre_l = sum((p.dot(lateral) for p in pts)) / len(pts)
    visible, every = [], []
    for side in (1.0, -1.0):
        lat = max(((p.dot(lateral) - centre_l) * side for p in near))
        out = lateral * side
        c = forward * fa + up * ua + lateral * centre_l + out * (lat - spec['sink'] * r)
        white = sphere(f'eye-{species}-{"l" if side > 0 else "r"}', r, mats['white'], coll)
        white.location = c
        pupil = sphere(f'pupil-{species}-{"l" if side > 0 else "r"}', r * PUPIL_SCALE, mats['pupil'], coll)
        pupil.location = c + out * (PUPIL_OUT * r) + forward * (PUPIL_FORWARD * r)
        lid = sphere(f'lid-{species}-{"l" if side > 0 else "r"}', r * LID_SCALE, mats['body'], coll)
        lid.location = c + out * (LID_OUT * r)
        # The lid disc is flat along the lateral axis.
        lid.rotation_mode = 'QUATERNION'
        lid.rotation_quaternion = out.to_track_quat('Z', 'Y')
        for o in (white, pupil, lid):
            bpy.context.view_layer.update()
            world = o.matrix_world.copy()
            o.parent = arm
            o.parent_type = 'BONE'
            o.parent_bone = 'Head'
            bpy.context.view_layer.update()
            o.matrix_world = world
        bpy.context.view_layer.update()
        lid_s = Vector((1.0, 1.0, LID_FLAT))
        key_scale(pupil, [(f, Vector((0.0, 0.0, 0.0)) if f == blink_frame else Vector((1.0, 1.0, 1.0))) for f in frames])
        key_scale(lid, [(f, lid_s if f == blink_frame else Vector((0.0, 0.0, 0.0))) for f in frames])
        visible.extend([white, pupil])
        every.extend([white, pupil, lid])
    return visible, every


def dress_dino(arm, meshes, species, colours, forward, lateral, coll, frames, blink_frame=None, warn=print):
    """Story 3.5 (shared with Story 3.3): recolours a gentle dinosaur by MATERIAL_ROLES and gives it the
    builder-made eyes (EYES) parented to its Head bone. Call it in the rest pose, with the model already
    turned to its facing (`forward`, `lateral`: world unit vectors). Returns {'mats', 'visible_eyes', 'eyes'}."""
    mats = dino_materials(species, meshes, colours, warn)
    visible, every = dino_eyes(species, arm, meshes[0], forward, lateral, mats, coll, frames, blink_frame)
    return {'mats': mats, 'visible_eyes': visible, 'eyes': every}
