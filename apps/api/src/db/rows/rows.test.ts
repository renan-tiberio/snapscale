import { describe, expect, it } from 'vitest'

import { firstRow, requireRow } from './rows.js'

describe('firstRow', () => {
  it('returns the first row', () => {
    expect(firstRow({ rows: [{ id: 1 }, { id: 2 }] })).toEqual({ id: 1 })
  })

  it('returns undefined for an empty result', () => {
    expect(firstRow({ rows: [] })).toBeUndefined()
  })
})

describe('requireRow', () => {
  it('returns the first row', () => {
    expect(requireRow({ rows: [{ id: 1 }], context: 'usersRepo.upsertByEmail' })).toEqual({
      id: 1,
    })
  })

  it('throws naming the caller when the statement returned nothing', () => {
    expect(() => requireRow({ rows: [], context: 'usersRepo.upsertByEmail' })).toThrow(
      'usersRepo.upsertByEmail: expected the statement to return one row, got 0',
    )
  })
})
