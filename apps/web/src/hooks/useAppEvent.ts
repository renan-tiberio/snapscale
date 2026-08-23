import { useEffect, useLayoutEffect, useRef } from 'react'

import type { AppEventMap } from '@/utils/events'

import { subscribeAppEvent } from '@/utils/events'

/** Subscribes to a typed app event for the lifetime of the component. */
export function useAppEvent<K extends keyof AppEventMap>(
  name: K,
  handler: (payload: AppEventMap[K]) => void,
): void {
  // Latest-handler ref: the effect subscribes once per event name and never
  // re-subscribes just because an inline handler identity changed.
  // Synced in an effect (not during render) — React Compiler forbids ref
  // writes in the render body.
  const handlerRef = useRef(handler)
  useLayoutEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    return subscribeAppEvent(name, (payload) => {
      handlerRef.current(payload)
    })
  }, [name])
}
