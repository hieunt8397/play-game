---
title: 'Giờ đi ngủ: Shiba chibi thay Shiba Quaternius'
type: 'refactor'
created: '2026-10-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ee30ac7d513fd5743fb2e14306cf77c19aca976c'
context: ['spec-7-4-gio-di-ngu.md', 'spec-8-2-thay-do-cho-shiba.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The bedtime friend is still the realistic, faceted Quaternius Shiba (ShibaInu.fbx). The parent finds it ugly (2026-10-29), and it clashes with the chibi Shiba on the map and in Tiệm kem and Tủ đồ.

**Approach:** In `build_bedtime.py`, build every Shiba pose from the chibi Shiba (`cute.chibi('dog','shiba',…)`, the same dog as in Tiệm kem and Tủ đồ). Keep all 7 poses and their frame names, the blanket over it, the brush at its mouth, the z above its sleeping head, and the hit hull. Then re-render `bedtime`.

Decisions (parent, 2026-10-29):
- Only the dog changes. Shiba does **not** wear the wardrobe outfit here.
- Tìm bóng's Quaternius Shiba stays for later (deferred).
- This reverses spec 7.4's choice of the "real Quaternius Shiba" and its "Never: chibi animals" for this one animal.

## Boundaries & Constraints

**Always:**
- Same sprite contract: `sprite.shiba` states `sit`, `brush`, `lie`, `lie-brush`, `yawn`, `sleep`, `roll` → frames `shiba/<pose>/00`. Same anchors (`mouth-sit`, `mouth-lie`, `head-sleep`) and hit `shiba`. The runtime is unchanged apart from tuning tokens if needed.
- Each pose still reads as before:
  - sit, facing the child;
  - brush: sitting, happy, eyes shut, mouth open (smile);
  - lie: sphinx on the bed, head up, toward the camera;
  - lie-brush: lying, happy, smile;
  - yawn: head up, mouth wide;
  - sleep: chin toward the pillow, eyes shut;
  - roll: on its side (never on its back), head readable.
- The chibi stays recognisably the same toy as in Tiệm kem and Tủ đồ: the same parts, colours (`chibi_materials`) and proportions. It is posed by moving and turning its parts or pivots inside this builder only. A small open-mouth part (named `<mesh>-mouth`, so `mouth_point` keeps working) is allowed.
- The blanket still covers the lying, lie-brush and sleeping Shiba up to the shoulders. The brush reaches the mouth. The z rises from the sleeping head.
- `validateBedtime` passes: hulls ≥ `ui.bedtimeTargetMinPx`, gaps ≥ `spacing.targetGap`. The plate's luminance ratio stays ≥ 0.35.
- Back up every file before editing or re-rendering it, in `_backup/2026-10-29-bedtime-shiba-chibi/` (same relative paths).

**Never:**
- Changing `cute.py`'s `chibi()` or `key_chibi()`, or the map, ice-cream or dress-up art.
- Outfit overlays in bedtime.
- Touching Tìm bóng.
- Removing `ShibaInu.fbx` from the repo (the map's ice-cream icon still uses it).

</frozen-after-approval>

## Code Map

All under `app/`.
- `tools/render/blender/build_bedtime.py`:
  - header (lines 15–28) and constants (lines 91–111: `SHIBA`, `SHIBA_K`, `SIT_*`, `HEADBOARD_GAP`, `FACE_TURN`, `ROLL_*`, `POSES`, `EYES_SHUT`, `MOUTH`, `FEET`, `DRAPE_*`, `LIE_SINK`);
  - FBX posing to replace: `import_shiba` (432), `turn` and `aim` (469 and 479), `pose_sit`, `pose_lie` and `pose_roll` (507–567), `eye_spots`, `snout`, `shut_eyes` and `open_mouth` (570–640), `build_pose` (642–673);
  - `build_shiba` (682–704) places each pose: sitting at `SIT_X` with yaw −18°; lying with yaw 90° and the nose at x1 − `HEADBOARD_GAP`; and returns `out[pose] = {'pts', …}`;
  - `build_blanket` (773–808) reads `pts`. Nose toward +x; the body box comes from the back 60%;
  - `build_layout` (905–943): `hit.shiba` is the hull of every pose. `mouth_point` (676) looks up `<mesh>-mouth`. `anchor.head-sleep` is the box of sleep pts near the nose.
- `tools/render/blender/cute.py`:
  - `chibi()` (189–249) is a sitting toy facing −Y, about 2.0 tall, with no armature. It returns `root`, `body`, `head` and `tail` empties plus the parts. Object names are global, so each pose needs its own name, e.g. `shiba-lie`.
  - `chibi_materials()` (167) builds its materials.
  - `key_chibi()` (384) keys head pitch, roll and yaw, the tail on Z, the tongue, the bob, and the eyes (`open`, `squint` or `shut`).
  - Lying, rolling, the mouth and a downward tail all need local part moves. See `build_map.py:70–80`, which re-parents a leg for the wave.
- Posing references:
  - `build_ice_cream.py:296–326` (states and `params['art']['creatureLight']`);
  - `build_dress_up.py:241–259` (happy uses shut eyes and the tongue).
- `tools/render/build.ts`: check that the bedtime params carry the chibi colours (`creatureOrange`, `creatureLight`, …) as for ice-cream and dress-up.
- Runtime, names only:
  - `src/content/games/bedtime.ts`: header comment lines 2–3;
  - `src/games/bedtime/Bedtime.ts` (brush 332–353, bubbles 377, z 426–429);
  - tokens `src/core/tokens.ts:329–342` (`bedtimeBrushOffsetPx`, tilts, `bedtimeZOffsetPx`), which may be retuned to the new mouth and head;
  - rules `tools/layout/rules.ts:1936–1990`.
- Docs: `app/README.md:217`, `:229` (bedtime friend credit); the spec 7.4 dev log is not edited.
- Commands (from `app/`): `npm run art:build -- bedtime`, `npm run render -- bedtime`, `npm run atlas -- bedtime`.

## Tasks & Acceptance

**Execution:**
- [x] `_backup/2026-10-29-bedtime-shiba-chibi/`: copy `build_bedtime.py`, `art/bedtime.blend`, the bedtime atlas and plate, `bedtime.layout.json`, `tokens.ts` and `README.md`.
- [x] `tools/render/blender/build_bedtime.py`: replace the FBX import and posing with one chibi rig per pose (`<name>-<pose>`):
  - sit and brush: the chibi as is, with the head and eyes keyed and a mouth part for the smile;
  - lying poses: body lowered, hind spheres tucked, front legs and paws slid forward, the root turned along the bed, the head turned toward the camera;
  - yawn: a wide mouth part with the head up;
  - sleep: head down toward the pillow, eyes shut;
  - roll: the body turned about its long axis, the head counter-turned so the face reads.
  
  Keep `out[pose]['pts']`, the `<mesh>-mouth` objects and the placement contract so the blanket and layout code still work. Retune the scale, `HEADBOARD_GAP`, `LIE_SINK` and the drape constants to the new shape. Update the header.
- [x] `tools/render/build.ts`: pass the chibi colours to bedtime if missing.
- [x] Build, render and atlas `bedtime`. Iterate on composites (every pose over the plate, with the blanket on, the brush at the mouth and the z) until each pose reads clearly and the blanket fits.
- [x] `src/core/tokens.ts`: retune the brush offset and tilts and `bedtimeZOffsetPx` if the composites show a gap.
- [x] `src/content/games/bedtime.ts` header, `app/README.md` asset table and credits: name the chibi Shiba.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md`: add one entry, "Tìm bóng still uses the Quaternius Shiba (parent 2026-10-29: later)".

**Acceptance Criteria:**
- Given a rebuilt and re-rendered bedtime, when the 7 Shiba frames are composited over the plate, then each shows the chibi Shiba in its pose: none shows the Quaternius model, and roll is on its side with the face visible.
- Given lie, lie-brush and sleep with the blanket on, then the quilt covers the body up to the shoulders with no gap or poke-through.
- Given brush and lie-brush, then the toothbrush tip sits at the mouth. Given sleep, then the z starts above the head.
- Given `npm run check`, then it exits 0, including `validateBedtime`.

## Design Notes

The chibi has no skeleton. A lying pose is made by moving its sphere parts (torso, legs, paws, hind legs) relative to `body`, then turning `root`. That is the same idea as `build_map.py` re-parenting a leg for the wave. Keep the per-pose rigs independent (their own names) so that one pose's tweaks never leak into another.

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- Scratch composites of all 7 poses (with the blanket, the brush and the z) shown to the parent before commit.

## Implementation Notes

- `build.ts` and `tokens.ts` needed no change: bedtime already received the chibi colours, and the brush and z offsets matched the new composites.
- The parent asked to commit and push (2026-10-29) without the step-04 multi-reviewer pass; `npm run check` passed (1996 tests).
