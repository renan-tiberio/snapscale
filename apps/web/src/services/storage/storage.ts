import { sessionResponseSchema, StorageKey } from '@snapscale/shared'

import type { SessionResponse } from '@snapscale/shared'

/**
 * Storage schema: one entry per key this app persists to `localStorage`.
 * `localStorage` is I/O — that's why this lives in `services/`, not `utils/`
 * (utils are pure; anything touching a browser/host API is a service).
 *
 * This is the only module in `src/` allowed to call `window.localStorage.*`
 * directly — every other consumer goes through `getItem`/`setItem`/`removeItem`.
 */
export type StorageSchema = {
  readonly session: SessionResponse
}

type StorageSchemaKey = keyof StorageSchema

const STORAGE_PREFIX = 'snapscale.'

type ToStorageKeyParams<K extends StorageSchemaKey> = { key: K }

/** The physical, prefixed key — validated through the shared `StorageKey` value object. */
const toStorageKey = <K extends StorageSchemaKey>({ key }: ToStorageKeyParams<K>): StorageKey =>
  new StorageKey(`${STORAGE_PREFIX}${key}`)

const STORAGE_VALIDATORS = {
  session: (value: unknown): boolean => sessionResponseSchema.safeParse(value).success,
} as const satisfies Record<StorageSchemaKey, (value: unknown) => boolean>

type IsValidStorageValueParams<K extends StorageSchemaKey> = { key: K }

/**
 * Runtime guard per key — catches both syntactically corrupt and legacy/
 * invalid shapes. Curried, and the inner parameter stays positional: a type
 * predicate can only narrow a parameter it names directly.
 */
const isValidStorageValue =
  <K extends StorageSchemaKey>({ key }: IsValidStorageValueParams<K>) =>
  (value: unknown): value is StorageSchema[K] =>
    STORAGE_VALIDATORS[key](value)

type GetItemParams<K extends StorageSchemaKey> = { key: K }

/**
 * Reads a typed value. A value that fails to parse as JSON, or that parses
 * but no longer matches the schema (corrupt or written by an older,
 * incompatible version of the app), is treated as absent — and the bad
 * entry is removed so it doesn't keep failing on every read.
 */
export const getItem = <K extends StorageSchemaKey>({
  key,
}: GetItemParams<K>): StorageSchema[K] | null => {
  const storageKey = toStorageKey({ key })
  const raw = window.localStorage.getItem(storageKey.value)

  if (raw === null) {
    return null
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    window.localStorage.removeItem(storageKey.value)
    return null
  }

  if (!isValidStorageValue({ key })(parsed)) {
    window.localStorage.removeItem(storageKey.value)
    return null
  }

  return parsed
}

type SetItemParams<K extends StorageSchemaKey> = { key: K; value: StorageSchema[K] }

export const setItem = <K extends StorageSchemaKey>({ key, value }: SetItemParams<K>): void => {
  window.localStorage.setItem(toStorageKey({ key }).value, JSON.stringify(value))
}

type RemoveItemParams<K extends StorageSchemaKey> = { key: K }

export const removeItem = <K extends StorageSchemaKey>({ key }: RemoveItemParams<K>): void => {
  window.localStorage.removeItem(toStorageKey({ key }).value)
}

/** Clears every key this app owns in `localStorage` — used by test teardown. */
export const clear = (): void => {
  window.localStorage.clear()
}
