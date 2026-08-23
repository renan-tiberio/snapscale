import { describe, expect, it } from 'vitest'

import {
  ALLOWED_IMAGE_MIME_TYPES,
  imageSchema,
  imageUploadConstraintsSchema,
  MAX_UPLOAD_BYTES,
} from './image.js'

describe('constants', () => {
  it('caps uploads at exactly 10MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024)
  })

  it('allows exactly jpeg, png and webp', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp'])
  })
})

describe('imageUploadConstraintsSchema', () => {
  it('accepts an allowed mime type within the size limit', () => {
    const result = imageUploadConstraintsSchema.safeParse({
      mimeType: 'image/png',
      sizeBytes: 5 * 1024 * 1024,
    })

    expect(result.success).toBe(true)
  })

  it('accepts a payload exactly at the 10MB boundary', () => {
    const result = imageUploadConstraintsSchema.safeParse({
      mimeType: 'image/jpeg',
      sizeBytes: MAX_UPLOAD_BYTES,
    })

    expect(result.success).toBe(true)
  })

  it('rejects a payload over the 10MB limit with a zod issue on sizeBytes', () => {
    const result = imageUploadConstraintsSchema.safeParse({
      mimeType: 'image/jpeg',
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['sizeBytes'])
  })

  it('rejects a mime type outside the allowlist with a zod issue on mimeType', () => {
    const result = imageUploadConstraintsSchema.safeParse({
      mimeType: 'image/gif',
      sizeBytes: 1024,
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['mimeType'])
  })
})

describe('imageSchema', () => {
  const validImage = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    albumId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    ownerId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    originalFilename: 'beach.jpg',
    storagePath: 'originals/owner/image.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 2048,
    width: 1920,
    height: 1080,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('accepts a well-formed image entity', () => {
    const result = imageSchema.safeParse(validImage)

    expect(result.success).toBe(true)
  })

  it('rejects a mime type outside the allowlist', () => {
    const result = imageSchema.safeParse({ ...validImage, mimeType: 'image/gif' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['mimeType'])
  })

  it('rejects a size over the 10MB limit', () => {
    const result = imageSchema.safeParse({ ...validImage, sizeBytes: MAX_UPLOAD_BYTES + 1 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['sizeBytes'])
  })
})
