import { describe, expect, it } from 'vitest'

import { processedImageSchema, processImageParamsSchema } from './process.js'

const validBase = {
  imageId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  width: 800,
  height: 600,
  filter: 'none' as const,
}

describe('processImageParamsSchema — width/height bounds', () => {
  it('rejects width below the minimum (15)', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, width: 15 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['width'])
  })

  it('rejects width above the maximum (4097)', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, width: 4097 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['width'])
  })

  it('accepts width at the lower boundary (16)', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, width: 16 })

    expect(result.success).toBe(true)
  })

  it('accepts width at the upper boundary (4096)', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, width: 4096 })

    expect(result.success).toBe(true)
  })

  it('rejects height below the minimum (15)', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, height: 15 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['height'])
  })

  it('rejects height above the maximum (4097)', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, height: 4097 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['height'])
  })

  it('accepts height at the lower boundary (16)', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, height: 16 })

    expect(result.success).toBe(true)
  })

  it('accepts height at the upper boundary (4096)', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, height: 4096 })

    expect(result.success).toBe(true)
  })

  it('rejects a non-integer width', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, width: 100.5 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['width'])
  })
})

describe('processImageParamsSchema — filter', () => {
  it.each(['none', 'grayscale', 'blur', 'sharpen'] as const)('accepts filter %s', (filter) => {
    const result = processImageParamsSchema.safeParse({ ...validBase, filter })

    expect(result.success).toBe(true)
  })

  it('rejects a filter outside the enum', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, filter: 'sepia' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['filter'])
  })
})

describe('processImageParamsSchema — quality', () => {
  it('defaults quality to 80 when omitted', () => {
    const result = processImageParamsSchema.safeParse(validBase)

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected parse to succeed')
    expect(result.data.quality).toBe(80)
  })

  it('accepts an explicit quality within range', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, quality: 42 })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected parse to succeed')
    expect(result.data.quality).toBe(42)
  })

  it('rejects quality below 1', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, quality: 0 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['quality'])
  })

  it('rejects quality above 100', () => {
    const result = processImageParamsSchema.safeParse({ ...validBase, quality: 101 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['quality'])
  })
})

describe('processImageParamsSchema — imageId', () => {
  it('rejects a missing imageId', () => {
    const withoutImageId = {
      width: validBase.width,
      height: validBase.height,
      filter: validBase.filter,
    }
    const result = processImageParamsSchema.safeParse(withoutImageId)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['imageId'])
  })
})

describe('processedImageSchema', () => {
  const validProcessedImage = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    imageId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    params: { width: 800, height: 600, filter: 'none' as const, quality: 80 },
    storagePath: 'processed/image/hash.jpg',
    durationMs: 120,
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  it('accepts a well-formed processed image response', () => {
    const result = processedImageSchema.safeParse(validProcessedImage)

    expect(result.success).toBe(true)
  })

  it('rejects a negative durationMs', () => {
    const result = processedImageSchema.safeParse({ ...validProcessedImage, durationMs: -1 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['durationMs'])
  })

  it('rejects params with a filter outside the enum', () => {
    const result = processedImageSchema.safeParse({
      ...validProcessedImage,
      params: { ...validProcessedImage.params, filter: 'sepia' },
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['params', 'filter'])
  })
})
