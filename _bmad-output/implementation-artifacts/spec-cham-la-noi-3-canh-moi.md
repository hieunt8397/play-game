---
title: 'Chạm là nói: thêm 3 cảnh Phòng tắm, Tiệm bánh, Dã ngoại'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Chạm là nói has only three scenes (Biển, Đường phố, Nhà bếp); the parent wants more fun themes for the child to explore.

**Approach:** Add three scenes in the same cute-toy style as the restyled ones — Phòng tắm (bathroom), Tiệm bánh (bakery), Dã ngoại (picnic in the park) — each with 10 tappable props that bounce, make a sound and say their name, and a scene name line. The child switches scenes with the scene bubbles as today.

Decisions (parent, 2026-10-21):
- Three new scenes, Tiệm bánh and Dã ngoại separate (six scenes in all).
- Scene bubbles: two columns of three on the right edge, every scene one tap away; the prop area narrows on the right, so every scene's prop boxes shift left and all six plates are re-rendered.
- The proposed prop lists and names in the Code Map are approved as written.
- This is batch 2 of 3; props get temporary synthesized sounds now, real CC0 sounds come in batch 3.

## Boundaries & Constraints

**Always:** Same scene mechanics as today (controller `talk.ts`, idle wiggle, name delay, slide between scenes, resume of scene + touched set). Prop ids kebab, unique across all six scenes. Art only from vendored CC0 packs (`assets/tinytreats`, `assets/kaykit`) or script-built in the cute style (chibi face on creatures). Every prop passes the existing touch-talk layout rules (size band, hit gaps, HUD and bubble keep-out). Voice lines follow the content rules (≤ 8 words, `Xoài` only in the scene line, review note on loanwords), rendered with `npm run tts` (ElevenLabs "Thắm"). Every new SFX passes `npm run audio:check`; provenance rows in `app/README.md`.

**Never:** Change the three existing scenes' props, lines or behaviour (only their position in the bubble order and, if the bubble layout needs it, their prop boxes); add a new game mechanic; use non-CC0 art or sounds.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open game | enter Chạm là nói | six scene bubbles reachable; first scene shown; scene line plays | — |
| Switch | tap a new-scene bubble | slide to it; its scene line ("Xoài ơi, phòng tắm!" …) | taps during the slide ignored (as today) |
| Tap prop | tap a bathroom/bakery/picnic prop | bounce + sound now, its name after the usual delay | — |
| Resume | Home mid-scene in a new scene, come back | same new scene and touched set | old snapshot ids still valid |
| Build | art:build, render, atlas | six plates, 60 props, six thumbs; atlas pages ≤ 2048² | missing model → builder fails naming it |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/games/touch-talk.ts` -- add `BATHROOM_PROP_IDS`, `BAKERY_PROP_IDS`, `PICNIC_PROP_IDS` and three `TOUCH_TALK_SCENES` entries (`bathroom`, `bakery`, `picnic`); `TOUCH_TALK_SCENE_SLOTS` = 6, laid out as two columns of 3.
- `src/content/assets.ts:51` -- `TOUCH_TALK_PLATES` + `BACKGROUNDS['touch-talk-<plate>']`.
- `src/core/scene-bubbles.ts`, `tools/layout/hud-keep-out.ts` (`sceneBubbleKeepOutRect`), `src/games/touch-talk/TouchTalk.ts` (`drawBubbles`, `placeBubbles`) -- two columns of 3 bubbles (column 1 under the Speaker, column 2 one bubble + targetGap to its left), keep-out rect widened to both columns (+ tests). Shift `PROP_BOXES` (and the sea anchors) left so no prop enters the wider keep-out; re-render all six plates.
- `src/content/voice-lines.ts` -- `vo.touch-talk.scene.{bathroom,bakery,picnic}` ("Xoài ơi, | phòng tắm!", "Xoài ơi, | tiệm bánh!", "Xoài ơi, | đi dã ngoại!") and one `vo.touch-talk.name.<id>` per prop; then `npm run tts`.
- `tools/audio/make-placeholders.ts` (~:242) -- one short soft synthesized `sfx.touch-talk.<id>` per new prop; `src/content/audio-catalog.ts` entries.
- `tools/render/blender/build_touch_talk.py` -- three new plate builders on the same `PROP_BOXES`/`build_box_prop` pattern; `cute.tt_model(stem, pack)` for models. Proposed props (id → name line → source):
  - Phòng tắm (Bubbly Bathroom; tiled wall, floor, mat, plant): bathtub "Bồn tắm" `bath`; rubber-duck "Con vịt" `ducky`; toothbrush "Bàn chải" `toothbrush_blue`; toothbrush-cup "Cái cốc" `toothbrush_cup`; towel "Khăn tắm" `towel_pink`; slippers "Đôi dép" `slippers`; mirror "Cái gương" `mirror`; shampoo "Dầu gội" `container_bathroom_A_*`; soap "Xà phòng" script; potty "Cái bô" script.
  - Tiệm bánh (Baked Goods + Charming Kitchen counter/shelves as a shop): birthday-cake "Bánh sinh nhật" `cake_birthday`; cupcake "Bánh kem nhỏ" `cupcake`; donut "Bánh vòng" `donut_pink`; cookie "Bánh quy" `cookie`; croissant "Bánh sừng bò" `croissant`; muffin "Bánh nướng" `muffin`; waffle "Bánh tổ ong" `waffle`; apple-pie "Bánh táo" `pie_apple`; cinnamon-roll "Bánh cuộn" `cinnamon_roll`; chocolate-cake "Bánh sô-cô-la" `cake_chocolate`.
  - Dã ngoại (Pleasant Picnic on Pretty Park grass, trees, flowers, blanket): picnic-basket "Giỏ đồ ăn" `picnic_basket_round`; sandwich "Bánh kẹp" `sandwich`; grapes "Chùm nho" `grapes`; cheese "Phô mai" `cheese_A`; teapot "Ấm trà" `teapot`; frisbee "Đĩa bay" `frisbee`; radio "Cái đài" `radio`; cooler "Thùng đá" `cooler`; pillow "Cái gối" `pillow_small_red`; butterfly "Con bướm" script chibi.
- Tests: `src/content/games/touch-talk.test.ts`, `src/games/touch-talk/talk-scenes.test.ts`, `tools/layout/touch-talk-rules.test.ts`, content validation — extend for six scenes.
- `app/README.md` -- provenance rows (plates/atlas, new voice lines, placeholder SFX).

## Tasks & Acceptance

**Execution:**
- [x] content (props, scenes, plates, voice lines, SFX catalogue) + tests.
- [x] two-column bubble layout + keep-out + shifted prop boxes + tests.
- [x] `build_touch_talk.py` -- three plates and 30 props; rebuild (`BLENDER_BIN=… npm run art:build -- touch-talk && npm run render -- touch-talk && npm run atlas -- touch-talk`), open every new plate and atlas page and iterate until each prop reads clearly.
- [x] `npm run tts`, `npx tsx`/`node tools/audio/make-placeholders.ts` for the new SFX, `npm run audio:check`.
- [x] `app/README.md` provenance.

**Acceptance Criteria:**
- Given the game, when the child taps any new prop, then it bounces, sounds and its Vietnamese name is spoken in the Thắm voice.
- Given `npm run check`, then it exits 0.

## Implementation Notes

- Bubble order: sea, street, kitchen (column under the Speaker), then bathroom, bakery, picnic (column to its left). Keep-out rect grows automatically from `sceneBubbleCentres` (now x ≥ 780 at y 224–617).
- PROP_BOXES end at x 746 (padded hulls ≤ 770); street streetlights now placed by screen x (`STREETLIGHT_SCREEN_X`). Sea props moved by `SEA_SHIFT_PX` (seagull moved right under the Speaker at 130 px, boat into its old spot) because the Home zone blocked the left.
- Bathroom rows: shelf / floor / floor; bakery: shelf / counter (on a floor at −0.6) / pink display table; picnic: all on grass. New token `art.touchTalk.grassNear`. `PROP_STRETCH` accepts an (x, y, z) tuple (toothbrush).
- New SFX generated only for the 30 new ids (running the whole make-placeholders would rewrite every catalogue file); peaks ≤ −20 dBFS measured. `audio:check` measures only creature sounds (none new).
- Atlas fits in 2 pages (max 3).

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | verif, edge, blind | STAR_TURN_DEG comment moved onto FLY_WING_DEG | low | two comments on one line, the starfish constant bare | patch |
| 2 | edge, blind | SEA_SHIFT_PX comment has the sign backwards | low | shifted() adds dx; positive moves right | patch |
| 3 | blind | seagull shrunk 140 → 130 px | low | frozen Never: existing props change only in position/boxes | patch (restore, move instead) |
| 4 | blind | single-"column" wording left in rules.ts, render.ts, PROP_BOXES comment, talk-scenes test | low | comments/describe names only | patch |
| 5 | blind | style: double blank line, redundant toBe(6), 190-char header line | low | read in diff | patch |
| 6 | edge | a right safe-area inset moves both bubble columns left onto props checked only at zero inset | medium | the second column's left edge (keep-out x 780) sits 34 px from the props' right edge (746); a landscape phone with a notch (right inset ~44–59 px) shifts it into the prop area; the iPad target has no side inset | defer |
| 7 | edge | screen_x_at divides by p.y − cam.y | false | every call uses fixed on-screen points below the horizon of a fixed camera, so the ray always reaches the ground in front of the camera | reject |
| 8 | blind | bakery names (bánh nướng, bánh cuộn, bánh kem nhỏ) lack review notes; nine names start with "Bánh" | low | names approved by the parent as written; REVIEW_WORDS does not list them | reject (parent decision) |
| 9 | blind | "Cái cốc!" names both the kitchen mug and the bathroom toothbrush-cup | low | approved list says "Cái cốc" for toothbrush-cup | reject (parent decision) |
| 10 | blind | picnic tuft keep-out uses hard-coded numbers; tufts may sit under props | low | cosmetic; the rendered picnic plate reads clean | reject |
| 11 | blind | several placeholder sounds nearly identical | low | temporary by decision; batch 3 replaces every prop sound | reject |
| 12 | blind | Python pixel constants vs TS bubble keep-out not cross-checked | low | the render's validateTouchTalk on the regenerated layout fails if a prop enters the keep-out | reject |
| 13 | blind | sceneBubbleCentres opens a third column for count > 6; no test of index → bubble mapping or picnic → sea slide | low | no caller passes > 6; rules test pins all six centres; the slide is direction-agnostic in talk.ts | reject |

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- Open the three new `public/assets/bg/touch-talk-*.png` plates and the atlas pages: cute, readable props, no dark blobs.
