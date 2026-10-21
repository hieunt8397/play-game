---
title: Adversarial review — Architecture Spine, Bé Học Chơi
target: ../ARCHITECTURE-SPINE.md
reviewed: 2026-10-08
method: Pairs of units one level down that each obey every AD to the letter yet build incompatibly
context: EXPERIENCE.md (final), DESIGN.md (final)
---

# Adversarial review — Architecture Spine

## Verdict

**Not ready to hand to independent AI builders.** The paradigm and the module boundaries are sound: one MiniGame contract, a single store owner, central audio, input and hints. But the spine names the seams and leaves their shapes open. Six seams are only named, never typed: the `outcome` payload, the `snapshot` payload, `DecorationSlotState`, the HintDirector call protocol, the end-of-round timing, and the asset key scheme. Those are exactly the places where two agents each make a reasonable choice and still produce code that doesn't fit together. There is also one direct contradiction with DESIGN.md over Scale.FIT vs cover. The fixes below are mostly a few lines of typed interface plus one ordering rule each, so this is a moderate amendment, not a redesign.

Severity scale: **Critical** = two compliant units will not work together, or a child-visible bug is near certain. **High** = likely to bite and costly to untangle. **Medium** = drift and rework, but caught early.

| # | Severity | Hole | Collision pair |
|---|---|---|---|
| H1 | Critical | End-of-round ordering, `outcome` shape and the difficulty rule are undefined | `games/ice-cream` vs `games/race`; any game vs `Map` |
| H2 | Critical | HintDirector protocol: speech attribution, retry voice, multi-step questions, level-4 powers, pause | `HintDirector` vs `AudioDirector`; `HintDirector` vs `games/pizza`; `HintDirector` vs `InputGuard` |
| H3 | High | Decoration grant ownership, slot shape, and the `touch-talk` reward while Map is not running | `Map` vs `ProgressStore`; `touch-talk` vs `Map` |
| H4 | High | Coordinate space: AD-7 says Scale.FIT, DESIGN says cover/crop; dead-zones in design px vs screen pt | `Map` (built to DESIGN) vs games (built to AD-7); `InputGuard` vs `Tokens` |
| H5 | High | Resume snapshot: shape, who writes SessionStore, and when it is cleared | game vs `Map` vs `SessionStore` |
| H6 | High | Bus lifecycle: listener leaks on replay/restart, double emits, and Home during celebration | `Map` vs `PlayAgainOverlay` vs game |
| H7 | High | Overlay input layering: "tap any station" through `PlayAgainOverlay`; `AudioUnlockOverlay` pausing | `PlayAgainOverlay` vs `Map`; `AudioUnlockOverlay` vs `HintDirector` |
| H8 | Medium | Asset/atlas/SFX key naming and who preloads what | `games/fishing` vs `games/touch-talk`; `Boot` vs games |
| H9 | Medium | Voice-line id grammar, runtime concatenation, and the TS→Python TTS bridge | `tools/tts` vs `content/voice-lines.ts`; `games/ice-cream` vs `games/pizza` |
| H10 | Medium | `stationId` vs `GameId`; difficulty integer semantics; `touch-talk` has no difficulty | `content/stations` vs `content/decorations` vs `ProgressStore` |
| H11 | Medium | Pointer policy: one gameplay pointer per object or per scene | `games/dino-puzzle` vs `games/shadow-match` |
| H12 | Medium | Behaviour timings (6 s, 10 s, 30 s, 1.5 s…) have no home; the AD-8 lint only catches px | `HintDirector` vs `Map` vs `PlayAgainOverlay` |
| H13 | Medium | Art pipeline: polygons measured by hand at 2× vs 1×; nothing is generated from Blender | `tools/render` vs `content/*` hit polygons |

---

## H1 — End-of-round ordering, `outcome` shape, difficulty rule (Critical)

**The collision.**
- `games/ice-cream` emits `round:complete { gameId, outcome: 'success' }` the instant the last scoop snaps. `Map` immediately does `scene.stop('ice-cream')` and starts the camera pull-back, so Shiba's ~1.5 s lick celebration (EXPERIENCE "Xong lượt") is cut off.
- `games/race` plays its 1.5 s celebration first and then emits `outcome: { stars: 3 }`.
- `Map` has to "ask ProgressStore to change difficulty" (AD-1), but nothing says what `outcome` contains or what rule turns it into a level. One Map agent writes `if (outcome === 'success') level++`, which reads `stars` as truthy and promotes forever. Another writes a per-game switch, so `Map` now holds game logic.
- `button-replay` has to start the next round "with continued difficulty". If `Map` calls `setDifficulty` after the overlay appears, or asynchronously, replay starts at the old level.
- Who knows the ladder length? `content/games/race.ts` has 4 rungs and `ice-cream` has 3. `Map` clamps to a generic max, or doesn't clamp at all.

**Proposed AD-1 amendment (replace the outcome clause):**
> `round:complete` payload is `{ gameId, questions: number, firstTryCorrect: number, maxHintLevel: 0|1|2|3|4 }`. A game emits it **exactly once, after its own character celebration has finished** (the game owns the ~1.5 s celebration; Map owns everything after it). After emitting, the game is inert: no input, no hints, and Home is disabled.
> Difficulty policy is data: each `content/games/<id>.ts` exports `ladder: Level[]` and the shared pure function `core/difficulty.ts › nextLevel(current, outcome, ladder.length)` decides −1/0/+1 and clamps. Only `Map` calls it, and it calls `ProgressStore.setDifficulty` **synchronously on receipt of `round:complete`, before the camera pull-back starts**. Replay reads the level from `ProgressStore`, never from the previous round.
> Map's post-round sequence is one awaited chain: pull-back (≤1.5 s) → decoration fly-in (~1 s) → overlay. Taps on stations during the chain are queued (the last one wins) and applied when the chain ends. Speaker stays live throughout.

## H2 — HintDirector protocol (Critical)

**The collision.** AD-5 says only `hint.attempt(correct|wrong)` and `hint.targets(objects, actionPath)`, and AD-3 says hint timers start from `speechEnded`. Each of these pairs complies with that wording:
- **`HintDirector` vs `AudioDirector`.** `speechEnded` fires for *every* line: the prompt, but also the counting line "Một!", the item name "Cá vàng nhỏ!", and Speaker replays. HintDirector restarts its ~6 s timer on each one. Speaker replay then resets hint timing, which EXPERIENCE forbids ("không reset gợi ý"). Or the timer never starts because the game played the prompt before calling `hint.targets`.
- **Retry voice played twice.** Level 1 is "item floats back + short re-prompt". The game plays "Mình tìm kem sô-cô-la màu nâu nhé!" on the wrong drop because it owns that line, and HintDirector *also* plays a re-prompt at level 1. The result is two voices, or one cut off by the single voice channel.
- **Multi-step questions.** In pizza, each correct slice is "correct" but the question is not finished. Calling `hint.attempt('correct')` after slice 1 could end the question and reset levels. Then the oven step needs its own target ("~6 s not tapping oven → ring + hand"), which AD-5 cannot express. The same goes for multi-scoop ice cream and the 3–6 piece dino puzzle.
- **Level 4 needs powers HintDirector does not have.** "Wrong items 60% dimmed and not liftable, snap radius doubled" means changing state on objects owned by `DragController`. HintDirector either reaches into game objects directly (bypassing InputGuard) or cannot implement level 4. `hint.targets(objects, …)` also doesn't tell it which objects are the distractors.
- **Background motion.** "When hint-ring shows, all background motion stops" (fish swimming, idle station bobbing). HintDirector can't stop game tweens. Games don't know the level, because nothing announces it.
- **Pause.** The app gets hidden and `AudioUnlockOverlay` shows. HintDirector `setTimeout`s keep running, so the child returns to a level-3 hand.
- **Map invites.** Map's idle invitation (ring after 8 s, then ≥20 s, max 3) is not a game. One agent builds it on HintDirector, another writes a second ring renderer in `Map`.

**Proposed AD-5 replacement rule:**
> The game drives one question at a time:
> `hint.beginQuestion({ promptLineId, retryLineId, step: { correct: GameObject[], distractors: GameObject[], target: GameObject | null, action: 'drag'|'tap'|'trace', path? } })`.
> HintDirector **plays the prompt itself** via `audio.say(promptLineId)` and starts its clock from the `speechEnded` of *that utterance token only* (`audio.say` returns a token; `speechEnded` carries it). Other lines never touch the clock.
> The game reports `hint.wrong()`, `hint.stepDone(nextStep)` (same question, new targets; levels are kept, the clock restarts), or `hint.questionDone()`. **All hint voice (level-1 retry, level-3 repeats) is played only by HintDirector**, and games never play a retry line.
> Speaker routes to `hint.replayPrompt()`: it replays the prompt, pauses the clock while speaking, and keeps the level.
> Level 4 is applied through InputGuard: `input.setPickable(obj, false)`, `input.setSnapScale(target, 2)`. Dimming is applied by HintDirector on `distractors`.
> HintDirector emits `hint:level { gameId, level }` on Bus. Games stop their own ambient motion at level ≥ 2.
> HintDirector runs on a pausable clock driven by the active scene's `time` (no `setTimeout`) and pauses on `visibilitychange`/`AudioUnlockOverlay`.
> Ring and hand rendering is `core/hint-visuals` and is reused by `Map`'s invite schedule (the schedule itself is Map-local).

## H3 — Decoration grant ownership, slot shape, touch-talk reward (High)

**The collision.**
- **`Map` vs `ProgressStore`.** The store exposes `placeDecoration` and `replaceOldestInStation`, so the *caller* must decide whether the station is full, which slot is free, and which decoration comes next. `Map` therefore re-implements slot selection. A second agent puts the same logic in the store behind `placeDecoration(stationId)`, and the two signatures don't match.
- **`DecorationSlotState` is unspecified.** One agent stores `{ stationId, index, decorationId }`, another `{ slotId, decorationId, placedAt: Date.now() }`. "Oldest" then needs a timestamp that the first shape lacks. EXPERIENCE also says "island full → old item flies off", but it never says whether "full" means the whole island or the station.
- **`touch-talk` vs `Map`.** `touch-talk` emits `reward:earned` while `Map` is stopped or asleep. If Map was `scene.stop`ped, there is no listener and the reward is lost. If Map was `sleep`ing, its listener calls `placeDecoration` and starts the fly-in tween on an invisible scene. Meanwhile `touch-talk` must show *the chosen* decoration sparkling beside the prop in its own scene, but it can't know which one without picking itself. That gives two owners of the choice.
- **The "Lượt dở" ring and the "sparkling at the town station" state.** Both need session-level "pending fly-in" state, and the spine doesn't say where it lives.

**Proposed AD-2 amendment:**
> `DecorationSlotState = { slotId: string, stationId: GameId, decorationId: string, seq: number }` (`seq` is a monotonically increasing counter stored in the document; no wall clock). Slots are declared in `content/decorations.ts` per station. "Full" is **per station**.
> The single store action `grantDecoration(stationId) → { slot, decorationId, replaced?: DecorationSlotState }` does all choosing (first free slot, else lowest `seq` in the station; decoration = next in that station's catalogue). `placeDecoration` and `replaceOldestInStation` become private.
> Reward events are handled by a `core/reward-service` subscribed at boot (not by a scene), so the handler exists whatever scene is active. It calls `grantDecoration` and records the result in `SessionStore.pendingFlyIns`. For `reward:earned` it replies on Bus with `reward:granted { gameId, decorationId }` so `touch-talk` can show that exact item in its scene. When Map becomes active it drains `pendingFlyIns` and animates them; Map never chooses a decoration.
> AD-1's "only Map grants decorations" is replaced with "only reward-service grants; only Map animates on the island".

## H4 — Coordinate space: FIT vs cover, dead-zones (High)

**The collision.** AD-7 says `Scale.FIT` + letterbox. DESIGN.md › Layout says the background covers the screen (`object-fit: cover`), the iPad's ~1.43 ratio crops ~5–7% top/bottom, and hit areas are mapped through the cover crop. The spine says UX wins on behaviour, and layout falls in a grey zone.
- The `Map` agent follows DESIGN and uses `Scale.ENVELOP`. Game agents follow AD-7 and use FIT. The same `content/` polygon now lands differently per screen, and a station or dino slot near the top is cropped off on the Map.
- **`InputGuard` vs `Tokens`.** Dead-zones are defined in "pt from the physical screen edge" (they are there to stop Control Center and Home swipes). Under FIT on an iPad Pro (canvas scaled ~1.3× with side letterboxes), a 24-unit strip in design space is neither 24 pt nor at the screen edge. One agent computes dead-zones in design space, another in `pointer.event.clientX`. A child's drag that starts 10 pt from the bezel is accepted in one game and rejected in another.
- The portrait CSS 90° rotation (deferred) also changes the client→design mapping, and anyone using `event.clientX` gets it wrong.

**Proposed AD-7 amendment:**
> Choose one mode globally: `Scale.ENVELOP` (cover) **or** `Scale.FIT`, with the background art bleeding past 1024×768. The spine must name it, and DESIGN.md's "safe 4:3 area" must be defined as design-space rect `Tokens.safeRect`. Recommended: FIT with each background rendered to 1366×1024-equivalent bleed, which keeps every interactive item inside 1024×768 and avoids crop math.
> Dead-zones are evaluated **in screen CSS px** using the raw pointer position relative to the viewport, plus `env(safe-area-inset-*)`, inside `InputGuard` only. Content coordinates are always design-space px and are converted only through `core/input/space.ts › toDesign(pointer)`, which also handles the portrait rotation. No game reads `event.clientX/Y`.

## H5 — Resume snapshot (High)

**The collision.** `round:abandon { gameId, snapshot }` and `start({ difficulty, resume? })` are typed only by name.
- `games/fishing` puts live `Phaser.GameObject` references in the snapshot. They are destroyed with the scene, so resume crashes.
- `games/ice-cream` saves `{ questionIndex }`. On resume it re-randomises the question, and the child hears a different flavour than the one they abandoned. EXPERIENCE requires "continue exactly the unfinished question".
- Who writes `SessionStore`: the game before emitting, or `Map` on receipt? Both agents do it, so it's written twice. Or neither does.
- When is it cleared? After a resumed round completes, the stale snapshot remains and the station keeps its "Lượt dở" ring. If difficulty changed between abandon and resume (via a replay of another round?), the snapshot level and the store level disagree.
- Partial placements: should 2 of 3 scoops already on the cone be restored or reset?
- `touch-talk` has no round, but Home still emits `round:abandon`. Is its distinct-touch counter (toward ~8) in the snapshot or lost?

**Proposed AD-1/AD-2 amendment:**
> Each game exports `type Snapshot` = JSON-serialisable data only (lint: no class instances), always including `{ v: 1, level: number, seed: number, questionIndex: number }` plus game fields. A round's questions are generated deterministically from `seed`, so resume re-derives the same question.
> **Partial progress within the current question is restored** (placed items, pizza slice count, trace progress index).
> Only `Map` writes `SessionStore.setResume(gameId, snapshot)` on `round:abandon`, and only `Map` clears it, on that game's `round:complete` or when starting that game without resume. Resume uses `snapshot.level`, not the store level.
> `touch-talk`'s snapshot is `{ v, scene, distinctTouched: string[] }`. Its counter survives Home within the session.

## H6 — Bus lifecycle and double events (High)

**The collision.** `Bus` is a global emitter.
- A game subscribes in `create()` with `Bus.on('hint:level', …)`. Replay restarts the same scene, `create()` runs again, and now there are two handlers. `Map` does the same with `round:complete`, so one round grants two decorations.
- Home is tapped during the post-win celebration, so the game emits `round:abandon` after `round:complete`, and Map runs both chains.
- A tap on another station during the kart drive "changes direction" (EXPERIENCE). If the game for the first station was already launched, two games are running.

**Proposed rule (new AD-10 "Bus discipline"):**
> `core/bus.ts` exports a typed `EventMap`. Emitting an event not in the map is a type error. Subscriptions are made only via `bus.scoped(scene)`, which auto-unsubscribes on `SHUTDOWN`/`DESTROY`.
> A game emits **exactly one** terminal event per start (`round:complete` xor `round:abandon`), enforced by a guard in the MiniGame base helper.
> At most one MiniGame scene is running at a time. `Map` starts a game only when the kart arrives, never when the station is tapped.

## H7 — Overlay input layering and pause (High)

**The collision.**
- `PlayAgainOverlay` is a separate scene launched over `Map` with an interactive 15% backdrop (to block stray taps). EXPERIENCE says "tap any station: close overlay, kart goes there". The backdrop eats the tap. Alternatively, the overlay agent re-implements station hit-testing by reading `content/stations`, which gives two owners of the station polygons.
- The overlay's ~10 s re-ask and ~30 s auto-close timers are a third hint timer system (AD-5 says only games may not run hint timers).
- `AudioUnlockOverlay` launches on top of a game. The game scene keeps running, so fish keep swimming and hint clocks keep ticking. Or one agent `pause()`s the game while another expects `sleep()`.

**Proposed rule (AD-1 addition):**
> `PlayAgainOverlay` and `AudioUnlockOverlay` are scenes launched above the current scene. `PlayAgainOverlay` has **no interactive backdrop**: taps outside its two buttons fall through to Map, which owns station hotspots. On any station tap Map tells the overlay to close (`overlay:close`).
> `AudioUnlockOverlay` calls `scene.pause()` on the scene beneath (which pauses its clock, tweens and HintDirector clock per H2) and `resume()` after the tap. No other pause mechanism.
> Overlay idle timers use the overlay scene's clock and timing tokens (H12).

## H8 — Asset, atlas and SFX key naming (Medium)

**The collision.** AD-6 governs voice lines only. `games/fishing` loads `this.load.atlas('fish', …)` and `touch-talk` loads the sea scene with `atlas('fish', …)` too. Phaser's texture cache is global, so the second load is skipped and the wrong frames show. SFX ids `pop` vs `sfx-pop` vs `ui.pop` drift. Some agents preload in each game's `preload()`, others expect `Boot` to load everything. The kart and button sprites are needed by Map and all games: whose atlas holds them? AD-3's "catalog id" has no catalog for sfx/music, so the lint cannot check them.

**Proposed rule (AD-6/AD-7 addition):**
> Atlas file `public/assets/atlases/<screenId>.png|json`, texture key `atlas.<screenId>`, where `screenId` ∈ `shared | map | <GameId>`. Frame names are `<object>/<state>/<nn>` (e.g. `shiba/happy/03`).
> SFX/music live in `content/audio-catalog.ts` as `{ id, file }`, with ids `sfx.<scope>.<name>` and `music.<name>`, and are linted like voice lines.
> Each `MiniGame` declares `assets: { atlases: ScreenId[] }`. `Boot` loads `shared` + `map`, and the shell loads a game's atlases before starting it, with the kart drive covering the load. Games never call `this.load.*`.

## H9 — Voice-line ids, concatenation, TTS bridge (Medium)

**The collision.**
- The id grammar `vo.<scope>.<intent>.<n>` has `<n>` as a variant number, so station names become `vo.shell.station-name.1..7`. The order is implicit, and an agent reorders the stations and everything says the wrong name.
- Ice cream has combinatorial prompts ("kem sô-cô-la và kem dâu", ordered variants for the top level). `games/ice-cream` concatenates segment files at runtime (`say('vo…cho-shiba')` then `say('vo…dau')`), which breaks the "~300 ms pause before keyword" and the single-channel "< 0.5 s queue" rule. `games/pizza` pre-generates whole sentences. The two styles behave differently with Speaker replay and with `speechEnded`, which fires twice for a concatenated prompt.
- `tools/tts` is Python (edge-tts) but the source is `voice-lines.ts`. One agent regex-parses TS, another expects JSON. The `file` field duplicates the id and can drift. When text changes, a stale `.m4a` passes the lint because the file still exists.
- Where do the 0.85× rate and the 300 ms pause live? One generator puts `…` in the text, another uses SSML `<break>`.

**Proposed AD-6 amendment:**
> Id grammar: `vo.<scope>.<intent>[.<subjectId>][.<n>]`, where `subjectId` is a content id (e.g. `vo.shell.station-name.ice-cream`, `vo.fishing.name.fish-yellow-small`).
> The `file` field is removed; the path is derived from the id.
> **One prompt = one file**: no runtime concatenation of voice. Combinatorial prompts are enumerated in content (generated by a content script if needed). `audio.say` takes exactly one id.
> `tools/tts` input is `voice-lines.json`, emitted by `npm run content:export` (tsx imports the TS). Each record carries `textHash`, the generator writes `<id>.m4a` plus `<id>.hash`, and the lint fails on a hash mismatch.
> In `text`, `…` means a 300 ms SSML break. Rate and voice are global in `tools/tts/config`.

## H10 — `stationId` vs `GameId`; difficulty semantics (Medium)

**The collision.** AD-6 keys records "by `GameId`/`stationId`" without relating the two. `content/stations.ts` uses `ice-cream-truck` and `content/decorations.ts` uses `ice-cream`, so the join fails silently. `difficulty: Record<GameId, number>` is ambiguous: 0- or 1-based? Is it an index or a count (pieces: 3/4/6)? `touch-talk` has no ladder, yet `Record` forces a value. What does a migration do when a ladder shrinks?

**Proposed rule:**
> `stationId === GameId` (7 stations, 7 games). There is no separate station id type.
> `difficulty: Partial<Record<GameId, number>>` is a **0-based index into `ladder`**, clamped to `[0, ladder.length-1]` on read. `touch-talk` is absent. A missing key means 0.

## H11 — Pointer policy granularity (Medium)

**The collision.** AD-4 says "assigns each interactive object to the first pointer that grabs it". Under `dino-puzzle`, one finger drags piece A while the parent's finger grabs piece B, and both drags proceed: this is legal per object. EXPERIENCE says every additional touch is ignored ("parents touching never break the child's round"). `shadow-match` builds global single-pointer, so the two games behave differently. A second finger on Home while the child drags is also undefined.

**Proposed AD-4 addition:**
> **One active gameplay pointer per scene.** While it is down, all other pointers are ignored for gameplay objects. Home and Speaker accept a second pointer only if it starts outside the dead-zones and the first pointer is not mid-drag; otherwise they are ignored too.

## H12 — Behaviour timings have no home (Medium)

**The collision.** AD-8's lint catches hex and px but not ms. HintDirector hard-codes `6000`, Map's invite uses `8000`, and the overlay uses `10000` and `30000`. EXPERIENCE says these are "to be tuned with the child", so tuning means editing three files that three agents wrote. The 4 s end-of-round budget is split across game and Map with no shared numbers.

**Proposed AD-8 addition:**
> `core/tokens.ts › Timing` holds every behaviour duration named in EXPERIENCE (`hintL2Idle`, `hintL3Extra`, `hintHandRepeat`, `hintVoiceRepeat`, `inviteFirst`, `inviteGap`, `inviteMax`, `overlayReask`, `overlayAutoClose`, `celebrate`, `pullBack`, `flyIn`, `kartMax`, `kartMaxRepeat`, `itemReturn`, `offTrayReturn`, `fishResurface`, `ttIdleWiggle`). The lint also rejects numeric literals ≥ 100 passed to `delayedCall`, `tweens.add({ duration })` or `time.addEvent` outside `tokens.ts`.

## H13 — Art pipeline vs hit polygons (Medium)

**The collision.** AD-7 says polygons are "measured on the fixed Blender camera". One agent measures in the 2048×1536 render, another in 1024×768, so the coordinates differ by a factor of 2. A re-render after DESIGN's requested layout shift (separate the fish pond from the dino park) silently invalidates the hand-entered polygons.

**Proposed AD-7 addition:**
> `tools/render` exports, per screen, `content/generated/<screenId>.layout.json` in **design-space px (1×)**: anchors and hit polygons from named Blender empties/curves (`hit.<id>`, `anchor.<id>`, `slot.<id>`). Content imports the generated layout and never hand-enters coordinates. Re-render regenerates the layout. The lint checks every `stationId`/`slotId` in content has a generated polygon or anchor.

---

## Lower-risk notes (no new AD needed)

- **`kart` parking and camera continuity.** Map must start its post-round pull-back from the same zoom the forward transition ended on. Store `lastStation` in `SessionStore` so Map can rebuild after a `scene.stop`.
- **`prefers-reduced-motion`.** The camera zoom becomes a fade. Put this in one `core/motion.ts` helper rather than in each scene.
- **`navigator.storage.persist()`.** "After first tap" needs one owner: `ProgressStore.init()` triggered from Start. Otherwise both Start and Map call it.
- **`ProgressStore` write timing.** Write synchronously on each action (the document is tiny) so a kill during the fly-in doesn't lose the grant.
- **AD-9 vs EXPERIENCE "button-play shows only when required assets are cached".** Define "ready" as the `controlling` service worker + precache complete event, so Boot isn't left waiting for a first-load `controllerchange` that only arrives after reload.
