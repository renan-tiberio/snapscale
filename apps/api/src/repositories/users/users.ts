import { Email, UserId } from '@snapscale/shared'
import { eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows/index.js'
import { users } from '@/db/schema.js'

export type User = typeof users.$inferSelect

type UpsertByEmailParams = {
  readonly db: Database
  readonly email: Email
}

/**
 * Login is passwordless: verifying an OTP must yield a user whether or not one
 * existed. `on conflict (email) do update` makes that a single round-trip and,
 * because the conflicting row is re-returned, the original `id`/`created_at`
 * survive — no duplicate account, no lost identity.
 */
export const upsertByEmail = async ({ db, email }: UpsertByEmailParams): Promise<User> => {
  const inserted = await db
    .insert(users)
    .values({ email: email.value })
    .onConflictDoUpdate({ target: users.email, set: { email: email.value } })
    .returning()

  return requireRow({ rows: inserted, context: 'usersRepo.upsertByEmail' })
}

type FindByEmailParams = {
  readonly db: Database
  readonly email: Email
}

export const findByEmail = async ({ db, email }: FindByEmailParams): Promise<User | undefined> =>
  firstRow({ rows: await db.select().from(users).where(eq(users.email, email.value)).limit(1) })

type FindByIdParams = {
  readonly db: Database
  readonly id: UserId
}

export const findById = async ({ db, id }: FindByIdParams): Promise<User | undefined> =>
  firstRow({ rows: await db.select().from(users).where(eq(users.id, id.value)).limit(1) })
