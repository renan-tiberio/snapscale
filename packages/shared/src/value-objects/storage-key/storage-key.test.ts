import { beforeEach, describe, expect, it } from 'vitest'

import { ValueObjectError } from '../value-object-error/index.js'

import { InvalidStorageKeyError, StorageKey } from './storage-key.js'

const VALID_KEY = 'originals/3fa85f64-5717-4562-b3fc-2c963f66afa6/photo.jpg'
const INVALID_KEY_MESSAGE =
  'StorageKey must be a relative "/"-separated path with no backslash and no empty, "." or ".." segment'

describe('StorageKey', () => {
  let key: StorageKey

  beforeEach(() => {
    key = new StorageKey(VALID_KEY)
  })

  it('exposes the primitive through the value accessor', () => {
    expect(key.value).toBe(VALID_KEY)
  })

  it('accepts a bare filename with dots inside a segment', () => {
    expect(new StorageKey('my.photo.final.jpg').value).toBe('my.photo.final.jpg')
  })

  it('does not hand the primitive out through implicit string coercion', () => {
    expect(String(key)).not.toContain(VALID_KEY)
  })

  it('is frozen, so no property can be added or replaced', () => {
    expect(Object.isFrozen(key)).toBe(true)
  })

  it('declares value as a getter with no setter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(StorageKey.prototype, 'value')

    expect(typeof descriptor?.get).toBe('function')
    expect(descriptor?.set).toBeUndefined()
  })

  it.each([
    { label: 'an empty string', value: '' },
    { label: 'an absolute path', value: '/etc/passwd' },
    { label: 'a leading parent segment', value: '../etc/passwd' },
    { label: 'a parent segment in the middle', value: 'originals/../../etc/passwd' },
    { label: 'a current-directory segment', value: 'originals/./photo.jpg' },
    { label: 'a doubled separator', value: 'originals//photo.jpg' },
    { label: 'a trailing separator', value: 'originals/' },
    { label: 'a backslash separator', value: 'originals\\photo.jpg' },
  ])('rejects $label at construction', ({ value }) => {
    expect(() => new StorageKey(value)).toThrow(InvalidStorageKeyError)
    expect(() => new StorageKey(value)).toThrow(INVALID_KEY_MESSAGE)
  })
})

describe('InvalidStorageKeyError', () => {
  it('is a ValueObjectError, so one catch covers every value object', () => {
    expect(new InvalidStorageKeyError()).toBeInstanceOf(ValueObjectError)
  })

  it('names itself for logs', () => {
    expect(new InvalidStorageKeyError().name).toBe('InvalidStorageKeyError')
  })
})
