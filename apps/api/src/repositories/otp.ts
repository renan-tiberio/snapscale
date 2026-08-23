import type { Database } from '@/db/index.js'

export function create(db: Database, input: unknown): Promise<unknown> {
  throw new Error(`not implemented: otpRepo.create(${typeof input})`)
}

export function findActiveByEmail(db: Database, email: string): Promise<unknown> {
  throw new Error(`not implemented: otpRepo.findActiveByEmail(${email})`)
}

export function invalidateActiveForEmail(db: Database, email: string): Promise<unknown> {
  throw new Error(`not implemented: otpRepo.invalidateActiveForEmail(${email})`)
}

export function incrementAttempts(db: Database, id: string): Promise<unknown> {
  throw new Error(`not implemented: otpRepo.incrementAttempts(${id})`)
}

export function markConsumed(db: Database, id: string): Promise<unknown> {
  throw new Error(`not implemented: otpRepo.markConsumed(${id})`)
}
