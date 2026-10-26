# Epic 8 Context: Nhà Xoài – chăm sóc và thay đồ (Xoài's home: caring and dress-up)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Add the last two games to the Home yard ("Nhà Xoài") that Epic 7 built. In the pet clinic, the child (Xoài, 3 years old) fixes a visible problem on an animal friend: it is muddy, hungry, scraped or sleepy. In the wardrobe, she dresses the chibi Shiba in hats, glasses and shirts, and Shiba keeps the outfit on the island map and in the ice-cream shop. Both games are about caring and making something her own. The child is never judged or tested.

## Stories

- Story 8.1: Bác sĩ thú cưng (pet clinic)
- Story 8.2: Thay đồ cho Shiba (dress Shiba)

## Requirements & Constraints

- **Pet clinic**:
  - There are 4 tools: shower, milk bottle, plaster and blanket. Each matches one visible problem: mud, rumbling tummy, scrape, yawning.
  - A patient arrives with 1–2 problems. Each problem the child fixes gets its own reaction (a laugh while showering, a burp when full…).
  - Once the patient is well, it thanks the child, hops, and the next patient comes in.
  - A tool that does not fit makes the animal tilt its head in a funny way, followed by a short voice reminder. There is no "wrong" sound or colour, and the voice never says "sai".
- **Wardrobe**:
  - The wardrobe holds at least 4 hats, 3 glasses and 4 shirts.
  - Tapping an item puts it on Shiba, who looks in the mirror and reacts (turns, smiles). Tapping an item Shiba is already wearing takes it off.
  - The chosen outfit is saved and shows on the map Shiba and the ice-cream Shiba.
- **Shared rules for every game**:
  - **Moving things**: tap-then-tap works as well as drag. If the child lifts her finger mid-drag, the item stays where it is and does not snap back.
  - **Reactions**: at least 3 random reactions for a correct action, with no immediate repeat. After the round, the game goes into free play.
  - **Taps**: everything reacts when tapped. Tap targets are about 2 cm (≥ 80 px, gap ≥ 24 px), and draggable items show at ≥ 90 px. Nothing important sits in the edge dead zones.
  - **Voice**: lines are short (about 2–4 s) and never make the child wait. Any animation longer than about 1.5 s can be skipped with a tap. There is no praise, and "Xoài" appears only in greeting, invite and prompt lines.
  - **Motion and sound**: flashing ≤ 1 Hz, one prominent motion at a time, and `prefers-reduced-motion` is respected. Creature sounds are short (≤ 0.8 s), with nothing below 150 Hz and nothing sudden or loud.
- **Verification**: each story ships vitest tests for its round model and passes `npm run check`.

## Technical Decisions

- **Clinic patients are real models, not chibi.** This overrides the epics text, which says "bạn thú chibi". The parent rejected chibi animals as unrecognisable. Reuse the low-poly models already used in `animal-pens`:
  - the Quaternius animals (CC0);
  - the Poly by Google cat and rooster (CC-BY 3.0). These need attribution lines in the README and in `app/public/CREDITS.txt`.

  The clinic props (furniture, tools) follow the cute-toy style: `cute.py`, Tiny Treats, KayKit, smooth shading, no subdivision modifier.
- **The wardrobe uses the existing chibi Shiba**, built with `cute.py` `chibi('dog','shiba',…)`. This is the same dog as `A_Shiba` in `build_map.py` and the Shiba in `build_ice_cream.py`.
  - Outfit meshes attach to the chibi rig's head and body parts.
  - Each item needs its own sprite that lines up with Shiba (same angle and anchor) on the wardrobe screen, the map and the ice-cream screen. The map Shiba's idle and wave frames and the ice-cream Shiba's reaction frames must all be able to wear it.
- **Game ids**: the yard corners `clinic` → `pet-clinic` and `wardrobe` → `dress-up` are placeholders in `content/home.ts`. A corner wakes when its game is registered in `games/registry.ts`, with no edit to the yard or navigation code.
  - Each game also needs its id added to `YARD_GAME_IDS`, to `SnapshotPartials` and to the ESLint `LINT_GAME_IDS`.
  - A yard game has no island station or decorations.
- **Game structure**: each game is a `MiniGameBase` game with a pure round model plus a thin Phaser scene. It uses the RoundGuard and the existing free-play paths (`round:next` continuous play, or `finishRoundAndStay` if a game should not restart).
  - Exactly one terminal event per start.
  - Home in a yard game returns to the yard.
  - Resume works through a JSON `partial` snapshot.
- **Saving the outfit**: only `ProgressStore` writes persistent storage, under the single key `bhc.progress`, currently schema v3 `{ schemaVersion, difficulty }`. Storing the outfit means bumping `schemaVersion` and adding a migration. The map and ice-cream scenes read the outfit from the store.
- **Input and sound**: all input goes through the `core/input` primitives (InputGuard: the first finger wins), and all sound goes through `AudioDirector`. Cross-scene communication uses only the typed Bus.
- **Art pipeline**: each game has its own builder, `tools/render/blender/build_<id>.py`. Sprites are pre-rendered, with atlas pages ≤ 2048² and every file ≤ 8 MiB. Each new screen gets a layout rule, following `validateAnimalPens`: hulls inside the interactive rect, clear of the HUD, with the minimum size and gap.
- **Data and voice**:
  - New numbers go in `Tokens` or `Tokens.Timing`, then `npm run tokens` (lint `no-magic-numbers`).
  - Content is data with stable ids in `content/games/<id>.ts`, registered in assets, layouts and the audio catalogue.
  - Voice lines are rendered with `npm run tts` (the ElevenLabs recipe). The homophone validator applies.
- **Sourcing**: the corporate firewall blocks itch.io and OpenGameArt, so use GitHub mirrors or Poly Pizza. Record the licence and provenance of every new asset in the README and a `SOURCE.txt`.

## UX & Interaction Patterns

- **Clinic**: the child drags or taps a tool onto the animal, and the problem clears step by step, each step with its own reaction. Every patient is a small story: arrive, get help, say thank you, leave.
- **Wardrobe**: one tap puts an item on and a second tap takes it off. There is no right outfit. The mirror moment (Shiba turns and smiles) is the reward.
- **Free play and Home**: after the round, the game stays playable with the voice silent. Home goes back to the yard.
- **Voice**: requests and invites are spoken and the game never shows instruction text. A parent-invite line ("Hỏi mẹ xem…") plays at most once per round.

## Cross-Story Dependencies

- Both games depend on Epic 7's yard and navigation (7.1) and reuse the patterns proven in 7.2–7.4: real models, door and anchor offset rendering, free play, no-judging round models.
- 8.1 depends on the `animal-pens` model assets and their attribution.
- 8.2 depends on the Shiba guide sprite from 5.2 (the map Shiba's idle and wave frames) and the ice-cream Shiba frames from 6.1. Rebuilding those screens with the outfit layers touches `build_map.py` and `build_ice_cream.py`.
- 8.2 also changes the ProgressStore schema.
- 8.1 and 8.2 are independent of each other.
