import { API_BASE_URL } from './env'

/**
 * Absolute URL of an original file — `GET /images/:id/file`
 * (`docs/03-technical-design.md` §4), served by the api.
 *
 * When a session token is provided, it is appended as a query parameter
 * since `<img>` tags cannot send Authorization headers.
 */
export function imageFileUrl(imageId: string, token: string | null = null): string {
  const url = `${API_BASE_URL}/images/${imageId}/file`
  if (token === null) {
    return url
  }
  const params = new URLSearchParams()
  params.set('token', token)
  return `${url}?${params.toString()}`
}

/**
 * Absolute URL of a processed file. The api serves `UPLOAD_DIR`
 * (`docs/03-technical-design.md` §7) under `/files`, so the stored
 * `processed/{imageId}/{paramsHash}.{ext}` path maps straight onto it.
 *
 * When a session token is provided, it is appended as a query parameter
 * since `<img>` tags cannot send Authorization headers.
 */
export function processedImageUrl(storagePath: string, token: string | null = null): string {
  const url = `${API_BASE_URL}/files/${storagePath}`
  if (token === null) {
    return url
  }
  const params = new URLSearchParams()
  params.set('token', token)
  return `${url}?${params.toString()}`
}
