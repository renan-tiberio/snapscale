/** Subscribes to a window event for the lifetime of the component. */
export function useEventListener<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  handler: (event: WindowEventMap[K]) => void,
): void
/** Subscribes to an event on an element; a `null` ref is a no-op. */
export function useEventListener<E extends HTMLElement, K extends keyof HTMLElementEventMap>(
  target: E | null,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void
// STUB — red phase. Real implementation lands with the green commit.
export function useEventListener(
  _target: EventTarget | null,
  _type: string,
  _handler: (event: Event) => void,
): void {
  // not implemented yet
}
