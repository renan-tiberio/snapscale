import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import * as usersRepo from '@/repositories/users.js'
import { countRows, createTestDatabase, truncateAll, type TestDatabase } from '~/test/db.js'

const EMAIL = 'ada@example.com'

describe('usersRepo', () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = await createTestDatabase()
  })

  afterAll(async () => {
    await database.destroy()
  })

  beforeEach(async () => {
    await truncateAll(database)
  })

  it('creates a user on first upsert', async () => {
    const user = await usersRepo.upsertByEmail(database.db, EMAIL)

    expect(user.email).toBe(EMAIL)
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(user.createdAt).toBeInstanceOf(Date)
    expect(await countRows(database, 'users')).toBe(1)
  })

  it('returns the existing row on a repeated upsert instead of duplicating the email', async () => {
    const first = await usersRepo.upsertByEmail(database.db, EMAIL)

    const second = await usersRepo.upsertByEmail(database.db, EMAIL)

    expect(second.id).toBe(first.id)
    expect(second.createdAt).toEqual(first.createdAt)
    expect(await countRows(database, 'users')).toBe(1)
  })

  it('finds a user by email and by id', async () => {
    const created = await usersRepo.upsertByEmail(database.db, EMAIL)

    expect(await usersRepo.findByEmail(database.db, EMAIL)).toEqual(created)
    expect(await usersRepo.findById(database.db, created.id)).toEqual(created)
  })

  it('returns undefined for an unknown email or id', async () => {
    expect(await usersRepo.findByEmail(database.db, 'nobody@example.com')).toBeUndefined()
    expect(await usersRepo.findById(database.db, randomUUID())).toBeUndefined()
  })

  it('rejects a direct duplicate email insert with unique_violation 23505', async () => {
    await database.pool.query('insert into users (email) values ($1)', [EMAIL])

    await expect(
      database.pool.query('insert into users (email) values ($1)', [EMAIL]),
    ).rejects.toMatchObject({ code: '23505' })
  })
})
