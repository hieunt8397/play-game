---
title: 'Chơi được trên điện thoại: khung chơi kẹp tỉ lệ iPad, viền hai bên'
type: 'feature'
created: '2026-11-27'
status: 'done'
baseline_commit: '1b41245ba3f902d047cd8f3cfdcc6f020cf0310d'
route: 'dispatch'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-be-hoc-choi-2026-10-08/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The stage is ENVELOP-scaled to the whole viewport, and every layout rule (safeRect, Hud, validators) only covers iPad aspects 4:3…1.46. A phone in landscape (~2.17) crops ~38 % of the height, so the Home/Speaker buttons and edge items are cut off.

**Approach:** Clamp the play box: `#game-container` becomes the largest centred box whose aspect is clamped to `Tokens.supportedAspect` [4/3, 1.46]; Phaser keeps ENVELOP inside that box. Outside it the page shows the sky colour (bars). Phone = iPad 1.46 layout with side bars; every iPad = unchanged (no bars). The user asked for "Scale.FIT"; this is the same goal (whole game visible on a phone) with no change on iPad and smaller bars, so all existing safeRect/validator rules stay true.

## Boundaries & Constraints

**Always:** design space stays 1024×768; pointer → design mapping stays only in `core/input/space.ts`; portrait CSS 90° rotation kept; bar colour = `Tokens.colors.sky` (already the body background); box aspect bounds come from `Tokens.supportedAspect` (set as CSS custom properties from main.ts, CSS fallback values equal to the tokens).

**Never:** no re-render of art, no change to `Tokens.safeRect`, `supportedAspect`, content layouts or validators; no Scale.FIT; no "rotate your device" screen; no Hud placed in the bars.

## I/O & Edge-Case Matrix

| Scenario | Viewport (stage layout w×h) | Expected |
|----------|------------------|---------|
| iPad 4:3 | 1024×768 | box = whole stage, s = 1, identical to today |
| iPad 1.44 | 1180×820 | box = whole stage, identical to today |
| Phone landscape | 844×390 | box 569×390 centred (bars 137.5 px each side); s = 0.5556 (ENVELOP 1.46 inside box); Hud at box corners + residual insets |
| Phone portrait | 390×844 window → stage rotated, layout 844×390 | same as above in the rotated frame; taps map correctly |
| Squarish desktop | 800×800 | box 800×600, bars top/bottom |
| Tap in a bar | client point outside box | `dead: true` (ignored like the edge strips) |
| Notch inset 47 px left on 844×390 | inset < bar 137.5 | residual inset 0; Hud not shifted |

</frozen-after-approval>

## Code Map

- `app/index.html`, `app/src/styles/stage.css` -- `#stage` > `#game-container`; stage fills viewport (rotated in portrait). Make `#stage` a flex centre with `container-type: size`; `#game-container` width `min(100cqw, 100cqh * var(--play-aspect-max))`, height `min(100cqh, 100cqw / var(--play-aspect-min))`, `flex: none`. Comments mention ENVELOP/no bars: update.
- `app/src/main.ts` -- sets `document.body` bg from Tokens; also set `--play-aspect-min/max` on `document.documentElement` from `Tokens.supportedAspect` before `new Game`. Keep `Scale.ENVELOP` + `CENTER_BOTH`.
- `app/src/core/stage.ts` -- patched `getParentBounds` reads parent `clientWidth/Height` (layout size, works with the box). No logic change expected; update doc comment only if it claims full-viewport.
- `app/src/core/input/space.ts` -- `View` gets an optional `box?: Rect`: `readView` measures `#game-container` in stage-local layout px (`offsetLeft`, `offsetTop`, `clientWidth`, `clientHeight`; transform-independent, the same rounded sizes Phaser's patched `getParentBounds` reads), only when it is non-empty. Add pure `playBox(view): Rect` = `view.box` when present, else computed (stage-local, centred, aspect clamped to supportedAspect; this computed path is what node tests and the no-DOM fallback use). Degenerate stage (w or h ≤ 0, or an empty box): keep the old whole-stage envelop (s > 0), never s = 0. `envelop` uses box size (offsets still `(view.w - 1024 s)/2`, same because centred). `visibleDesignRect` = box in design px. Add box-relative insets `max(0, localInset - barMargin)`; `designInsets` and `isDeadZone` use them; `isDeadZone` true outside the box. `localInsets` stays (screen → local).
- `app/src/core/input/drop.ts` -- `dragBounds` uses `localInsets`; switch to the box-relative insets so drag bounds follow the box.
- `app/src/core/input/space.test.ts`, `drag.test.ts` (the dragBounds/hudExclusions tests live there; there is no drop.test.ts) -- existing iPad cases must still pass unchanged; add the matrix cases with exact expected values (no loose tolerances), `readView` with a fake `#game-container` box, a measured box that differs from the computed one (e.g. full stage, as with no container-query support) driving `playBox`/taps, w = 0 stage, and the Hud circles at exact box-corner positions incl. a rotated view with real insets and a residual-inset case. The square 800×800 window is portrait under `(orientation: portrait)` (rotated); test squarish as 1000×900 (landscape) and describe it that way in docs.
- `app/tools/layout/hud-keep-out.ts` -- already models aspects [min,max]; unchanged, stays valid.
- `ARCHITECTURE-SPINE.md` AD-7, `app/README.md` -- document the play box.

## Tasks & Acceptance

**Execution:**
- [x] `app/src/core/input/space.ts` -- measured `View.box` in `readView`, `playBox` (measured first, computed fallback, degenerate guard), box-relative insets, envelop/visibleDesignRect/designInsets/isDeadZone on the box -- single mapping source.
- [x] `app/src/core/input/drop.ts` -- dragBounds on box insets -- drags stay inside the visible game.
- [x] `app/src/styles/stage.css`, `app/src/main.ts` -- clamp `#game-container` to the box from token CSS vars -- Phaser ENVELOPs into the box.
- [x] `app/src/core/input/space.test.ts`, `drag.test.ts` -- matrix cases (844×390 box/scale/visible rect/insets/bar taps, rotated, 1000×900 squarish, measured box, w = 0) -- lock the maths.
- [x] `ARCHITECTURE-SPINE.md` AD-7, `app/README.md` -- amend AD-7 rule and add a "Phones" note.

**Acceptance Criteria:**
- Given headless Chrome at 844×390 and 390×844 (portrait, rotated), when the app runs Start → Map → a game, then the whole safeRect content and the Home/Speaker buttons are visible, taps on an item and on Home hit them, and bars are sky colour.
- Given 1024×768 and 1180×820, when compared with screenshots from before the change, then they are pixel-identical (no bars, same layout).
- Given `npm run check`, then it passes.

## Implementation Notes

## Spec Change Log

- **Loop 1 (review of iteration 0).** Trigger: input mapping re-derived the play box from aspect maths while Phaser renders into the CSS-laid-out #game-container; they disagree without container-query support (CSS keeps the full stage, TS still clamps: wrong taps, bars dead over visible game), with integer rounding (569 vs 569.4), and nothing checks they match. Amended Code Map: readView measures #game-container into View.box and playBox prefers it; degenerate-stage guard; tests incl. measured box, w = 0, exact Hud positions, squarish = 1000×900; docs wording. Avoids: a second, unverified copy of the CSS layout rule deciding taps. KEEP (iteration 0 worked, re-derive the same): the stage.css flex centring + container-type + min(cqw…) box with token CSS vars set in main.ts; boxInsets = max(0, inset − bar) used by designInsets, isDeadZone (dead outside the box) and dragBounds; envelop scaling to the box (amended: offsets from the box, ox = box.x + (box.w − 1024·s)/2, oy likewise, since a measured box need not be exactly centred); visibleDesignRect = box in design px; iPads return the whole stage exactly; README Phones section and AD-7 play-box rule (also mention the box is laid out in the rotated stage's local frame); stage.ts comment-only change, wrapped at ~100 chars.

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence / route |
|---|-------|---------|---------|------------------|
| 1 | edge, blind, gap-other | No container-query support: CSS box ≠ playBox() | medium | var()+cqw declarations fail → box is the full stage (or auto), playBox still clamps → wrong tap mapping on iOS < 16 phones. bad_spec (measure the box). |
| 2 | edge, blind, gap-other | clientWidth rounding (569) vs exact 569.4 | low | Real, ≤ 0.4 px. Grouped with 1 (same root: computed vs laid-out box). |
| 3 | gap | No check that CSS box equals playBox() | medium (gap, defer) | Pre-verified; resolved in part by measuring; a browser layout harness is not in npm run check → deferred-work. |
| 4 | edge, blind | Stage w = 0, h > 0 → s = 0, NaN/Infinity | low | Confirmed in playBox maths; before the change s = h/768. Direct guard; folded into the loop-1 amendment. |
| 5 | blind | 800×800 is portrait (rotated), test/README describe unrotated | low | (orientation: portrait) matches h ≥ w. Direct correction; folded (squarish = 1000×900). |
| 6 | blind | Hud/drag phone tests use loose inequalities | low | Assertions would pass almost anywhere; folded (exact positions, rotated + residual insets). |
| 7 | blind | Test tolerances use rounded spec numbers (137.5, 569) | low | Folded with 6 (exact values). |
| 8 | blind | stage.css fallback values not checked against tokens | low | Only first paint before main.ts; rejected (unlikely, fix adds a test harness). |
| 9 | blind | No evidence the ACs ran | false | Headless Chrome screenshots exist (scratchpad shots a-*/b-*), taps verified; fix would edit the spec → rejected. |
| 10 | blind | Spec names drop.test.ts, tests in drag.test.ts | low | Fix edits the spec → rejected (Code Map corrected in loop-1 amendment anyway). |
| 11 | blind | stage.ts / README lines over wrap width; AD-7 portrait bullet | low | Cosmetic, direct; folded into KEEP notes. |
| 12 | edge | Float epsilon at aspect boundary CSS vs JS | false | Moot once the box is measured; computed path only used without a DOM. |
| 13 | gap, edge (r2) | — | none | Verification-gap layer: no gaps. Edge-case layer: no findings. |
| 14 | blind (r2) | Dead strips larger in design px on a phone (≈43/58/72 vs ≈20–24/27–32/34–40) | low | Real: items within ~30 design px of the top/bottom safeRect edge lose part of their hit area on phones; strips are physical CSS px by design (palm rejection). Rejected: occasional, fix needs a new phone-only rule. Reported to the user. |
| 15 | blind (r2) | Targets ~55 % of iPad size on phones | false | Accepted by intent (whole game visible, smaller picture). |
| 16 | blind (r2) | iOS < 16 phones keep the old cropped view; README called the fallback harmless | low | Behaviour unchanged from before; wording → patch (README: phones need iOS 16+). Fixed. |
| 17 | blind (r2) | container-type: size containment side effects on overlays | false | No DOM overlays inside #stage (no createElement/appendChild/fixed descendants; overlays are Phaser scenes). |
| 18 | blind (r2) | CSS min() vs JS playBox duplicated, untested | low | carried from #3 (deferred); input uses the measured box. |
| 19 | blind (r2) | Box not re-measured on resize/rotation | false | locate() calls currentView() → readView() on every pointer. |
| 20 | blind (r2) | Measured box rounding vs Phaser floor centring | low | carried from #2: ≤ 1 px; rejected. |
| 21 | blind (r2) | Test gaps: aspect boundaries, rotated squarish + insets, measured box y≠0, w=h=0 | low / false | Boundary/rotated-squarish: rejected (plain comparisons). w=h=0: false as a regression, s = 0 there before the change too. |
| 22 | blind (r2) | README: dead-bar text names only side bars; wrap; no phone install note | low | Wording + wrap → patch, fixed. Install note rejected (same Add to Home Screen steps). |
| 23 | blind (r2) | Drag crossing into a bar not tested | low | clampDrag clamps to box-based dragBounds (tested at 844×390); rejected. |

## Design Notes

Why not FIT: FIT letterboxes iPads 1.43–1.46 too and wastes more of a phone (box 4:3 = 520 px wide vs 569 px). Clamping the box to the already-supported aspect range reuses every guarantee (safeRect, hud-keep-out, validators) with no new layout rule.

```ts
// stage-local, centred
const a = clamp(view.w / view.h, min, max);
const w = Math.min(view.w, view.h * a), h = w / a;
return { x: (view.w - w) / 2, y: (view.h - h) / 2, w, h };
```

## Verification

**Commands:**
- `cd app && npm run check` -- expected: passes, last line precache OK.

**Manual checks:**
- Headless Chrome CDP (see dev-machine notes) screenshots at 844×390, 390×844, 1024×768, 1180×820; before/after diff at the iPad sizes; synthetic tap on Home and on a Map station at 844×390.
