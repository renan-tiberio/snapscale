import type { Database } from '@/db/index.js'

export function create(db: Database, input: unknown): Promise<unknown> {
  throw new Error(`not implemented: processedImagesRepo.create(${typeof input})`)
}

export function findByImageAndParamsHash(
  db: Database,
  imageId: string,
  paramsHash: string,
): Promise<unknown> {
  throw new Error(`not implemented: processedImagesRepo.findByImageAndParamsHash(${imageId}, ${paramsHash})`)
}
