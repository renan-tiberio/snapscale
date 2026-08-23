import { describe, expect, it } from 'vitest'

import { albumSchema, createAlbumSchema, updateAlbumSchema } from './album.js'

describe('createAlbumSchema', () => {
  it('accepts a name without a description', () => {
    const result = createAlbumSchema.safeParse({ name: 'Summer trip' })

    expect(result.success).toBe(true)
  })

  it('accepts a name with a description', () => {
    const result = createAlbumSchema.safeParse({ name: 'Summer trip', description: 'Beach days' })

    expect(result.success).toBe(true)
  })

  it('rejects a missing name with a zod issue on the name field', () => {
    const result = createAlbumSchema.safeParse({ description: 'Beach days' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['name'])
    }
  })

  it('rejects an empty name', () => {
    const result = createAlbumSchema.safeParse({ name: '' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['name'])
    }
  })
})

describe('updateAlbumSchema', () => {
  it('accepts an empty object (all fields optional on PATCH)', () => {
    const result = updateAlbumSchema.safeParse({})

    expect(result.success).toBe(true)
  })

  it('accepts a partial update of only the description', () => {
    const result = updateAlbumSchema.safeParse({ description: 'Updated' })

    expect(result.success).toBe(true)
  })

  it('rejects an empty-string name when provided', () => {
    const result = updateAlbumSchema.safeParse({ name: '' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['name'])
    }
  })
})

describe('albumSchema', () => {
  const validAlbum = {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    userId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    name: 'Summer trip',
    description: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('accepts a well-formed album entity', () => {
    const result = albumSchema.safeParse(validAlbum)

    expect(result.success).toBe(true)
  })

  it('rejects an album with a non-uuid id', () => {
    const result = albumSchema.safeParse({ ...validAlbum, id: '123' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['id'])
    }
  })
})
