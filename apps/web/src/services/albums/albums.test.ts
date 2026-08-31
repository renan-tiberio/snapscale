import { ERROR_CODES } from '@snapscale/shared'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../http'

import { createAlbum, deleteAlbum, listAlbums, updateAlbum } from './albums'

import { fixtures } from '@/test/msw/handlers'

const MISSING_ALBUM_ID = '00000000-0000-4000-8000-000000000000'

describe('albums service', () => {
  it('lists the albums the API answers with, in the order it sent them', async () => {
    await expect(listAlbums()).resolves.toEqual([fixtures.album, fixtures.secondAlbum])
  })

  it('creates an album and returns the row the API stored', async () => {
    const created = await createAlbum({ name: 'Trip', description: 'Summer' })

    expect(created).toMatchObject({ name: 'Trip', description: 'Summer' })
    await expect(listAlbums()).resolves.toContainEqual(created)
  })

  it('keeps an omitted description as an explicit null instead of dropping the field', async () => {
    const created = await createAlbum({ name: 'Untitled' })

    expect(created.description).toBeNull()
  })

  it('patches only the fields it is given and returns the whole updated album', async () => {
    const updated = await updateAlbum({ id: fixtures.album.id, input: { name: 'Renamed' } })

    expect(updated).toEqual({ ...fixtures.album, name: 'Renamed' })
  })

  it('answers with the deleted id, because DELETE /albums/:id carries an empty body', async () => {
    await expect(deleteAlbum({ id: fixtures.album.id })).resolves.toBe(fixtures.album.id)
    await expect(listAlbums()).resolves.toEqual([fixtures.secondAlbum])
  })

  it('rejects with a NOT_FOUND ApiError when patching an album that does not exist', async () => {
    const rejected = updateAlbum({ id: MISSING_ALBUM_ID, input: { name: 'Renamed' } })

    await expect(rejected).rejects.toBeInstanceOf(ApiError)
    await expect(rejected).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Album not found',
      status: 404,
    })
  })
})
