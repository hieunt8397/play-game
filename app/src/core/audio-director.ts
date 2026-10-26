// AudioDirector (AD-3): the ONLY code that plays sound. Scenes/games call it by catalog id
// (content/audio-catalog.ts) or voice-line id (content/voice-lines.ts); ESLint bans `this.sound`
// and audio paths there.
//
// It wraps Phaser's own unlock (`sound.locked` + the `'unlocked'` event, Sound.Events.UNLOCKED) and
// re-resumes the AudioContext on `visibilitychange`. When the page comes back and the context stays
// suspended (after the session was unlocked once), it emits `audio:suspended`; AudioUnlockOverlay
// then pauses the current scene behind a `button-play` and calls `unlock()` on the tap.
//
// Voice channel (Story 1.3, UX-DR66): one voice at a time. `say(id)` returns a token, and
// `speech:ended { token, completed }` fires exactly once per token (`completed: false` when the line
// is stopped, interrupted, dropped or unknown). Rules for a new request:
//   - same line (or chain) as the playing one → ignored, the playing token is returned;
//   - the playing line has < Timing.voiceQueueTailMs left → the new line waits in ONE pending slot
//     (a newer request replaces it; the replaced one ends completed:false);
//   - otherwise the playing line is cut (completed:false) and the new one plays.
// Lines play only while unlocked (a `say` while locked is held until `'unlocked'`). A hidden page
// stops current and pending voice (nothing resumes). While a line plays the music is ducked by
// 20 dB over musicDuckDownMs and restored musicDuckRestoreDelayMs after the channel goes idle —
// scheduled on the WebAudio gain param (audio clock), never with timers.
//
// Story 7.3 (the band): `note(id, cap)` plays an SFX as one voice of a capped pool. Past `cap` live notes the
// oldest is cut (its gain ramps to 0 over Timing.bandNoteCutMs on the audio clock, then it runs out silently);
// `stopNotes()` cuts them all (Home, hide). `musicId` names the current music loop (the band swaps the island
// loop for its beat and restores it).
//
// No runtime Phaser import: it depends on the small `SoundLike`/`DocLike` slices so it runs in node
// tests.
import {
  AUDIO_CATALOG,
  isAudioId,
  type AudioId,
  type AudioKind,
} from "../content/audio-catalog";
import { isVoiceLineId, type VoiceLineId } from "../content/voice-lines";
import { bus as appBus, type Bus } from "./bus";
import { Timing } from "./timing";

/** `Phaser.Sound.Events.UNLOCKED`. */
export const SOUND_UNLOCKED = "unlocked";
/** `Phaser.Sound.Events.COMPLETE`: playback reached the end (not emitted by `stop()`). */
export const SOUND_COMPLETE = "complete";
export const VISIBILITY_CHANGE = "visibilitychange";
const CONTEXT_RUNNING = "running";
const VISIBLE = "visible";

/** Music gain while a voice line plays: −20 dB (EXPERIENCE › Âm thanh asks for ≥ 18 dB). */
export const MUSIC_DUCK_DB = -20;
const DUCK_FACTOR = 10 ** (MUSIC_DUCK_DB / 20);
const MS_PER_S = 1000;

/** Slice of `AudioContext`. */
export interface AudioContextLike {
  readonly state: string;
  resume(): Promise<void>;
}

/** Slice of `AudioParam`. */
export interface AudioParamLike {
  readonly value: number;
  cancelScheduledValues(startTime: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
}

/** Slice of `GainNode` (`WebAudioSound.volumeNode`). */
export interface GainNodeLike {
  readonly gain: AudioParamLike;
  readonly context: { readonly currentTime: number };
}

/** Slice of `Phaser.Sound.BaseSound` / `WebAudioSound`. */
export interface SoundInstanceLike {
  play(): boolean;
  pause(): boolean;
  resume(): boolean;
  stop(): boolean;
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  once(event: string, fn: () => void): unknown;
  /** Seconds. */
  readonly duration: number;
  /** Current position in seconds. */
  seek: number;
  volume: number;
  destroy?(): void;
  /** WebAudio only. */
  readonly volumeNode?: GainNodeLike;
}

export interface SoundConfigLike {
  loop?: boolean;
  volume?: number;
}

/** Slice of `Phaser.Sound.WebAudioSoundManager` (`game.sound`). */
export interface SoundLike {
  readonly locked: boolean;
  readonly context?: AudioContextLike;
  once(event: string, fn: () => void): unknown;
  play(key: string, config?: SoundConfigLike): boolean;
  add(key: string, config?: SoundConfigLike): SoundInstanceLike;
}

/** Slice of `Document`. */
export interface DocLike {
  readonly visibilityState: string;
  addEventListener(type: string, fn: () => void): void;
}

/**
 * `navigator` (or a fake). Only `navigator.audioSession` (Audio Session API, Safari 16.4+) is read;
 * the DOM lib does not type it yet, hence `object` and an `in` check.
 */
export type NavigatorLike = object;

/** `navigator.audioSession.type` that keeps playing with the silent switch on. */
export const AUDIO_SESSION_PLAYBACK = "playback";

/** Sets the audio session type to `'playback'` when the API exists; a throw warns once and is ignored. */
export function setPlaybackSession(nav: NavigatorLike | undefined): void {
  try {
    if (!nav || !("audioSession" in nav)) return;
    const session = nav.audioSession;
    if (typeof session === "object" && session !== null) {
      (session as { type: string }).type = AUDIO_SESSION_PLAYBACK;
    }
  } catch (error) {
    console.warn("audio: navigator.audioSession.type = 'playback' failed", error);
  }
}

/** Ramps `instance`'s volume to `target` over `ms`, starting `delayMs` from now. */
export type RampVolume = (
  instance: SoundInstanceLike,
  target: number,
  ms: number,
  delayMs: number,
) => void;

/**
 * Default ramp: scheduled on the WebAudio gain param against the audio clock (no timers), so the
 * next ramp cancels a pending one through `cancelScheduledValues`. Without a gain node it sets
 * `volume` at once.
 */
export const rampVolume: RampVolume = (instance, target, ms, delayMs) => {
  const node = instance.volumeNode;
  if (!node) {
    instance.volume = target;
    return;
  }
  const gain = node.gain;
  const now = node.context.currentTime;
  const from = gain.value;
  const start = now + delayMs / MS_PER_S;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(from, now);
  if (start > now) gain.setValueAtTime(from, start);
  gain.linearRampToValueAtTime(target, start + ms / MS_PER_S);
};

export interface AudioDirectorDeps {
  bus?: Bus;
  /** Monotonic ms clock (default `performance.now`). */
  now?: () => number;
  /** Music ducking ramp (default `rampVolume`). */
  rampVolume?: RampVolume;
  /** Story 7.3 review: runs `fn` after `ms` (default setTimeout): releases a music loop once its fade-out ends. */
  schedule?: (fn: () => void, ms: number) => void;
}

interface PendingSfx {
  id: AudioId;
  at: number;
}

interface MusicState {
  id: AudioId;
  instance?: SoundInstanceLike;
  /** Story 7.3 review: the loop fades in over this long when it starts. */
  fadeInMs?: number;
}

/** One `say`/`sayChain`/`replayPrompt` request: one token, one or more lines back to back. */
interface Utterance {
  readonly token: number;
  readonly ids: readonly VoiceLineId[];
  /** Identity for the "same line" rule. */
  readonly key: string;
  index: number;
  instance?: SoundInstanceLike | undefined;
}

export class AudioDirector {
  private readonly bus: Bus;
  private readonly now: () => number;
  private readonly ramp: RampVolume;
  private readonly schedule: (fn: () => void, ms: number) => void;
  private sound: SoundLike | undefined;
  /** True once `unlock()` completed (the first Start tap) — gates `audio:suspended`. */
  private sessionUnlocked = false;
  /** `audio:suspended` already emitted and not yet answered by `unlock()`. */
  private suspendedEmitted = false;
  private pendingSfx: PendingSfx[] = [];
  private current: MusicState | undefined;
  private unlockWaiters: Array<() => void> = [];
  private lastToken = 0;
  /** The utterance on the voice channel. */
  private voice: Utterance | undefined;
  /** One waiting utterance (queue tail, or held while locked). */
  private pendingVoice: Utterance | undefined;
  /** While `request` rearranges the channel, cut tokens wait here so a listener's `say` sees settled state. */
  private heldEnds: number[] | undefined;
  /** Story 3.1: `speech:line` events of lines started while `request` rearranges the channel. */
  private heldLines: Array<{ token: number; index: number; id: string }> | undefined;
  /** The Speaker's prompt: one line, or a chain (Story 2.4) replayed back to back. */
  private prompt: readonly VoiceLineId[] | undefined;
  /** Music is (being) ducked for the voice channel. */
  private ducked = false;
  /** Story 5.3: instances fading out after `fadeOut` — already off the channel, stopped on complete, on the next utterance or on hide. */
  private readonly fading = new Set<SoundInstanceLike>();
  /** Story 5.3: while a skip runs, `sfx()` is dropped (no SFX burst). */
  private sfxHeld = false;
  /** Story 7.3: the live pooled notes, oldest first (`note`). */
  private notes: SoundInstanceLike[] = [];

  constructor(deps: AudioDirectorDeps = {}) {
    this.bus = deps.bus ?? appBus;
    this.now = deps.now ?? (() => performance.now());
    this.ramp = deps.rampVolume ?? rampVolume;
    this.schedule = deps.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
  }

  /**
   * Called once from main.ts right after `new Game` with `game.sound`, `document` and `navigator`.
   * When `nav.audioSession` exists (Safari 16.4+), its type becomes `'playback'` so the iPad's silent
   * switch does not mute the app (Story 1.11).
   */
  attach(sound: SoundLike, doc: DocLike, nav?: NavigatorLike): void {
    if (this.sound) {
      console.warn("audio: attach() called twice — ignored");
      return;
    }
    this.sound = sound;
    setPlaybackSession(nav);
    if (sound.locked) sound.once(SOUND_UNLOCKED, () => this.onUnlocked());
    doc.addEventListener(VISIBILITY_CHANGE, () => {
      if (doc.visibilityState === VISIBLE) void this.onVisible();
      else this.onHidden();
    });
  }

  /** True after the session was unlocked by a tap (`unlock()` resolved). */
  get isUnlocked(): boolean {
    return this.sessionUnlocked;
  }

  /**
   * Call from the tap handler (inside the user gesture). Resolves on Phaser's `'unlocked'` when the
   * sound manager is still locked; otherwise resumes a suspended context right away.
   * Resolves `true` when the AudioContext runs afterwards, `false` when it is still suspended (the
   * overlay then stays up for another tap).
   */
  async unlock(): Promise<boolean> {
    const sound = this.sound;
    if (!sound) return false;
    if (sound.locked) {
      await new Promise<void>((resolve) => this.unlockWaiters.push(resolve));
    } else {
      await this.resumeContext(sound);
    }
    this.sessionUnlocked = true;
    if (!this.contextRunning(sound)) return false;
    this.suspendedEmitted = false;
    this.resumeMusic();
    return true;
  }

  /** Plays a one-shot SFX. While locked it waits for `'unlocked'`, then plays only if still fresh. */
  sfx(id: string): void {
    const audioId = this.checkId(id, "sfx");
    if (!audioId || !this.sound || this.sfxHeld) return;
    if (this.sound.locked) {
      this.pendingSfx.push({ id: audioId, at: this.now() });
      return;
    }
    this.playSfx(audioId);
  }

  /** Starts a music loop (no-op when the same id is already current). Starts on `'unlocked'` if locked. */
  music(id: string, fadeInMs?: number): void {
    const audioId = this.checkId(id, "music");
    if (!audioId) return;
    if (this.current?.id === audioId) return;
    this.stopMusic();
    this.current = fadeInMs !== undefined && fadeInMs > 0 ? { id: audioId, fadeInMs } : { id: audioId };
    if (this.sound && !this.sound.locked) this.startMusic();
  }

  /**
   * Story 7.3 review: the current loop fades out over `ms` (audio clock) and is then stopped and destroyed; the
   * channel is free at once (`musicId` is undefined). Without a gain node it stops at once.
   */
  fadeOutMusic(ms: number): void {
    const current = this.current;
    this.current = undefined;
    const instance = current?.instance;
    if (!instance) return;
    if (!instance.volumeNode || ms <= 0) {
      this.releaseMusic(instance);
      return;
    }
    this.ramp(instance, 0, ms, 0);
    this.schedule(() => this.releaseMusic(instance), ms);
  }

  /** Story 7.3 review: the current loop's playback position (ms into the loop) while it plays, else undefined. */
  get musicPositionMs(): number | undefined {
    const instance = this.current?.instance;
    if (!instance?.isPlaying) return undefined;
    const s = instance.seek;
    return Number.isFinite(s) ? s * MS_PER_S : undefined;
  }

  /** Story 7.3: the current music loop's id (also while it waits for the unlock), else undefined. */
  get musicId(): string | undefined {
    return this.current?.id;
  }

  /**
   * Story 7.3: plays the SFX `id` at once as one voice of a pool of at most `cap` (the band's notes). Past the cap the
   * oldest live note is cut first. A note never waits: while locked or held (a skip) it is dropped.
   */
  note(id: string, cap: number): void {
    const audioId = this.checkId(id, "sfx");
    if (!audioId || !this.sound || this.sound.locked || this.sfxHeld) return;
    while (this.notes.length >= Math.max(1, cap)) this.cutNote(this.notes.shift());
    const { volume } = AUDIO_CATALOG[audioId];
    let instance: SoundInstanceLike | undefined;
    try {
      instance = this.sound.add(audioId, volume === undefined ? {} : { volume });
      const inst = instance;
      inst.once(SOUND_COMPLETE, () => {
        this.notes = this.notes.filter((n) => n !== inst);
        this.release(inst, false);
      });
      inst.play();
      this.notes.push(inst);
    } catch (error) {
      console.warn(`audio: cannot play "${audioId}"`, error);
      this.release(instance, false);
    }
  }

  /** Story 7.3: the number of pooled notes still sounding (tests, diagnostics). */
  get liveNotes(): number {
    return this.notes.length;
  }

  /** Story 7.3: cuts every pooled note (a short fade where the gain node allows it). */
  stopNotes(): void {
    const all = this.notes;
    this.notes = [];
    for (const n of all) this.cutNote(n);
  }

  stopMusic(): void {
    const instance = this.current?.instance;
    this.current = undefined;
    this.releaseMusic(instance);
  }

  /** Stops and destroys a music instance (Story 7.3 review: no stopped loop piles up in the sound manager). */
  private releaseMusic(instance: SoundInstanceLike | undefined): void {
    if (!instance) return;
    try {
      instance.stop();
      instance.destroy?.();
    } catch (error) {
      console.warn("audio: music stop failed", error);
    }
  }

  /** Story 5.7: true while an utterance plays or waits on the voice channel (a new `say` could cut it). */
  get voiceBusy(): boolean {
    return this.voice !== undefined || this.pendingVoice !== undefined;
  }

  /** Speaks one voice line; returns its token (`speech:ended` reports it exactly once). */
  say(id: string): number {
    return this.request([id], false);
  }

  /** Speaks several lines back to back under one token; `speech:ended` fires after the last. */
  sayChain(ids: readonly string[]): number {
    return this.request(ids, false);
  }

  /**
   * Stores the line (or, Story 2.4, the chain of lines) that `replayPrompt()` (the Speaker button)
   * replays. A chain replays from its first line under one token, with no overlap.
   */
  setPrompt(idOrIds: string | readonly string[]): void {
    const ids: readonly string[] = typeof idOrIds === "string" ? [idOrIds] : [...idOrIds];
    const unknown = ids.filter((id) => !isVoiceLineId(id));
    if (ids.length === 0 || unknown.length > 0) {
      console.warn(`audio: unknown voice line "${unknown.join(", ") || "(empty chain)"}" — prompt not set`);
      return;
    }
    this.prompt = ids as readonly VoiceLineId[];
  }

  /**
   * Story 1.8: forgets the prompt (only when it is `id`, if given), so the Speaker does not replay a
   * line of a scene that has gone (a game's request after Home). Story 2.4: a chain prompt matches an
   * `id` that is one of its lines.
   */
  clearPrompt(id?: string): void {
    if (id === undefined || this.prompt?.some((p) => p === id)) this.prompt = undefined;
  }

  /** Stops anything on the voice channel and replays the prompt from the start with a new token. */
  replayPrompt(): number | undefined {
    if (!this.prompt) return undefined;
    return this.request(this.prompt, true);
  }

  /**
   * Story 2.4: cuts the utterance with this token — the current or the pending one — which then ends
   * `completed:false`. Any other token (unknown, finished or someone else's) is left alone.
   */
  stop(token: number): void {
    if (this.pendingVoice?.token === token) {
      this.dropPending();
      return;
    }
    if (this.voice === undefined || this.voice.token !== token) return;
    this.cutCurrent();
    this.afterVoiceEnded();
  }

  /**
   * Story 5.3: fades the utterance with this token to silence over Timing.promptFadeOutMs (audio
   * clock). It ends `completed:false` at once and frees the channel (a waiting line starts now). A
   * pending utterance is dropped; any other token is a no-op. Without a gain node it stops at once.
   */
  fadeOut(token: number): void {
    if (this.pendingVoice?.token === token) {
      this.dropPending();
      return;
    }
    const utt = this.voice;
    if (utt === undefined || utt.token !== token) return;
    this.voice = undefined;
    const instance = utt.instance;
    utt.instance = undefined;
    if (instance?.volumeNode) {
      this.fading.add(instance);
      this.ramp(instance, 0, Timing.promptFadeOutMs, 0);
    } else {
      this.release(instance, true);
    }
    this.end(utt.token, false);
    this.afterVoiceEnded();
  }

  /** Story 5.3: while `on`, `sfx()` plays nothing (dropped, not deferred). */
  holdSfx(on: boolean): void {
    this.sfxHeld = on;
  }

  // --- voice internals --------------------------------------------------------

  private request(rawIds: readonly string[], restart: boolean): number {
    const unknown = rawIds.filter((id) => !isVoiceLineId(id));
    if (unknown.length > 0 || rawIds.length === 0 || !this.sound) {
      const token = ++this.lastToken;
      const what = rawIds.join(", ") || "(empty chain)";
      console.warn(
        this.sound
          ? `audio: unknown voice line "${what}" — nothing played`
          : `audio: not attached — voice "${what}" not played`,
      );
      this.endLater(token);
      return token;
    }
    const ids = rawIds as readonly VoiceLineId[];
    const key = ids.join("+");
    if (!restart) {
      if (this.voice?.key === key) return this.voice.token;
      if (this.pendingVoice?.key === key) return this.pendingVoice.token;
    }
    const utt: Utterance = { token: ++this.lastToken, ids, key, index: 0 };
    const current = this.voice;
    const wait =
      this.sound.locked ||
      (!restart &&
        current !== undefined &&
        this.remainingMs(current) < Timing.voiceQueueTailMs);
    const held: number[] = [];
    const lines: Array<{ token: number; index: number; id: string }> = [];
    this.heldEnds = held;
    this.heldLines = lines;
    try {
      this.dropPending();
      if (wait) {
        this.pendingVoice = utt;
      } else {
        this.cutCurrent();
        this.startUtterance(utt);
      }
    } finally {
      this.heldEnds = undefined;
      this.heldLines = undefined;
    }
    for (const token of held) this.end(token, false);
    for (const l of lines) this.bus.emit("speech:line", l);
    return utt.token;
  }

  /** Time left on the channel; a chain counts as ≥ the queue tail until its last line plays. */
  private remainingMs(utt: Utterance): number {
    const inst = utt.instance;
    const left = inst ? Math.max(0, (inst.duration - inst.seek) * MS_PER_S) : 0;
    return utt.index < utt.ids.length - 1
      ? Math.max(left, Timing.voiceQueueTailMs)
      : left;
  }

  private startUtterance(utt: Utterance): void {
    this.stopFading();
    this.voice = utt;
    this.duck();
    this.playItem(utt);
  }

  private playItem(utt: Utterance): void {
    const id = utt.ids[utt.index];
    if (!this.sound || id === undefined) return;
    let instance: SoundInstanceLike | undefined;
    try {
      instance = this.sound.add(id);
      utt.instance = instance;
      const inst = instance;
      inst.once(SOUND_COMPLETE, () => this.onItemComplete(utt, inst));
      inst.play();
      this.lineStarted(utt.token, utt.index, id);
    } catch (error) {
      // Not loaded (Phaser's add() throws on a key missing from the cache) — skip silently.
      console.warn(`audio: cannot play voice "${id}"`, error);
      this.release(instance, false);
      utt.instance = undefined;
      if (this.voice === utt) this.voice = undefined;
      this.endLater(utt.token);
      this.afterVoiceEnded();
    }
  }

  private onItemComplete(utt: Utterance, instance: SoundInstanceLike): void {
    if (this.voice !== utt || utt.instance !== instance) {
      // Stale: cut or replaced. A faded-out instance that reached its end is released here.
      if (this.fading.delete(instance)) this.release(instance, false);
      return;
    }
    this.release(instance, false);
    utt.instance = undefined;
    if (utt.index < utt.ids.length - 1) {
      utt.index++;
      this.playItem(utt);
      return;
    }
    this.voice = undefined;
    // Promote the pending line before reporting, so listeners see a consistent channel.
    this.startPendingIfAny();
    this.end(utt.token, true);
    if (!this.voice && !this.pendingVoice) this.unduck();
  }

  /** Channel freed without a completion (start failure): next pending line, else restore music. */
  private afterVoiceEnded(): void {
    if (this.voice) return;
    this.startPendingIfAny();
    if (!this.voice && !this.pendingVoice) this.unduck();
  }

  private startPendingIfAny(): void {
    const next = this.pendingVoice;
    if (!next || this.voice || !this.sound || this.sound.locked) return;
    this.pendingVoice = undefined;
    this.startUtterance(next);
  }

  /** Stops the current utterance; it ends `completed:false`. */
  private cutCurrent(): void {
    const utt = this.voice;
    if (!utt) return;
    this.voice = undefined;
    this.release(utt.instance, true);
    utt.instance = undefined;
    this.end(utt.token, false);
  }

  /** Story 5.3: stops and forgets every fading instance (one voice at a time). */
  private stopFading(): void {
    const all = [...this.fading];
    this.fading.clear();
    for (const instance of all) this.release(instance, true);
  }

  /** Drops the waiting utterance; it ends `completed:false`. */
  private dropPending(): void {
    const utt = this.pendingVoice;
    if (!utt) return;
    this.pendingVoice = undefined;
    this.end(utt.token, false);
  }

  /** Story 7.3: a cut note fades to silence and runs out (released on complete); without a gain node it stops now. */
  private cutNote(instance: SoundInstanceLike | undefined): void {
    if (!instance) return;
    if (instance.volumeNode) {
      this.ramp(instance, 0, Timing.bandNoteCutMs, 0);
      return;
    }
    this.release(instance, true);
  }

  private release(
    instance: SoundInstanceLike | undefined,
    stop: boolean,
  ): void {
    if (!instance) return;
    try {
      if (stop) instance.stop();
      instance.destroy?.();
    } catch (error) {
      console.warn("audio: voice stop failed", error);
    }
  }

  /** Story 3.1: `speech:line` for a line that just started (held, like the ends, while `request` runs). */
  private lineStarted(token: number, index: number, id: string): void {
    if (this.heldLines) {
      this.heldLines.push({ token, index, id });
      return;
    }
    this.bus.emit("speech:line", { token, index, id });
  }

  private end(token: number, completed: boolean): void {
    if (this.heldEnds) {
      this.heldEnds.push(token);
      return;
    }
    this.bus.emit("speech:ended", { token, completed });
  }

  /** For a token that never started: ends after the caller has received it. */
  private endLater(token: number): void {
    queueMicrotask(() => this.end(token, false));
  }

  private musicBase(): number {
    const id = this.current?.id;
    return id ? (AUDIO_CATALOG[id].volume ?? 1) : 1;
  }

  private duck(): void {
    if (this.ducked) return;
    this.ducked = true;
    const instance = this.current?.instance;
    if (instance)
      this.ramp(
        instance,
        this.musicBase() * DUCK_FACTOR,
        Timing.musicDuckDownMs,
        0,
      );
  }

  private unduck(): void {
    if (!this.ducked) return;
    this.ducked = false;
    const instance = this.current?.instance;
    // The restore reuses the duck-down time (spec decision), after the restore delay.
    if (instance)
      this.ramp(
        instance,
        this.musicBase(),
        Timing.musicDuckDownMs,
        Timing.musicDuckRestoreDelayMs,
      );
  }

  // --- internals --------------------------------------------------------------

  private checkId(id: string, kind: AudioKind): AudioId | undefined {
    if (isAudioId(id) && AUDIO_CATALOG[id].kind === kind) return id;
    console.warn(`audio: unknown ${kind} id "${id}" — nothing played`);
    return undefined;
  }

  private onUnlocked(): void {
    const now = this.now();
    for (const p of this.pendingSfx.splice(0)) {
      if (now - p.at <= Timing.feedbackMaxMs) this.playSfx(p.id);
    }
    if (this.current && !this.current.instance) this.startMusic();
    // A line held while locked starts now (and ducks the music just started).
    this.startPendingIfAny();
    for (const resolve of this.unlockWaiters.splice(0)) resolve();
  }

  private playSfx(id: AudioId): void {
    const { volume } = AUDIO_CATALOG[id];
    try {
      this.sound?.play(id, volume === undefined ? {} : { volume });
    } catch (error) {
      console.warn(`audio: cannot play "${id}"`, error);
    }
  }

  private startMusic(): void {
    const current = this.current;
    if (!current || !this.sound) return;
    const { loop, volume } = AUDIO_CATALOG[current.id];
    const config: SoundConfigLike = { loop: loop ?? false };
    // Started while a voice line plays → starts already ducked.
    if (this.ducked) config.volume = (volume ?? 1) * DUCK_FACTOR;
    else if (volume !== undefined) config.volume = volume;
    const target = config.volume ?? 1;
    // Story 7.3 review: a fade-in starts silent and ramps to its level on the audio clock.
    if (current.fadeInMs !== undefined) config.volume = 0;
    try {
      current.instance = this.sound.add(current.id, config);
      current.instance.play();
      if (current.fadeInMs !== undefined) this.ramp(current.instance, target, current.fadeInMs, 0);
    } catch (error) {
      // Forget it so a later music(id) retries instead of being a no-op.
      this.current = undefined;
      console.warn(`audio: cannot play "${current.id}"`, error);
    }
  }

  private resumeMusic(): void {
    const instance = this.current?.instance;
    if (instance?.isPaused) instance.resume();
  }

  private onHidden(): void {
    const instance = this.current?.instance;
    if (instance?.isPlaying) instance.pause();
    // Story 7.3: no band note rings on in the background.
    this.stopNotes();
    // Voice never resumes after backgrounding: current and pending both end completed:false.
    this.dropPending();
    this.cutCurrent();
    this.stopFading();
    if (!this.voice && !this.pendingVoice) this.unduck();
  }

  private async onVisible(): Promise<void> {
    const sound = this.sound;
    // Still locked (no tap yet): Phaser's own unlock handles it; nothing to resume.
    if (!sound || sound.locked) return;
    await this.resumeContext(sound);
    if (this.contextRunning(sound)) {
      this.resumeMusic();
      return;
    }
    if (this.sessionUnlocked && !this.suspendedEmitted) {
      this.suspendedEmitted = true;
      this.bus.emit("audio:suspended");
    }
  }

  private contextRunning(sound: SoundLike): boolean {
    return !sound.context || sound.context.state === CONTEXT_RUNNING;
  }

  private async resumeContext(sound: SoundLike): Promise<void> {
    const ctx = sound.context;
    if (!ctx || ctx.state === CONTEXT_RUNNING) return;
    try {
      await ctx.resume();
    } catch (error) {
      console.warn("audio: AudioContext.resume() rejected", error);
    }
  }
}

/** The app-wide AudioDirector (attached in main.ts). */
export const audio = new AudioDirector();
