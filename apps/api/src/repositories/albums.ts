import type { Database } from '@/db/index.js'

export function create(db: Database, input: unknown): Promise<unknown> {
  throw new Error(`not implemented: albumsRepo.create(${typeof input})`)
}

export function listByOwner(db: Database, ownerId: string): Promise<unknown> {
  throw new Error(`not implemented: albumsRepo.listByOwner(${ownerId})`)
}

export function findById(db: Database, id: string, ownerId: string): Promise<unknown> {
  throw new Error(`not implemented: albumsRepo.findById(${id}, ${ownerId})`)
}

export function update(
  db: Database,
  id: string,
  ownerId: string,
  patch: unknown,
): Promise<unknown> {
  throw new Error(`not implemented: albumsRepo.update(${id}, ${ownerId}, ${typeof patch})`)
}

export function remove(db: Database, id: string, ownerId: string): Promise<unknown> {
  throw new Error(`not implemented: albumsRepo.remove(${id}, ${ownerId})`)
}
