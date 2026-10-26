import './styles/stage.css';
import { AUTO, Game, Scale, type Types } from 'phaser';
import { Tokens } from './core/tokens';
import { installPageGuards, installRotationSafeScaleManager } from './core/stage';
import { audio, type SoundLike } from './core/audio-director';
import { registerServiceWorker } from './core/sw';
import { SHARED_POINTERS } from './core/input/guard';
import { GAME_SCENES } from './games/registry';
import { AudioUnlockOverlay } from './scenes/AudioUnlockOverlay';
import { Boot } from './scenes/Boot';
import { Hud } from './scenes/Hud';
import { HomeYard } from './scenes/HomeYard';
import { MapScene } from './scenes/Map';
import { Start } from './scenes/Start';

/**
 * Touch pointers Phaser tracks. More than one so a second finger (thumb holding the iPad,
 * a parent pointing) is seen and can be *ignored* by InputGuard (first finger wins, AD-4)
 * instead of being silently dropped, and so Hud can accept a second pointer when allowed.
 */
const ACTIVE_POINTERS = SHARED_POINTERS;

const config: Types.Core.GameConfig = {
  type: AUTO,
  parent: 'game-container',
  width: Tokens.design.width,
  height: Tokens.design.height,
  backgroundColor: Tokens.colors.sky.css,
  scale: {
    mode: Scale.ENVELOP,
    autoCenter: Scale.CENTER_BOTH,
  },
  input: {
    activePointers: ACTIVE_POINTERS,
  },
  // The games between Map and Hud, so Hud renders above them (Story 1.7); Story 7.1: the yard shell scene
  // (HomeYard) right after Map, below its games;
  // AudioUnlockOverlay last so it renders above the shell scenes (it also bringToTop()s on wake).
  scene: [Boot, Start, MapScene, HomeYard, ...GAME_SCENES, Hud, AudioUnlockOverlay],
};

installPageGuards();
installRotationSafeScaleManager();
document.body.style.backgroundColor = Tokens.colors.sky.css;

// Story 1.11: register the precaching service worker once, before the game boots (Boot's readiness
// gate reads the same promise). Skipped in dev; an update waits for the next cold open (no reload).
registerServiceWorker('serviceWorker' in navigator ? navigator.serviceWorker : undefined, import.meta.env.DEV);

const game = new Game(config);
// The only place outside core/ that touches the sound manager: hand it to AudioDirector, which
// wraps Phaser's unlock and the visibility handling. WebAudioSoundManager satisfies SoundLike.
// `navigator` lets it set audioSession.type = 'playback' (the silent switch must not mute the app).
audio.attach(game.sound satisfies SoundLike, document, navigator);

