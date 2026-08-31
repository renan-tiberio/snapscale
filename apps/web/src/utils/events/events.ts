/**
 * Typed application events, broadcast on `window` as `CustomEvent`s. Extend
 * by adding a key here (or, from a test, via `declare module` augmentation —
 * see `events.test.ts`). `interface`, not `type`: declaration merging (the
 * augmentation this map is built for) only works on an `interface`
 * (docs/06-code-standards.md §2).
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging (this map's whole point) only works on an interface
export interface AppEventMap {
  'auth/logout': undefined
}

type AppEventName = keyof AppEventMap

type IsAppCustomEventParams<K extends AppEventName> = { name: K }

/**
 * Every event this module dispatches is a `CustomEvent` created by
 * `emitAppEvent` below, so `detail` always matches the event's own name —
 * this predicate documents that trust boundary in one place instead of
 * casting at every call site. Curried, and the inner parameter stays
 * positional: a type predicate can only narrow a parameter it names directly.
 */
const isAppCustomEvent =
  <K extends AppEventName>({ name }: IsAppCustomEventParams<K>) =>
  (event: Event): event is CustomEvent<AppEventMap[K]> =>
    event instanceof CustomEvent && event.type === name

type EmitAppEventParams<K extends AppEventName> = { name: K; payload: AppEventMap[K] }

/** Dispatches a typed app event on `window`. */
export const emitAppEvent = <K extends AppEventName>({
  name,
  payload,
}: EmitAppEventParams<K>): void => {
  window.dispatchEvent(new CustomEvent(name, { detail: payload }))
}

type SubscribeAppEventParams<K extends AppEventName> = {
  name: K
  handler: (payload: AppEventMap[K]) => void
}

/** Subscribes to a typed app event; call the returned function to unsubscribe. */
export const subscribeAppEvent = <K extends AppEventName>({
  name,
  handler,
}: SubscribeAppEventParams<K>): (() => void) => {
  const isMatchingEvent = isAppCustomEvent({ name })

  const listener = (event: Event): void => {
    if (!isMatchingEvent(event)) {
      return
    }

    handler(event.detail)
  }

  window.addEventListener(name, listener)

  return () => {
    window.removeEventListener(name, listener)
  }
}
