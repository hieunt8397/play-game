# The soft "cute toy" look (2026-10-16): replaces the faceted low-poly style everywhere.
#
# - `tt_model(name)` / `import_joined(path)`: Tiny Treats / KayKit (CC0, assets/tinytreats, assets/kaykit)
#   glTF models, imported as one joined mesh with its origin at the bottom centre.
# - `soften(obj)` / `soften_scene(scene)`: smooth shading (skinned and organic meshes fully smooth,
#   props smooth below 65° so their hard edges stay); runs as the last step of every builder.
# - `chibi(kind, ...)` / `key_chibi(...)`: a big-headed toy animal (dog or fox) built from primitives,
#   with head / tail pivots and a tongue for the builders' idle, eat and happy frames. Its fur
#   materials are named `Main` and `Main_Light`, so common.recolor_creature recolours it like the
#   Quaternius animals it replaces.
#   2026-10-22 (Hang tìm bóng): also the farm kinds 'cow', 'horse', 'donkey' and 'stag' (FARM_KINDS),
#   each with its outline cue: horns + tail tuft, mane + long tail, long ears, antlers.
# - Soft toy shapes (`mat`, `blob`, `rbox`, `lathe`, `rod`, `torus`, `wheel`, `chibi_face`, …) and the soft
#   bus / truck / tractor (moved here from build_touch_talk.py on 2026-10-22, shared with build_shadow_match.py).
import glob
import math
import os

import bmesh
import bpy
from mathutils import Vector

from common import flat_material

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
PACKS = [os.path.join(ASSETS, 'tinytreats'), os.path.join(ASSETS, 'kaykit')]

PROP_SMOOTH_DEG = 65.0  # props: faces meeting at less than this shade smooth (icosphere rocks too), box edges stay crisp
SKIP_PREFIXES = ('hit.', 'slot.', 'anchor.', 'area.')


def tt_model(name, pack=None):
    """The glTF path of a Tiny Treats / KayKit model by file stem; raises naming it when missing.
    `pack` (a substring of the pack folder, e.g. 'Pretty-Park') picks one when several packs share a stem."""
    for root in PACKS:
        hits = sorted(glob.glob(os.path.join(root, '**', 'gltf', f'{name}.gltf'), recursive=True))
        if pack is not None:  # only the pack folder (the first component under the root) is matched
            hits = [h for h in hits if pack in os.path.relpath(h, root).split(os.sep)[0]]
        if hits:
            return hits[0]
    where = f' in a "{pack}" pack' if pack else ''
    raise RuntimeError(f'cute: model "{name}"{where} not found under assets/tinytreats or assets/kaykit')


def import_joined(path, name):
    """Imports a glTF into the active collection as ONE mesh object (transforms applied), origin at
    the bottom centre of its bounds. Marked `cute` so soften_scene leaves its authored normals."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    if not meshes:
        raise RuntimeError(f'cute: {path} has no mesh')
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
    vs = [v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    shift = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in obj.data.vertices:
        v.co -= shift
    obj.name = name
    obj.data.name = name
    obj['cute'] = 1
    return obj


def model_height(obj):
    return max(v.co.z for v in obj.data.vertices) - min(v.co.z for v in obj.data.vertices)


def clear_custom_normals(obj):
    me = obj.data
    if getattr(me, 'has_custom_normals', False):
        try:
            with bpy.context.temp_override(object=obj, active_object=obj):
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
        except RuntimeError as e:  # an object outside the active scene: its authored normals stay
            print(f'cute: kept the custom normals of {obj.name} ({e})')


def soften(obj, angle_deg=PROP_SMOOTH_DEG):
    """Smooth shading; faces meeting at less than `angle_deg` blend, sharper edges stay crisp."""
    if obj.type != 'MESH' or obj.get('cute') or obj.name.startswith(SKIP_PREFIXES):
        return
    if obj.data.users > 1 and obj.data.get('softened'):
        return
    clear_custom_normals(obj)
    obj.data.shade_smooth()
    obj.data.set_sharp_from_angle(angle=math.radians(angle_deg))
    obj.data['softened'] = 1


def is_organic(obj):
    return any(m.type == 'ARMATURE' for m in obj.modifiers) or (obj.parent is not None and obj.parent.type == 'ARMATURE')


def soften_scene(scene):
    """The builders' last step: every mesh in the scene gets the soft shading (skinned meshes fully
    smooth, the rest below PROP_SMOOTH_DEG). Hidden layout geometry is left alone. A multi-plate file
    (touch-talk) has several scenes: all of them are softened."""
    for sc in bpy.data.scenes:
        for obj in sc.objects:
            if obj.type == 'MESH':
                soften(obj, 180.0 if is_organic(obj) else PROP_SMOOTH_DEG)


# --- chibi animals ------------------------------------------------------------------------------------
# Built at a unit size (paws at z 0, about 2.0 tall to the ear tips), facing -Y; the caller scales and
# turns the returned root. Parts are UV spheres / cones / tori, all smooth shaded.

def _part(name, mat, loc, scale, parent, kind='sphere', rot=(0.0, 0.0, 0.0), coll=None):
    if kind == 'sphere':
        me = bpy.data.meshes.new(name)
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=1.0)
        bm.to_mesh(me)
        bm.free()
    elif kind == 'cone':
        me = bpy.data.meshes.new(name)
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=28, radius1=1.0, radius2=0.08, depth=2.0)
        bm.to_mesh(me)
        bm.free()
    else:  # torus (the curled shiba tail)
        bpy.ops.mesh.primitive_torus_add(major_radius=1.0, minor_radius=0.34, major_segments=40, minor_segments=14)
        tmp = bpy.context.object
        me = tmp.data
        bpy.data.objects.remove(tmp, do_unlink=True)
        me.name = name
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    (coll or parent.users_collection[0]).objects.link(o)
    o.parent = parent
    o.location = loc
    o.scale = scale
    o.rotation_euler = rot
    o['cute'] = 1
    return o


def _pivot(name, loc, parent, coll):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.2
    coll.objects.link(e)
    e.parent = parent
    e.location = loc
    return e


def chibi_materials(colours, fur_hex, light_hex):
    """Fur (`Main`), face/belly (`Main_Light`) and the face details, from Tokens colours."""
    return {
        'fur': flat_material('Main', fur_hex, 0.6),
        'light': flat_material('Main_Light', light_hex, 0.6),
        'ink': flat_material('chibi-ink', colours['iconInk'], 0.25),
        'shine': flat_material('chibi-shine', colours['counterTop'], 0.2),
        'blush': flat_material('chibi-blush', colours['tintPink'], 0.6),
        'tongue': flat_material('chibi-tongue', colours['creaturePink'], 0.45),
    }


# Story 6.1: eye openness (scale of each eye and its shine) for key_chibi's `eyes`.
EYE_SCALE = (0.095, 0.06, 0.115)
SHINE_SCALE = (0.03, 0.02, 0.035)
EYE_SQUINT_Z = 0.045  # a squeezed, grimacing / shivering eye
EYE_SHUT_Z = 0.014  # a closed eye: a thin line
EYE_CLOSED_WIDEN = 1.15  # a squeezed eye is a little wider
HIDDEN_SCALE = (0.0001, 0.0001, 0.0001)
NOSE_CREAM_SCALE = (0.15, 0.1, 0.1)  # the ice-cream blob sneezed onto the nose (bigger than the nose: it reads as a dollop)


def chibi(kind, name, coll, mats, nose_cream=False):
    """A toy dog ('dog', shiba-like) or fox ('fox'), or a farm kind (FARM_KINDS: cow, horse, donkey, stag;
    _chibi_farm). Returns a rig dict: root, head, tail, tongue, meshes,
    eyes (Story 6.1: [(kind, part)] of the eyes and shines, for key_chibi's `eyes`), nose, and cream (the
    hidden nose-cream blob when `nose_cream`, made of `mats['cream']`; else None)."""
    if kind in FARM_KINDS:
        if nose_cream:
            raise RuntimeError(f'cute: chibi "{kind}" has no nose cream')
        return _chibi_farm(kind, name, coll, mats)
    if kind not in ('dog', 'fox'):
        raise RuntimeError(f'cute: chibi kind "{kind}" is not dog | fox | {" | ".join(FARM_KINDS)}')
    fox = kind == 'fox'
    root = _pivot(f'{name}-root', (0.0, 0.0, 0.0), None, coll)
    body = _pivot(f'{name}-body', (0.0, 0.0, 0.0), root, coll)
    fur, light, ink = mats['fur'], mats['light'], mats['ink']
    # body, belly, legs
    _part(f'{name}-torso', fur, (0, 0.06, 0.55), (0.42, 0.44, 0.44), body, coll=coll)
    _part(f'{name}-belly', light, (0, -0.2, 0.5), (0.3, 0.22, 0.33), body, coll=coll)
    for sx, side in ((-1, 'L'), (1, 'R')):
        _part(f'{name}-leg{side}', fur, (0.2 * sx, -0.14, 0.15), (0.13, 0.13, 0.17), body, coll=coll)
        _part(f'{name}-paw{side}', light, (0.2 * sx, -0.24, 0.06), (0.12, 0.12, 0.07), body, coll=coll)
        _part(f'{name}-hind{side}', fur, (0.28 * sx, 0.28, 0.16), (0.15, 0.17, 0.15), body, coll=coll)
    # tail: shiba curls a torus over its back, the fox carries a big brush with a light tip
    tail = _pivot(f'{name}-tail', (0.0, 0.42, 0.62), body, coll)
    if fox:
        _part(f'{name}-brush', fur, (0, 0.28, 0.22), (0.2, 0.36, 0.2), tail, rot=(math.radians(-40), 0, 0), coll=coll)
        _part(f'{name}-brush-tip', light, (0, 0.55, 0.45), (0.14, 0.16, 0.14), tail, coll=coll)
    else:
        _part(f'{name}-curl', fur, (0, 0.05, 0.2), (0.17, 0.17, 0.17), tail, kind='torus', rot=(0, math.radians(90), 0), coll=coll)
    # head on a neck pivot
    hz = 1.33
    head = _pivot(f'{name}-head', (0.0, -0.02, 0.95), body, coll)

    def hp(z):
        return z - 0.95

    _part(f'{name}-skull', fur, (0, -0.03, hp(hz)), (0.62, 0.55, 0.55), head, coll=coll)
    _part(f'{name}-face', light, (0, -0.28, hp(hz - 0.16)), (0.46, 0.32, 0.33), head, coll=coll)
    snout_y, snout_s = (-0.62, (0.18, 0.22, 0.13)) if fox else (-0.55, (0.2, 0.15, 0.13))
    _part(f'{name}-snout', light, (0, snout_y, hp(hz - 0.14)), snout_s, head, coll=coll)
    nose_at = (0, snout_y - (0.2 if fox else 0.14), hp(hz - 0.07))
    nose = _part(f'{name}-nose', ink, nose_at, (0.07, 0.05, 0.05), head, coll=coll)
    cream = None
    if nose_cream:
        # Story 6.1: a blob of ice cream on the nose tip, a little forward and up; hidden until keyed.
        cream = _part(f'{name}-nose-cream', mats['cream'], (nose_at[0], nose_at[1] - 0.03, nose_at[2] + 0.06), HIDDEN_SCALE, head, coll=coll)
    tongue = _part(f'{name}-tongue', mats['tongue'], (0, snout_y - 0.05, hp(hz - 0.3)), (0.07, 0.09, 0.03), head, coll=coll)
    ear_h, ear_w = ((0.3, 0.2) if fox else (0.2, 0.17))
    eyes = []
    for sx, side in ((-1, 'L'), (1, 'R')):
        tilt = (0, math.radians(-16 * sx), 0)
        ear_z = hp(hz + 0.42 + ear_h * 0.5)
        _part(f'{name}-ear{side}', fur, (0.34 * sx, 0.0, ear_z), (ear_w, 0.11, ear_h), head, kind='cone', rot=tilt, coll=coll)
        _part(f'{name}-ear-in{side}', ink if fox else light, (0.34 * sx, -0.06, ear_z + (0.12 if fox else -0.03)),
              (ear_w * 0.55, 0.06, ear_h * (0.45 if fox else 0.7)), head, kind='cone', rot=tilt, coll=coll)
        eyes.append(('eye', _part(f'{name}-eye{side}', ink, (0.24 * sx, -0.52, hp(hz + 0.08)), EYE_SCALE, head, coll=coll)))
        eyes.append(('shine', _part(f'{name}-shine{side}', mats['shine'], (0.21 * sx, -0.575, hp(hz + 0.13)), SHINE_SCALE, head, coll=coll)))
        _part(f'{name}-cheek{side}', mats['blush'], (0.36 * sx, -0.45, hp(hz - 0.1)), (0.09, 0.04, 0.06), head, coll=coll)
    meshes = [o for o in coll.objects if o.type == 'MESH' and o.name.startswith(f'{name}-')]
    return {'root': root, 'body': body, 'head': head, 'tail': tail, 'tongue': tongue, 'meshes': meshes,
            'eyes': eyes, 'nose': nose, 'cream': cream}

# --- chibi farm animals (2026-10-22, Hang tìm bóng) ----------------------------------------------------------
# Same unit frame as chibi() (paws at z 0, facing -Y), a big head on a short body, but on longer legs with
# hooves and a forward muzzle, so the five quadrupeds read apart in silhouette by their outline cue
# (content/games/shadow-match.ts › features): cow horns + tail tuft, horse mane + long tail, donkey long
# ears, stag antlers. `mats` = chibi_materials(...) plus optional 'hoof', 'horn', 'mane', 'patch',
# 'muzzle' (each falls back to ink / light).
# kind → leg height, torso radii (x, y, z), head radii, muzzle radii, ear (width, height, tilt°).
FARM_KINDS = ('cow', 'horse', 'donkey', 'stag')
FARM_SHAPES = {
    'cow': {'leg': 0.24, 'torso': (0.44, 0.58, 0.4), 'head': (0.5, 0.44, 0.44), 'muzzle': (0.3, 0.2, 0.19), 'ear': (0.16, 0.08, 90.0)},
    'horse': {'leg': 0.36, 'torso': (0.36, 0.56, 0.34), 'head': (0.44, 0.44, 0.44), 'muzzle': (0.24, 0.26, 0.2), 'ear': (0.09, 0.15, 10.0)},
    'donkey': {'leg': 0.28, 'torso': (0.38, 0.5, 0.36), 'head': (0.46, 0.44, 0.44), 'muzzle': (0.26, 0.22, 0.2), 'ear': (0.1, 0.36, 12.0)},
    'stag': {'leg': 0.4, 'torso': (0.32, 0.5, 0.31), 'head': (0.42, 0.4, 0.4), 'muzzle': (0.2, 0.2, 0.16), 'ear': (0.14, 0.08, 70.0)},
}


def _euler(rot):
    from mathutils import Euler
    return Euler(rot, 'XYZ')


def _chibi_farm(kind, name, coll, mats):
    sh = FARM_SHAPES[kind]
    fur, light, ink = mats['fur'], mats['light'], mats['ink']
    hoof = mats.get('hoof', ink)
    horn = mats.get('horn', light)
    mane = mats.get('mane', ink)
    patch = mats.get('patch', ink)
    muzzle = mats.get('muzzle', light)
    root = _pivot(f'{name}-root', (0.0, 0.0, 0.0), None, coll)
    body = _pivot(f'{name}-body', (0.0, 0.0, 0.0), root, coll)
    leg = sh['leg']
    tx, ty, tz_r = sh['torso']
    tz = leg + tz_r * 0.85  # the torso's centre: its belly just above the legs
    _part(f'{name}-torso', fur, (0, 0.08, tz), (tx, ty, tz_r), body, coll=coll)
    _part(f'{name}-belly', light, (0, 0.02, tz - tz_r * 0.35), (tx * 0.8, ty * 0.78, tz_r * 0.6), body, coll=coll)
    # four legs (soft capsules) on little hooves
    front_y, back_y = 0.08 - ty * 0.55, 0.08 + ty * 0.6
    for sx, side in ((-1, 'L'), (1, 'R')):
        for ly, end in ((front_y, 'F'), (back_y, 'B')):
            x = tx * 0.55 * sx
            rod(f'{name}-leg{end}{side}', (x, ly, 0.06), (x, ly, tz), 0.1, fur, coll, body)
            _part(f'{name}-hoof{end}{side}', hoof, (x, ly, 0.05), (0.105, 0.105, 0.06), body, coll=coll)
    # neck and head (the head pivot sits on the neck top, a little forward)
    hx, hy, hz_r = sh['head']
    neck_top = (0.0, front_y - 0.12, tz + tz_r + 0.18)
    rod(f'{name}-neck', (0.0, front_y + 0.05, tz), neck_top, 0.17 if kind != 'stag' else 0.14, fur, coll, body)
    head = _pivot(f'{name}-head', neck_top, body, coll)
    hz = 0.24  # the skull centre above the pivot
    _part(f'{name}-skull', fur, (0, -0.06, hz), (hx, hy, hz_r), head, coll=coll)
    mx, my, mz = sh['muzzle']
    mu_y = -0.06 - hy * 0.8
    mu_z = hz - hz_r * 0.42
    _part(f'{name}-muzzle', muzzle, (0, mu_y, mu_z), (mx, my, mz), head, coll=coll)
    nose = None
    for sx, side in ((-1, 'L'), (1, 'R')):
        n = _part(f'{name}-nostril{side}', ink, (mx * 0.42 * sx, mu_y - my * 0.9, mu_z + mz * 0.15), (0.035, 0.02, 0.045), head, coll=coll)
        nose = nose or n
    tongue = _part(f'{name}-tongue', mats['tongue'], (0, mu_y - my * 0.6, mu_z - mz * 0.7), HIDDEN_SCALE, head, coll=coll)
    eyes = []
    for sx, side in ((-1, 'L'), (1, 'R')):
        ex, ey, ez = hx * 0.48 * sx, -0.06 - hy * 0.86, hz + hz_r * 0.12
        eyes.append(('eye', _part(f'{name}-eye{side}', ink, (ex, ey, ez), EYE_SCALE, head, coll=coll)))
        eyes.append(('shine', _part(f'{name}-shine{side}', mats['shine'], (ex - 0.03 * sx, ey - 0.055, ez + 0.05), SHINE_SCALE, head, coll=coll)))
        _part(f'{name}-cheek{side}', mats['blush'], (hx * 0.72 * sx, -0.06 - hy * 0.62, hz - hz_r * 0.2), (0.08, 0.04, 0.055), head, coll=coll)
    # ears
    ew, eh, tilt = sh['ear']
    for sx, side in ((-1, 'L'), (1, 'R')):
        if kind == 'cow':  # floppy ears sticking out sideways, under the horns
            _part(f'{name}-ear{side}', fur, (sx * (hx + 0.08), -0.02, hz + hz_r * 0.15), (0.17, 0.07, 0.09), head, rot=(0, math.radians(-15 * sx), 0), coll=coll)
            _part(f'{name}-ear-in{side}', mats['blush'], (sx * (hx + 0.09), -0.06, hz + hz_r * 0.15), (0.11, 0.03, 0.05), head, coll=coll)
        elif kind == 'stag':  # small ears out to the side, below the antlers
            _part(f'{name}-ear{side}', fur, (sx * (hx + 0.04), 0.0, hz + hz_r * 0.42), (0.15, 0.06, 0.08), head, rot=(0, math.radians(-25 * sx), 0), coll=coll)
        else:  # upright pointed ears: short (horse) or long (donkey), a little splayed
            base_z = hz + hz_r * 0.78
            rot = (math.radians(-8), math.radians(-tilt * sx), 0)
            _part(f'{name}-ear{side}', fur, (sx * hx * 0.5, 0.0, base_z + eh * 0.85), (ew, ew * 0.7, eh), head, kind='cone', rot=rot, coll=coll)
            _part(f'{name}-ear-in{side}', mats['blush'] if kind == 'donkey' else light, (sx * hx * 0.5, -0.04, base_z + eh * 0.8), (ew * 0.55, ew * 0.35, eh * 0.75), head, kind='cone', rot=rot, coll=coll)
            if kind == 'donkey':  # the dark ear tips
                tip = Vector((0.0, 0.0, eh * 1.55))
                tip.rotate(_euler(rot))
                _part(f'{name}-ear-tip{side}', ink, (sx * hx * 0.5 + tip.x, tip.y, base_z + eh * 0.85 + tip.z), (ew * 0.42, ew * 0.32, eh * 0.2), head, rot=rot, coll=coll)
    # the kind's outline cue
    tail = _pivot(f'{name}-tail', (0.0, 0.08 + ty * 0.92, tz + tz_r * 0.35), body, coll)
    if kind == 'cow':
        for sx, side in ((-1, 'L'), (1, 'R')):  # horns: short soft cones curving up and out
            h0 = Vector((sx * hx * 0.5, -0.04, hz + hz_r * 0.62))
            h1 = h0 + Vector((sx * 0.28, -0.02, 0.24))
            rod(f'{name}-horn{side}', tuple(h0), tuple(h1), 0.085, horn, coll, head)
            rod(f'{name}-horn-tip{side}', tuple(h1), tuple(h1 + Vector((sx * 0.03, 0.0, 0.18))), 0.065, horn, coll, head)
        rod(f'{name}-tail-rope', (0.0, 0.0, 0.0), (0.0, 0.16, -tz_r * 1.25), 0.035, fur, coll, tail)
        _part(f'{name}-tail-tuft', mane, (0.0, 0.17, -tz_r * 1.32), (0.07, 0.07, 0.11), tail, coll=coll)
        for i, (px, py, pz, r) in enumerate([(0.3, 0.2, 0.12, 0.2), (-0.32, -0.05, 0.05, 0.18), (0.22, -0.3, -0.08, 0.15), (-0.2, 0.4, 0.16, 0.14)]):
            _part(f'{name}-patch{i}', patch, (px * tx / 0.44 * 1.02, 0.08 + py, tz + pz), (r * 0.5, r, r * 0.8), body, coll=coll)
        _part(f'{name}-head-patch', patch, (hx * 0.55, -0.06 - hy * 0.25, hz + hz_r * 0.45), (0.18, 0.2, 0.14), head, coll=coll)
    elif kind == 'horse':
        for i in range(6):  # the mane: soft tufts along the head's crown and down the back of the neck
            t = i / 5
            _part(f'{name}-mane{i}', mane, (0.0, 0.02 + 0.5 * t, hz + hz_r * (0.95 - 1.6 * t)), (0.1, 0.16, 0.14), head, coll=coll)
        _part(f'{name}-forelock', mane, (0.0, -0.06 - hy * 0.45, hz + hz_r * 0.88), (0.12, 0.1, 0.1), head, coll=coll)
        _part(f'{name}-tail-hair', mane, (0.0, 0.2, -tz_r * 0.85), (0.11, 0.16, 0.42), tail, rot=(math.radians(-28), 0, 0), coll=coll)
    elif kind == 'donkey':
        rod(f'{name}-tail-rope', (0.0, 0.0, 0.0), (0.0, 0.12, -tz_r * 1.05), 0.03, fur, coll, tail)
        _part(f'{name}-tail-tuft', ink, (0.0, 0.13, -tz_r * 1.1), (0.06, 0.06, 0.09), tail, coll=coll)
        for i in range(4):  # a short dark crest
            _part(f'{name}-crest{i}', ink, (0.0, 0.02 + 0.12 * i, hz + hz_r * (0.92 - 0.35 * i)), (0.05, 0.08, 0.06), head, coll=coll)
    elif kind == 'stag':
        for sx, side in ((-1, 'L'), (1, 'R')):  # antlers: a soft beam out and up with three tines
            b0 = Vector((sx * hx * 0.38, 0.0, hz + hz_r * 0.82))
            b1 = b0 + Vector((sx * 0.22, 0.06, 0.32))
            b2 = b1 + Vector((sx * 0.12, 0.04, 0.3))
            rod(f'{name}-antler{side}-a', tuple(b0), tuple(b1), 0.045, horn, coll, head)
            rod(f'{name}-antler{side}-b', tuple(b1), tuple(b2), 0.04, horn, coll, head)
            rod(f'{name}-antler{side}-t1', tuple(b1), tuple(b1 + Vector((-sx * 0.1, -0.06, 0.2))), 0.035, horn, coll, head)
            rod(f'{name}-antler{side}-t2', tuple(b2), tuple(b2 + Vector((-sx * 0.12, -0.04, 0.14))), 0.032, horn, coll, head)
            rod(f'{name}-antler{side}-t3', tuple(b2), tuple(b2 + Vector((sx * 0.1, 0.02, 0.14))), 0.032, horn, coll, head)
        _part(f'{name}-tail-puff', light, (0.0, 0.05, 0.02), (0.08, 0.08, 0.1), tail, coll=coll)
        for i, (px, py, pz) in enumerate([(0.2, -0.1, 0.25), (-0.2, 0.0, 0.26), (0.1, 0.22, 0.28), (-0.12, 0.3, 0.24), (0.24, 0.32, 0.15)]):
            _part(f'{name}-spot{i}', light, (px, 0.08 + py, tz + pz * tz_r / 0.31), (0.05, 0.05, 0.035), body, coll=coll)
    meshes = [o for o in coll.objects if o.type == 'MESH' and o.name.startswith(f'{name}-')]
    return {'root': root, 'body': body, 'head': head, 'tail': tail, 'tongue': tongue, 'meshes': meshes,
            'eyes': eyes, 'nose': nose, 'cream': None}


def _eye_scale(kind, eyes):
    """Story 6.1: the scale of an eye ('eye') or its shine ('shine') for `eyes` 'open' | 'squint' | 'shut'."""
    if eyes == 'open':
        return EYE_SCALE if kind == 'eye' else SHINE_SCALE
    if kind == 'shine':
        return HIDDEN_SCALE
    return (EYE_SCALE[0] * EYE_CLOSED_WIDEN, EYE_SCALE[1], EYE_SQUINT_Z if eyes == 'squint' else EYE_SHUT_Z)


def key_chibi(rig, frame, head_pitch=0.0, head_roll=0.0, head_yaw=0.0, tail=0.0, tongue=False, bob=0.0, eyes=None, nose_cream=None):
    """Keys one pose: head pitch/roll/yaw and tail swing in degrees, tongue out or in, body bob (units).
    Story 6.1: `eyes` ('open' | 'squint' | 'shut') and `nose_cream` (bool; a chibi(nose_cream=True) rig)
    also key the eye / cream scales. Left None they are not keyed, so every older builder's keys stay."""
    head, tl, tg, body = rig['head'], rig['tail'], rig['tongue'], rig['body']
    head.rotation_euler = (math.radians(head_pitch), math.radians(head_roll), math.radians(head_yaw))
    tl.rotation_euler = (0.0, 0.0, math.radians(tail))
    tg.scale = (0.07, 0.09, 0.03) if tongue else (0.0001, 0.0001, 0.0001)
    body.location = (0.0, 0.0, bob)
    keyed = [(head, 'rotation_euler'), (tl, 'rotation_euler'), (tg, 'scale'), (body, 'location')]
    if eyes is not None:
        if eyes not in ('open', 'squint', 'shut'):
            raise RuntimeError(f'cute: key_chibi eyes "{eyes}" is not open | squint | shut')
        for kind, ob in rig.get('eyes', []):
            ob.scale = _eye_scale(kind, eyes)
            keyed.append((ob, 'scale'))
    if nose_cream is not None:
        if rig.get('cream') is None:
            raise RuntimeError('cute: key_chibi nose_cream needs a chibi(nose_cream=True) rig')
        rig['cream'].scale = NOSE_CREAM_SCALE if nose_cream else HIDDEN_SCALE
        keyed.append((rig['cream'], 'scale'))
    for ob, path in keyed:
        ob.keyframe_insert(path, frame=frame)
        fc_owner = ob.animation_data.action if ob.animation_data else None
        if fc_owner is not None:
            for kp in _keyframes(ob):
                kp.interpolation = 'CONSTANT'


def _keyframes(ob):
    ad = ob.animation_data
    if ad is None or ad.action is None:
        return []
    act = ad.action
    curves = []
    if hasattr(act, 'fcurves'):
        try:
            curves = list(act.fcurves)
        except Exception:
            curves = []
    if not curves and hasattr(act, 'layers'):
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    curves.extend(bag.fcurves)
    return [kp for fc in curves for kp in fc.keyframe_points]


# --- soft toy shapes (2026-10-22: moved from build_touch_talk.py, shared with build_shadow_match.py) ---------
# Materials are shared per (colour, roughness). Vehicles: length along y, front at -y, axles along x;
# `c` maps colour names (Tokens colours + art.touchTalk) to hex.

GLOSS = 0.38  # the props' toy-plastic roughness
EYE_GLOSS = 0.2


_MATS = {}


def mat(hex_colour, rough=GLOSS):
    """A shared plain material per (colour, roughness)."""
    key = (hex_colour.upper(), round(rough, 3))
    if key not in _MATS:
        _MATS[key] = flat_material(f'tt-{hex_colour.lstrip("#").lower()}-{int(rough * 100)}', hex_colour, rough)
    return _MATS[key]


# --- soft shapes (every shape's scale is baked into its mesh, so children are never skewed) -----------------

def mesh_obj(name, bm, material, coll, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in (material if isinstance(material, list) else [material]):
        me.materials.append(m)
    for poly in me.polygons:
        poly.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def place(o, parent, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0)):
    o.parent = parent
    o.location = loc
    o.rotation_euler = tuple(math.radians(a) for a in rot)
    return o


def blob(name, material, coll, parent, loc=(0.0, 0.0, 0.0), size=(1.0, 1.0, 1.0), rot=(0.0, 0.0, 0.0), seg=(40, 20), shape=None):
    """A smooth ellipsoid (radii `size`), optionally deformed by `shape(unit direction) → point`."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg[0], v_segments=seg[1], radius=1.0)
    for v in bm.verts:
        d = v.co.normalized()
        p = shape(d) if shape else d
        v.co = Vector((p.x * size[0], p.y * size[1], p.z * size[2]))
    return place(mesh_obj(name, bm, material, coll), parent, loc, rot)


def lathe_bm(profile, seg=40):
    """A surface of revolution about z from a (radius, z) profile (radius 0 closes an end)."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * j / seg), r * math.sin(2 * math.pi * j / seg), z)) for j in range(seg)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for j in range(seg):
            k = (j + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[k], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[j], a[k], b[0]))
            else:
                bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def lathe(name, profile, material, coll, parent, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), seg=40):
    return place(mesh_obj(name, lathe_bm(profile, seg), material, coll), parent, loc, rot)


def rounded_profile(r, z0, z1, round_=0.3, steps=6):
    """A capped cylinder's profile with rounded rims (radius r, from z0 to z1, rims of round_ × r)."""
    c = round_ * r
    out = [(0.0, z0)]
    for i in range(steps + 1):
        t = math.pi / 2 * i / steps
        out.append((r - c + c * math.sin(t), z0 + c - c * math.cos(t)))
    for i in range(steps + 1):
        t = math.pi / 2 * i / steps
        out.append((r - c + c * math.cos(t), z1 - c + c * math.sin(t)))
    out.append((0.0, z1))
    return out


def capsule_profile(r, length, steps=8):
    out = [(r * math.sin(math.pi / 2 * i / steps), r - r * math.cos(math.pi / 2 * i / steps)) for i in range(steps + 1)]
    out += [(r * math.cos(math.pi / 2 * i / steps), length - r + r * math.sin(math.pi / 2 * i / steps)) for i in range(steps + 1)]
    return out


def rod(name, a, b, r, material, coll, parent, seg=16):
    """A capsule from a to b (parent space)."""
    a, b = Vector(a), Vector(b)
    o = mesh_obj(name, lathe_bm(capsule_profile(r, max((b - a).length, 2 * r + 1e-4)), seg), material, coll)
    o.parent = parent
    o.location = a
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (b - a).to_track_quat('Z', 'Y')
    return o


def rbox(name, size, radius, material, coll, parent, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), seg=4):
    """A box with rounded edges and corners."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    r = min(radius, min(size) / 2 * 0.98)
    bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=r, segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
    return place(mesh_obj(name, bm, material, coll), parent, loc, rot)


def torus_bm(major, minor, arc=(0.0, 360.0), seg=40, tube=14):
    closed = arc[1] - arc[0] >= 360.0
    n = seg if closed else seg + 1
    bm = bmesh.new()
    grid = []
    for i in range(n):
        a = math.radians(arc[0] + (arc[1] - arc[0]) * i / seg)
        ring = []
        for k in range(tube):
            b = 2 * math.pi * k / tube
            ring.append(bm.verts.new(((major + minor * math.cos(b)) * math.cos(a), (major + minor * math.cos(b)) * math.sin(a), minor * math.sin(b))))
        grid.append(ring)
    for i in range(seg if closed else seg):
        i2 = (i + 1) % n
        for k in range(tube):
            k2 = (k + 1) % tube
            bm.faces.new((grid[i][k], grid[i2][k], grid[i2][k2], grid[i][k2]))
    if not closed:
        bm.faces.new(list(reversed(grid[0])))
        bm.faces.new(grid[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def torus(name, major, minor, material, coll, parent, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), arc=(0.0, 360.0)):
    return place(mesh_obj(name, torus_bm(major, minor, arc), material, coll), parent, loc, rot)


def ellipsoid_point(radii, direction):
    """The point of an ellipsoid (centred at the origin) along `direction` and its outward normal."""
    d = Vector(direction).normalized()
    t = 1.0 / math.sqrt(sum((d[i] / radii[i]) ** 2 for i in range(3)))
    p = d * t
    n = Vector(tuple(p[i] / radii[i] ** 2 for i in range(3))).normalized()
    return p, n


def chibi_face(prefix, parent, coll, c, eyes, size, cheeks=(), smile=None):
    """Big glossy ink eyes with a white shine (Tiệm kem style), pink cheeks and a small smile. `eyes`,
    `cheeks`: [(point, outward normal)] in the parent's space; `smile`: (point, normal, width)."""
    ink = mat(c['iconInk'], EYE_GLOSS)
    shine = mat(c['white'], EYE_GLOSS)
    blush = mat(c['tintPink'], 0.6)
    for i, (p, n) in enumerate(eyes):
        q = Vector(n).to_track_quat('Z', 'Y')
        e = blob(f'{prefix}-eye-{i}', ink, coll, parent, size=(0.78 * size, size, 0.45 * size), seg=(24, 12))
        e.rotation_mode = 'QUATERNION'
        e.rotation_quaternion = q
        e.location = Vector(p) + Vector(n) * 0.12 * size
        right = q @ Vector((1.0, 0.0, 0.0))
        s = blob(f'{prefix}-shine-{i}', shine, coll, parent, size=(0.26 * size, 0.3 * size, 0.12 * size), seg=(16, 8))
        s.rotation_mode = 'QUATERNION'
        s.rotation_quaternion = q
        s.location = e.location + Vector(n) * 0.4 * size + (q @ Vector((0.0, 1.0, 0.0))) * 0.42 * size - right * 0.25 * size
    for i, (p, n) in enumerate(cheeks):
        k = blob(f'{prefix}-cheek-{i}', blush, coll, parent, size=(0.55 * size, 0.38 * size, 0.14 * size), seg=(16, 8))
        k.rotation_mode = 'QUATERNION'
        k.rotation_quaternion = Vector(n).to_track_quat('Z', 'Y')
        k.location = Vector(p) + Vector(n) * 0.05 * size
    if smile is not None:
        p, n, w = smile
        m = mesh_obj(f'{prefix}-smile', torus_bm(w / 2, w * 0.09, (200.0, 340.0), seg=16, tube=8), ink, coll)
        m.parent = parent
        m.rotation_mode = 'QUATERNION'
        m.rotation_quaternion = Vector(n).to_track_quat('Z', 'Y')
        m.location = Vector(p) + Vector(n) * 0.04 * w + (m.rotation_quaternion @ Vector((0.0, 1.0, 0.0))) * (w * 0.35)


def on_body(radii, centre, direction):
    p, n = ellipsoid_point(radii, direction)
    return Vector(centre) + p, n


def wheel(name, at, radius, c, coll, parent, hub_hex=None):
    """A toy wheel: a fat tyre and a domed hub, its axle along x."""
    torus(f'{name}-tyre', radius * 0.68, radius * 0.32, mat(c['tire'], 0.55), coll, parent, at, (0.0, 90.0, 0.0))
    side = 1 if at[0] >= 0 else -1
    blob(f'{name}-hub', mat(hub_hex or c['hub'], GLOSS), coll, parent, (at[0] + side * radius * 0.12, at[1], at[2]), (radius * 0.22, radius * 0.42, radius * 0.42))


# --- soft vehicles (Chạm là nói street, Hang tìm bóng) --------------------------------------------------------

def build_bus(root, coll, c):
    yellow = mat(c['bus'])
    glass = mat(c['glass'], 0.2)
    rbox('bus-body', (1.15, 2.7, 1.15), 0.26, yellow, coll, root, (0.0, 0.0, 0.88))
    rbox('bus-windows', (1.19, 2.2, 0.4), 0.12, glass, coll, root, (0.0, 0.12, 1.1))
    for k in range(4):
        rbox(f'bus-pillar-{k}', (1.21, 0.08, 0.44), 0.03, yellow, coll, root, (0.0, -0.75 + 0.55 * k + 0.12, 1.1))
    rbox('bus-windshield', (0.92, 0.1, 0.48), 0.12, glass, coll, root, (0.0, -1.32, 1.1))
    rbox('bus-roof', (0.95, 2.3, 0.1), 0.05, mat(c['white']), coll, root, (0.0, 0.0, 1.47))
    rbox('bus-stripe', (1.18, 2.72, 0.1), 0.05, mat(c['creatureOrange']), coll, root, (0.0, 0.0, 0.66))
    rbox('bus-bumper', (1.05, 0.14, 0.14), 0.06, mat(c['hub']), coll, root, (0.0, -1.36, 0.42))
    for s in (-1, 1):
        blob(f'bus-light-{s}', mat(c['tintButter'], 0.2), coll, root, (s * 0.38, -1.36, 0.62), (0.11, 0.05, 0.11))
        for y in (-0.82, 0.82):
            wheel(f'bus-wheel-{s}-{y}', (s * 0.54, y, 0.34), 0.36, c, coll, root)


def build_truck(root, coll, c):
    blue = mat(c['creatureBlue'])
    rbox('truck-chassis', (1.0, 2.6, 0.3), 0.1, mat(c['tire'], 0.6), coll, root, (0.0, 0.1, 0.45))
    cab = rbox('truck-cab', (1.1, 0.95, 1.05), 0.26, blue, coll, root, (0.0, -0.75, 1.05))
    rbox('truck-windshield', (0.88, 0.1, 0.42), 0.12, mat(c['glass'], 0.2), coll, cab, (0.0, -0.47, 0.18))
    rbox('truck-side-window', (1.14, 0.5, 0.38), 0.1, mat(c['glass'], 0.2), coll, cab, (0.0, 0.05, 0.2))
    rbox('truck-box', (1.2, 1.7, 1.3), 0.2, mat(c['creatureOrange']), coll, root, (0.0, 0.55, 1.25))
    rbox('truck-box-band', (1.24, 1.74, 0.14), 0.06, mat(c['white']), coll, root, (0.0, 0.55, 1.25))
    rbox('truck-bumper', (1.0, 0.14, 0.14), 0.06, mat(c['hub']), coll, root, (0.0, -1.24, 0.55))
    for s in (-1, 1):
        blob(f'truck-light-{s}', mat(c['tintButter'], 0.2), coll, root, (s * 0.36, -1.24, 0.78), (0.1, 0.05, 0.1))
        for y in (-0.75, 0.85):
            wheel(f'truck-wheel-{s}-{y}', (s * 0.54, y, 0.36), 0.38, c, coll, root)


def build_tractor(root, coll, c):
    green = mat(c['creatureGreen'])
    rbox('tractor-hood', (0.72, 1.25, 0.62), 0.22, green, coll, root, (0.0, -0.45, 0.82))
    rbox('tractor-grill', (0.5, 0.08, 0.34), 0.08, mat(c['hub']), coll, root, (0.0, -1.08, 0.8))
    rbox('tractor-seat-base', (0.9, 0.9, 0.5), 0.18, green, coll, root, (0.0, 0.45, 0.75))
    roof_z = 2.05
    rbox('tractor-roof', (1.15, 1.1, 0.12), 0.06, mat(c['white']), coll, root, (0.0, 0.45, roof_z))
    for sx in (-1, 1):
        for sy in (-1, 1):
            rod(f'tractor-post-{sx}-{sy}', (sx * 0.45, 0.45 + sy * 0.4, 0.95), (sx * 0.45, 0.45 + sy * 0.4, roof_z), 0.045, mat(c['white']), coll, root)
    rod('tractor-exhaust', (0.18, -0.6, 1.0), (0.18, -0.6, 1.55), 0.06, mat(c['tire'], 0.5), coll, root)
    blob('tractor-light', mat(c['tintButter'], 0.2), coll, root, (0.0, -1.1, 1.02), (0.1, 0.05, 0.1))
    hub = c['tintButter']
    for s in (-1, 1):
        wheel(f'tractor-big-{s}', (s * 0.62, 0.5, 0.58), 0.6, c, coll, root, hub)
        wheel(f'tractor-small-{s}', (s * 0.5, -0.8, 0.34), 0.34, c, coll, root, hub)
