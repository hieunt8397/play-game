// Service-worker registration (Story 1.11, AR33/AR34). The app registers the Workbox worker that
// vite-plugin-pwa generates (`generateSW`, `injectRegister: false`) itself, once, from main.ts
// before `new Game`. Boot's readiness gate reads the same promise through `swRegistration()`.
//
// Update policy: nothing here (or anywhere) calls `update()`, `skipWaiting` or `location.reload`,
// and nothing listens for `controllerchange`. A new worker waits and applies at the next cold open,
// so a deploy never reloads the app mid-play.

/** The worker file vite-plugin-pwa writes next to index.html. Relative, so `base: './'` hosts work. */
export const SW_URL = "./sw.js";
/** Scope of the worker: the folder the app is served from. */
export const SW_SCOPE = "./";

/** Slice of `ServiceWorkerRegistration`. `active` is set once a worker finished its install (precache). */
export interface SwRegistrationLike {
  readonly active: unknown;
}

/** Slice of `ServiceWorkerContainer` (`navigator.serviceWorker`). */
export interface SwContainerLike {
  register(url: string, options: { scope: string }): Promise<SwRegistrationLike>;
}

let registration: Promise<SwRegistrationLike | undefined> = Promise.resolve(undefined);

/**
 * Registers `SW_URL`. Resolves `undefined` in DEV, without SW support, or when the registration
 * rejects (one `console.warn`, e.g. a SecurityError in a locked-down profile); never rejects.
 */
export function registerServiceWorker(
  container: SwContainerLike | undefined,
  isDev: boolean,
): Promise<SwRegistrationLike | undefined> {
  if (isDev || !container) {
    registration = Promise.resolve(undefined);
    return registration;
  }
  let pending: Promise<SwRegistrationLike>;
  try {
    pending = container.register(SW_URL, { scope: SW_SCOPE });
  } catch (error) {
    pending = Promise.reject(error);
  }
  registration = pending.then(
    (reg) => reg,
    (error: unknown) => {
      console.warn("sw: registration failed — running online only", error);
      return undefined;
    },
  );
  return registration;
}

/** The promise stored by the last `registerServiceWorker` call (`undefined` before any call). */
export function swRegistration(): Promise<SwRegistrationLike | undefined> {
  return registration;
}
