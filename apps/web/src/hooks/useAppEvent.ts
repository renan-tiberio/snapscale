import type { AppEventMap } from '@/utils/events'

/** Subscribes to a typed app event for the lifetime of the component. */
// STUB — red phase. Real implementation lands with the green commit.
export function useAppEvent<K extends keyof AppEventMap>(
  _name: K,
  _handler: (payload: AppEventMap[K]) => void,
): void {
  // not implemented yet
}
