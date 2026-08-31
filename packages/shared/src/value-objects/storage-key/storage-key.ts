import { ValueObjectError } from '../value-object-error/index.js'

const STORAGE_KEY_SEPARATOR = '/'
const FORBIDDEN_SEGMENTS: readonly string[] = ['', '.', '..']
const WINDOWS_SEPARATOR = '\\'

export class InvalidStorageKeyError extends ValueObjectError {
  constructor() {
    super({
      name: 'InvalidStorageKeyError',
      subject: 'StorageKey',
      expectation:
        'a relative "/"-separated path with no backslash and no empty, "." or ".." segment',
    })
  }
}

const isSafeStorageKey = (value: string): boolean => {
  if (value.includes(WINDOWS_SEPARATOR)) return false

  return value
    .split(STORAGE_KEY_SEPARATOR)
    .every((segment) => !FORBIDDEN_SEGMENTS.includes(segment))
}

/** Rejects every path that could escape the upload root, so callers never re-check for `..`. */
export class StorageKey {
  readonly #value: string

  constructor(value: string) {
    if (!isSafeStorageKey(value)) throw new InvalidStorageKeyError()

    this.#value = value
    Object.freeze(this)
  }

  get value(): string {
    return this.#value
  }
}
