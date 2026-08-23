import { eq } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows.js'
import { users } from '@/db/schema.js'

export type User = typeof users.$inferSelect

/**
 * Login is passwordless: verifying an OTP must yield a user whether or not one
 * existed. `on conflict (email) do update` makes that a single round-trip and,
 * because the conflicting row is re-returned, the original `id`/`created_at`
 * survive — no duplicate account, no lost identity.
 */
export async function upsertByEmail(db: Database, email: string): Promise<User> {
  const inserted = await db
    .insert(users)
    .values({ email })
    .onConflictDoUpdate({ target: users.email, set: { email } })
    .returning()

  return requireRow(inserted, 'usersRepo.upsertByEmail')
}

export async function findByEmail(db: Database, email: string): Promise<User | undefined> {
  return firstRow(await db.select().from(users).where(eq(users.email, email)).limit(1))
}

export async function findById(db: Database, id: string): Promise<User | undefined> {
  return firstRow(await db.select().from(users).where(eq(users.id, id)).limit(1))
}
