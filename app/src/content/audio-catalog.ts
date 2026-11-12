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
  'sfx.animal-pens.dog.call',
  'sfx.animal-pens.dog.muffled',
  'sfx.animal-pens.cat.call',
  'sfx.animal-pens.cat.muffled',
  'sfx.animal-pens.rooster.call',
  'sfx.animal-pens.rooster.muffled',
  'sfx.animal-pens.cow.call',
  'sfx.animal-pens.cow.muffled',
  'sfx.animal-pens.pig.call',
  'sfx.animal-pens.pig.muffled',
  'sfx.animal-pens.sheep.call',
  'sfx.animal-pens.sheep.muffled',
  'sfx.animal-pens.horse.call',
  'sfx.animal-pens.horse.muffled',
  'sfx.band.drum.c4',
  'sfx.band.drum.d4',
  'sfx.band.drum.e4',
  'sfx.band.drum.g4',
  'sfx.band.drum.a4',
  'sfx.band.horn.e4',
  'sfx.band.horn.g4',
  'sfx.band.horn.a4',
  'sfx.band.horn.c5',
  'sfx.band.horn.d5',
  'sfx.band.frog.g4',
  'sfx.band.frog.a4',
  'sfx.band.frog.c5',
  'sfx.band.frog.d5',
  'sfx.band.frog.e5',
  'sfx.band.xylophone.c5',
  'sfx.band.xylophone.d5',
  'sfx.band.xylophone.e5',
  'sfx.band.xylophone.g5',
  'sfx.band.xylophone.a5',
  'sfx.band.bell.g5',
  'sfx.band.bell.a5',
  'sfx.band.bell.c6',
  'sfx.band.bell.d6',
  'sfx.band.bell.e6',
  'music.band-beat',
  'sfx.bedtime.giggle',
  'sfx.bedtime.yawn',
  'sfx.bedtime.snore',
  'sfx.bedtime.sigh',
  'sfx.bedtime.click',
  'sfx.bedtime.blanket',
  'music.bedtime-lullaby',
  'sfx.pet-clinic.splash',
  'sfx.pet-clinic.burp',
  'sfx.pet-clinic.gurgle',
  'sfx.pet-clinic.pat',
  'sfx.dress-up.pop',
  'sfx.garden.pour',
  'sfx.garden.pop',
  'sfx.garden.crunch',
  'sfx.garden.slurp',
  'sfx.car-wash.squish',
  'sfx.car-wash.chime',
  'sfx.car-wash.fire-siren',
  'sfx.car-wash.ambulance-siren',
  'sfx.car-wash.honk-low',
  'sfx.plane.propeller',
  'sfx.plane.whoosh',
  'sfx.plane.boing',
  'sfx.train.toot',
  'sfx.train.chug',
  'sfx.train.puff',
  'sfx.train.hiss',
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
  /** Chạm là nói (Stories 4.5, 4.6; 2026-10-22 batch 3): every prop plays a real CC0 recording (Freesound, README provenance), trimmed to ≤ 0.8 s and mastered with `npm run audio:normalize` (50 ms fade-in, −20 LUFS, true peak ≤ −3 dBFS). Creature voices (`creature: true`) are lowered to a −19.5 dBFS peak and measured by `npm run audio:check`. Load with the game. */
  /** Sea: a short ship-horn toot (Freesound #468846, CC0). */
  'sfx.touch-talk.boat': { path: 'assets/audio/sfx/sfx.touch-talk.boat.m4a', kind: 'sfx' },
  /** Sea: a small water splash (Freesound #737233, CC0). */
  'sfx.touch-talk.fish': { path: 'assets/audio/sfx/sfx.touch-talk.fish.m4a', kind: 'sfx' },
  /** Sea: quick claw clicks (Freesound #321604, CC0). */
  'sfx.touch-talk.crab': { path: 'assets/audio/sfx/sfx.touch-talk.crab.m4a', kind: 'sfx' },
  /** Sea: a magic sparkle twinkle (Freesound #511485, CC0). */
  'sfx.touch-talk.starfish': { path: 'assets/audio/sfx/sfx.touch-talk.starfish.m4a', kind: 'sfx' },
  /** Sea: an umbrella whooshing open (Freesound #629989, CC0). */
  'sfx.touch-talk.parasol': { path: 'assets/audio/sfx/sfx.touch-talk.parasol.m4a', kind: 'sfx' },
  /** Sea: a plastic shovel digging wet sand (Freesound #651293, CC0). */
  'sfx.touch-talk.bucket': { path: 'assets/audio/sfx/sfx.touch-talk.bucket.m4a', kind: 'sfx' },
  /** Sea: a seagull's single call (Freesound #263786, CC0), creature. */
  'sfx.touch-talk.seagull': { path: 'assets/audio/sfx/sfx.touch-talk.seagull.m4a', kind: 'sfx', creature: true },
  /** Sea: a hollow wooden knock (Freesound #364704, CC0). */
  'sfx.touch-talk.coconut': { path: 'assets/audio/sfx/sfx.touch-talk.coconut.m4a', kind: 'sfx' },
  /** Sea: a sea wave swelling (the sea in the shell) (Freesound #441852, CC0). */
  'sfx.touch-talk.shell': { path: 'assets/audio/sfx/sfx.touch-talk.shell.m4a', kind: 'sfx' },
  /** Sea: a plastic ball bonk (Freesound #117111, CC0). */
  'sfx.touch-talk.beach-ball': { path: 'assets/audio/sfx/sfx.touch-talk.beach-ball.m4a', kind: 'sfx' },
  /** Street: a "beep beep" car horn (Freesound #423990, CC0). */
  'sfx.touch-talk.car': { path: 'assets/audio/sfx/sfx.touch-talk.car.m4a', kind: 'sfx' },
  /** Street: the bus doors hissing shut (Freesound #446523, CC0). */
  'sfx.touch-talk.bus': { path: 'assets/audio/sfx/sfx.touch-talk.bus.m4a', kind: 'sfx' },
  /** Street: two crosswalk bleeps (Freesound #267471, CC0). */
  'sfx.touch-talk.traffic-light': { path: 'assets/audio/sfx/sfx.touch-talk.traffic-light.m4a', kind: 'sfx' },
  /** Street: leaves rustling (Freesound #538152, CC0). */
  'sfx.touch-talk.tree': { path: 'assets/audio/sfx/sfx.touch-talk.tree.m4a', kind: 'sfx' },
  /** Street: a doorbell ding (Freesound #458868, CC0). */
  'sfx.touch-talk.house': { path: 'assets/audio/sfx/sfx.touch-talk.house.m4a', kind: 'sfx' },
  /** Street: a short "wee-woo" whoop (Freesound #536773, CC0). */
  'sfx.touch-talk.police-car': { path: 'assets/audio/sfx/sfx.touch-talk.police-car.m4a', kind: 'sfx' },
  /** Street: a soft truck-horn toot (Freesound #513741, CC0). */
  'sfx.touch-talk.truck': { path: 'assets/audio/sfx/sfx.touch-talk.truck.m4a', kind: 'sfx' },
  /** Street: a tractor engine chugging (Freesound #707745, CC0). */
  'sfx.touch-talk.tractor': { path: 'assets/audio/sfx/sfx.touch-talk.tractor.m4a', kind: 'sfx' },
  /** Street: a bin lid closing (Freesound #400826, CC0). */
  'sfx.touch-talk.dumpster': { path: 'assets/audio/sfx/sfx.touch-talk.dumpster.m4a', kind: 'sfx' },
  /** Street: a hollow plastic donk (Freesound #455196, CC0). */
  'sfx.touch-talk.cone': { path: 'assets/audio/sfx/sfx.touch-talk.cone.m4a', kind: 'sfx' },
  /** Kitchen: water bubbling in a pot (Freesound #532735, CC0). */
  'sfx.touch-talk.pot': { path: 'assets/audio/sfx/sfx.touch-talk.pot.m4a', kind: 'sfx' },
  /** Kitchen: a sizzle in the pan (Freesound #234124, CC0). */
  'sfx.touch-talk.frying-pan': { path: 'assets/audio/sfx/sfx.touch-talk.frying-pan.m4a', kind: 'sfx' },
  /** Kitchen: a crunchy apple bite (Freesound #584290, CC0). */
  'sfx.touch-talk.apple': { path: 'assets/audio/sfx/sfx.touch-talk.apple.m4a', kind: 'sfx' },
  /** Kitchen: a knife sawing bread (Freesound #419756, CC0). */
  'sfx.touch-talk.bread': { path: 'assets/audio/sfx/sfx.touch-talk.bread.m4a', kind: 'sfx' },
  /** Kitchen: a banana peel tearing (Freesound #398763, CC0). */
  'sfx.touch-talk.banana': { path: 'assets/audio/sfx/sfx.touch-talk.banana.m4a', kind: 'sfx' },
  /** Kitchen: a knife chopping a vegetable (Freesound #839155, CC0). */
  'sfx.touch-talk.carrot': { path: 'assets/audio/sfx/sfx.touch-talk.carrot.m4a', kind: 'sfx' },
  /** Kitchen: a slurp (Freesound #426324, CC0). */
  'sfx.touch-talk.mug': { path: 'assets/audio/sfx/sfx.touch-talk.mug.m4a', kind: 'sfx' },
  /** Kitchen: a teaspoon clinking in a cup (Freesound #724608, CC0). */
  'sfx.touch-talk.spoon': { path: 'assets/audio/sfx/sfx.touch-talk.spoon.m4a', kind: 'sfx' },
  /** Kitchen: an egg cracking (Freesound #244749, CC0). */
  'sfx.touch-talk.egg': { path: 'assets/audio/sfx/sfx.touch-talk.egg.m4a', kind: 'sfx' },
  /** Kitchen: a juicy watermelon squelch (Freesound #159669, CC0). */
  'sfx.touch-talk.watermelon': { path: 'assets/audio/sfx/sfx.touch-talk.watermelon.m4a', kind: 'sfx' },
  /** Bathroom: a bath splash (Freesound #333351, CC0). */
  'sfx.touch-talk.bathtub': { path: 'assets/audio/sfx/sfx.touch-talk.bathtub.m4a', kind: 'sfx' },
  /** Bathroom: a rubber-duck squeak (a toy, not a creature) (Freesound #685067, CC0). */
  'sfx.touch-talk.rubber-duck': { path: 'assets/audio/sfx/sfx.touch-talk.rubber-duck.m4a', kind: 'sfx' },
  /** Bathroom: a toothbrush scrubbing (Freesound #426369, CC0). */
  'sfx.touch-talk.toothbrush': { path: 'assets/audio/sfx/sfx.touch-talk.toothbrush.m4a', kind: 'sfx' },
  /** Bathroom: a clink in a glass (Freesound #837694, CC0). */
  'sfx.touch-talk.toothbrush-cup': { path: 'assets/audio/sfx/sfx.touch-talk.toothbrush-cup.m4a', kind: 'sfx' },
  /** Bathroom: a cloth flap (Freesound #391945, CC0). */
  'sfx.touch-talk.towel': { path: 'assets/audio/sfx/sfx.touch-talk.towel.m4a', kind: 'sfx' },
  /** Bathroom: two slipper shuffles (Freesound #848697, CC0). */
  'sfx.touch-talk.slippers': { path: 'assets/audio/sfx/sfx.touch-talk.slippers.m4a', kind: 'sfx' },
  /** Bathroom: a fairy-bell shimmer (Freesound #759840, CC0). */
  'sfx.touch-talk.mirror': { path: 'assets/audio/sfx/sfx.touch-talk.mirror.m4a', kind: 'sfx' },
  /** Bathroom: a squeeze-bottle squirt (Freesound #630484, CC0). */
  'sfx.touch-talk.shampoo': { path: 'assets/audio/sfx/sfx.touch-talk.shampoo.m4a', kind: 'sfx' },
  /** Bathroom: a bubble pop (Freesound #669918, CC0). */
  'sfx.touch-talk.soap': { path: 'assets/audio/sfx/sfx.touch-talk.soap.m4a', kind: 'sfx' },
  /** Bathroom: a toilet flush (Freesound #792460, CC0). */
  'sfx.touch-talk.potty': { path: 'assets/audio/sfx/sfx.touch-talk.potty.m4a', kind: 'sfx' },
  /** Bakery: a party horn (Freesound #170583, CC0). */
  'sfx.touch-talk.birthday-cake': { path: 'assets/audio/sfx/sfx.touch-talk.birthday-cake.m4a', kind: 'sfx' },
  /** Bakery: a cartoon "boing" (jaw harp) (Freesound #540790, CC0). */
  'sfx.touch-talk.cupcake': { path: 'assets/audio/sfx/sfx.touch-talk.cupcake.m4a', kind: 'sfx' },
  /** Bakery: a cork "pop" (Freesound #741368, CC0). */
  'sfx.touch-talk.donut': { path: 'assets/audio/sfx/sfx.touch-talk.donut.m4a', kind: 'sfx' },
  /** Bakery: a cookie crunch (Freesound #444786, CC0). */
  'sfx.touch-talk.cookie': { path: 'assets/audio/sfx/sfx.touch-talk.cookie.m4a', kind: 'sfx' },
  /** Bakery: a dry flaky crackle (Freesound #723851, CC0). */
  'sfx.touch-talk.croissant': { path: 'assets/audio/sfx/sfx.touch-talk.croissant.m4a', kind: 'sfx' },
  /** Bakery: a soft squish (Freesound #536765, CC0). */
  'sfx.touch-talk.muffin': { path: 'assets/audio/sfx/sfx.touch-talk.muffin.m4a', kind: 'sfx' },
  /** Bakery: a toaster popping up (Freesound #444430, CC0). */
  'sfx.touch-talk.waffle': { path: 'assets/audio/sfx/sfx.touch-talk.waffle.m4a', kind: 'sfx' },
  /** Bakery: an egg-timer bell "ding" (out of the oven) (Freesound #490326, CC0). */
  'sfx.touch-talk.apple-pie': { path: 'assets/audio/sfx/sfx.touch-talk.apple-pie.m4a', kind: 'sfx' },
  /** Bakery: a swirly slide whistle (Freesound #403002, CC0). */
  'sfx.touch-talk.cinnamon-roll': { path: 'assets/audio/sfx/sfx.touch-talk.cinnamon-roll.m4a', kind: 'sfx' },
  /** Bakery: a yummy "mmm!" (Freesound #170789, CC0). */
  'sfx.touch-talk.chocolate-cake': { path: 'assets/audio/sfx/sfx.touch-talk.chocolate-cake.m4a', kind: 'sfx' },
  /** Picnic: a wicker creak (Freesound #687265, CC0). */
  'sfx.touch-talk.picnic-basket': { path: 'assets/audio/sfx/sfx.touch-talk.picnic-basket.m4a', kind: 'sfx' },
  /** Picnic: a soft chomp (Freesound #723601, CC0). */
  'sfx.touch-talk.sandwich': { path: 'assets/audio/sfx/sfx.touch-talk.sandwich.m4a', kind: 'sfx' },
  /** Picnic: a juicy squish (Freesound #242425, CC0). */
  'sfx.touch-talk.grapes': { path: 'assets/audio/sfx/sfx.touch-talk.grapes.m4a', kind: 'sfx' },
  /** Picnic: a little mouse squeak (Freesound #800274, CC0), creature. */
  'sfx.touch-talk.cheese': { path: 'assets/audio/sfx/sfx.touch-talk.cheese.m4a', kind: 'sfx', creature: true },
  /** Picnic: tea pouring (Freesound #335258, CC0). */
  'sfx.touch-talk.teapot': { path: 'assets/audio/sfx/sfx.touch-talk.teapot.m4a', kind: 'sfx' },
  /** Picnic: a whirling flying disc (Freesound #807248, CC0). */
  'sfx.touch-talk.frisbee': { path: 'assets/audio/sfx/sfx.touch-talk.frisbee.m4a', kind: 'sfx' },
  /** Picnic: a xylophone run (music) (Freesound #468152, CC0). */
  'sfx.touch-talk.radio': { path: 'assets/audio/sfx/sfx.touch-talk.radio.m4a', kind: 'sfx' },
  /** Picnic: an ice cube clacking on the cooler lid (Freesound #406123, CC0). */
  'sfx.touch-talk.cooler': { path: 'assets/audio/sfx/sfx.touch-talk.cooler.m4a', kind: 'sfx' },
  /** Picnic: a soft pillow thump (Freesound #640870, CC0). */
  'sfx.touch-talk.pillow': { path: 'assets/audio/sfx/sfx.touch-talk.pillow.m4a', kind: 'sfx' },
  /** Picnic: a light wing flutter (Freesound #402450, CC0). */
  'sfx.touch-talk.butterfly': { path: 'assets/audio/sfx/sfx.touch-talk.butterfly.m4a', kind: 'sfx' },
  /** Ú òa chuồng thú (Story 7.2): each animal's real call (Freesound CC0, README provenance), trimmed (and sped up where longer) to ≤ 0.8 s, high-passed (≥ 200 Hz), mastered with `npm run audio:normalize`, its peak lowered to −19.5 dBFS (creature, `npm run audio:check`). `.muffled`: the same call lowpassed at 900 Hz with its peak at −30 dBFS, played while the door wiggles. Load with the game. */
  /** two small-dog barks ("gâu gâu") (Freesound #163459, CC0), creature. */
  'sfx.animal-pens.dog.call': { path: 'assets/audio/sfx/sfx.animal-pens.dog.call.m4a', kind: 'sfx', creature: true },
  'sfx.animal-pens.dog.muffled': { path: 'assets/audio/sfx/sfx.animal-pens.dog.muffled.m4a', kind: 'sfx', creature: true },
  /** a cat meow (Freesound #436541, CC0), creature. */
  'sfx.animal-pens.cat.call': { path: 'assets/audio/sfx/sfx.animal-pens.cat.call.m4a', kind: 'sfx', creature: true },
  'sfx.animal-pens.cat.muffled': { path: 'assets/audio/sfx/sfx.animal-pens.cat.muffled.m4a', kind: 'sfx', creature: true },
  /** a rooster crow, sped up to fit 0.8 s (Freesound #435508, CC0), creature. */
  'sfx.animal-pens.rooster.call': { path: 'assets/audio/sfx/sfx.animal-pens.rooster.call.m4a', kind: 'sfx', creature: true },
  'sfx.animal-pens.rooster.muffled': { path: 'assets/audio/sfx/sfx.animal-pens.rooster.muffled.m4a', kind: 'sfx', creature: true },
  /** a cow moo, sped up to fit 0.8 s (Freesound #275154, CC0), creature. */
  'sfx.animal-pens.cow.call': { path: 'assets/audio/sfx/sfx.animal-pens.cow.call.m4a', kind: 'sfx', creature: true },
  'sfx.animal-pens.cow.muffled': { path: 'assets/audio/sfx/sfx.animal-pens.cow.muffled.m4a', kind: 'sfx', creature: true },
  /** a pig oink (Freesound #442906, CC0), creature. */
  'sfx.animal-pens.pig.call': { path: 'assets/audio/sfx/sfx.animal-pens.pig.call.m4a', kind: 'sfx', creature: true },
  'sfx.animal-pens.pig.muffled': { path: 'assets/audio/sfx/sfx.animal-pens.pig.muffled.m4a', kind: 'sfx', creature: true },
  /** a ewe baa, sped up (Freesound #677221, CC0), creature. */
  'sfx.animal-pens.sheep.call': { path: 'assets/audio/sfx/sfx.animal-pens.sheep.call.m4a', kind: 'sfx', creature: true },
  'sfx.animal-pens.sheep.muffled': { path: 'assets/audio/sfx/sfx.animal-pens.sheep.muffled.m4a', kind: 'sfx', creature: true },
  /** a horse whinny, sped up (Freesound #269571, CC0), creature. */
  'sfx.animal-pens.horse.call': { path: 'assets/audio/sfx/sfx.animal-pens.horse.call.m4a', kind: 'sfx', creature: true },
  'sfx.animal-pens.horse.muffled': { path: 'assets/audio/sfx/sfx.animal-pens.horse.muffled.m4a', kind: 'sfx', creature: true },
  /** Ban nhạc (Story 7.3): a soft pitched tom, synthesised (tools/audio/make-band.ts). */
  'sfx.band.drum.c4': { path: 'assets/audio/sfx/sfx.band.drum.c4.m4a', kind: 'sfx' },
  'sfx.band.drum.d4': { path: 'assets/audio/sfx/sfx.band.drum.d4.m4a', kind: 'sfx' },
  'sfx.band.drum.e4': { path: 'assets/audio/sfx/sfx.band.drum.e4.m4a', kind: 'sfx' },
  'sfx.band.drum.g4': { path: 'assets/audio/sfx/sfx.band.drum.g4.m4a', kind: 'sfx' },
  'sfx.band.drum.a4': { path: 'assets/audio/sfx/sfx.band.drum.a4.m4a', kind: 'sfx' },
  /** Ban nhạc (Story 7.3): a toy horn, synthesised (tools/audio/make-band.ts). */
  'sfx.band.horn.e4': { path: 'assets/audio/sfx/sfx.band.horn.e4.m4a', kind: 'sfx' },
  'sfx.band.horn.g4': { path: 'assets/audio/sfx/sfx.band.horn.g4.m4a', kind: 'sfx' },
  'sfx.band.horn.a4': { path: 'assets/audio/sfx/sfx.band.horn.a4.m4a', kind: 'sfx' },
  'sfx.band.horn.c5': { path: 'assets/audio/sfx/sfx.band.horn.c5.m4a', kind: 'sfx' },
  'sfx.band.horn.d5': { path: 'assets/audio/sfx/sfx.band.horn.d5.m4a', kind: 'sfx' },
  /** Ban nhạc (Story 7.3): the singer frog's croak "ộp ộp" (creature), synthesised (tools/audio/make-band.ts). */
  'sfx.band.frog.g4': { path: 'assets/audio/sfx/sfx.band.frog.g4.m4a', kind: 'sfx', creature: true },
  'sfx.band.frog.a4': { path: 'assets/audio/sfx/sfx.band.frog.a4.m4a', kind: 'sfx', creature: true },
  'sfx.band.frog.c5': { path: 'assets/audio/sfx/sfx.band.frog.c5.m4a', kind: 'sfx', creature: true },
  'sfx.band.frog.d5': { path: 'assets/audio/sfx/sfx.band.frog.d5.m4a', kind: 'sfx', creature: true },
  'sfx.band.frog.e5': { path: 'assets/audio/sfx/sfx.band.frog.e5.m4a', kind: 'sfx', creature: true },
  /** Ban nhạc (Story 7.3): a wooden xylophone bar, synthesised (tools/audio/make-band.ts). */
  'sfx.band.xylophone.c5': { path: 'assets/audio/sfx/sfx.band.xylophone.c5.m4a', kind: 'sfx' },
  'sfx.band.xylophone.d5': { path: 'assets/audio/sfx/sfx.band.xylophone.d5.m4a', kind: 'sfx' },
  'sfx.band.xylophone.e5': { path: 'assets/audio/sfx/sfx.band.xylophone.e5.m4a', kind: 'sfx' },
  'sfx.band.xylophone.g5': { path: 'assets/audio/sfx/sfx.band.xylophone.g5.m4a', kind: 'sfx' },
  'sfx.band.xylophone.a5': { path: 'assets/audio/sfx/sfx.band.xylophone.a5.m4a', kind: 'sfx' },
  /** Ban nhạc (Story 7.3): a small bell, synthesised (tools/audio/make-band.ts). */
  'sfx.band.bell.g5': { path: 'assets/audio/sfx/sfx.band.bell.g5.m4a', kind: 'sfx' },
  'sfx.band.bell.a5': { path: 'assets/audio/sfx/sfx.band.bell.a5.m4a', kind: 'sfx' },
  'sfx.band.bell.c6': { path: 'assets/audio/sfx/sfx.band.bell.c6.m4a', kind: 'sfx' },
  'sfx.band.bell.d6': { path: 'assets/audio/sfx/sfx.band.bell.d6.m4a', kind: 'sfx' },
  'sfx.band.bell.e6': { path: 'assets/audio/sfx/sfx.band.bell.e6.m4a', kind: 'sfx' },
  /** Ban nhạc (Story 7.3): the soft idle beat — a tom and shaker loop of 4 beats at 80 BPM (3 s), mastered to ≤ −30 LUFS, synthesised (tools/audio/make-band.ts). Music channel: ducked under every voice line. */
  'music.band-beat': { path: 'assets/audio/music/music.band-beat.m4a', kind: 'music', loop: true },
  /** Giờ đi ngủ (Story 7.4): every sound synthesised by our own recipes (tools/audio/make-bedtime.ts): ≤ 0.8 s, a 50 ms fade-in, nothing below 150 Hz, quiet. Shiba's voice (giggle, yawn, snore, sigh) is a creature sound. Load with the game. */
  /** Shiba giggles "hi hi hi": three soft voiced chirps stepping up (E5 G5 A5), 0.5 s. */
  'sfx.bedtime.giggle': { path: 'assets/audio/sfx/sfx.bedtime.giggle.m4a', kind: 'sfx', creature: true },
  /** Shiba yawns: a voiced glide 520 → 330 Hz with a breath, 0.8 s. */
  'sfx.bedtime.yawn': { path: 'assets/audio/sfx/sfx.bedtime.yawn.m4a', kind: 'sfx', creature: true },
  /** Shiba's soft "khò khò": two breathy syllables, 0.8 s. */
  'sfx.bedtime.snore': { path: 'assets/audio/sfx/sfx.bedtime.snore.m4a', kind: 'sfx', creature: true },
  /** Shiba's soft sigh as it rolls over in its sleep, 0.75 s. */
  'sfx.bedtime.sigh': { path: 'assets/audio/sfx/sfx.bedtime.sigh.m4a', kind: 'sfx', creature: true },
  /** The lamp's soft click, 0.2 s. */
  'sfx.bedtime.click': { path: 'assets/audio/sfx/sfx.bedtime.click.m4a', kind: 'sfx' },
  /** The blanket's soft rustle, 0.7 s. */
  'sfx.bedtime.blanket': { path: 'assets/audio/sfx/sfx.bedtime.blanket.m4a', kind: 'sfx' },
  /** Giờ đi ngủ (Story 7.4): the lullaby — an original 24 s music-box tune on C-major pentatonic at 60 BPM, looped, mastered to ≤ −30 LUFS (tools/audio/make-bedtime.ts). Music channel: ducked under every voice line. */
  'music.bedtime-lullaby': { path: 'assets/audio/music/music.bedtime-lullaby.m4a', kind: 'music', loop: true },
  /** Bác sĩ thú cưng (Story 8.1): our own ffmpeg recipes (tools/audio/make-pet-clinic.ts): ≤ 0.8 s, a 50 ms fade-in, nothing below 150 Hz, quiet. The patient's voice (burp, gurgle) is a creature sound. Load with the game. */
  /** The shower's soft splash: band-passed noise with a little sparkle, 0.7 s. */
  'sfx.pet-clinic.splash': { path: 'assets/audio/sfx/sfx.pet-clinic.splash.m4a', kind: 'sfx' },
  /** The full patient's small burp: a short voiced "ợ" with a falling pitch, 0.4 s. */
  'sfx.pet-clinic.burp': { path: 'assets/audio/sfx/sfx.pet-clinic.burp.m4a', kind: 'sfx', creature: true },
  /** The hungry tummy rumbles: a soft fluttering gurgle (all above 150 Hz), 0.7 s. */
  'sfx.pet-clinic.gurgle': { path: 'assets/audio/sfx/sfx.pet-clinic.gurgle.m4a', kind: 'sfx', creature: true },
  /** Two soft pats on the plaster, 0.35 s. */
  'sfx.pet-clinic.pat': { path: 'assets/audio/sfx/sfx.pet-clinic.pat.m4a', kind: 'sfx' },
  /** Thay đồ cho Shiba (Story 8.2): the soft pop of an item coming off Shiba (our own ffmpeg recipe, tools/audio/make-dress-up.ts): 0.25 s, a 50 ms fade-in, nothing below 150 Hz, quiet. Load with the game. */
  'sfx.dress-up.pop': { path: 'assets/audio/sfx/sfx.dress-up.pop.m4a', kind: 'sfx' },
  /** Trồng cây (2026-10-30): our own ffmpeg recipes (tools/audio/make-garden.ts): ≤ 0.8 s, a 50 ms fade-in, nothing below 150 Hz, quiet. The water pouring from the can; a soft pop (a growth step, a pick, the packets); Shiba's crunch and slurp (creature sounds: its mouth). Load with the game. */
  'sfx.garden.pour': { path: 'assets/audio/sfx/sfx.garden.pour.m4a', kind: 'sfx' },
  'sfx.garden.pop': { path: 'assets/audio/sfx/sfx.garden.pop.m4a', kind: 'sfx' },
  'sfx.garden.crunch': { path: 'assets/audio/sfx/sfx.garden.crunch.m4a', kind: 'sfx', creature: true },
  'sfx.garden.slurp': { path: 'assets/audio/sfx/sfx.garden.slurp.m4a', kind: 'sfx', creature: true },
  /** Rửa xe (2026-10-30): our own ffmpeg recipes (tools/audio/make-car-wash.ts): ≤ 0.8 s, a 50 ms fade-in, nothing below 150 Hz, quiet. A mud spot squished under the foam; the soft chime of the clean car's sparkles; the fire truck's and the ambulance's own sirens (two-tone, short); the garbage truck's low honk. Load with the game. */
  'sfx.car-wash.squish': { path: 'assets/audio/sfx/sfx.car-wash.squish.m4a', kind: 'sfx' },
  'sfx.car-wash.chime': { path: 'assets/audio/sfx/sfx.car-wash.chime.m4a', kind: 'sfx' },
  'sfx.car-wash.fire-siren': { path: 'assets/audio/sfx/sfx.car-wash.fire-siren.m4a', kind: 'sfx' },
  'sfx.car-wash.ambulance-siren': { path: 'assets/audio/sfx/sfx.car-wash.ambulance-siren.m4a', kind: 'sfx' },
  'sfx.car-wash.honk-low': { path: 'assets/audio/sfx/sfx.car-wash.honk-low.m4a', kind: 'sfx' },
  /** Phi công nhí (2026-11-11): our own ffmpeg recipes (tools/audio/make-plane.ts): ≤ 0.8 s, a 50 ms fade-in, nothing below 150 Hz, quiet. The toy propeller starting up (a soft purr that rises); the whoosh as the plane flies on; the soft "boing" of a cloud the plane bumps. Load with the game. */
  'sfx.plane.propeller': { path: 'assets/audio/sfx/sfx.plane.propeller.m4a', kind: 'sfx' },
  'sfx.plane.whoosh': { path: 'assets/audio/sfx/sfx.plane.whoosh.m4a', kind: 'sfx' },
  'sfx.plane.boing': { path: 'assets/audio/sfx/sfx.plane.boing.m4a', kind: 'sfx' },
  /** Tàu hỏa chở bạn (2026-11-12): our own ffmpeg recipes (tools/audio/make-train.ts): ≤ 0.8 s, a 50 ms fade-in, nothing below 150 Hz, quiet. The toy whistle's "tu tu" (two soft notes); the chug as the train pulls away; the soft puff of smoke from the chimney; the brakes' gentle hiss as it stops. Load with the game. */
  'sfx.train.toot': { path: 'assets/audio/sfx/sfx.train.toot.m4a', kind: 'sfx' },
  'sfx.train.chug': { path: 'assets/audio/sfx/sfx.train.chug.m4a', kind: 'sfx' },
  'sfx.train.puff': { path: 'assets/audio/sfx/sfx.train.puff.m4a', kind: 'sfx' },
  'sfx.train.hiss': { path: 'assets/audio/sfx/sfx.train.hiss.m4a', kind: 'sfx' },
  /** Island background loop, mastered to −30 LUFS (EXPERIENCE › Âm thanh: music ≤ −30 LUFS). */
  'music.island': { path: 'assets/audio/music/music.island.m4a', kind: 'music', loop: true },
};

export function isAudioId(id: string): id is AudioId {
  return Object.prototype.hasOwnProperty.call(AUDIO_CATALOG, id);
}
