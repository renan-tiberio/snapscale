import type { Database } from '@/db/index.js'

export function create(db: Database, input: unknown): Promise<unknown> {
  throw new Error(`not implemented: imagesRepo.create(${typeof input})`)
}

export function listByAlbum(db: Database, albumId: string): Promise<unknown> {
  throw new Error(`not implemented: imagesRepo.listByAlbum(${albumId})`)
}

export function findById(db: Database, id: string): Promise<unknown> {
  throw new Error(`not implemented: imagesRepo.findById(${id})`)
}
