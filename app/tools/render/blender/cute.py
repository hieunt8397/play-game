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
import glob
import math
import os

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
    """A toy dog ('dog', shiba-like) or fox ('fox'). Returns a rig dict: root, head, tail, tongue, meshes,
    eyes (Story 6.1: [(kind, part)] of the eyes and shines, for key_chibi's `eyes`), nose, and cream (the
    hidden nose-cream blob when `nose_cream`, made of `mats['cream']`; else None)."""
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
