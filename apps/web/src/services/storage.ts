import type { SessionResponse } from '@snapscale/shared'

/** Storage schema: one entry per key this app persists to `localStorage`. */
export interface StorageSchema {
  session: SessionResponse
}

type StorageKey = keyof StorageSchema

// STUB — red phase. Real implementation lands with the green commit.
export function getItem<K extends StorageKey>(_key: K): StorageSchema[K] | null {
  return null
}

export function setItem<K extends StorageKey>(_key: K, _value: StorageSchema[K]): void {
  // not implemented yet
}

export function removeItem(_key: StorageKey): void {
  // not implemented yet
}

export function clear(): void {
  // not implemented yet
}
