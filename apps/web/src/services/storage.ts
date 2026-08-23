import { sessionResponseSchema } from '@snapscale/shared'

import type { SessionResponse } from '@snapscale/shared'

/**
 * Storage schema: one entry per key this app persists to `localStorage`.
 * `localStorage` is I/O — that's why this lives in `services/`, not `utils/`
 * (utils are pure; anything touching a browser/host API is a service).
 *
 * This is the only module in `src/` allowed to call `window.localStorage.*`
 * directly — every other consumer goes through `getItem`/`setItem`/`removeItem`.
 */
export interface StorageSchema {
  session: SessionResponse
}

type StorageKey = keyof StorageSchema

const STORAGE_PREFIX = 'snapscale.'

function toStorageKey(key: StorageKey): string {
  return `${STORAGE_PREFIX}${key}`
}

/** Runtime guard per key — catches both syntactically corrupt and legacy/invalid shapes. */
function isValidStorageValue<K extends StorageKey>(
  key: K,
  value: unknown,
): value is StorageSchema[K] {
  switch (key) {
    case 'session':
      return sessionResponseSchema.safeParse(value).success
    default:
      return false
  }
}

/**
 * Reads a typed value. A value that fails to parse as JSON, or that parses
 * but no longer matches the schema (corrupt or written by an older,
 * incompatible version of the app), is treated as absent — and the bad
 * entry is removed so it doesn't keep failing on every read.
 */
export function getItem<K extends StorageKey>(key: K): StorageSchema[K] | null {
  const storageKey = toStorageKey(key)
  const raw = window.localStorage.getItem(storageKey)

  if (raw === null) {
    return null
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    window.localStorage.removeItem(storageKey)
    return null
  }

  if (!isValidStorageValue(key, parsed)) {
    window.localStorage.removeItem(storageKey)
    return null
  }

  return parsed
}

export function setItem<K extends StorageKey>(key: K, value: StorageSchema[K]): void {
  window.localStorage.setItem(toStorageKey(key), JSON.stringify(value))
}

export function removeItem(key: StorageKey): void {
  window.localStorage.removeItem(toStorageKey(key))
}

/** Clears every key this app owns in `localStorage` — used by test teardown. */
export function clear(): void {
  window.localStorage.clear()
}
