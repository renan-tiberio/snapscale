import { useEffect, useLayoutEffect, useRef } from 'react'

type UseWindowEventListenerParams<K extends keyof WindowEventMap> = {
  target: Window
  type: K
  handler: (event: WindowEventMap[K]) => void
}

type UseElementEventListenerParams<E extends HTMLElement, K extends keyof HTMLElementEventMap> = {
  target: E | null
  type: K
  handler: (event: HTMLElementEventMap[K]) => void
}

// `function`, not an arrow const: overload signatures require it.
/** Subscribes to a window event for the lifetime of the component. */
export function useEventListener<K extends keyof WindowEventMap>(
  params: UseWindowEventListenerParams<K>,
): void
/** Subscribes to an event on an element; a `null` ref is a no-op. */
export function useEventListener<E extends HTMLElement, K extends keyof HTMLElementEventMap>(
  params: UseElementEventListenerParams<E, K>,
): void
export function useEventListener({
  target,
  type,
  handler,
}: {
  target: EventTarget | null
  type: string
  handler: (event: Event) => void
}): void {
  // Latest-handler ref: the effect subscribes once per (target, type) pair and
  // never re-subscribes just because an inline handler identity changed.
  // Synced in an effect (not during render) — React Compiler forbids ref
  // writes in the render body.
  const handlerRef = useRef(handler)
  useLayoutEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (target === null) {
      return
    }

    const listener = (event: Event): void => {
      handlerRef.current(event)
    }

    target.addEventListener(type, listener)

    return () => {
      target.removeEventListener(type, listener)
    }
  }, [target, type])
}
