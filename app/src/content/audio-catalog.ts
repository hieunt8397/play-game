// SFX and music catalog (AD-6). Code plays sound ONLY by these ids through core/audio-director.
// Files live at public/assets/audio/<kind>/<id>.m4a (checked by tools/lint/validate-content.ts).
// The current files are synthesized placeholders: `npm run audio:placeholders`.

export type AudioKind = 'sfx' | 'music';

export interface AudioEntry {
  /** Relative to the app base (`base: './'`): `assets/audio/<kind>/<id>.m4a`. */
  readonly path: string;
  readonly kind: AudioKind;
  readonly loop?: boolean;
  /** Playback gain 0..1 (the file itself is already mastered to its loudness target). */
  readonly volume?: number;
  /**
   * Story 3.3: a creature's voice (EXPERIENCE creature SFX): ≤ 800 ms, nothing below 150 Hz, below the
   * voice, fade-in ≥ 50 ms. `npm run audio:check` (tools/audio/check-sfx.ts) measures every such file.
   */
  readonly creature?: boolean;
}

export const AUDIO_IDS = [
  'sfx.shell.pop',
  'sfx.shell.happy',
  'sfx.shell.prop',
  'sfx.shell.kart-beep',
  'sfx.shell.woof',
  'sfx.shell.chirp',
  'music.island',
  'sfx.ice-cream.snap',
  'sfx.ice-cream.happy',
  'sfx.ice-cream.sneeze',
  'sfx.pizza.snap',
  'sfx.pizza.ting',
  'sfx.pizza.munch',
  'sfx.pizza.happy',
  'sfx.dino-puzzle.snap',
  'sfx.dino-puzzle.happy',
  'sfx.dino-puzzle.apatosaurus.happy',
  'sfx.dino-puzzle.triceratops.happy',
  'sfx.dino-puzzle.stegosaurus.happy',
  'sfx.shadow-match.snap',
  'sfx.shadow-match.happy',
  'sfx.shadow-match.trike.happy',
  'sfx.race.engine',
  'sfx.race.horn',
  'sfx.race.happy',
  'sfx.fishing.plop',
  'sfx.fishing.bubble',
  'sfx.fishing.reel',
  'sfx.fishing.happy',
  'sfx.touch-talk.boat',
  'sfx.touch-talk.fish',
  'sfx.touch-talk.crab',
  'sfx.touch-talk.starfish',
  'sfx.touch-talk.parasol',
  'sfx.touch-talk.bucket',
  'sfx.touch-talk.seagull',
  'sfx.touch-talk.coconut',
  'sfx.touch-talk.shell',
  'sfx.touch-talk.beach-ball',
  'sfx.touch-talk.car',
  'sfx.touch-talk.bus',
  'sfx.touch-talk.traffic-light',
  'sfx.touch-talk.tree',
  'sfx.touch-talk.house',
  'sfx.touch-talk.police-car',
  'sfx.touch-talk.truck',
  'sfx.touch-talk.tractor',
  'sfx.touch-talk.dumpster',
  'sfx.touch-talk.cone',
  'sfx.touch-talk.pot',
  'sfx.touch-talk.frying-pan',
  'sfx.touch-talk.apple',
  'sfx.touch-talk.bread',
  'sfx.touch-talk.banana',
  'sfx.touch-talk.carrot',
  'sfx.touch-talk.mug',
  'sfx.touch-talk.spoon',
  'sfx.touch-talk.egg',
  'sfx.touch-talk.watermelon',
  'sfx.touch-talk.bathtub',
  'sfx.touch-talk.rubber-duck',
  'sfx.touch-talk.toothbrush',
  'sfx.touch-talk.toothbrush-cup',
  'sfx.touch-talk.towel',
  'sfx.touch-talk.slippers',
  'sfx.touch-talk.mirror',
  'sfx.touch-talk.shampoo',
  'sfx.touch-talk.soap',
  'sfx.touch-talk.potty',
  'sfx.touch-talk.birthday-cake',
  'sfx.touch-talk.cupcake',
  'sfx.touch-talk.donut',
  'sfx.touch-talk.cookie',
  'sfx.touch-talk.croissant',
  'sfx.touch-talk.muffin',
  'sfx.touch-talk.waffle',
  'sfx.touch-talk.apple-pie',
  'sfx.touch-talk.cinnamon-roll',
  'sfx.touch-talk.chocolate-cake',
  'sfx.touch-talk.picnic-basket',
  'sfx.touch-talk.sandwich',
  'sfx.touch-talk.grapes',
  'sfx.touch-talk.cheese',
  'sfx.touch-talk.teapot',
  'sfx.touch-talk.frisbee',
  'sfx.touch-talk.radio',
  'sfx.touch-talk.cooler',
  'sfx.touch-talk.pillow',
  'sfx.touch-talk.butterfly',
] as const;

export type AudioId = (typeof AUDIO_IDS)[number];

export const AUDIO_CATALOG: Record<AudioId, AudioEntry> = {
  /** "Pụp" of button-play: 140 ms sine sweep, ≥ 50 ms fade-in, peak ≈ −20 dBFS (quieter than voice). */
  'sfx.shell.pop': { path: 'assets/audio/sfx/sfx.shell.pop.m4a', kind: 'sfx' },
  /** Sleeping-station tap (Story 1.5, "tiếng vui"): rising two-note chime, ≥ 50 ms fade-in, peak ≈ −20 dBFS. */
  'sfx.shell.happy': { path: 'assets/audio/sfx/sfx.shell.happy.m4a', kind: 'sfx' },
  /** Map prop tap (Story 1.5, tappable-prop): ~100 ms soft tick, ≥ 50 ms fade-in, peak ≈ −20 dBFS. */
  'sfx.shell.prop': { path: 'assets/audio/sfx/sfx.shell.prop.m4a', kind: 'sfx' },
  /** Kart tap (Story 1.7): two-tone horn ~200 ms, ≥ 50 ms fade-in, peak ≈ −20 dBFS. */
  'sfx.shell.kart-beep': { path: 'assets/audio/sfx/sfx.shell.kart-beep.m4a', kind: 'sfx' },
  /** Guide Shiba tap on the island (Story 5.2): two soft "gâu" yips ~360 ms (creature), peak ≈ −20 dBFS. Placeholder. */
  'sfx.shell.woof': { path: 'assets/audio/sfx/sfx.shell.woof.m4a', kind: 'sfx', creature: true },
  /** Creature decoration tap on the island (Story 5.4: fish, dino, alpaca): two soft high chirps ~300 ms (creature), peak ≈ −20 dBFS. Placeholder. */
  'sfx.shell.chirp': { path: 'assets/audio/sfx/sfx.shell.chirp.m4a', kind: 'sfx', creature: true },
  /** Tiệm kem (Story 1.8): a scoop snaps onto the cone — soft plop ~150 ms, 50 ms fade-in, peak ≈ −20 dBFS. Loads with the game. */
  'sfx.ice-cream.snap': { path: 'assets/audio/sfx/sfx.ice-cream.snap.m4a', kind: 'sfx' },
  /** Tiệm kem: Shiba's happy tune — major arpeggio ~1.5 s, 50 ms fade-in, peak ≈ −20 dBFS. Loads with the game. */
  'sfx.ice-cream.happy': { path: 'assets/audio/sfx/sfx.ice-cream.happy.m4a', kind: 'sfx' },
  /** Tiệm kem (Story 6.1): Shiba's sneeze — a real small-dog sneeze ~600 ms (Freesound #548465, CC0), creature. Loads with the game. */
  'sfx.ice-cream.sneeze': { path: 'assets/audio/sfx/sfx.ice-cream.sneeze.m4a', kind: 'sfx', creature: true },
  /** Tiệm pizza (Story 3.1): a slice snaps onto the base — soft "pụp" ~150 ms. All pizza SFX: 50 ms fade-in, peak ≈ −20 dBFS, partials ≥ 300 Hz. Load with the game. */
  'sfx.pizza.snap': { path: 'assets/audio/sfx/sfx.pizza.snap.m4a', kind: 'sfx' },
  /** Tiệm pizza: the oven's "ting" when the pizza is baked — a small bell ~400 ms. */
  'sfx.pizza.ting': { path: 'assets/audio/sfx/sfx.pizza.ting.m4a', kind: 'sfx' },
  /** Tiệm pizza: the fox's "măm măm" — two soft clicks, 600 ms (≤ 700 ms). */
  'sfx.pizza.munch': { path: 'assets/audio/sfx/sfx.pizza.munch.m4a', kind: 'sfx' },
  /** Tiệm pizza: the fox's happy tune at the end of the round — a major arpeggio ~1.5 s. */
  'sfx.pizza.happy': { path: 'assets/audio/sfx/sfx.pizza.happy.m4a', kind: 'sfx' },
  /** Ghép khủng long (Story 3.3): a piece snaps into its slot — soft "pụp" ~150 ms. All dino SFX: 50 ms fade-in, peak ≈ −20 dBFS, highpass 150 Hz, partials ≥ 300 Hz. Load with the game. */
  'sfx.dino-puzzle.snap': { path: 'assets/audio/sfx/sfx.dino-puzzle.snap.m4a', kind: 'sfx' },
  /** Ghép khủng long: the round-end tune after the third dino — a major arpeggio ~1.5 s. */
  'sfx.dino-puzzle.happy': { path: 'assets/audio/sfx/sfx.dino-puzzle.happy.m4a', kind: 'sfx' },
  /** The long-neck's soft happy call: a two-note hoot 392 → 330 Hz, 600 ms (never a roar). */
  'sfx.dino-puzzle.apatosaurus.happy': { path: 'assets/audio/sfx/sfx.dino-puzzle.apatosaurus.happy.m4a', kind: 'sfx', creature: true },
  /** The triceratops' happy call: two chirps 659 / 784 Hz, 400 ms. */
  'sfx.dino-puzzle.triceratops.happy': { path: 'assets/audio/sfx/sfx.dino-puzzle.triceratops.happy.m4a', kind: 'sfx', creature: true },
  /** The stegosaurus' happy call: a trill around 523 Hz (± 30 Hz), 500 ms. */
  'sfx.dino-puzzle.stegosaurus.happy': { path: 'assets/audio/sfx/sfx.dino-puzzle.stegosaurus.happy.m4a', kind: 'sfx', creature: true },
  /** Hang tìm bóng (Story 3.5): an item is sucked into its shadow — soft "pụp" ~150 ms. All shadow-match SFX: 50 ms fade-in, peak ≈ −20 dBFS, highpass 150 Hz, partials ≥ 300 Hz. Load with the game. */
  'sfx.shadow-match.snap': { path: 'assets/audio/sfx/sfx.shadow-match.snap.m4a', kind: 'sfx' },
  /** Hang tìm bóng: the round-end tune after the fourth name — a major arpeggio ~1.5 s. */
  'sfx.shadow-match.happy': { path: 'assets/audio/sfx/sfx.shadow-match.happy.m4a', kind: 'sfx' },
  /** The triceratops' happy chirp after each reveal: two chirps 659 / 784 Hz, 400 ms (the sfx.dino-puzzle.triceratops.happy recipe). */
  'sfx.shadow-match.trike.happy': { path: 'assets/audio/sfx/sfx.shadow-match.trike.happy.m4a', kind: 'sfx', creature: true },
  /** Đường đua (Story 4.1): the kart is grabbed — a soft rising two-partial "vroom" ~400 ms. All race SFX: 50 ms fade-in, peak ≈ −20 dBFS. Load with the game. */
  'sfx.race.engine': { path: 'assets/audio/sfx/sfx.race.engine.m4a', kind: 'sfx' },
  /** Đường đua: the kart reaches the gate — a happy two-tone beep ~300 ms. */
  'sfx.race.horn': { path: 'assets/audio/sfx/sfx.race.horn.m4a', kind: 'sfx' },
  /** Đường đua: the end of the round — a major arpeggio ~1.5 s. */
  'sfx.race.happy': { path: 'assets/audio/sfx/sfx.race.happy.m4a', kind: 'sfx' },
  /** Câu cá (Story 4.3): a water tap — a soft "tõm" ~200 ms. All fishing SFX: 50 ms fade-in, peak ≈ −20 dBFS, partials ≥ 300 Hz. Load with the game. */
  'sfx.fishing.plop': { path: 'assets/audio/sfx/sfx.fishing.plop.m4a', kind: 'sfx' },
  /** Câu cá: a wrong fish dives — three rising blips ~400 ms. */
  'sfx.fishing.bubble': { path: 'assets/audio/sfx/sfx.fishing.bubble.m4a', kind: 'sfx' },
  /** Câu cá: the line reels the fish up — a soft ratchet ~600 ms. */
  'sfx.fishing.reel': { path: 'assets/audio/sfx/sfx.fishing.reel.m4a', kind: 'sfx' },
  /** Câu cá: the caught fish jumps — a major arpeggio ~1.5 s. */
  'sfx.fishing.happy': { path: 'assets/audio/sfx/sfx.fishing.happy.m4a', kind: 'sfx' },
  /** Chạm là nói (Story 4.5): one short sound per sea prop (≤ 350 ms, 50 ms fade-in, peak ≈ −20 dBFS, partials ≥ 300 Hz). The seagull's call is a creature sound. Load with the game. */
  'sfx.touch-talk.boat': { path: 'assets/audio/sfx/sfx.touch-talk.boat.m4a', kind: 'sfx' },
  'sfx.touch-talk.fish': { path: 'assets/audio/sfx/sfx.touch-talk.fish.m4a', kind: 'sfx' },
  'sfx.touch-talk.crab': { path: 'assets/audio/sfx/sfx.touch-talk.crab.m4a', kind: 'sfx' },
  'sfx.touch-talk.starfish': { path: 'assets/audio/sfx/sfx.touch-talk.starfish.m4a', kind: 'sfx' },
  'sfx.touch-talk.parasol': { path: 'assets/audio/sfx/sfx.touch-talk.parasol.m4a', kind: 'sfx' },
  'sfx.touch-talk.bucket': { path: 'assets/audio/sfx/sfx.touch-talk.bucket.m4a', kind: 'sfx' },
  'sfx.touch-talk.seagull': { path: 'assets/audio/sfx/sfx.touch-talk.seagull.m4a', kind: 'sfx', creature: true },
  'sfx.touch-talk.coconut': { path: 'assets/audio/sfx/sfx.touch-talk.coconut.m4a', kind: 'sfx' },
  'sfx.touch-talk.shell': { path: 'assets/audio/sfx/sfx.touch-talk.shell.m4a', kind: 'sfx' },
  'sfx.touch-talk.beach-ball': { path: 'assets/audio/sfx/sfx.touch-talk.beach-ball.m4a', kind: 'sfx' },
  /** Story 4.6: the street and kitchen props (the same rules). */
  'sfx.touch-talk.car': { path: 'assets/audio/sfx/sfx.touch-talk.car.m4a', kind: 'sfx' },
  'sfx.touch-talk.bus': { path: 'assets/audio/sfx/sfx.touch-talk.bus.m4a', kind: 'sfx' },
  'sfx.touch-talk.traffic-light': { path: 'assets/audio/sfx/sfx.touch-talk.traffic-light.m4a', kind: 'sfx' },
  'sfx.touch-talk.tree': { path: 'assets/audio/sfx/sfx.touch-talk.tree.m4a', kind: 'sfx' },
  'sfx.touch-talk.house': { path: 'assets/audio/sfx/sfx.touch-talk.house.m4a', kind: 'sfx' },
  'sfx.touch-talk.police-car': { path: 'assets/audio/sfx/sfx.touch-talk.police-car.m4a', kind: 'sfx' },
  'sfx.touch-talk.truck': { path: 'assets/audio/sfx/sfx.touch-talk.truck.m4a', kind: 'sfx' },
  'sfx.touch-talk.tractor': { path: 'assets/audio/sfx/sfx.touch-talk.tractor.m4a', kind: 'sfx' },
  'sfx.touch-talk.dumpster': { path: 'assets/audio/sfx/sfx.touch-talk.dumpster.m4a', kind: 'sfx' },
  'sfx.touch-talk.cone': { path: 'assets/audio/sfx/sfx.touch-talk.cone.m4a', kind: 'sfx' },
  'sfx.touch-talk.pot': { path: 'assets/audio/sfx/sfx.touch-talk.pot.m4a', kind: 'sfx' },
  'sfx.touch-talk.frying-pan': { path: 'assets/audio/sfx/sfx.touch-talk.frying-pan.m4a', kind: 'sfx' },
  'sfx.touch-talk.apple': { path: 'assets/audio/sfx/sfx.touch-talk.apple.m4a', kind: 'sfx' },
  'sfx.touch-talk.bread': { path: 'assets/audio/sfx/sfx.touch-talk.bread.m4a', kind: 'sfx' },
  'sfx.touch-talk.banana': { path: 'assets/audio/sfx/sfx.touch-talk.banana.m4a', kind: 'sfx' },
  'sfx.touch-talk.carrot': { path: 'assets/audio/sfx/sfx.touch-talk.carrot.m4a', kind: 'sfx' },
  'sfx.touch-talk.mug': { path: 'assets/audio/sfx/sfx.touch-talk.mug.m4a', kind: 'sfx' },
  'sfx.touch-talk.spoon': { path: 'assets/audio/sfx/sfx.touch-talk.spoon.m4a', kind: 'sfx' },
  'sfx.touch-talk.egg': { path: 'assets/audio/sfx/sfx.touch-talk.egg.m4a', kind: 'sfx' },
  'sfx.touch-talk.watermelon': { path: 'assets/audio/sfx/sfx.touch-talk.watermelon.m4a', kind: 'sfx' },
  /** Chạm là nói 2026-10-21 (batch 2): bathroom, bakery and picnic props — temporary synthesized sounds (≤ 350 ms, 50 ms fade-in, peak ≈ −20 dBFS); CC0 recordings replace them in batch 3. */
  'sfx.touch-talk.bathtub': { path: 'assets/audio/sfx/sfx.touch-talk.bathtub.m4a', kind: 'sfx' },
  'sfx.touch-talk.rubber-duck': { path: 'assets/audio/sfx/sfx.touch-talk.rubber-duck.m4a', kind: 'sfx' },
  'sfx.touch-talk.toothbrush': { path: 'assets/audio/sfx/sfx.touch-talk.toothbrush.m4a', kind: 'sfx' },
  'sfx.touch-talk.toothbrush-cup': { path: 'assets/audio/sfx/sfx.touch-talk.toothbrush-cup.m4a', kind: 'sfx' },
  'sfx.touch-talk.towel': { path: 'assets/audio/sfx/sfx.touch-talk.towel.m4a', kind: 'sfx' },
  'sfx.touch-talk.slippers': { path: 'assets/audio/sfx/sfx.touch-talk.slippers.m4a', kind: 'sfx' },
  'sfx.touch-talk.mirror': { path: 'assets/audio/sfx/sfx.touch-talk.mirror.m4a', kind: 'sfx' },
  'sfx.touch-talk.shampoo': { path: 'assets/audio/sfx/sfx.touch-talk.shampoo.m4a', kind: 'sfx' },
  'sfx.touch-talk.soap': { path: 'assets/audio/sfx/sfx.touch-talk.soap.m4a', kind: 'sfx' },
  'sfx.touch-talk.potty': { path: 'assets/audio/sfx/sfx.touch-talk.potty.m4a', kind: 'sfx' },
  'sfx.touch-talk.birthday-cake': { path: 'assets/audio/sfx/sfx.touch-talk.birthday-cake.m4a', kind: 'sfx' },
  'sfx.touch-talk.cupcake': { path: 'assets/audio/sfx/sfx.touch-talk.cupcake.m4a', kind: 'sfx' },
  'sfx.touch-talk.donut': { path: 'assets/audio/sfx/sfx.touch-talk.donut.m4a', kind: 'sfx' },
  'sfx.touch-talk.cookie': { path: 'assets/audio/sfx/sfx.touch-talk.cookie.m4a', kind: 'sfx' },
  'sfx.touch-talk.croissant': { path: 'assets/audio/sfx/sfx.touch-talk.croissant.m4a', kind: 'sfx' },
  'sfx.touch-talk.muffin': { path: 'assets/audio/sfx/sfx.touch-talk.muffin.m4a', kind: 'sfx' },
  'sfx.touch-talk.waffle': { path: 'assets/audio/sfx/sfx.touch-talk.waffle.m4a', kind: 'sfx' },
  'sfx.touch-talk.apple-pie': { path: 'assets/audio/sfx/sfx.touch-talk.apple-pie.m4a', kind: 'sfx' },
  'sfx.touch-talk.cinnamon-roll': { path: 'assets/audio/sfx/sfx.touch-talk.cinnamon-roll.m4a', kind: 'sfx' },
  'sfx.touch-talk.chocolate-cake': { path: 'assets/audio/sfx/sfx.touch-talk.chocolate-cake.m4a', kind: 'sfx' },
  'sfx.touch-talk.picnic-basket': { path: 'assets/audio/sfx/sfx.touch-talk.picnic-basket.m4a', kind: 'sfx' },
  'sfx.touch-talk.sandwich': { path: 'assets/audio/sfx/sfx.touch-talk.sandwich.m4a', kind: 'sfx' },
  'sfx.touch-talk.grapes': { path: 'assets/audio/sfx/sfx.touch-talk.grapes.m4a', kind: 'sfx' },
  'sfx.touch-talk.cheese': { path: 'assets/audio/sfx/sfx.touch-talk.cheese.m4a', kind: 'sfx' },
  'sfx.touch-talk.teapot': { path: 'assets/audio/sfx/sfx.touch-talk.teapot.m4a', kind: 'sfx' },
  'sfx.touch-talk.frisbee': { path: 'assets/audio/sfx/sfx.touch-talk.frisbee.m4a', kind: 'sfx' },
  'sfx.touch-talk.radio': { path: 'assets/audio/sfx/sfx.touch-talk.radio.m4a', kind: 'sfx' },
  'sfx.touch-talk.cooler': { path: 'assets/audio/sfx/sfx.touch-talk.cooler.m4a', kind: 'sfx' },
  'sfx.touch-talk.pillow': { path: 'assets/audio/sfx/sfx.touch-talk.pillow.m4a', kind: 'sfx' },
  'sfx.touch-talk.butterfly': { path: 'assets/audio/sfx/sfx.touch-talk.butterfly.m4a', kind: 'sfx' },
  /** Island background loop, mastered to −30 LUFS (EXPERIENCE › Âm thanh: music ≤ −30 LUFS). */
  'music.island': { path: 'assets/audio/music/music.island.m4a', kind: 'music', loop: true },
};

export function isAudioId(id: string): id is AudioId {
  return Object.prototype.hasOwnProperty.call(AUDIO_CATALOG, id);
}
