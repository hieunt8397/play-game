---
title: 'Story 7.1: Trạm Nhà Xoài trên đảo và màn sân nhà'
type: 'feature'
created: '2026-10-22'
status: 'in-progress'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: ['../planning-artifacts/epics.md#Story 7.1', 'spec-choi-lien-mach.md', 'spec-5-8-khung-choi-tu-do-phan-ung.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 7 and Epic 8 add five new games. The island already holds 7 stations and has no room for 5 more.

**Approach:** Add one new island station, `home` ("Nhà Xoài"). Tapping it opens a new shell scene, the yard (sân nhà), with 5 big play corners:
- chuồng thú: animal pens (7.2);
- sân khấu: stage (7.3);
- giường ngủ: bed (7.4);
- phòng khám: pet clinic (8.1);
- tủ đồ: wardrobe (8.2).

A corner whose game is not built yet is asleep: a tap bounces it and plays a happy sound, exactly like a sleeping island station. A game opened from the yard returns to the yard, not to the island. Home in the yard returns to the island.

Decisions (parent, 2026-10-22):
- 5 corners; the 2 Epic 8 corners sleep until Epic 8.
- Animals are real models (Quaternius, as in Tìm bóng), not chibi. Buildings and furniture use Tiny Treats / KayKit.
- All 4 Epic 7 specs are approved together and built in order 7.1 → 7.4.

## Boundaries & Constraints

**Always:**
- Map stays the owner of navigation (AD-1). The yard asks Map to open a corner's game, and Map starts it and routes its last event back. This covers:
  - continuous play (`round:next`, which restarts the game in place);
  - `round:leave` and `round:abandon`, which return to the yard with the usual fade;
  - resume snapshots, which work as for island games.
- Home in a yard game returns to the yard. Home in the yard returns to the island (kart parked at the home stop). The Home voice line fits where it goes: a new "Về nhà nào!" line for yard games; the existing "Về đảo nào!" in the yard.
- The station is built like the 7 others: built in `build_map.py` from the map-v3 source, with:
  - a polygon hit and a kart stop (`home-stop`);
  - the parent label "Nhà Xoài" and `vo.shell.station-name.home`;
  - an invite line;
  - decoration slots only as far as the current layout validator still requires them.

  Every map layout, contrast and hint rule passes without loosening.
- The yard is one 2048×1536 plate rendered by a new `build_home.py` (house front, fence, lawn) with 5 corner props. Each prop is a sprite with an idle frame and a bounce, recognisable from far away:
  - a pen with an animal peeking out;
  - a little stage with a drum;
  - a bed;
  - a vet's cross box;
  - a wardrobe.

  Each corner also has a hit polygon, all inside the interactive rect and clear of HUD zones. The art follows the cute-toy style (`cute.py`, Tiny Treats Homely House, KayKit Furniture).
- Any new voice line uses the ElevenLabs recipe (`npm run tts`). This includes corner names for the parent and a yard invite such as "Xoài ơi, chơi gì ở nhà nào?".
- vitest covers the navigation: island → yard → game → back to the yard; yard → island; a sleeping corner; abandon and resume of a yard game; continuous play inside a yard game.

**Never:**
- Change the 7 existing stations' behaviour.
- Add a reward or decoration mechanic (removed 2026-10-21).
- Let a yard game's Home land on the island.
- Use chibi animals.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap home station | island | kart drives there, name line, yard fades in | — |
| Tap awake corner | yard | corner bounces, its game starts (assets loaded like a station trip) | asset load fails → stay in yard (existing load-error path) |
| Tap sleeping corner | clinic / wardrobe | bounce + happy sound, nothing opens | — |
| Home in yard | yard | back to the island, kart at `home-stop` | — |
| Home in yard game, mid-round | game playing | `round:abandon`, snapshot kept, back to the yard | — |
| Round complete | yard game | continuous play: next round in place (`round:next`) | — |
| Reopen | after abandon | resumes the snapshot | — |
| 7.1 alone | no Epic 7 game built yet | all 5 corners sleep | — |

</frozen-after-approval>

## Code Map

All under `app/`.
- `src/content/types.ts` (`GAME_IDS`), `src/content/stations.ts` (`STATIONS`, `SLOT_COUNT`): add `home`. Decide whether `home` is a GameId or a separate shell id; keep `GameId === scene key` for real games.
- New `src/content/home.ts`: the corner list (`id`, gameId, parent label, `awake` derived from the registry, hit and anchor ids) and the yard's screen requirements.
- New `src/scenes/HomeYard.ts` (shell scene, like Map's station taps: `core/kart-trip` bounce, sleeping-station reaction). `src/scenes/Map.ts`: route the home station to the yard, route yard corner opens through the existing game start (`takeStartData`, asset loading), and track the origin so leave/abandon return to the yard. `core/post-round-chain.ts` (`routeRoundLeave`, `routeRoundNext`) and the bus event types get the new event, e.g. `yard:open`.
- `src/scenes/Hud.ts`: the Home line depends on the destination.
- `tools/render/blender/build_map.py` (+ `art/src/map-v3.blend` station spot), new `tools/render/blender/build_home.py`, `src/content/assets.ts` (`ATLASES`, `BACKGROUNDS`, `SCREEN_IDS`), `tools/layout/rules.ts` (new `validateHome` like `validateTouchTalk`).
- `src/content/voice-lines.ts` + `npm run tts`; `src/content/audio-catalog.ts`.
- Tests: Map routing tests (`scenes/*.test.ts`, `core/post-round-chain.test.ts`), new `content/home.test.ts`, layout rules tests.
- Docs: amend ARCHITECTURE-SPINE (yard shell) and EXPERIENCE.md with a dated note.

## Tasks & Acceptance

**Execution:**
- [x] Content: `home` station, corner list, voice lines (+ tts).
- [x] Navigation: HomeYard scene, Map routing with the yard as origin, Hud Home line (+ tests).
- [x] Art: map station via build_map; `build_home.py` plate + corner sprites; render + atlas; look at the island and the yard and iterate.
- [x] Rules: validateHome + map rules pass; `npm run check` 0.

**Acceptance Criteria:**
- Given the island, when the home station is tapped, then the kart drives there and the yard shows 5 corners.
- Given an awake corner, when it is tapped, then its game opens. When that game is left or abandoned, the yard shows again.
- Given a sleeping corner, when it is tapped, then it bounces with a happy sound and nothing opens.
- Given `npm run check`, then it exits 0.

## Implementation Notes

2026-10-22 (dev). Baseline copied to `_backup/2026-10-22-truoc-7-1/` (app/src, app/tools, README, the map atlas and plate, art/map.blend, the planning docs, this spec).

**Ids.** `home` is a shell station, not a GameId: `content/stations` adds `HOME_STATION`, `StationId = GameId | 'home'`, `STATION_IDS` and `GAME_STATIONS` (the 7 game stations, used by the decoration and icon checks). Scene key === GameId stays true for every game; `SessionStore.lastStation` is a `StationId`. `content/home.ts` holds the 5 corners (`pen` → `animal-pens`, `stage` → `band`, `bed` → `bedtime`, `clinic` → `pet-clinic`, `wardrobe` → `dress-up`; the two Epic 8 ids are placeholders until those specs), the yard's screen requirements, its assets and its line ids. `awake` is derived, never stored: `yardCorners(isGameId)`. Stories 7.2–7.4 wake their corner just by registering their game in `games/registry`; `home.ts` needs no edit.

**Navigation (Map stays the owner, AD-1).**
- Island → yard: the kart trip treats `home` like a station (`home-stop`, the name line, `load` = `HOME_ASSETS`: the yard atlas and plate). On `enter`, Map zooms in, starts the shell scene `HomeYard` (registered in `main.ts` right after Map, below the games) and sleeps. The yard fades in and says "Xoài ơi, chơi gì ở nhà nào?".
- Yard → game: `core/home-yard › YardController` (pure, modelled on `kart-trip`). An awake tap gives bounce + corner name + `load`. After `Timing.stationTapMs`, once the assets are settled, it emits `enter`: the yard zooms on the corner and emits `yard:open { gameId }`. Map routes it with `post-round-chain › routeYardOpen` (it opens only when the yard is open, no game or chain is running, and the id is registered). Map then:
  - takes `takeStartData` (resume snapshots work as on the island);
  - arms the asset release;
  - runs the game with `RunningGame.origin = 'yard'`;
  - sets the Hud Home target to `yard`;
  - sleeps the yard.

  The yard loads the game's assets itself because a sleeping scene's LoaderPlugin refills its queue only on that scene's `update`. Map (asleep under the yard) could stall on a large game. `scenes/game-loader.ts` holds the shared load/track/error path. Map still releases the assets when the game shuts down (the caches are global).
- Game → yard:
  - `routeRoundLeave` returns `fade` for a yard game. The round was already settled on `round:complete`, and there is no island pull-back chain.
  - `round:abandon` keeps the snapshot first, as before.
  - `returnFrom` wakes the yard instead of Map (`returnTarget`), and `PostRoundChain.forget` drops the settled mark.
  - `round:next` restarts the game in place, unchanged.

  The yard wakes with its camera reset, a fade-in, the corner's name as the Speaker prompt and its resume marks synced.
- Yard → island: Hud Home in the new `'yard'` mode says "Về đảo nào!" and the yard emits `yard:leave`. Map stops the yard (its assets are released on its shutdown) and wakes; `lastStation = 'home'` parks the kart at `home-stop`.
- Home line: `core/hud › homeLine(mode, target)` says "Về nhà nào!" (`vo.shell.home.yard`) only in a game whose Home target is the yard. Island games and the yard itself say "Về đảo nào!".
- If Map does not take a `yard:open` (an unregistered id), the yard comes back after `sceneFadeMs` instead of staying zoomed.

**Art.**
- Island: `build_map.py › build_home_station` builds `sprite.home`, the Homely House `house` with its `mailbox` fitted to a projected width. It stands on the grass south of the road between the pizza and race stations, the only clear ground left. To make room:
  - the reference pine there is removed;
  - the swim ring moves left on the beach (`RING.at`);
  - the pizza station keeps 1 decoration slot. Its second slot stood there; slots are unused at runtime and the validator needs ≥ 1 per game station.

  The home station has no slot (`NO_SLOTS`). Its hull, anchor and kart stop come from the same station loop, so these all still apply unchanged:
  - stationGap separation;
  - the dressing checks;
  - the decoration footprint checks, which now also test against `hit.home` (`decorationLimits(…, [HOME_STATION])`).
- Yard: the new `build_home.py` builds one plate (the picnic-lawn palette; the house front with a fence and hazed trees) and 5 corner sprites, each fitted into a design-px box:
  - the pen, with a real Quaternius cow in its Idle pose and source colours;
  - the stage with a drum;
  - the KayKit bed;
  - the vet box with a red cross;
  - the wardrobe with a shirt.

  The props use the new `Tokens.art.home` colours (passed through by `build.ts`). The tall wardrobe takes the back-right spot and the bed the front-right one: a bed in the back row would have been too short to reach 150 px.
- Rules:
  - The new `validateHome` (run by `render`, `atlas` and `validate:content`) requires that each hull is ≥ targetMin, inside the interactive rect, off the Home/Speaker zones, and ≥ targetGap from the others, and that each frame is ≥ 150 px (`HOME_CORNER_MIN_PX`).
  - `validateLayout` takes `shellStations: ['home']`: the station must exist and follows every station rule.

**Voice.** New lines, rendered with `npm run tts` and not yet approved:
- `vo.shell.station-name.home` "Nhà Xoài";
- `vo.shell.invite.home`;
- `vo.shell.invite.yard`;
- `vo.shell.home.yard` "Về nhà nào!";
- `vo.shell.corner-name.{pen,stage,bed,clinic,wardrobe}`.

The name rule ("Xoài" only in greeting, invite and prompt intents) gets one exception for an exact id: `NAME_PLACE_LINES = ['vo.shell.station-name.home']`. The spec requires that line, where "Xoài" is part of the place's name, not praise. Shell lines load at boot (the `vo.shell.` prefix), so the yard needs no audio load.

**Tests.**
- `core/home-yard.test.ts`: the plan and the controller (sleeping corner, 7.1 alone, awake open, assets first or last, re-target, entering, Home).
- `core/yard-flow.test.ts`:
  - island → yard → game → yard;
  - yard → island;
  - sleeping corner;
  - abandon + resume;
  - continuous play;
  - island games still chain.
- `content/home.test.ts`.
- Hud Home-line tests.
- Shell-station tests for `validateLayout`.
- Existing station-count tests updated (8 stations, 9 slots). The two-slot decoration rule tests keep a two-slot pizza fixture.

**Deferred.**
- No idle invitations in the yard yet (nothing is awake). 7.2 can add them on the island's `map-idle` pattern.
- The Epic 8 game ids are placeholders.
- Not tried in a browser or on the iPad in this session.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `cd app && npm run check` -- expected: exit 0.

**Manual checks:**
- Rendered island with the new station; rendered yard plate with the 5 corners.
