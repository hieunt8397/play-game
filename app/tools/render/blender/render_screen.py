# Renders one screen's .blend (Story 1.4). Generic: works for any art/<screen>.blend that follows
# the naming contract. Run by `npm run render -- <screen>` (tools/render/render.ts), never by hand:
#   blender -b --factory-startup art/<screen>.blend --python-exit-code 1 --python render_screen.py -- \
#     --out <tmp dir> --screen <screen>
#
# Writes into --out:
# (`--images 0` skips the renders and writes raw.json only, for diagnosis.)
#   bg.png                          the plate: the whole scene from the scene camera; sprite objects
#                                   have visible_camera = False but still cast their shadows,
#                                   except moving sprites (occlude = 0, the kart): no shadow
#   frames/<object>/<state>/<nn>.png  full-frame transparent renders per `sprite.<object>` collection.
#                                   Collection props (all optional, Story 1.8 adds the last three):
#                                   - `occlude` (Story 1.4) / `holdout_occluders` = 1: plate objects
#                                     become holdouts, so plate objects in front of the sprite cut it;
#                                     otherwise the sprite renders alone;
#                                   - `movable` = 1: no shadow in the plate (default: not holdout);
#                                   - `states` = JSON {state: [timeline frames]} → <state>/<nn> per
#                                     frame in order (default {"idle": [1]});
#                                   - Story 2.2: `bhc_detached` = 1: the group is excluded from the
#                                     plate entirely (hide_render: no image, no shadow) — the map
#                                     decorations, placed anywhere at runtime.
#                                   Story 2.2: a group with `state.<state>` child collections renders
#                                   one pass per child (other states hidden) as <object>/<state>/00,
#                                   at timeline frame 1, instead of the `states` prop (Story 7.4: a child's
#                                   `bhc_state` prop, when set, is the state name: collection names are global).
#                                   Story 8.2: `bhc_holdout_sprites` = JSON list of sprite names: in this
#                                   group's pass their objects become holdouts instead of being hidden (the
#                                   Shiba cuts its outfit items: its head hides the back of a hat).
#                                   Story 3.3: `ghost` = 1 lists the object in raw.json `ghosts`;
#                                   render.ts then draws <object>/ghost/00 (tools/render/ghost.ts).
#                                   Story 3.5: `silhouette` = 1 lists the object in raw.json
#                                   `silhouettes`; render.ts then writes <object>/shadow/00 from
#                                   <object>/color/00 (RGB := colors.shadowTarget, alpha kept).
#                                   The plate renders at timeline frame 1.
#   raw.json                        every object of the `layout` collection projected to render px:
#                                   hit = every evaluated vertex, anchor/slot = the origin,
#                                   path = the evaluated spline points (in order). Each point is
#                                   [x, y, depth]; x/y from the top-left, y down; depth <= 0 is
#                                   behind the camera. tools/layout/to-layout.ts checks everything.
import json
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view


def fail(msg):
    raise RuntimeError(f'render_screen: {msg}')


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = {}
    for i in range(0, len(argv) - 1, 2):
        args[argv[i].lstrip('-')] = argv[i + 1]
    for key in ('out', 'screen'):
        if key not in args:
            fail(f'missing --{key}')
    return args


DEFAULT_STATES = {'idle': [1]}
PLATE_FRAME = 1


def holdout_of(c):
    return bool(c.get('holdout_occluders', c.get('occlude', 0)))


def movable_of(c):
    return bool(c.get('movable', not holdout_of(c)))


def states_of(c):
    raw = c.get('states')
    if raw is None:
        return DEFAULT_STATES
    states = json.loads(raw) if isinstance(raw, str) else dict(raw)
    if not states or any(not isinstance(v, list) or not v for v in states.values()):
        fail(f'collection "{c.name}": prop "states" must map each state to a non-empty frame list')
    return states


def ghost_of(c):
    """Story 3.3: `ghost` = 1: render.ts derives <object>/ghost/00 from <object>/idle/00."""
    return bool(c.get('ghost', 0))


def silhouette_of(c):
    """Story 3.5: `silhouette` = 1: render.ts derives <object>/shadow/00 from <object>/color/00."""
    return bool(c.get('silhouette', 0))


def holdout_sprites_of(c):
    """Story 8.2: `bhc_holdout_sprites` = JSON list of sprite names whose objects are holdouts (not hidden) in this group's pass."""
    raw = c.get('bhc_holdout_sprites')
    if raw is None:
        return []
    names = json.loads(raw) if isinstance(raw, str) else list(raw)
    if not isinstance(names, list) or any(not isinstance(n, str) for n in names):
        fail(f'collection "{c.name}": prop "bhc_holdout_sprites" must be a JSON list of sprite names')
    return names


def detached_of(c):
    return bool(c.get('bhc_detached', 0))


STATE_PREFIX = 'state.'


def state_children(c):
    """Story 2.2: the `state.<state>` child collections of a sprite group, by name."""
    return sorted((k for k in c.children if k.name.startswith(STATE_PREFIX)), key=lambda k: k.name)


def scene_collections(scene):
    """Story 4.5: the collections linked into `scene` (a multi-plate .blend holds one scene per plate)."""
    return set(scene.collection.children_recursive)


def sprite_collections(scene=None):
    owned = scene_collections(scene) if scene is not None else None
    return sorted((c for c in bpy.data.collections if c.name.startswith('sprite.') and (owned is None or c in owned)), key=lambda c: c.name)


def layout_collection(scene):
    """The scene's `layout` collection (`layout` or, in a plate scene, `layout.<plate>`)."""
    owned = scene_collections(scene)
    found = [c for c in owned if c.name == 'layout' or c.name.startswith('layout.')]
    if len(found) != 1:
        fail(f'scene "{scene.name}" needs exactly one layout collection (found {len(found)})')
    return found[0]


def project_layout(scene, depsgraph):
    layout = layout_collection(scene)
    if not layout.hide_render:
        fail(f'the "{layout.name}" collection must have hide_render = True')
    cam = scene.camera
    w, h = scene.render.resolution_x, scene.render.resolution_y

    def proj(co):
        v = world_to_camera_view(scene, cam, co)
        return [round(v.x * w, 3), round((1 - v.y) * h, 3), round(v.z, 4)]

    objects = []
    for o in sorted(layout.all_objects, key=lambda o: o.name):
        ev = o.evaluated_get(depsgraph)
        mw = ev.matrix_world
        if o.type == 'MESH':
            me = ev.to_mesh()
            pts = [proj(mw @ v.co) for v in me.vertices]
            ev.to_mesh_clear()
        elif o.type == 'CURVE':
            pts = []
            for spline in ev.data.splines:
                if spline.type == 'POLY':
                    pts.extend(proj(mw @ p.co.xyz) for p in spline.points)
                else:
                    pts.extend(proj(mw @ p.co) for p in spline.bezier_points)
        else:
            pts = [proj(mw.translation)]
        objects.append({'name': o.name, 'type': o.type, 'points': pts})
    return objects


def render_to(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if not os.path.isfile(path):
        fail(f'render did not write {path}')


def main():
    args = parse_args()
    out = os.path.abspath(args['out'])
    # Story 4.5: a plate (`--scene <plate>`) is made the active scene of the (headless) window.
    if 'scene' in args:
        plate = bpy.data.scenes.get(args['scene'])
        if plate is None:
            fail(f'no scene "{args["scene"]}" in the file')
        bpy.context.window_manager.windows[0].scene = plate
    scene = bpy.context.scene
    if 'scene' in args and scene.name != args['scene']:
        fail(f'the active scene is "{scene.name}", not the plate "{args["scene"]}"')
    if scene.camera is None:
        fail('the scene has no camera')
    r = scene.render
    r.resolution_percentage = 100
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    r.image_settings.compression = 15
    r.use_file_extension = False

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    sprites = sprite_collections(scene)
    sprite_objs = {c.name: list(c.all_objects) for c in sprites}
    in_sprite = {o for objs in sprite_objs.values() for o in objs}
    layout = layout_collection(scene)
    # Plate geometry only: lights and cameras stay as they are in every pass.
    plate_objs = [o for o in scene.objects if o not in in_sprite and o.name not in layout.all_objects and o.type not in ('LIGHT', 'CAMERA', 'LIGHT_PROBE')]
    # Sprites that move at runtime (occlude = 0, e.g. the kart) must not leave a shadow in the plate.
    moving = {o for c in sprites if movable_of(c) for o in sprite_objs[c.name]}
    scene.frame_set(PLATE_FRAME)

    raw = {
        'screenId': args['screen'],
        'render': {'width': r.resolution_x, 'height': r.resolution_y},
        'objects': project_layout(scene, depsgraph),
        'frames': [],
        'ghosts': [c.name[len('sprite.'):] for c in sprites if ghost_of(c)],
        'silhouettes': [c.name[len('sprite.'):] for c in sprites if silhouette_of(c)],
    }

    if args.get('images', '1') == '0':  # diagnosis only: projection without renders
        with open(os.path.join(out, 'raw.json'), 'w', encoding='utf8') as f:
            json.dump(raw, f, indent=1, sort_keys=True)
        return

    # Plate: sprites hidden from the camera, still casting shadows; detached groups not rendered at all.
    film = r.film_transparent
    detached = [(o, o.hide_render) for c in sprites if detached_of(c) for o in sprite_objs[c.name]]
    for o in in_sprite:
        o.visible_camera = False
    for o in moving:
        o.visible_shadow = False
    for o, _hide in detached:
        o.hide_render = True
    render_to(scene, os.path.join(out, 'bg.png'))
    for o in in_sprite:
        o.visible_camera = True
    for o in moving:
        o.visible_shadow = True
    for o, hide in detached:
        o.hide_render = hide

    # Full-frame transparent renders per sprite collection and state frame.
    r.film_transparent = True
    for c in sprites:
        name = c.name[len('sprite.'):]
        holdout = holdout_of(c)
        saved = [(o, o.hide_render, o.is_holdout) for o in scene.objects]
        # Story 8.2: the objects of the listed sprites cut this one (holdouts) instead of being hidden.
        cutters = set()
        for other in holdout_sprites_of(c):
            key = f'sprite.{other}'
            if key not in sprite_objs:
                fail(f'collection "{c.name}": bhc_holdout_sprites names "{other}", which is not a sprite of this scene')
            cutters.update(sprite_objs[key])
        for o in in_sprite:
            if o in cutters and o not in sprite_objs[c.name]:
                o.is_holdout = True
            elif o not in sprite_objs[c.name]:
                o.hide_render = True
        for o in plate_objs:
            if holdout:
                o.is_holdout = True
            else:
                o.hide_render = True
        children = state_children(c)
        if children:
            # One full-frame pass per `state.<state>` child, the other states hidden.
            members = {k.name: list(k.all_objects) for k in children}
            scene.frame_set(PLATE_FRAME)
            for k in children:
                # Story 7.4: a `bhc_state` prop names the state when two groups share a state name (collection names are global).
                state = k.get('bhc_state', k.name[len(STATE_PREFIX):])
                hidden = [(o, o.hide_render) for other, objs in members.items() if other != k.name for o in objs]
                for o, _hide in hidden:
                    o.hide_render = True
                render_to(scene, os.path.join(out, 'frames', name, state, '00.png'))
                raw['frames'].append(f'{name}/{state}/00')
                for o, hide in hidden:
                    o.hide_render = hide
        else:
            for state, timeline in states_of(c).items():
                for n, f in enumerate(timeline):
                    scene.frame_set(int(f))
                    frame = f'{name}/{state}/{n:02d}'
                    render_to(scene, os.path.join(out, 'frames', name, state, f'{n:02d}.png'))
                    raw['frames'].append(frame)
        scene.frame_set(PLATE_FRAME)
        for o, hide, hold in saved:
            o.hide_render = hide
            o.is_holdout = hold
    r.film_transparent = film

    with open(os.path.join(out, 'raw.json'), 'w', encoding='utf8') as f:
        json.dump(raw, f, indent=1, sort_keys=True)
    print(f'render_screen: wrote {len(raw["frames"])} frames and {len(raw["objects"])} layout objects')


main()
