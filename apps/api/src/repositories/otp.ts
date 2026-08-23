import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows.js'
import { otpCodes } from '@/db/schema.js'

export type OtpCode = typeof otpCodes.$inferSelect

export interface CreateOtpCodeInput {
  readonly email: string
  readonly codeHash: string
  readonly salt: string
  readonly expiresAt: Date
}

export async function create(db: Database, input: CreateOtpCodeInput): Promise<OtpCode> {
  const inserted = await db
    .insert(otpCodes)
    .values({ ...input })
    .returning()

  return requireRow(inserted, 'otpRepo.create')
}

/**
 * "Active" is the whole OTP contract in one predicate: not consumed and not
 * expired. `now` is a parameter so expiry tests do not have to sleep.
 */
export async function findActiveByEmail(
  db: Database,
  email: string,
  now: Date = new Date(),
): Promise<OtpCode | undefined> {
  return firstRow(
    await db
      .select()
      .from(otpCodes)
      .where(
        and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, now)),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1),
  )
}

/**
 * Burns every still-active code of an email — what `otp/request` does before
 * issuing a new one (docs/03 §5). Returns how many were invalidated.
 */
export async function invalidateActiveForEmail(
  db: Database,
  email: string,
  consumedAt: Date = new Date(),
): Promise<number> {
  const invalidated = await db
    .update(otpCodes)
    .set({ consumedAt })
    .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id })

  return invalidated.length
}

/** Increments in SQL, not read-modify-write, so concurrent verifies cannot lose a count. */
export async function incrementAttempts(db: Database, id: string): Promise<OtpCode | undefined> {
  return firstRow(
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, id))
      .returning(),
  )
}

export async function markConsumed(
  db: Database,
  id: string,
  consumedAt: Date = new Date(),
): Promise<OtpCode | undefined> {
  return firstRow(
    await db.update(otpCodes).set({ consumedAt }).where(eq(otpCodes.id, id)).returning(),
  )
}
