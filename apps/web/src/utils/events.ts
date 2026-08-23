/** Typed application events, extendable by adding a key here. */
export interface AppEventMap {
  'auth/logout': undefined
}

type AppEventName = keyof AppEventMap

// STUB — red phase. Real implementation lands with the green commit.
export function emitAppEvent<K extends AppEventName>(_name: K, _payload: AppEventMap[K]): void {
  // not implemented yet
}

export function subscribeAppEvent<K extends AppEventName>(
  _name: K,
  _handler: (payload: AppEventMap[K]) => void,
): () => void {
  return () => {
    // not implemented yet
  }
}
