- source_spec: `spec-1-1-khoi-tao-app-tu-starter-phaser.md`
  summary: Add DOM-level tests for installRotationSafeScaleManager (patched getParentBounds/updateCenter) and assert the patched method names still exist on Phaser's ScaleManager prototype.
  evidence: The patch replaces Phaser 4.2.1 internals and has no test; Vitest runs in a node environment without layout sizes. It fits Story 1.6, which touches the same rotation path (core/input/space.ts).
- source_spec: `spec-1-1-khoi-tao-app-tu-starter-phaser.md`
  summary: Guard core/timing.ts against drift from EXPERIENCE.md (source references per value or a generated/checked table like tokens).
  evidence: About 40 durations were copied by hand; the only test checks they are positive, so an EXPERIENCE.md change would not fail npm run check.
- source_spec: `spec-1-1-khoi-tao-app-tu-starter-phaser.md`
  summary: Confirm the widest target viewport ratio; if iPad mini (1133×744 ≈ 1.52) or a Safari tab with toolbars must be supported, widen Tokens.supportedAspect.max and recompute safeRect.
  evidence: Unverified medium. safeRect assumes ratios ≤ 1.46 and would crop interactive items on wider viewports. Settle by checking the child's iPad model (sprint action item for iPadOS check).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-chay-offline-va-thu-tren-ipad.md`
  summary: main.ts wiring (registerServiceWorker with the real container and DEV flag, `navigator` passed to audio.attach) has no automated check.
  evidence: no test imports main.ts; dropping either call keeps `npm run check` green. Close with device checklist items 3/6 or a future browser smoke test.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-chay-offline-va-thu-tren-ipad.md`
  summary: Boot's Phaser adapter (`isCached` / `loadAll` item-kind dispatch) is not exercised by any test.
  evidence: boot-load tests use a string-key fake adapter; a cheap fix is moving the kind dispatch into a pure helper in core/boot-load.ts and unit-testing it.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-danh-muc-trang-tri-o-tren-dao-reward-service.md`
  summary: nothing checks that render_screen.py leaves the detached decoration group out of the map plate (bg.png).
  evidence: no test runs Blender; dropping the hide loop bakes every decoration into bg.png while all frame checks still pass. Settle with a Blender-in-the-loop check or a human look at each regenerated bg.png.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-danh-muc-trang-tri-o-tren-dao-reward-service.md`
  summary: reward-service grants on both `round:complete` and `reward:earned`, so a game emitting both would earn two decorations per round (unverified, medium if true).
  evidence: no game emits `reward:earned` yet; Stories 4.5/4.6 (touch-talk) must emit only `reward:earned` and not `round:complete`, or the service must dedupe per round.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-danh-muc-trang-tri-o-tren-dao-reward-service.md`
  summary: MapScene.syncDecorations glue (calls in create/onWake, router readiness, z = −1, happy sound) has no test; a decoration earned in a round might not appear on return with all tests green.
  evidence: the repo has no Phaser scene harness; the pure helpers (planDecorations, diffDecorations, spriteSourceRect) are tested. Close by moving the sync loop into core with injected create/destroy callbacks.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-danh-muc-trang-tri-o-tren-dao-reward-service.md`
  summary: main.ts reward-service install is guarded only by a source-text scan; wrapping it in a non-running branch would still pass.
  evidence: reward-service.test.ts compares indexOf positions in main.ts; a real boot test needs a harness the repo lacks.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-chuoi-sau-luot-tren-ban-do.md`
  summary: a post-round chain started from Map `create` (pending fly-ins, no round played) uses kind `abandon`, so Story 2.4's play-again overlay cannot tell it from a real abandon.
  evidence: Map.ts create path starts `{ kind: 'abandon', gameId: first.slot.stationId }`; Story 2.4 should add a distinct kind or skip the overlay for that start.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-chuoi-sau-luot-tren-ban-do.md`
  summary: with 2–3 pending fly-ins the chain lasts 2500–2800 ms, which breaks the 4 s round-end-to-overlay budget.
  evidence: 1200 pull-back + 300 stagger per extra item + 1000 fly-in; several pending items arise once Epic 4 (touch-talk) grants away from Map. Cap the stagger or the count then.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-lop-phu-hoi-choi-tiep.md`
  summary: PlayAgainOverlay's forwarding of `speech:ended`, the hint tick and tap activity to PlayAgainController is untested.
  evidence: thin Phaser wiring with no scene harness; dropping the tick event would stop re-ask and auto-close with all tests green.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-lop-phu-hoi-choi-tiep.md`
  summary: play-again button placement does not treat the Hud Speaker/Home circles as obstacles (unverified; medium if a candidate reaches the top-right corner).
  evidence: settle by adding Hud rects to the real-layout placement test for all 7 stations at 1180×820 and in portrait.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-giu-luot-do-trong-phien.md`
  summary: Map's `syncResumeMarks` (called on create, wake and start) has no test; dropping the wake call would hide the mark after Home with all tests green.
  evidence: no Phaser scene harness; only the pure `resumeMarkPlan` is tested.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-danh-thuc-tiem-pizza-be-dem-topping.md`
  summary: tools/atlas/pack.ts near-identical frame aliasing in `packScreen` is not exercised by any test.
  evidence: needs real PNG fixtures (sharp + free-tex-packer); a cheaper step is extracting the twin predicate into a pure function and unit-testing it.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-lam-pizza-thang-do-kho-toi-5-lat.md`
  summary: Pizza scene handlers (addBowls per level, restoreSlices into base.placed, beginOvenQuestion, bowl dim refs) have no test; roundQuestions' exhausted-attempts fallback branch never runs in a test.
  evidence: no Phaser scene harness (same as IceCream); the fallback is unreachable with ROUND_ATTEMPTS = 32 unless the count becomes injectable.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-danh-thuc-cong-vien-khung-long-ghep-3-manh.md`
  summary: DinoPuzzle scene wiring (come-alive chain, speech token mapping, slot highlight, dino hand-over, bounce) has no test; `scaryAssetProblems` wiring into validate-content `run()` is not asserted; pack.ts multi-page stale-page cleanup is unverified and ignores a leftover single-page png/json.
  evidence: no Phaser scene harness; `run` has no appDir seam; the cleanup only runs when the page count shrinks (an extracted `stalePages` helper would make it testable).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-ghep-khung-long-thang-3-4-6-manh-va-luot-do.md`
  summary: DinoPuzzle scene handling of `showDino` (slot targets for the whole cut), `restorePieces`, loose/lift scales and the enlarged hit radius has no test.
  evidence: no Phaser scene harness for any game; the round command contract is pinned in round.test.ts.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-danh-thuc-cua-hang-tim-bong.md`
  summary: Hang tìm bóng's "dog" item renders the ShibaInu model, the Tiệm kem host character, but is named "Bạn chó" — human decision needed (another dog model, a recolour, or accept).
  evidence: build_shadow_match.py ITEM_MODELS dog → quaternius/animals/ShibaInu.fbx; Shiba is the ice-cream host and play-again icon.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-danh-thuc-cua-hang-tim-bong.md`
  summary: Pizza, Dino and ShadowMatch scenes map speech tokens to tags after `audio.say()` returns (with an `issuing` fallback on `speech:line`); a `speech:ended` arriving synchronously with no `speech:line` first would leave a round waiting (unverified; medium if reachable).
  evidence: settle by testing AudioDirector with a missing/failed voice file: does it emit `speech:line` before `speech:ended`, and is either emitted synchronously inside `say()`?
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-danh-thuc-cua-hang-tim-bong.md`
  summary: ShadowMatch scene wiring (suck-in → reveal via afterSuck, token tagging, clearQuestion, reduced motion) and the `hintContrastProblems` shadow-match wiring have no test.
  evidence: no Phaser scene harness; hintContrastProblems has had no test since Story 1.9 (a real-tree assertion `rings['shadow-match'] === 3` would close it).
- source_spec: `_bmad-output/implementation-artifacts/spec-5-8-khung-choi-tu-do-phan-ung.md`
  summary: A piece dragged (or still pickable) during free play is left where it was dropped, because every scene's applyAll returns on `inert`, so floatBack/returnLater never run.
  evidence: Verified for ice-cream (a drag that crosses the round end; IceCream.applyAll gate plus the dead round-level "free play floats back" path). Unverified medium for the other games (whether pieces stay pickable after the last question). Settle in Epic 6, where each game's free-play rules (using `freePlay`) decide what drags do.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-8-khung-choi-tu-do-phan-ung.md`
  summary: Map's `settle` dispatch and `round:leave` subscription (Map.ts follow/scoped.on) have no test; only the pure routes and PostRoundChain are covered.
  evidence: Removing either line keeps npm run check green (no Map test harness exists). Cheap fix: move the subscription wiring into a pure helper in core/post-round-chain.ts and test it with a real Bus.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-8-khung-choi-tu-do-phan-ung.md`
  summary: IceCream's scene handling of `choseOther` (playChoseOther → moveTo) is untested, and `apply`'s switch is not exhaustive.
  evidence: Deleting `case 'choseOther'` keeps typecheck and tests green. A `never` exhaustiveness check in apply would make typecheck catch it.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-tiem-kem-shiba-hat-xi-lau-mui-thap-kem.md`
  summary: IceCream scene free-play wiring (the applyAll `inert && !freePlay` gate, the onFreePlay → beginFreePlay forward, and the stack/topple apply) has no automated test.
  evidence: Reverting the gate makes the scene drop every free-play command while the round tests stay green. The repo has no Phaser scene harness (registry.test.ts:54); a scene-apply harness would close this and the 5.8 choseOther gap.
- source_spec: none
  summary: Continuous play — a finished round celebrates in place (~2 s) and the next round starts automatically in the same game (level from saved difficulty, new seed); the play-again overlay is removed and the kid returns to the island only via Home.
  evidence: Split from the "chơi liền mạch, bỏ trang trí" request (2026-10-21) by the parent's choice; decorations removal goes first. Parent decided the next round starts right after the celebration (ice-cream free play after a round is dropped). Every game builds its round only in create()/build(), so this needs a restart-in-place path (Map-driven scene restart or a split build()).
- source_spec: `_bmad-output/implementation-artifacts/spec-bo-do-trang-tri.md`
  summary: Art-pipeline cleanup of decorations — drop the `sprite.decoration` group and slot empties from build_map.py, the catalogue/decorationModels in tools/render/build.ts, `content/decorations.ts`, `StationDef.slots`, the decoration layout rules, and re-render the map atlas without the 28 decoration frames.
  evidence: Kept out of the runtime removal so the map is not re-rendered in the same change (Blender run, atlas re-pack, layout diff).
- source_spec: `_bmad-output/implementation-artifacts/spec-choi-lien-mach.md`
  summary: Art-pipeline cleanup of the removed play-again overlay (add to the decorations art cleanup above) — the `icon/<id>/00` frames of `atlas.map`, the detached `sprite.icon` group in build_map.py, `content/game-icons.ts` (`GAME_ICONS`, ex-PLAY_AGAIN_ICONS) and its users in tools/render/build.ts and tools/atlas/pack.ts, the `validatePlayAgainIcons` layout rule (tools/layout/rules.ts, tools/lint/validate-content.ts), `ui.playAgainIconPx`, and the generated tokens `components.buttonReplay`, `buttonBackToMap`, `playAgainOverlay` (AudioUnlockOverlay still reads `playAgainOverlay.backdrop`: rename it in the token source first).
  evidence: Kept out of the runtime removal so the map is not re-rendered in the same change (Blender run, atlas re-pack, layout diff), as in spec-bo-do-trang-tri.
- source_spec: `_bmad-output/implementation-artifacts/spec-choi-lien-mach.md`
  summary: Map's in-place restart wiring (the `round:next` subscription → restartGame → `releases.markRestart` → scene.restart, and listenShutdown's re-arm loop) has no test; dropping markRestart or the re-arm keeps npm run check green.
  evidence: No Map scene harness exists. Cheapest fix: move the SHUTDOWN loop into a pure `watchShutdown(events, releases, id, release)` in core/release-arming.ts and test restart, restart, exit → release once with a fake emitter.
- source_spec: `_bmad-output/implementation-artifacts/spec-choi-lien-mach.md`
  summary: Play-again names outlive the overlay — `Tokens.components.playAgainOverlay` (read by AudioUnlockOverlay for its backdrop), `buttonReplay`/`buttonBackToMap` components, `ui.playAgainIconPx`, `validatePlayAgainIcons` — rename or delete them with the art-pipeline cleanup (DESIGN.md is the tokens source).
  evidence: tokens.generated.ts and the icon pipeline were kept by the spec; only names are stale.
- source_spec: none
  summary: Chạm là nói — add three new cute scenes (Phòng tắm from Tiny Treats Bubbly Bathroom, Tiệm bánh from Baked Goods, Dã ngoại from Pleasant Picnic): plates, props, scene/prop name lines, temporary SFX, bubble column for six scenes.
  evidence: Parent request 2026-10-21 ("thêm chủ đề thú vị hơn"); split as batch 2 of 3 after restyling the three existing scenes.
- source_spec: none
  summary: Chạm là nói — replace every prop's synthesized SFX with a real CC0 sound (Freesound/BigSoundBank), mastered with audio:normalize and checked by audio:check, provenance rows in README.
  evidence: Parent chose real CC0 sounds 2026-10-21; batch 3 of 3.
- source_spec: `_bmad-output/implementation-artifacts/spec-cham-la-noi-3-canh-moi.md`
  summary: Chạm là nói's two-column scene bubbles follow the Speaker, so a right safe-area inset (landscape phone with a notch, ~44–59 px) shifts the left column into the prop area, which the layout rules only check at zero inset.
  evidence: keep-out starts at x 780 and the props end at x 746 (34 px). iPad (the target) has no side inset. Fix: validate the keep-out at the largest supported right inset (or anchor the bubbles to the design rect, not the inset Speaker) and re-render if boxes must move.
- source_spec: none
  summary: Đường đua — stars (or coins) placed along each road; the kart collects them as it passes with a "ting" and a little sparkle; no penalty for missing one.
  evidence: Parent chose it 2026-10-22 together with harder road shapes; split into its own spec after spec-duong-dua-them-duong-kho.
- source_spec: `_bmad-output/implementation-artifacts/spec-tim-bong-bo-khung-long-lam-dep.md`
  summary: ShadowMatch scene's new item joy (itemHappy hop/bounce/sparkle, stopHop reset, celebrate bounce) has no scene-level test.
  evidence: The repo has no Phaser scene harness; only the pure round command and sparklePoints maths are tested.
- source_spec: `_bmad-output/implementation-artifacts/spec-tim-bong-hinh-that-them-vat.md`
  summary: Hang tìm bóng — bull (bò tót), taxi and ambulance (xe cứu thương) were dropped under the spec's Fallback because their measured shadows overlap a group mate's above ui.shadowMaxIoU (0.85). Bring them back only with a parent-approved change (another model, pose or a different shape group).
  evidence: shadow-distinct IoU on the 2026-10-22 render: cow/bull 0.895, car/taxi 0.939 (same Kenney sedan body), firetruck/ambulance 0.860. Their ask/name lines were not added.
- source_spec: `_bmad-output/implementation-artifacts/spec-tim-bong-hinh-that-them-vat.md`
  summary: Hang tìm bóng — parent 2026-10-22: shark (cá mập) dropped, the cutefish model reads as a generic grey fish; the fish group now has 3 items (goldfish, puffer, swordfish) and is no longer used at the 4-shadow level. A fourth, clearly recognisable fish would bring it back to that level.
  evidence: Parent review of the composites; excavator and banana kept.
