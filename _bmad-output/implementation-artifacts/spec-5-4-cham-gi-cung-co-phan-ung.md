---
title: 'Story 5.4 — Chạm gì cũng có phản ứng'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'NO_VCS'
review_loop_iteration: 0
followup_review_recommended: true
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md']
warnings: ['oversized']
deferred:
  - summary: >-
      Map decoration shake + per-type SFX and background-ripple blocking have no scene test.
    evidence: |-
      Only helper tests (map-prop, decorations) exist; no MapScene harness.
    location: >-
      app/src/scenes/Map.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Most taps do nothing. In the games, only the router targets react: draggables, the pizza oven, the touch-talk props and the fishing pond. Tapping a character (Shiba, the fox, the triceratops), a decor sprite or empty background gets no response. On the island, every decoration gives the same bounce and the same happy chime, whatever it is (FR33, FR53).

**Approach:** Add a pure tap-reaction model in core. It classifies a press as target, ordinary sprite or background, and limits the background ripple to at most 1 Hz. A shared Phaser helper turns that model into one catch-all router target with the lowest z. Anything a real target wants (draggable, the 5.1 catcher, the oven, a station, a decoration) wins by z first. Whatever is left becomes a sprite bounce with "pụp", or a silent ripple. MiniGameBase exposes the helper, so each game only registers its non-target sprites. Map gets the ripple plus a decoration shake with a sound chosen by decoration type.

## Boundaries & Constraints

**Always:**
- Input goes only through `core/input`. The reaction target uses `TAP_REACT_Z = −3`, below the 5.1 catcher (−2) and Map decorations (−1). So it only ever receives presses no other target accepted. InputGuard pickability is untouched: a non-pickable item's circle is already absent from `contains`, so the press falls through.
- A reaction never calls `hint.wrong()`, never feeds the RoundTally and never emits on the Bus. It runs inside the pointerdown handler, which keeps it within NFR5's 100 ms.
- Sprite bounce reuses `bounce` (core/ui/scale-motion) with `Tokens.components.tappableProp.react` and `amplitude(…, reduced)`. Its sound is `audio.sfx('sfx.shell.pop')`, which already exists and is boot-loaded. The ripple has no sound.
- Every new number goes in `Tokens.ui` or `Tokens.Timing`: ripple radius, duration, min gap and depth, plus decoration shake degrees and duration. Timers and tweens use the scene clock (`scene.time.now`, `scene.tweens`). The ripple colour reuses an existing white hint/selection-ring token, so no new colour is added.
- The helper is disabled after the game's terminal event (`inert`). It is also disabled for a press that skipped a celebration (5.3). On Map it is disabled while the post-round chain runs, after a skip tap, or while the play-again overlay is open.

**Never:**
- No "wrong" signal: no red, no ✗, no wrong sound. Never bounce a draggable, a drop target or a router target through this path.
- No changes to `drag-controller` semantics, the guard, the HintDirector, or the existing behaviour of Fishing's water ripple ("tõm" stays) and touch-talk's prop taps.
- Do not include 5.5 (reward choice), 5.6 (landmarks, ambient art), 5.8 (free play) or per-game "chose-other" reactions (Epic 6).
- No calls to `this.sound`, `this.load` or `this.scene` in games. No `setTimeout`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sprite tap | Ice-cream, no scoop held; tap inside the `HITS.shiba` polygon | Shiba bounces to 1.1× and "pụp" plays. Hint level and tally are unchanged. | No error expected |
| Real target wins | Tap on a pickable scoop or the oven, or on a Map station that overlaps a decoration | The existing handler runs. The reaction target is never called. | No error expected |
| Selected item | A 5.1 item is selected; tap on Shiba or the background | The catcher (−2) flies the item there, as before. No bounce, no ripple. | No error expected |
| Non-pickable item | Scoops locked during a celebration; tap on one | The press falls through. A registered sprite under it bounces, otherwise a ripple shows. | No error expected |
| Background | Tap on empty plate or island | A small light ring at the finger grows and fades. No sound. | No error expected |
| Ripple rate | Two background taps less than `Timing.tapRippleMinGapMs` (1000) apart | Only the first shows a ripple. | No error expected |
| `isTarget` entry | A registered entry whose `isTarget()` is true | Classified `target`: no bounce, no ripple. | No error expected |
| Decoration | Tap on a Map decoration of kind `vehicle` | It shakes ±`ui.decorationShakeDeg` (reduced under reduced motion) and plays `DECORATION_SOUNDS.vehicle`. No station opens. | No error expected |
| Blocked | Inert scene, a skip tap, Map chain active or play-again open | Nothing happens. | No error expected |

</intent-contract>

## Code Map

- `app/src/core/input/guard.ts:204-221` -- `decide`: resolves the topmost target, then runs `anyTap`, then `onPress`. Unchanged; the reaction relies on this order.
- `app/src/core/input/tap-router.ts:85-91` -- `hit`: the highest z wins. The new lowest-z target plugs in here.
- `app/src/core/input/drag-controller.ts:78-79,160-170` -- `CATCHER_Z = −2`, which must stay above the reaction z; the pickability check in `contains`.
- `app/src/core/input/fakes.ts` -- fake scene and pointers for the router-level tests.
- `app/src/core/ui/scale-motion.ts:100-114` -- `bounce`. Add an angle `shake` beside it, with its own motion map.
- `app/src/core/ui/map-prop.ts:52-61` -- prop press → bounce + `onTap`. Add a `react: 'bounce' | 'shake'` option.
- `app/src/core/hint-visuals.ts:125-134` -- `itemBounds` (the trimmed bounds of a sprite). Use it as the default live hit area.
- `app/src/games/mini-game-base.ts:150-157` -- `attachSkip`, the model for a new `attachReactions(router)` and `react(entry)`. Also track whether the current press skipped.
- `app/src/scenes/Map.ts:110,257-264,468-480` -- `HAPPY_SFX`, `onAnyTap` (5.3 `skipTap`), and `addDecorationProp`, where the sound is currently always happy.
- `app/src/content/decorations.ts:11-15,27-71` -- `DecorationItem`, which has no sound/type yet, and the 28 items.
- `app/src/content/audio-catalog.ts:22-26,98-108` -- the `sfx.shell.*` ids, boot-loaded via `core/boot-load.ts:17`.
- `app/tools/audio/make-placeholders.ts:140-148,300-301` -- the woof creature recipe and its switch case, the model for one new placeholder.
- Per-game hookup points:
  - ice-cream: `IceCream.ts:103-104,183-191` (Shiba, `HITS.shiba`)
  - pizza: `Pizza.ts:146-147,257-258,605-611` (fox via `HITS.fox`, bowls)
  - dino-puzzle: `DinoPuzzle.ts:138-139,268-279` (clouds and the finished-dino sprites)
  - shadow-match: `ShadowMatch.ts:119-120,222-244` (trike)
  - race: `Race.ts:110,174-188` (swaying props)
  - touch-talk: `TouchTalk.ts:75-87` (background only)
  - fishing: `Fishing.ts:97-100`. The whole-scene pond target means no hookup.

## Tasks & Acceptance

**Execution:**
- `app/src/core/tap-react.ts` -- NEW, pure, no Phaser.
  - `ReactEntry { id; contains(p); enabled?(); isTarget?() }`.
  - `classifyTap(p, entries)`: the last-added enabled entry that contains `p` wins. It returns `{kind:'target'}` if `isTarget()` is true, otherwise `{kind:'sprite', id}`. With no such entry it returns `{kind:'background'}`.
  - `createTapReactor({ rippleMinGapMs })` with `press(p, nowMs, entries)` returning `sprite | ripple | none`. It throttles only the ripple.
  - Export `TAP_REACT_Z = −3`.
  - Why: this is the pure router the epic asks for.
- `app/src/core/tap-react.test.ts` -- NEW. Cover every matrix row at model level: classification order, `enabled` false, `isTarget`, and the ripple gap with a fake clock. Add router-level cases with `fakes.ts`: a z0 target, a pickable draggable and the selected-item catcher each win; a non-pickable draggable falls through; a spy `wrong` is never called.
- `app/src/core/ui/tap-reactions.ts` -- NEW Phaser helper.
  - `attachTapReactions(scene, router, { reduced, blocked? })` registers one target at `TAP_REACT_Z` that contains every point.
  - `add({ image, area?, base?, enabled?, isTarget? })` returns a remove function. The area defaults to the live `itemBounds(image)` padded by `tappableProp.hitPad`.
  - On a sprite it bounces and plays `sfx.shell.pop`. On background it draws the ripple at the press point. On Map that point is in world space through the router's `toWorld`.
- `app/src/core/ui/scale-motion.ts` -- add `shake(scene, target, deg, durationMs)`: an angle wobble that ends at the start angle, where a new shake restarts it. Why: decorations shake rather than bounce.
- `app/src/core/ui/map-prop.ts` (+ `map-prop.test.ts`) -- add the optional `react: 'shake'`, defaulting to bounce so the existing props keep their behaviour.
- `app/src/core/tokens.ts`, `app/src/core/timing.ts` -- add:
  - `ui.tapRippleRadiusPx`, `ui.tapRippleDepth`, `ui.decorationShakeDeg`
  - `Timing.tapRippleMs`, `Timing.tapRippleMinGapMs` (1000), `Timing.decorationShakeMs`
- `app/src/games/mini-game-base.ts` -- add `protected attachReactions(router)` and `protected react(entry)`. They are blocked while `inert` or when the current press skipped: `attachSkip` records the return of `skip.tap()`. While a bounce runs, call `holdAmbient('react')` so the breath and sway tweens pause, keeping one prominent motion at a time.
- Per-game hookup: right after creating the router (and after `attachSkip`), call `attachReactions`, then `react(...)` for each of these:
  - `ice-cream/IceCream.ts`: Shiba
  - `pizza/Pizza.ts`: fox and bowls
  - `dino-puzzle/DinoPuzzle.ts`: clouds and finished dinos
  - `shadow-match/ShadowMatch.ts`: trike
  - `race/Race.ts`: swaying props
  - `touch-talk/TouchTalk.ts`: background only

  Pass `enabled` wherever a sprite's own celebration tween must not be interrupted.
- `app/src/content/decorations.ts` -- add `sound: DecorationSound` to each item, where `DecorationSound` is `'food' | 'vehicle' | 'creature' | 'thing'`. Add `DECORATION_SOUNDS` mapping to `sfx.shell.happy`, `sfx.shell.kart-beep`, `sfx.shell.chirp` and `sfx.shell.prop` respectively, plus `decorationSfx(id)`, which falls back to happy.
- `app/src/content/audio-catalog.ts`, `app/tools/audio/make-placeholders.ts` -- add `sfx.shell.chirp` (creature, ≤ 400 ms, two soft high chirps, ≥ 50 ms fade-in, highpass 150 Hz). Then run `npm run audio:placeholders` to create the `.m4a`.
- `app/src/scenes/Map.ts` -- call `attachTapReactions(this, router, { reduced, blocked: chain active || skipTap || playAgain })`, which gives Map its background ripple. In `addDecorationProp`, pass `react: 'shake'` and `onTap: () => audio.sfx(decorationSfx(item.decorationId))`.
- `app/src/content/validate.test.ts` (or a new `decorations.test.ts`) -- every decoration has a sound, and every `DECORATION_SOUNDS` value is an `sfx.shell.*` catalog id.

**Acceptance Criteria:**
- Given any of the 6 hooked games, when the child taps a registered character or sprite that is not a router target, then it bounces with "pụp" in the same pointerdown, and `hint:level` and the round outcome are unchanged.
- Given a Map decoration that overlaps a station's hit polygon, when the child taps the overlap, then the station handles the tap (z 0 > −1) and the decoration neither shakes nor sounds.
- Given `prefers-reduced-motion`, when a sprite bounces, a decoration shakes or a ripple shows, then the amplitudes are reduced through `amplitude` / `ui.reducedMotionAmplitude`.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 27 findings — high 0, medium 4, low 21, false 2, maybe-false 0
- findings:
  - `[low]` `reject` (blind) Fishing never wired — spec decision: the whole scene is one tap target and water taps already ripple ("tõm"); a fish tap is a game choice
  - `[medium]` `patch` (blind) "wrong is never called" spy is disconnected — patched: spy wired to the hint wrong path in a MiniGameBase test; vacuous assertion removed
  - `[medium]` `patch` (blind) tap-reactions.ts + MiniGameBase gating untested — patched: tap-reactions.test.ts + registry.test cases
  - `[low]` `patch` (blind) react() removal discarded for per-round sprites — patched
  - `[low]` `patch` (blind) shakes invisible to stopMotion — patched: stopShake + Map call
  - `[low]` `patch` (blind) attachReactions reads window instead of this.reduced — patched
  - `[low]` `reject` (blind) amplitude(1+deg)−1 workaround / upper-bound-only test — amplitude is linear by definition; works and is tested
  - `[low]` `patch` (blind) Pizza fox enabled misses the eat phase — patched
  - `[low]` `patch` (blind) Dino busy can stick — patched: cleared on every end path
  - `[low]` `reject` (blind) decoration id uniqueness / silent fallback — ids are authored constants already validated by validate:content
  - `[low]` `reject` (blind) boot-loaded claim untested — shell sfx are preloaded by prefix in boot; audio:check verified the chirp file
  - `[low]` `reject` (blind) CHIRP_PARTIALS not used to build the expression — placeholder sound, same pattern as the woof
  - `[low]` `reject` (blind) TAP_REACT_SFX typed as string — single constant, catalog id checked at runtime by the director
  - `[low]` `reject` (blind) ripple depth comment untested / ripple colour like hint — depth 9000 is below the resume mark token (10000); ripple is a small fading ring, unlike the pulsing three-layer hint ring
  - `[medium]` `patch` (verification-gap) MiniGameBase gating — grouped
  - `[medium]` `patch` (verification-gap) tap-reactions layer — grouped
  - `[medium]` `defer` (verification-gap) Map decoration shake/SFX/ripple wiring — no Map harness (filed defer)
  - `[medium]` `patch` (verification-gap) vacuous wrong spy — grouped
  - `[low]` `patch` (edge) decoration replaced mid-shake — grouped with stopShake
  - `[low]` `reject` (edge) bounce in flight when a celebration starts — enabled guards stop new bounces; ≤ 300 ms overlap is cosmetic
  - `[low]` `patch` (edge) press during fast-forward reacts — patched: blocked while skipping
  - `[false]` `reject` (edge claim) wrong spy — duplicate of the patched row
  - `[low]` `patch` (edge claim) SHAKE_SWINGS not a token — patched
  - `[low]` `reject` (intent a) coverage is opt-in per scene — every visible character/prop the child can tap is registered; scenery baked into the plate cannot be addressed separately (background ripple covers it)
  - `[low]` `reject` (intent c) "current target" modelled as router target — the routers already hold exactly the live targets
  - `[false]` `reject` (intent d) decoration/station overlap untested — existing Story 2.2 z-order tests cover station-over-decoration priority
  - `[low]` `reject` (intent e/f) Phaser visuals untested / check not shown — tap-reactions test patched; check run by the orchestrator

## Design Notes

Decisions on intent gaps:
- **What counts as a "target":** any enabled router target. Router targets win by z, so the reaction layer never sees them. Inside the reaction layer, an entry can say `isTarget()` (for example, a drop zone a game wants silent). Unregistered drop zones (cone, shadow, slot) get the ripple, which is harmless and is not a wrong choice.
- **While a 5.1 item is selected,** the catcher owns every play-area tap, so there is no bounce or ripple; the item's flight is the reaction.
- **Fishing is exempt.** Its whole-scene pond target already gives a ripple and "tõm" on water. A wrong fish is a game choice (FR30 / Epic 6).
- **Decoration types:** food → happy chime (today's sound), vehicle → kart beep, creature (fish, dino, alpaca) → a new `sfx.shell.chirp`, thing → prop tick. Only one new audio file is needed. Decorations shake (angle) instead of bounce, so they read differently from stations.
- **The ripple is throttled; the bounce is not.** A bounce restarts on each tap (scale-motion already restarts). The 1 Hz limit applies to light flashes, which is why only the ripple is limited.
- **Map:** stations, the kart and the guide already react. 5.4 adds only the ripple and the typed decoration reaction.

Shape of the pure model:
```ts
export function classifyTap(p: Point, entries: readonly ReactEntry[]): TapClass {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if ((e.enabled?.() ?? true) && e.contains(p)) return e.isTarget?.() ? { kind: 'target' } : { kind: 'sprite', id: e.id };
  }
  return { kind: 'background' };
}
```

## Verification

**Commands:**
- `cd app && npm run audio:placeholders` -- expected: `public/assets/audio/sfx/sfx.shell.chirp.m4a` exists.
- `cd app && npm run audio:check` -- expected: the chirp passes the creature rules.
- `cd app && npm run check` -- expected: typecheck, lint (no magic numbers in scenes and games), vitest (including `tap-react.test.ts`), tokens, `validate:content`, build and precache all pass.

**Manual checks (if no CLI):**
- `npm run dev`. In ice-cream, tap Shiba: bounce and pụp, with no hint climb. Tap the plate twice quickly: one ripple. On the island, tap a car decoration: shake and beep. Tap a station next to it: the station opens.

## Auto Run Result

Status: done

- **Summary:** a pure tap classifier/reactor (core/tap-react.ts) with one catch-all router target at z −3 below every real target, the 5.1 catcher and Map decorations; a Phaser helper (core/ui/tap-reactions.ts): a non-target sprite bounces + sfx.shell.pop, an empty-background tap draws a silent fading ring (≤ 1 Hz); MiniGameBase.attachReactions/react (blocked while inert, on a skip tap and while fast-forwarding); hookups in ice-cream, pizza, dino-puzzle, shadow-match, race, touch-talk (fishing exempt by design); Map: background ripple + decorations shake and play a sound by type (new sound field, new sfx.shell.chirp).
- **Files:** core/tap-react.ts (+test), core/ui/tap-reactions.ts (+test), core/ui/scale-motion.ts (shake/stopShake), core/ui/map-prop.ts (+test), core/tokens.ts, core/timing.ts, content/decorations.ts (+test), content/audio-catalog.ts, tools/audio/make-placeholders.ts (+test), tools/audio/check-sfx.test.ts, games/mini-game-base.ts (+registry tests), six game scenes, scenes/Map.ts.
- **Review:** 27 findings — 12 patch entries applied (4 medium: gating tests, tap-reactions tests, vacuous wrong spy → wired spy; 8 low), 1 deferred (Map wiring test), rest rejected with reasons.
- **Follow-up review recommended:** true — four medium entries patched; the reduced field moved into MiniGameBase across all 7 games (wide mechanical change, only typechecked per game).
- **Verification:** npm run check exit 0 (1680 tests); audio:check passes (chirp meets creature rules). No browser pass this run.
- **Residual risks:** token values untuned on device; Map wiring untested.
