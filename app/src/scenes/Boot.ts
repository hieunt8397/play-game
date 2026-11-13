// Boot (Story 1.2): sky + loading-strip only (no text, no bar, no button). Loads the shared/map
// assets (the SFX/music catalog, every vo.shell.* voice line, and since Story 1.5 the map atlas and
// plate), then waits for the readiness gate (first SW precache, bounded — Story 1.11 — and the
// self-hosted Baloo 2).
// Since Story 1.11 the load loop (dispatch / attempt / gate) lives in core/boot-load.ts
// (`createBootLoader`); this scene is the Phaser adapter: the loading-strip, the timers, the `online`
// listener and the `this.load` calls. On a loader error or gate rejection the kart slows and waits;
// the load retries on window `online` or every Tokens.Timing.loadRetryMs. Errors go only to
// console.warn. When ready: launches AudioUnlockOverlay (it sleeps itself) and starts Start.
import { Scene } from "phaser";
import {
  bootAudio,
  bootTextures,
  createBootLoader,
  createReadinessGate,
  type BootLoader,
  type FailedFile,
  type TextureLoad,
} from "../core/boot-load";
import { swRegistration } from "../core/sw";
import { Tokens } from "../core/tokens";
import {
  createLoadingStrip,
  type LoadingStrip,
} from "../core/ui/loading-strip";

const LOADER_ERROR = "loaderror";
const LOADER_COMPLETE = "complete";
const ONLINE = "online";

/** One entry of Boot's load list: an audio file (`bootAudio()`) or a texture (`bootTextures()`). */
type BootItem =
  | { readonly kind: "audio"; readonly key: string; readonly url: string }
  | TextureLoad;

/** Everything Boot loads. Story 1.4/1.5 textures and the `bootAudio()` list are its inputs. */
const BOOT_ITEMS: readonly BootItem[] = [
  ...bootAudio().map(([key, url]) => ({ kind: "audio" as const, key, url })),
  ...bootTextures(),
];

/** Never settles: `ready` stand-in without SW support (the gate skips the SW step then anyway). */
const NEVER = new Promise<unknown>(() => undefined);

export class Boot extends Scene {
  private strip: LoadingStrip | undefined;
  private loader: BootLoader | undefined;
  private readonly onOnline = (): void => this.loader?.dispatch("online");

  constructor() {
    super("Boot");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(Tokens.colors.sky.css);
    this.strip = createLoadingStrip(this, Tokens.safeRect);

    this.loader = createBootLoader<BootItem>({
      missing: () => BOOT_ITEMS.filter((item) => !this.isCached(item)),
      loadAll: (list, done) => this.loadAll(list, done),
      // The SW wait runs at most once per Boot; retries only re-check the font.
      gate: createReadinessGate({
        registration: swRegistration(),
        ready: "serviceWorker" in navigator ? navigator.serviceWorker.ready : NEVER,
        sleep: (ms) =>
          new Promise<void>((resolve) => {
            this.time.delayedCall(ms, resolve);
          }),
        fonts: document.fonts,
        fontFace: (family, source, descriptors) =>
          new FontFace(family, source, descriptors),
      }),
      setTimeScale: (scale) => this.strip?.setTimeScale(scale),
      onReady: () => {
        this.scene.launch("AudioUnlockOverlay");
        this.scene.start("Start");
      },
    });

    window.addEventListener(ONLINE, this.onOnline);
    this.events.once("shutdown", () =>
      window.removeEventListener(ONLINE, this.onOnline),
    );
    this.time.addEvent({
      delay: Tokens.Timing.loadRetryMs,
      loop: true,
      callback: () => this.loader?.dispatch("retryTick"),
    });

    this.loader.start();
  }

  private isCached(item: BootItem): boolean {
    return item.kind === "audio"
      ? this.cache.audio.exists(item.key)
      : this.textures.exists(item.key);
  }

  /** Queues `list` on the Phaser loader; `done` gets the files that failed (key + URL). */
  private loadAll(
    list: readonly BootItem[],
    done: (failed: readonly FailedFile[]) => void,
  ): void {
    const failed: FailedFile[] = [];
    const onError = (file: { key: string; src?: string }): void => {
      failed.push(file.src === undefined ? { key: file.key } : { key: file.key, src: file.src });
    };
    this.load.on(LOADER_ERROR, onError);
    this.load.once(LOADER_COMPLETE, () => {
      this.load.off(LOADER_ERROR, onError);
      done(failed);
    });
    for (const item of list) {
      if (item.kind === "audio") this.load.audio(item.key, item.url);
      else if (item.kind === "atlas") this.load.atlas(item.key, item.png, item.json);
      else if (item.kind === "multiatlas") this.load.multiatlas(item.key, item.json, item.path);
      else this.load.image(item.key, item.path);
    }
    this.load.start();
  }
}
