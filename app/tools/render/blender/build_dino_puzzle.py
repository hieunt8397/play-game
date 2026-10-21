# Builds art/dino-puzzle.blend (Ghép khủng long, Stories 3.3 and 3.4) from the vendored island art/src/map-v3.blend.
#
# Run by `npm run art:build -- dino-puzzle` (tools/render/build.ts), never by hand:
#   blender -b --factory-startup art/src/map-v3.blend --python-exit-code 1 --python build_dino_puzzle.py -- \
#     --out <tmp>/dino-puzzle.blend --params <tmp>/params.json --cuts "3:head-neck,body-legs,tail;4:…;6:…"
# params.json (written by build.ts from Tokens and content): colours (hex), art (incl. art.dino), dino
# {species, pieces, sizePx, sizeTolerance, walkMaxPx}, design size, renderScale, the interactive rect.
# --cuts (Story 3.4): the content cuts (PIECES); each cut must partition every deform bone exactly once.
#
# Steps: prune the reference's Tiệm kem preview, its HintRing and the three station dinos (the fence
# stays); add camera `CamDino` (lens from `CamGame2`) aimed at the lawn inside the dino-park fence;
# import the three gentle Quaternius dinosaurs (never a meat-eater, never an attack pose), recolour
# them by material name and give each builder-made eyes (common.py › dress_dino, Story 3.5), key their frames:
#   1 idle · 2 blink (pupils hidden, lids shown) · 10–11 happy (head up, tail wag) · 20, 22 walk in place;
# cut each into pieces by bone groups (PIECE_BONES) at frame 1, every piece id of every cut rendered once
# in place as its own sprite; two clouds; 8 lawn bays (BAY_SPOTS) where loose pieces start; the layout
# objects in a hidden `layout` collection; render size; save.
# Every sprite collection here is `movable` (no baked shadow); dinos and pieces carry `ghost` (the
# render step derives `<object>/ghost/00` from `<object>/idle/00`, tools/render/ghost.ts).
# Every constant is in Blender world units (metres) unless its name says otherwise.
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cute import soften_scene  # noqa: E402
from common import (  # noqa: E402
    add_empty, descendants, dominant_bones, dress_dino, eval_world_verts, flat_material, force_opaque, key_constant, move_to,
    parse_args, sphere,
)

ASSETS = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', '..', 'assets'))
DINO_DIR = os.path.join(ASSETS, 'quaternius', 'dinosaurs')
# Species id → (FBX file, action name prefix). Only these three files are ever imported.
DINO_FILES = {
    'apatosaurus': ('Apatosaurus.fbx', 'Apatosaurus'),
    'triceratops': ('Triceratops.fbx', 'Triceratops'),
    'stegosaurus': ('Stegosaurus.fbx', 'Stegosaurus'),
}

PRUNE_COLLECTIONS = ['GameIce', 'Car']  # the reference's Tiệm kem preview and its parked kid kart
# HintRing, and the pond's jumping fish, which would stand in front of this low camera.
PRUNE_OBJECTS = ['HintRing', 'A_FishGold', 'A_FishClown', 'A_FishKoi']
STATION_DINOS = ['A_DinoNeck', 'A_DinoTri', 'A_DinoSteg']  # the three station dinos (the fence stays)
LENS_FROM = 'CamGame2'
CAMERA = 'CamDino'

# --- the camera: on the road side of the fence, looking north over the lawn (horizon in the top fifth) ---
CAM_LOCATION = (-3.1, 4.85, 1.05)
CAM_TARGET = (-3.1, 7.69, 0.07)

# --- the dinos ------------------------------------------------------------------------------------
GROUND_Z = 0.45  # the island's grass
DINO_SPOT = (-3.1, 6.75)  # every species' ground pivot (XY centre of its idle bbox at its lowest z)
DINO_FACING_DEG = -40.0  # world heading of the head: +x (screen right), turned a little towards the camera
WALK_DISTANCE_M = 0.25  # the come-alive walk, along the facing
FIT_PASSES = 3  # scale/ground/recentre passes (perspective makes the fit converge in a few)

# The recolour (MATERIAL_ROLES) and the builder-made eyes (EYES) are common.py › dress_dino (Story 3.5).

# Frames (timeline): idle, blink, happy, walk.
IDLE_FRAME = 1
BLINK_FRAME = 2
HAPPY_FRAMES = [10, 11]
WALK_FRAMES = [20, 22]  # Story 3.4: 2 walk frames keep the atlas within 4 pages
DINO_STATES = {'idle': [IDLE_FRAME], 'blink': [BLINK_FRAME], 'happy': HAPPY_FRAMES, 'walk': WALK_FRAMES}
HEAD_PITCH_DEG = 10.0  # happy: the head looks up
TAIL_YAW_DEG = 15.0  # happy: the tail wags ± this
IDLE_SUFFIX = '_Idle'
WALK_SUFFIX = '_Walk'

# Piece cut by bones (Story 3.4: explicit per piece id). A bone pattern is an exact bone name, or a
# prefix ending in `*`. Every cut must partition every deform bone of the armature exactly once.
# `Back` (exact) is the spine bone between the hips and the tail; the back legs are the `Back<Leg…>`
# prefixes, so the spine goes with the body in every cut.
FRONT_LEGS = ['FrontLeg*', 'FrontUpLeg*', 'FrontLowLeg*', 'FrontFoot*']
BACK_LEGS = ['BackLeg*', 'BackUpLeg*', 'BackLowLeg*', 'BackFoot*']
PIECE_BONES = {
    'head-neck': ['Neck', 'Head', 'Head_end'],
    'body-legs': ['root', 'Body', 'Back', 'Hips', 'Torso', 'Shoulders', *FRONT_LEGS, *BACK_LEGS],
    'tail': ['Tail*'],
    'front': ['Shoulders', 'Torso', *FRONT_LEGS],
    'back': ['root', 'Body', 'Back', 'Hips', *BACK_LEGS],
    'head': ['Head', 'Head_end'],
    'neck': ['Neck'],
    'body': ['root', 'Body', 'Back', 'Hips', 'Torso', 'Shoulders'],
    'front-legs': FRONT_LEGS,
    'back-legs': BACK_LEGS,
}
# A piece with fewer faces than this fails the build (naming the cut, the piece and its bones).
PIECE_MIN_FACES = 12
# Story 3.4: optional per-species planes that grow a piece too small to grab. After the bone pass, the
# faces of piece `from` whose centre lies on the positive side of the plane move to piece `to` (`to`
# must be one bone group, so every cut holding both stays a partition). Key (species, from, to); value
# (bone, t): the world-space plane through the posed bone at fraction `t` from its head to its tail,
# normal along the bone (head → tail), so the plane follows the frame-1 pose wherever the dino stands.
# Tuned until ui.dinoPieceMinRawPx passes.
CUT_PLANES = {
    # The long-neck's head alone is ~34 design px (< 40): its neck's last stretch joins it.
    ('apatosaurus', 'neck', 'head'): ('Neck', 0.88),
}

# Story 3.4: the 8 lawn bays where loose pieces start (world XY offsets from DINO_SPOT, on the ground).
# A ring around the ghost: arrangeStarts (games/dino-puzzle/starts.ts) shuffles each dino's pieces into
# them; bays 1…n are also the identity fallback, so their order matters (validateDinoPuzzle checks it).
BAY_SPOTS = [
    (-0.810, 0.243),  # 1 left, behind the ghost's tail
    (0.727, -0.174),  # 2 right, below the Speaker keep-out
    (-0.145, -0.860),  # 3 front row
    (0.166, -0.860),  # 4 front row
    (-0.456, -0.860),  # 5 front row, left
    (0.451, -0.860),  # 6 front row, right
    (-0.554, -0.499),  # 7 left, middle
    (0.560, -0.617),  # 8 right, middle
]
# The lawn (`hit.grass`): a world rect on the grass inside the fence (x0, x1, y0, y1).
LAWN_RECT_M = (-5.2, -1.0, 5.5, 7.05)

# --- clouds ------------------------------------------------------------------------------------------
CLOUD_SPOTS = {'cloud-1': (-6.4, 16.0, 1.12), 'cloud-2': (0.6, 16.5, 1.2)}  # far behind the island, in the sky strip
CLOUD_PUFFS = [(-0.9, 0.0, 0.0, 0.75), (0.0, 0.0, 0.25, 1.0), (0.95, 0.0, 0.05, 0.7)]  # (dx, dy, dz, radius)
CLOUD_FLAT = 0.6  # z squash of each puff
CLOUD_SIZE = 0.75  # puff radius scale

RENDER_SIZE = (2048, 1536)


def fail(msg):
    raise RuntimeError(f'build_dino_puzzle: {msg}')


def warn(msg):
    print(f'build_dino_puzzle: WARNING {msg}')


def remove_tree(obj):
    for o in reversed(descendants(obj)):
        bpy.data.objects.remove(o, do_unlink=True)


def prune():
    for name in PRUNE_COLLECTIONS:
        coll = bpy.data.collections.get(name)
        if coll is None:
            fail(f'collection "{name}" to prune not found')
        for o in list(coll.all_objects):
            if o.name in bpy.data.objects:
                bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
    for name in PRUNE_OBJECTS:
        o = bpy.data.objects.get(name)
        if o is not None:  # HintRing may already be gone with GameIce
            remove_tree(o)
    for name in STATION_DINOS:
        o = bpy.data.objects.get(name)
        if o is None:
            fail(f'station dino "{name}" to prune not found')
        remove_tree(o)


def import_new(op, **kw):
    before = set(bpy.data.objects)
    op(**kw)
    return [o for o in bpy.data.objects if o not in before]


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
    return cam


class Screen:
    """World → design px through the scene camera (same projection as render_screen.py)."""

    def __init__(self, scene, params):
        self.scene = scene
        self.w, self.h = params['design']['width'], params['design']['height']

    def project(self, p):
        v = world_to_camera_view(self.scene, self.scene.camera, Vector(p))
        return (v.x * self.w, (1 - v.y) * self.h)

    def rect(self, pts):
        sp = [self.project(p) for p in pts]
        xs, ys = [p[0] for p in sp], [p[1] for p in sp]
        return (min(xs), min(ys), max(xs), max(ys))

    def unproject(self, x, y, depth_point):
        """The world point on the camera ray through design (x, y), at the camera depth of `depth_point`."""
        scene = self.scene
        cam = scene.camera
        tr, br, bl, tl = [Vector(c) for c in cam.data.view_frame(scene=scene)]
        u, v = x / self.w, y / self.h
        local = tl + (tr - tl) * u + (bl - tl) * v  # a point on the z = -1 plane (camera space)
        mw = cam.matrix_world
        origin = mw.translation
        direction = (mw.to_3x3() @ local).normalized()
        forward = (mw.to_3x3() @ Vector((0.0, 0.0, -1.0))).normalized()
        depth = (Vector(depth_point) - origin).dot(forward)
        return origin + direction * (depth / direction.dot(forward))


def bounds(pts):
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


# --- posing --------------------------------------------------------------------------------------------

def find_action(actions, prefix, suffix):
    for a in actions:
        # A re-import of a file the island already holds names its actions `….001`.
        name = a.name.rsplit('.', 1)[0] if a.name.rsplit('.', 1)[-1].isdigit() else a.name
        if name.endswith(f'{prefix}{suffix}') and '_Attack' not in name:
            return a
    warn(f'action "*{prefix}{suffix}" not found — those frames keep the rest pose')
    return None


def assign_action(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    if action is not None and hasattr(ad, 'action_slot') and ad.action_slot is None and len(action.slots) > 0:
        ad.action_slot = action.slots[0]


def axis_closest_to(arm, pb, world_dir):
    """The bone's local axis ('X' or 'Z') closest to `world_dir`."""
    m = arm.matrix_world.to_3x3() @ pb.bone.matrix_local.to_3x3()
    x, z = m.col[0].normalized(), m.col[2].normalized()
    return 'X' if abs(x.dot(world_dir)) >= abs(z.dot(world_dir)) else 'Z'


def head_tip_z(arm, scene):
    bpy.context.view_layer.update()
    pb = arm.pose.bones['Head']
    return (arm.matrix_world @ pb.tail).z


def pose_dino(scene, arm, actions, prefix, lateral):
    """Keys frame 1 (Idle), 2 (Idle), 10–11 (Idle, head up, tail wag) and 20–23 (Walk in place)."""
    idle = find_action(actions, prefix, IDLE_SUFFIX)
    walk = find_action(actions, prefix, WALK_SUFFIX)
    rest_basis = arm.matrix_basis.copy()
    idle_start = int(idle.frame_range[0]) if idle else 1
    plan = [(IDLE_FRAME, idle, idle_start, 0), (BLINK_FRAME, idle, idle_start, 0)]
    for i, tf in enumerate(HAPPY_FRAMES):
        plan.append((tf, idle, idle_start, 1 if i % 2 == 0 else -1))
    if walk:
        w0, w1 = walk.frame_range
        step = (w1 - w0) / len(WALK_FRAMES)
        for i, tf in enumerate(WALK_FRAMES):
            plan.append((tf, walk, int(round(w0 + i * step)), None))
    else:
        for tf in WALK_FRAMES:
            plan.append((tf, idle, idle_start, None))
    poses = []
    for tf, action, sf, wag in plan:
        assign_action(arm, action)
        scene.frame_set(sf)
        poses.append((tf, wag, {pb.name: pb.matrix_basis.copy() for pb in arm.pose.bones}))
    assign_action(arm, None)
    # The FBX actions may key the armature object itself: back to its imported transform.
    arm.matrix_basis = rest_basis
    if arm.animation_data:
        arm.animation_data.action = None
    head = arm.pose.bones.get('Head')
    tail = arm.pose.bones.get('Tail1')
    root = arm.pose.bones.get('root')
    if head is None or tail is None:
        warn(f'{prefix}: no Head/Tail1 bone — the happy frames keep the idle pose')
    up = Vector((0.0, 0.0, 1.0))
    pitch_sign = 1.0
    if head is not None:
        # The sign of the head pitch that lifts the snout.
        idle_pose = poses[0][2]
        for pb in arm.pose.bones:
            pb.matrix_basis = idle_pose[pb.name]
        axis = axis_closest_to(arm, head, lateral)
        z0 = head_tip_z(arm, scene)
        head.matrix_basis = idle_pose['Head'] @ Matrix.Rotation(math.radians(HEAD_PITCH_DEG), 4, axis)
        pitch_sign = 1.0 if head_tip_z(arm, scene) >= z0 else -1.0
    for tf, wag, pose in poses:
        for pb in arm.pose.bones:
            pb.matrix_basis = pose[pb.name]
        if wag is None and root is not None:
            # Walk in place: the root bone's travel is dropped.
            mb = root.matrix_basis.copy()
            mb.translation = Vector((0.0, 0.0, 0.0))
            root.matrix_basis = mb
        if wag and head is not None and tail is not None:
            head.matrix_basis = head.matrix_basis @ Matrix.Rotation(math.radians(HEAD_PITCH_DEG * pitch_sign), 4, axis_closest_to(arm, head, lateral))
            tail.matrix_basis = tail.matrix_basis @ Matrix.Rotation(math.radians(TAIL_YAW_DEG * wag), 4, axis_closest_to(arm, tail, up))
        for pb in arm.pose.bones:
            pb.keyframe_insert('location', frame=tf)
            pb.keyframe_insert('rotation_quaternion' if pb.rotation_mode == 'QUATERNION' else 'rotation_euler', frame=tf)
            pb.keyframe_insert('scale', frame=tf)
    key_constant(arm)
    scene.frame_set(IDLE_FRAME)


# --- import, place, fit ----------------------------------------------------------------------------------

def import_dino(species, params, coll):
    fname, prefix = DINO_FILES[species]
    path = os.path.join(DINO_DIR, fname)
    if not os.path.isfile(path):
        fail(f'{path} is missing')
    before_actions = set(bpy.data.actions)
    new = import_new(bpy.ops.import_scene.fbx, filepath=path)
    actions = [a for a in bpy.data.actions if a not in before_actions]
    arm = next((o for o in new if o.type == 'ARMATURE'), None)
    meshes = [o for o in new if o.type == 'MESH']
    if arm is None or not meshes:
        fail(f'{fname} has no armature or mesh')
    for o in new:
        move_to(o, coll)
    force_opaque(new)
    # The importer may leave an action active: the eyes are placed on the rest pose.
    assign_action(arm, None)
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    root = add_empty(f'{species}-root', (0.0, 0.0, 0.0), coll)
    arm.parent = root
    bpy.context.view_layer.update()
    # The model's own heading: from the tail towards the head (rest pose, world XY).
    bones = arm.data.bones
    if 'Head' not in bones or 'Tail1' not in bones:
        fail(f'{fname}: no Head / Tail1 bone')
    hv = arm.matrix_world @ bones['Head'].head_local
    tv = arm.matrix_world @ bones['Tail1'].head_local
    own = math.atan2(hv.y - tv.y, hv.x - tv.x)
    root.rotation_euler = (0.0, 0.0, math.radians(DINO_FACING_DEG) - own)
    bpy.context.view_layer.update()
    forward = Vector((math.cos(math.radians(DINO_FACING_DEG)), math.sin(math.radians(DINO_FACING_DEG)), 0.0))
    lateral = forward.cross(Vector((0.0, 0.0, 1.0))).normalized()
    colours = {'colours': params['colours'], 'dino': params['art']['dino']}
    dressed = dress_dino(arm, meshes, species, colours, forward, lateral, coll, [IDLE_FRAME, BLINK_FRAME, *HAPPY_FRAMES, *WALK_FRAMES], BLINK_FRAME, warn)
    mats, visible_eyes, eyes = dressed['mats'], dressed['visible_eyes'], dressed['eyes']
    pose_dino(bpy.context.scene, arm, actions, prefix, lateral)
    return {'root': root, 'arm': arm, 'meshes': meshes, 'eyes': eyes, 'visible_eyes': visible_eyes, 'mats': mats, 'forward': forward}


def fit_dino(screen, d, size_px):
    """Scales the dino so the idle frame's longest projected side is size_px, stands it on the
    ground and moves its ground pivot onto DINO_SPOT."""
    scene = bpy.context.scene
    root = d['root']
    objs = d['meshes'] + d['visible_eyes']
    for _ in range(FIT_PASSES):
        scene.frame_set(IDLE_FRAME)
        bpy.context.view_layer.update()
        pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
        x0, y0, x1, y1 = screen.rect(pts)
        k = size_px / max(x1 - x0, y1 - y0)
        root.scale = root.scale * k
        bpy.context.view_layer.update()
        pts = eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())
        (bx0, bx1), (by0, by1), (bz0, _bz1) = bounds(pts)
        root.location += Vector((DINO_SPOT[0] - (bx0 + bx1) / 2, DINO_SPOT[1] - (by0 + by1) / 2, GROUND_Z - bz0))
    bpy.context.view_layer.update()


# --- pieces --------------------------------------------------------------------------------------------

def bone_matches(pattern, bone):
    return bone.startswith(pattern[:-1]) if pattern.endswith('*') else bone == pattern


def pieces_of_bone(bone, cut):
    """The pieces of `cut` whose PIECE_BONES match `bone`."""
    return [p for p in cut if any(bone_matches(x, bone) for x in PIECE_BONES[p])]


def check_cuts(species, arm, cuts):
    """Every cut partitions every deform bone exactly once; returns the deform bone names."""
    bones = [b.name for b in arm.data.bones if b.use_deform]
    for n, cut in cuts.items():
        for b in bones:
            hits = pieces_of_bone(b, cut)
            if len(hits) != 1:
                where = 'no piece' if not hits else f'pieces {", ".join(hits)}'
                fail(f'{species}: cut {n}: bone "{b}" is in {where}')
    return bones


class Atoms:
    """The coarsest bone groups every cut agrees on: two bones share an atom when they share a piece in
    every cut. A face belongs to one atom, so a piece id is the same faces in every cut it is in."""

    def __init__(self, bones, cuts):
        self.cuts = cuts
        self.of_bone = {}
        self.order = []
        for b in bones:
            sig = tuple(pieces_of_bone(b, cut)[0] for cut in cuts.values())
            if sig not in self.order:
                self.order.append(sig)
            self.of_bone[b] = sig
        # Ties go to the atom holding `Body` (the seam stays on the body), then by bone order.
        body = self.of_bone.get('Body')
        if body is not None:
            self.order.remove(body)
            self.order.insert(0, body)

    def of_piece(self, piece):
        return [a for a in self.order if piece in a]

    def fallback(self):
        return self.order[0]


def cut_plane(arm, spec):
    """(bone, t) → (point, normal) in world space at the current frame."""
    bone, t = spec
    pb = arm.pose.bones.get(bone)
    if pb is None:
        fail(f'CUT_PLANES: no bone "{bone}"')
    h, tl = arm.matrix_world @ pb.head, arm.matrix_world @ pb.tail
    return h.lerp(tl, t), (tl - h).normalized()


def plane_side(point, plane):
    origin, normal = plane
    return (point - origin).dot(normal)


def static_copy(obj, name, coll):
    """The object's evaluated (posed) mesh at the current frame, baked into world space."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    me.transform(ev.matrix_world)
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o


def cut_pieces(species, d, cuts, piece_ids, sprites):
    """Splits the frame-1 pose into one static sprite per piece id (rendered in place). A vertex goes to
    the atom of its dominant bone, a face to the atom holding most of its vertices (ties: the body), then
    CUT_PLANES move faces; a piece is the faces of its atoms."""
    scene = bpy.context.scene
    scene.frame_set(IDLE_FRAME)
    bpy.context.view_layer.update()
    mesh = d['meshes'][0]
    bones = check_cuts(species, d['arm'], cuts)
    atoms = Atoms(bones, cuts)
    dom = dominant_bones(mesh)
    vatom = [atoms.of_bone.get(b, atoms.fallback()) if b is not None else atoms.fallback() for b in dom]
    whole = static_copy(mesh, f'{species}-posed', scene.collection)
    if len(whole.data.vertices) != len(dom):
        fail(f'{species}: the posed mesh changed its vertex count')
    body_index = next((i for i, m in enumerate(whole.data.materials) if m and m.name == d['mats']['body'].name), 0)
    # Face → atom.
    fatom = []
    for poly in whole.data.polygons:
        counts = {}
        for vi in poly.vertices:
            counts[vatom[vi]] = counts.get(vatom[vi], 0) + 1
        best = max(counts.values())
        fatom.append(next(a for a in atoms.order if counts.get(a, 0) == best))
    for (s, src, dst), spec in CUT_PLANES.items():
        if s != species or src not in piece_ids or dst not in piece_ids:
            continue
        plane = cut_plane(d['arm'], spec)
        to = atoms.of_piece(dst)
        if len(to) != 1:
            fail(f'{species}: CUT_PLANES {src} → {dst}: "{dst}" is not one bone group')
        src_atoms = set(atoms.of_piece(src))
        moved = 0
        for i, poly in enumerate(whole.data.polygons):
            if fatom[i] in src_atoms and plane_side(whole.matrix_world @ poly.center, plane) > 0:
                fatom[i] = to[0]
                moved += 1
        print(f'build_dino_puzzle: {species} CUT_PLANES {src} → {dst}: {moved} faces')
    for n, cut in cuts.items():
        for p in cut:
            own = set(atoms.of_piece(p))
            faces = sum(1 for a in fatom if a in own)
            if faces < PIECE_MIN_FACES:
                fail(f'{species}: cut {n}: piece "{p}" has {faces} faces (min {PIECE_MIN_FACES}; bones {", ".join(PIECE_BONES[p])})')
    holds_head = [p for p in piece_ids if any(bone_matches(x, 'Head') for x in PIECE_BONES[p])]
    out = {}
    for p in piece_ids:
        coll = bpy.data.collections.new(f'sprite.{species}-{p}')
        sprites.children.link(coll)
        coll['movable'] = 1
        coll['ghost'] = 1
        own = set(atoms.of_piece(p))
        bm = bmesh.new()
        bm.from_mesh(whole.data)
        bm.faces.ensure_lookup_table()
        drop = [f for f in bm.faces if fatom[f.index] not in own]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
        boundary = [e for e in bm.edges if e.is_boundary]
        if boundary:
            filled = bmesh.ops.holes_fill(bm, edges=boundary, sides=0)
            for f in filled['faces']:
                f.material_index = body_index
        me = bpy.data.meshes.new(f'{species}-{p}')
        bm.to_mesh(me)
        bm.free()
        for m in whole.data.materials:
            me.materials.append(m)
        o = bpy.data.objects.new(f'{species}-{p}', me)
        coll.objects.link(o)
        objs = [o]
        if p in holds_head:
            for e in d['visible_eyes']:
                objs.append(static_copy(e, f'{e.name}-{p}', coll))
        out[p] = objs
    bpy.data.objects.remove(whole, do_unlink=True)
    return out


# --- the lawn ---------------------------------------------------------------------------------------------

FRAME_INSET = 0.002  # of the frame: the clipped lawn stays just inside the render
BISECT_STEPS = 40


def clip_to_frame(scene, poly):
    """Clips a convex world polygon on the ground to the camera frame (Sutherland–Hodgman against the
    four frame edges; each crossing is found by bisection along the edge, where the projection is monotonic)."""
    cam = scene.camera
    lo, hi = FRAME_INSET, 1.0 - FRAME_INSET
    tests = [lambda v: v.x - lo, lambda v: hi - v.x, lambda v: v.y - lo, lambda v: hi - v.y]

    def inside(p, t):
        v = world_to_camera_view(scene, cam, p)
        return v.z > 0 and t(v) >= 0

    def crossing(a, b, t):
        ia = inside(a, t)
        lo_t, hi_t = 0.0, 1.0
        for _ in range(BISECT_STEPS):
            mid = (lo_t + hi_t) / 2
            if inside(a.lerp(b, mid), t) == ia:
                lo_t = mid
            else:
                hi_t = mid
        return a.lerp(b, lo_t)  # on the side of `a` (always the inside end here)

    for t in tests:
        out = []
        for i, b in enumerate(poly):
            a = poly[i - 1]
            ia, ib = inside(a, t), inside(b, t)
            if ib:
                if not ia:
                    out.append(crossing(b, a, t))
                out.append(b)
            elif ia:
                out.append(crossing(a, b, t))
        poly = out
        if not poly:
            return []
    return poly


# --- clouds ----------------------------------------------------------------------------------------------

def build_cloud(name, at, mat, sprites):
    coll = bpy.data.collections.new(f'sprite.{name}')
    sprites.children.link(coll)
    coll['movable'] = 1
    objs = []
    for i, (dx, dy, dz, r) in enumerate(CLOUD_PUFFS):
        o = sphere(f'{name}-puff-{i + 1}', r * CLOUD_SIZE, mat, coll, segments=12, rings=6)
        o.location = (at[0] + dx * CLOUD_SIZE, at[1] + dy, at[2] + dz * CLOUD_SIZE)
        o.scale = (1.0, 1.0, CLOUD_FLAT)
        objs.append(o)
    return objs


def parse_cuts(text):
    """`3:a,b,c;4:…` → {'3': ['a', 'b', 'c'], …} (content PIECES, in order)."""
    cuts = {}
    for part in text.split(';'):
        n, _, ids = part.partition(':')
        pieces = [p for p in ids.split(',') if p]
        if not n.strip().isdigit() or len(pieces) != int(n) or len(set(pieces)) != len(pieces):
            fail(f'--cuts: bad cut "{part}"')
        cuts[n.strip()] = pieces
    if not cuts:
        fail('--cuts is empty')
    return cuts


def main():
    args = parse_args('build_dino_puzzle', required=('out', 'params', 'cuts'))
    params = args['params']
    content = params['dino']
    cuts = parse_cuts(args['cuts'])
    piece_ids = []
    for cut in cuts.values():
        for p in cut:
            if p not in PIECE_BONES:
                fail(f'unknown piece id "{p}" (PIECE_BONES has {", ".join(PIECE_BONES)})')
            if p not in piece_ids:
                piece_ids.append(p)
    for s in content['species']:
        if s not in DINO_FILES:
            fail(f'unknown species "{s}"')
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100

    prune()
    make_camera(scene)
    bpy.context.view_layer.update()
    screen = Screen(scene, params)

    sprites = bpy.data.collections.new('sprites')
    scene.collection.children.link(sprites)
    layout = bpy.data.collections.new('layout')
    scene.collection.children.link(layout)
    layout.hide_render = True

    dinos = {}
    for s in content['species']:
        coll = bpy.data.collections.new(f'sprite.{s}')
        sprites.children.link(coll)
        coll['states'] = json.dumps(DINO_STATES, separators=(',', ':'))
        coll['movable'] = 1
        coll['ghost'] = 1
        d = import_dino(s, params, coll)
        fit_dino(screen, d, content['sizePx'])
        dinos[s] = d

    pieces = {s: cut_pieces(s, d, cuts, piece_ids, sprites) for s, d in dinos.items()}

    white = flat_material('cloud-white', params['colours']['counterTop'], roughness=0.9)
    clouds = {name: build_cloud(name, at, white, sprites) for name, at in CLOUD_SPOTS.items()}

    bpy.context.view_layer.update()
    scene.frame_set(IDLE_FRAME)
    dg = bpy.context.evaluated_depsgraph_get()

    for s, d in dinos.items():
        pts = eval_world_verts(d['meshes'] + d['visible_eyes'], dg)
        (x0, x1), (y0, y1), (z0, _z1) = bounds(pts)
        pivot = Vector(((x0 + x1) / 2, (y0 + y1) / 2, z0))
        add_empty(f'anchor.{s}', pivot, layout)
        add_empty(f'anchor.{s}-walk', pivot + d['forward'] * WALK_DISTANCE_M, layout)
        for p, objs in pieces[s].items():
            ppts = eval_world_verts(objs, dg)
            rx0, ry0, rx1, ry1 = screen.rect(ppts)
            (_a, _b), (_c, _d), (pz0, pz1) = bounds(ppts)
            centre = Vector(((min(q.x for q in ppts) + max(q.x for q in ppts)) / 2, (min(q.y for q in ppts) + max(q.y for q in ppts)) / 2, (pz0 + pz1) / 2))
            add_empty(f'slot.{s}-{p}', screen.unproject((rx0 + rx1) / 2, (ry0 + ry1) / 2, centre), layout)
    for i, (dx, dy) in enumerate(BAY_SPOTS):
        add_empty(f'anchor.dino-bay-{i + 1}', (DINO_SPOT[0] + dx, DINO_SPOT[1] + dy, GROUND_Z), layout)
    for name, objs in clouds.items():
        pts = eval_world_verts(objs, dg)
        (x0, x1), (y0, y1), (z0, z1) = bounds(pts)
        add_empty(f'anchor.{name}', ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), layout)

    lx0, lx1, ly0, ly1 = LAWN_RECT_M
    lawn = [Vector((x, y, GROUND_Z)) for x, y in ((lx0, ly0), (lx1, ly0), (lx1, ly1), (lx0, ly1))]
    lawn = clip_to_frame(scene, lawn)
    if len(lawn) < 3:
        fail('the lawn (LAWN_RECT_M) is not in view')
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in lawn]
    bm.faces.new(vs)
    me = bpy.data.meshes.new('hit.grass')
    bm.to_mesh(me)
    bm.free()
    layout.objects.link(bpy.data.objects.new('hit.grass', me))

    report(screen, dinos, pieces, clouds, params)
    scene.frame_set(IDLE_FRAME)
    soften_scene(bpy.context.scene)  # the soft toy look (cute.py), last so every builder-made mesh gets it
    bpy.ops.wm.save_as_mainfile(filepath=args['out'], compress=True)
    print(f'build_dino_puzzle: saved {args["out"]}')


def report(screen, dinos, pieces, clouds, params):
    """Diagnostics in design px (the rules themselves run in TypeScript on the render)."""
    scene = bpy.context.scene
    fmt = lambda r: f'({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f}) {r[2] - r[0]:.0f}×{r[3] - r[1]:.0f}'  # noqa: E731
    for s, d in dinos.items():
        for f in [IDLE_FRAME, BLINK_FRAME, *HAPPY_FRAMES, *WALK_FRAMES]:
            scene.frame_set(f)
            pts = eval_world_verts(d['meshes'] + d['visible_eyes'], bpy.context.evaluated_depsgraph_get())
            print(f'build_dino_puzzle: {s} frame {f} {fmt(screen.rect(pts))}')
        scene.frame_set(IDLE_FRAME)
        a = screen.project(bpy.data.objects[f'anchor.{s}'].location)
        w = screen.project(bpy.data.objects[f'anchor.{s}-walk'].location)
        print(f'build_dino_puzzle: {s} anchor {a[0]:.0f},{a[1]:.0f} walk {math.dist(a, w):.0f} px')
        dg = bpy.context.evaluated_depsgraph_get()
        for p, objs in pieces[s].items():
            r = screen.rect(eval_world_verts(objs, dg))
            sl = screen.project(bpy.data.objects[f'slot.{s}-{p}'].location)
            print(f'build_dino_puzzle: {s}-{p} {fmt(r)} slot {sl[0]:.0f},{sl[1]:.0f}')
    for i in range(len(BAY_SPOTS)):
        b = screen.project(bpy.data.objects[f'anchor.dino-bay-{i + 1}'].location)
        print(f'build_dino_puzzle: dino-bay-{i + 1} {b[0]:.1f},{b[1]:.1f}')
    for name, objs in clouds.items():
        print(f'build_dino_puzzle: {name} {fmt(screen.rect(eval_world_verts(objs, bpy.context.evaluated_depsgraph_get())))}')
    grass = bpy.data.objects['hit.grass']
    print(f'build_dino_puzzle: grass {fmt(screen.rect([grass.matrix_world @ v.co for v in grass.data.vertices]))} corners {[tuple(round(c) for c in screen.project(grass.matrix_world @ v.co)) for v in grass.data.vertices]}')
    horizon = screen.project((CAM_LOCATION[0], CAM_LOCATION[1] + 1000.0, CAM_LOCATION[2]))
    print(f'build_dino_puzzle: horizon y {horizon[1]:.0f}')


main()
