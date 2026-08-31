import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ALBUM_PAGE_SIZE,
  MAX_ALBUM_PAGE_SIZE,
  albumSchema,
  createAlbumSchema,
  listAlbumsQuerySchema,
  updateAlbumSchema,
} from './album.js'

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
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['name'])
  })

  it('rejects an empty name', () => {
    const result = createAlbumSchema.safeParse({ name: '' })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['name'])
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
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['name'])
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
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['id'])
  })
})

describe('listAlbumsQuerySchema', () => {
  it('defaults to the first page of 20 when neither param is given', () => {
    const result = listAlbumsQuerySchema.safeParse({})

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected parse to succeed')
    expect(result.data).toEqual({ page: 1, limit: DEFAULT_ALBUM_PAGE_SIZE })
  })

  it('coerces the query-string numbers, which always arrive as strings', () => {
    const result = listAlbumsQuerySchema.safeParse({ page: '3', limit: '5' })

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('expected parse to succeed')
    expect(result.data).toEqual({ page: 3, limit: 5 })
  })

  it('accepts the cap exactly', () => {
    const result = listAlbumsQuerySchema.safeParse({ limit: MAX_ALBUM_PAGE_SIZE })

    expect(result.success).toBe(true)
  })

  it('rejects a limit above the cap instead of silently clamping it', () => {
    const result = listAlbumsQuerySchema.safeParse({ limit: MAX_ALBUM_PAGE_SIZE + 1 })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues[0]?.path).toEqual(['limit'])
  })

  it.each([
    { input: { page: 0 }, field: 'page' },
    { input: { limit: 0 }, field: 'limit' },
    { input: { page: 1.5 }, field: 'page' },
    { input: { page: 'abc' }, field: 'page' },
  ])('rejects $input on the $field field', ({ input, field }) => {
    const result = listAlbumsQuerySchema.safeParse(input)

    expect(result.success).toBe(false)
    if (result.success) throw new Error('expected parse to fail')
    expect(result.error.issues.some((issue) => issue.path[0] === field)).toBe(true)
  })
})
