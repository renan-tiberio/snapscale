import { describe, expect, it } from 'vitest'

import { firstRow, requireRow } from '@/db/rows.js'

describe('firstRow', () => {
  it('returns the first row', () => {
    expect(firstRow([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 })
  })

  it('returns undefined for an empty result', () => {
    expect(firstRow([])).toBeUndefined()
  })
})

describe('requireRow', () => {
  it('returns the first row', () => {
    expect(requireRow([{ id: 1 }], 'usersRepo.upsertByEmail')).toEqual({ id: 1 })
  })

  it('throws naming the caller when the statement returned nothing', () => {
    expect(() => requireRow([], 'usersRepo.upsertByEmail')).toThrow(
      'usersRepo.upsertByEmail: expected the statement to return one row, got 0',
    )
  })
})
