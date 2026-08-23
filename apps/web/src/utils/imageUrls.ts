import { API_BASE_URL } from './env'

/**
 * Absolute URL of an original file — `GET /images/:id/file`
 * (`docs/03-technical-design.md` §4), served by the api.
 */
export function imageFileUrl(imageId: string): string {
  return `${API_BASE_URL}/images/${imageId}/file`
}

/**
 * Absolute URL of a processed file. The api serves `UPLOAD_DIR`
 * (`docs/03-technical-design.md` §7) under `/files`, so the stored
 * `processed/{imageId}/{paramsHash}.{ext}` path maps straight onto it.
 */
export function processedImageUrl(storagePath: string): string {
  return `${API_BASE_URL}/files/${storagePath}`
}
