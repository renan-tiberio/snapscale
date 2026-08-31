import { API_BASE_URL } from '../env'

const withOptionalToken = ({ url, token }: { url: string; token: string | null }): string => {
  if (token === null) {
    return url
  }

  const params = new URLSearchParams()
  params.set('token', token)

  return `${url}?${params.toString()}`
}

type ImageFileUrlParams = { imageId: string; token?: string | null }

/**
 * Absolute URL of an original file — `GET /images/:id/file`
 * (`docs/03-technical-design.md` §4), served by the api. A session token,
 * when provided, is appended as a query parameter since `<img>` tags cannot
 * send Authorization headers.
 */
export const imageFileUrl = ({ imageId, token = null }: ImageFileUrlParams): string =>
  withOptionalToken({ url: `${API_BASE_URL}/images/${imageId}/file`, token })

type ProcessedImageUrlParams = { storagePath: string; token?: string | null }

/**
 * Absolute URL of a processed file. The api serves `UPLOAD_DIR`
 * (`docs/03-technical-design.md` §7) under `/files`, so the stored
 * `processed/{imageId}/{paramsHash}.{ext}` path maps straight onto it.
 * Token handling mirrors `imageFileUrl`.
 */
export const processedImageUrl = ({ storagePath, token = null }: ProcessedImageUrlParams): string =>
  withOptionalToken({ url: `${API_BASE_URL}/files/${storagePath}`, token })
