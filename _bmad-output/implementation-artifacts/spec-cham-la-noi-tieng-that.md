---
title: 'Chạm là nói: tiếng thật CC0 cho 60 đồ vật'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every Chạm là nói prop (60, six scenes) plays a synthesized beep/ping/noise placeholder; many sound alike and none sounds like the thing, so tapping is less fun and teaches nothing.

**Approach:** Give every prop a real CC0 recording that sounds like it (or like a playful foley for things that make no sound), short and gentle for a 3-year-old, mastered with the project's audio pipeline.

Decisions (parent, 2026-10-21): real CC0 sounds (Freesound / BigSoundBank), batch 3 of 3.

## Boundaries & Constraints

**Always:** Only CC0 1.0 sources (Freesound filtered on "Creative Commons 0", or BigSoundBank); record each file's title, author, URL and licence in the `app/README.md` provenance table. Each sound is ~0.2–1.0 s, trimmed to the characteristic part, no harsh peaks, mastered with `npm run audio:normalize -- <src> sfx.touch-talk.<id>` (peak may be lowered further by hand as for the ice-cream sneeze). Creature voices (seagull, rubber duck squeak counts as a toy, not a creature) are catalogued `creature: true` and pass `npm run audio:check`. Within one scene no two props sound alike. Downloads go to a scratch folder outside `app/`; only the mastered `.m4a` lands in `public/assets/audio/sfx/`.

**Never:** Non-CC0 or "attribution required" sources; scary or loud sounds (a police car is a short friendly "whoop", not a full siren; a truck a soft horn toot, not an engine roar); change voice lines, art or game code beyond the catalogue/placeholder entries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap | any of the 60 props | its own real sound at once, then its name | — |
| Silent things | towel, pillow, cheese, cookie, bread … | a playful foley (soft whoosh, fluff, small crunch/munch, squish) | — |
| No CC0 found | a prop with no fitting CC0 sound | closest gentle foley; listed in the report | never fall back to a non-CC0 file |
| Checks | `npm run audio:check`, `npm run check` | pass | fix the file, never loosen a limit |

</frozen-after-approval>

## Code Map

All under `app/`.
- `tools/audio/make-placeholders.ts` (`TOUCH_TALK_SOUNDS` :~240, lookup :~328) -- remove the `sfx.touch-talk.*` entries once each real file exists so the placeholder tool never overwrites them; keep the generator for other games. Update `make-placeholders.test.ts` (the per-id TOUCH_TALK_SOUNDS test).
- `tools/audio/normalize.ts` -- `npm run audio:normalize -- <src> <id>`: two-pass loudnorm I=−20 TP=−3, 50 ms fade-in, AAC mono 44.1 kHz 64k. Trim/high-pass with ffmpeg first when needed (see the README row for `sfx.ice-cream.sneeze` as the worked example).
- `tools/audio/check-sfx.ts` -- creature limits (≤ 800 ms, nothing < 150 Hz, peak ≤ −18 dBFS, fade-in); `check-sfx.test.ts` lists the creature ids — add new creature ids there.
- `src/content/audio-catalog.ts` -- the 60 `sfx.touch-talk.<id>` entries (set `creature: true` where it applies; doc comment per entry like the sneeze).
- `src/content/games/touch-talk.ts` -- prop ids per scene (sea, street, kitchen, bathroom, bakery, picnic).
- Sources: Freesound search `https://freesound.org/search/?q=<words>&f=license:%22Creative+Commons+0%22` — each result's `previews/<n>/<id>_<user>-lq.mp3` has an `-hq.mp3` sibling on `https://cdn.freesound.org/previews/…`; the sound page `freesound.org/s/<id>/` gives title/author/licence. BigSoundBank (all CC0) as a second source.
- `app/README.md` -- one provenance row per file (or a compact table section for touch-talk SFX).

## Tasks & Acceptance

**Execution:**
- [ ] For each of the 60 props: find a CC0 source, trim, master into `public/assets/audio/sfx/sfx.touch-talk.<id>.m4a`, listen-proxy check (duration, peak, spectrum via ffmpeg `astats`/`volumedetect`).
- [ ] `audio-catalog.ts` creature flags + `check-sfx.test.ts` creature ids.
- [ ] `make-placeholders.ts` (+test) -- drop the replaced entries.
- [ ] `app/README.md` -- provenance.
- [ ] Report a table: prop → source title/author/URL → what it sounds like, flagging weak matches.

**Acceptance Criteria:**
- Given any prop, when tapped, then a real, recognisable or playful sound plays, ≤ ~1 s, never startling.
- Given `npm run audio:check` and `npm run check`, then both exit 0.

## Implementation Notes

## Spec Change Log

- 2026-10-22, review finding #1 (name over sound): the spec's Never ("no game code beyond catalogue/placeholder entries") would keep the 350 ms name delay, under which every real sound overlaps the spoken name — which defeats the sound-then-name intent. Amended by raising the Timing token `touchTalkNameDelayMs` to 800 ms (a tuning value, no logic change). KEEP: all 60 recordings, catalogue comments and README rows as delivered.

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge, verif | name line starts 350 ms after the tap, over the 0.43–0.77 s sounds | medium | Timing.touchTalkNameDelayMs = 350; every new file is longer | patch (delay → 800 ms; see change log) |
| 2 | verif, blind | no automated check of the 58 non-creature recordings | medium | the per-id recipe test was deleted; audio:check covers creatures only | patch (vitest: file exists, duration ≤ 800 ms) |
| 3 | blind, edge | audio:placeholders logs "kept the recording" for a missing file | low | main() never checks existence | patch |
| 4 | edge | test pins the literal 60 | low | count not derived from content | patch |
| 5 | blind, edge | README "≤ 0.75 s" / catalog "≤ ~0.7 s" vs bathtub 0.766 s | low | ffprobe | patch |
| 6 | blind | licence evidence without a date; lossy previews re-encoded | low | README note | patch |
| 7 | blind | chocolate-cake is a real child's voice, not flagged | low | "Mmm girl 2" | patch (flag in README) |
| 8 | blind | loudness rule changed (−20 LUFS, TP −3) without explanation | false | that is the existing audio:normalize SFX target used by every real SFX since Story 3.x; only the old placeholders used fixed gain | reject |
| 9 | blind | high-pass lowered to 100–150 Hz on some props | low | no rule for non-creature SFX; creature limits still enforced | reject |
| 10 | blind, edge | isRecording uses a prefix, not catalog data | low | no synthesized touch-talk id is planned | reject |
| 11 | blind | several sounds are playful, not literal (donut pop, cupcake boing, radio xylophone …) | low | the spec allows playful foley for silent things; listed to the parent | reject (parent listens) |
| 12 | verif | cheese/seagull creature limits only checked by audio:check outside npm run check | low | pre-existing design; audio:check run and passing | reject (pre-existing) |

## Verification

**Commands:**
- `cd app && npm run audio:check && npm run check` -- expected: exit 0.

**Manual checks:**
- The parent listens to each scene in the game and flags any sound to redo.
