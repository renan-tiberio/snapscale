/**
 * Typed application events, broadcast on `window` as `CustomEvent`s. Extend
 * by adding a key here (or, from a test, via `declare module` augmentation —
 * see `events.test.ts`).
 */
export interface AppEventMap {
  'auth/logout': undefined
}

type AppEventName = keyof AppEventMap

/**
 * Every event this module dispatches is a `CustomEvent` created by
 * `emitAppEvent` below, so `detail` always matches the event's own name —
 * this predicate documents that trust boundary in one place instead of
 * casting at every call site.
 */
function isAppCustomEvent<K extends AppEventName>(
  event: Event,
  name: K,
): event is CustomEvent<AppEventMap[K]> {
  return event instanceof CustomEvent && event.type === name
}

/** Dispatches a typed app event on `window`. */
export function emitAppEvent<K extends AppEventName>(name: K, payload: AppEventMap[K]): void {
  window.dispatchEvent(new CustomEvent(name, { detail: payload }))
}

/** Subscribes to a typed app event; call the returned function to unsubscribe. */
export function subscribeAppEvent<K extends AppEventName>(
  name: K,
  handler: (payload: AppEventMap[K]) => void,
): () => void {
  function listener(event: Event): void {
    if (!isAppCustomEvent(event, name)) {
      return
    }

    handler(event.detail)
  }

  window.addEventListener(name, listener)

  return () => {
    window.removeEventListener(name, listener)
  }
}
