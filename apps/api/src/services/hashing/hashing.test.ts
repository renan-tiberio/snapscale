import { describe, expect, it } from 'vitest'

import { hashHex } from '@/services/hashing/index.js'

/** Published sha256 vectors — the constant that pins the digest to sha256 rather than to itself. */
const SHA256_OF_EMPTY_STRING = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const SHA256_OF_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('hashHex', () => {
  it('produces the published sha256 digest of the empty string', () => {
    expect(hashHex({ value: '' })).toBe(SHA256_OF_EMPTY_STRING)
  })

  it('produces the published sha256 digest of "abc"', () => {
    expect(hashHex({ value: 'abc' })).toBe(SHA256_OF_ABC)
  })

  it('is deterministic, so the same input always yields the same stored hash', () => {
    expect(hashHex({ value: 'snapscale' })).toBe(hashHex({ value: 'snapscale' }))
  })

  it('separates inputs that differ by a single character', () => {
    expect(hashHex({ value: 'snapscale' })).not.toBe(hashHex({ value: 'snapscalf' }))
  })
})
