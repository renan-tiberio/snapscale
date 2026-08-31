import { ERROR_CODES } from '@snapscale/shared'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../http'

import { listImages, processImage, uploadImage } from './images'

import { fixtures } from '@/test/msw/handlers'

type UploadFormParams = { albumId: string; filename: string }

const uploadForm = ({ albumId, filename }: UploadFormParams): FormData => {
  const formData = new FormData()
  formData.append('albumId', albumId)
  formData.append('file', new File(['fake-png-bytes'], filename, { type: 'image/png' }))

  return formData
}

describe('images service', () => {
  it('lists only the images of the album it was asked about', async () => {
    await expect(listImages({ albumId: fixtures.image.albumId })).resolves.toEqual([fixtures.image])
  })

  it('answers with an empty list for an album that holds no images', async () => {
    await expect(listImages({ albumId: fixtures.secondAlbum.id })).resolves.toEqual([])
  })

  it('uploads a real multipart body and returns the stored image', async () => {
    const uploaded = await uploadImage({
      formData: uploadForm({ albumId: fixtures.album.id, filename: 'sunrise.png' }),
    })

    expect(uploaded).toMatchObject({
      albumId: fixtures.album.id,
      originalFilename: 'sunrise.png',
      mimeType: 'image/png',
    })
    await expect(listImages({ albumId: fixtures.album.id })).resolves.toContainEqual(uploaded)
  })

  it('rejects with a VALIDATION_ERROR ApiError when the body carries no file part', async () => {
    const formData = new FormData()
    formData.append('albumId', fixtures.album.id)

    const rejected = uploadImage({ formData })

    await expect(rejected).rejects.toBeInstanceOf(ApiError)
    await expect(rejected).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'file is required',
      status: 422,
    })
  })

  it('processes an image and echoes back the params it was asked for', async () => {
    const processed = await processImage({
      imageId: fixtures.image.id,
      width: 320,
      height: 240,
      filter: 'grayscale',
      quality: 70,
    })

    expect(processed.imageId).toBe(fixtures.image.id)
    expect(processed.params).toEqual({ width: 320, height: 240, filter: 'grayscale', quality: 70 })
  })
})
