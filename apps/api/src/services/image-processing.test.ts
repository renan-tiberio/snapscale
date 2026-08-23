import { describe, expect, it } from 'vitest'

import { canonicalParamsJson, computeParamsHash } from '@/services/image-processing.js'

/**
 * Pure-logic unit tests for the `params_hash` computation (docs/03 §7) — the
 * pyramid's "params hashing" unit-test target (docs/03 §9). No db, no sharp,
 * no IO: this only has to prove the hash is a stable function of the params,
 * independent of the input object's key order.
 */
describe('image-processing params hashing', () => {
  it('produces identical canonical JSON regardless of input key order', () => {
    const a = canonicalParamsJson({ width: 100, height: 200, filter: 'grayscale', quality: 80 })
    const b = canonicalParamsJson({ quality: 80, filter: 'grayscale', height: 200, width: 100 })

    expect(a).toBe(b)
  })

  it('produces the same hash regardless of input key order', () => {
    const hashA = computeParamsHash({ width: 100, height: 200, filter: 'grayscale', quality: 80 })
    const hashB = computeParamsHash({ quality: 80, filter: 'grayscale', height: 200, width: 100 })

    expect(hashA).toBe(hashB)
  })

  it('is a 64-char lowercase hex sha256 digest', () => {
    const hash = computeParamsHash({ width: 100, height: 200, filter: 'none', quality: 80 })

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when any single param changes', () => {
    const base = { width: 100, height: 200, filter: 'none', quality: 80 } as const
    const baseline = computeParamsHash(base)

    expect(computeParamsHash({ ...base, width: 101 })).not.toBe(baseline)
    expect(computeParamsHash({ ...base, height: 201 })).not.toBe(baseline)
    expect(computeParamsHash({ ...base, filter: 'blur' })).not.toBe(baseline)
    expect(computeParamsHash({ ...base, quality: 81 })).not.toBe(baseline)
  })
})
