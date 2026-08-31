import { randomUUID } from 'node:crypto'

import { Email } from '@snapscale/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as otpRepo from '@/repositories/otp/index.js'
import { createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const EMAIL = new Email('ada@example.com')
const OTHER_EMAIL = new Email('grace@example.com')

const inTenMinutes = (): Date => new Date(Date.now() + 600_000)
const oneMinuteAgo = (): Date => new Date(Date.now() - 60_000)

describe('otpRepo', () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll({ handle: database })
  })

  it('stores a code with zero attempts and no consumed_at', async () => {
    const code = await otpRepo.create({
      db: database.db,
      email: EMAIL,
      codeHash: 'hash-1',
      salt: 'salt-1',
      expiresAt: inTenMinutes(),
    })

    expect(code.email).toBe(EMAIL.value)
    expect(code.codeHash).toBe('hash-1')
    expect(code.salt).toBe('salt-1')
    expect(code.attempts).toBe(0)
    expect(code.consumedAt).toBeNull()
  })

  it('findActiveByEmail returns the unexpired unconsumed code and ignores expired ones', async () => {
    await otpRepo.create({
      db: database.db,
      email: EMAIL,
      codeHash: 'expired',
      salt: 'salt',
      expiresAt: oneMinuteAgo(),
    })
    const active = await otpRepo.create({
      db: database.db,
      email: EMAIL,
      codeHash: 'active',
      salt: 'salt',
      expiresAt: inTenMinutes(),
    })

    expect(await otpRepo.findActiveByEmail({ db: database.db, email: EMAIL })).toMatchObject({
      id: active.id,
    })
  })

  it('findActiveByEmail returns undefined once the code is consumed', async () => {
    const code = await otpRepo.create({
      db: database.db,
      email: EMAIL,
      codeHash: 'hash',
      salt: 'salt',
      expiresAt: inTenMinutes(),
    })

    const consumed = await otpRepo.markConsumed({ db: database.db, id: code.id })

    expect(consumed?.consumedAt).toBeInstanceOf(Date)
    expect(await otpRepo.findActiveByEmail({ db: database.db, email: EMAIL })).toBeUndefined()
  })

  it('incrementAttempts raises the counter by one per call', async () => {
    const code = await otpRepo.create({
      db: database.db,
      email: EMAIL,
      codeHash: 'hash',
      salt: 'salt',
      expiresAt: inTenMinutes(),
    })

    expect((await otpRepo.incrementAttempts({ db: database.db, id: code.id }))?.attempts).toBe(1)
    expect((await otpRepo.incrementAttempts({ db: database.db, id: code.id }))?.attempts).toBe(2)
    expect((await otpRepo.findActiveByEmail({ db: database.db, email: EMAIL }))?.attempts).toBe(2)
  })

  it('incrementAttempts returns undefined for an unknown id', async () => {
    expect(await otpRepo.incrementAttempts({ db: database.db, id: randomUUID() })).toBeUndefined()
  })

  it('markConsumed returns undefined for an unknown id', async () => {
    expect(await otpRepo.markConsumed({ db: database.db, id: randomUUID() })).toBeUndefined()
  })

  it('invalidateActiveForEmail consumes every active code of that email only', async () => {
    await otpRepo.create({
      db: database.db,
      email: EMAIL,
      codeHash: 'first',
      salt: 'salt',
      expiresAt: inTenMinutes(),
    })
    await otpRepo.create({
      db: database.db,
      email: EMAIL,
      codeHash: 'second',
      salt: 'salt',
      expiresAt: inTenMinutes(),
    })
    await otpRepo.create({
      db: database.db,
      email: OTHER_EMAIL,
      codeHash: 'other',
      salt: 'salt',
      expiresAt: inTenMinutes(),
    })

    const invalidated = await otpRepo.invalidateActiveForEmail({ db: database.db, email: EMAIL })

    expect(invalidated).toBe(2)
    expect(await otpRepo.findActiveByEmail({ db: database.db, email: EMAIL })).toBeUndefined()
    expect(await otpRepo.findActiveByEmail({ db: database.db, email: OTHER_EMAIL })).toMatchObject({
      codeHash: 'other',
    })
  })

  it('invalidateActiveForEmail reports zero when nothing is active', async () => {
    expect(await otpRepo.invalidateActiveForEmail({ db: database.db, email: EMAIL })).toBe(0)
  })
})
