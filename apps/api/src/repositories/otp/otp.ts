import { Email } from '@snapscale/shared'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'

import type { Database } from '@/db/index.js'

import { firstRow, requireRow } from '@/db/rows/index.js'
import { otpCodes } from '@/db/schema.js'

/** `Row`, not `OtpCode`: that name is the shared six-digit value object, and callers import both. */
export type OtpCodeRow = typeof otpCodes.$inferSelect

export type CreateOtpCodeInput = {
  readonly email: Email
  readonly codeHash: string
  readonly salt: string
  readonly expiresAt: Date
}

type CreateParams = {
  readonly db: Database
} & CreateOtpCodeInput

export const create = async ({
  db,
  email,
  codeHash,
  salt,
  expiresAt,
}: CreateParams): Promise<OtpCodeRow> => {
  const inserted = await db
    .insert(otpCodes)
    .values({ email: email.value, codeHash, salt, expiresAt })
    .returning()

  return requireRow({ rows: inserted, context: 'otpRepo.create' })
}

type FindActiveByEmailParams = {
  readonly db: Database
  readonly email: Email
  readonly now?: Date
}

/**
 * "Active" is the whole OTP contract in one predicate: not consumed and not
 * expired. `now` is a parameter so expiry tests do not have to sleep.
 */
export const findActiveByEmail = async ({
  db,
  email,
  now = new Date(),
}: FindActiveByEmailParams): Promise<OtpCodeRow | undefined> =>
  firstRow({
    rows: await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.email, email.value),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, now),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1),
  })

type InvalidateActiveForEmailParams = {
  readonly db: Database
  readonly email: Email
  readonly consumedAt?: Date
}

/**
 * Burns every still-active code of an email — what `otp/request` does before
 * issuing a new one. Returns how many were invalidated.
 */
export const invalidateActiveForEmail = async ({
  db,
  email,
  consumedAt = new Date(),
}: InvalidateActiveForEmailParams): Promise<number> => {
  const invalidated = await db
    .update(otpCodes)
    .set({ consumedAt })
    .where(and(eq(otpCodes.email, email.value), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id })

  return invalidated.length
}

type IncrementAttemptsParams = {
  readonly db: Database
  readonly id: string
}

/** Increments in SQL, not read-modify-write, so concurrent verifies cannot lose a count. */
export const incrementAttempts = async ({
  db,
  id,
}: IncrementAttemptsParams): Promise<OtpCodeRow | undefined> =>
  firstRow({
    rows: await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, id))
      .returning(),
  })

type MarkConsumedParams = {
  readonly db: Database
  readonly id: string
  readonly consumedAt?: Date
}

export const markConsumed = async ({
  db,
  id,
  consumedAt = new Date(),
}: MarkConsumedParams): Promise<OtpCodeRow | undefined> =>
  firstRow({
    rows: await db.update(otpCodes).set({ consumedAt }).where(eq(otpCodes.id, id)).returning(),
  })
