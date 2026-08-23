import type { Database } from '@/db/index.js'

export function upsertByEmail(db: Database, email: string): Promise<unknown> {
  throw new Error(`not implemented: usersRepo.upsertByEmail(${email})`)
}

export function findByEmail(db: Database, email: string): Promise<unknown> {
  throw new Error(`not implemented: usersRepo.findByEmail(${email})`)
}

export function findById(db: Database, id: string): Promise<unknown> {
  throw new Error(`not implemented: usersRepo.findById(${id})`)
}
