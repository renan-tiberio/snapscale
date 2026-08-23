import { ERROR_CODES, fail } from '@snapscale/shared'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { useAlbums } from './useAlbums'

import { API_BASE, fixtures } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { createHookWrapper, seedSession } from '@/test/utils'


function renderUseAlbums() {
  seedSession()
  return renderHook(() => useAlbums(), { wrapper: createHookWrapper() })
}

describe('useAlbums', () => {
  it('lists the albums returned by the API', async () => {
    const { result } = renderUseAlbums()

    await waitFor(() => {
      expect(result.current.albums.map((album) => album.name)).toEqual(['Holidays', 'Work'])
    })
  })

  it('shows the created album in the list once the cache is invalidated', async () => {
    const { result } = renderUseAlbums()
    await waitFor(() => {
      expect(result.current.albums).toHaveLength(2)
    })

    result.current.createAlbum({ name: 'Trip to Porto' })

    await waitFor(() => {
      expect(result.current.albums.map((album) => album.name)).toContain('Trip to Porto')
    })
  })

  it('shows the new name after renaming an album', async () => {
    const { result } = renderUseAlbums()
    await waitFor(() => {
      expect(result.current.albums).toHaveLength(2)
    })

    result.current.updateAlbum({ id: fixtures.album.id, input: { name: 'Summer' } })

    await waitFor(() => {
      expect(result.current.albums.map((album) => album.name)).toEqual(['Summer', 'Work'])
    })
  })

  it('drops the deleted album from the list', async () => {
    const { result } = renderUseAlbums()
    await waitFor(() => {
      expect(result.current.albums).toHaveLength(2)
    })

    result.current.deleteAlbum(fixtures.album.id)

    await waitFor(() => {
      expect(result.current.albums.map((album) => album.name)).toEqual(['Work'])
    })
  })

  it('surfaces the error code and message when the list request fails', async () => {
    server.use(
      http.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail(ERROR_CODES.INTERNAL, 'Albums unavailable'), { status: 500 }),
      ),
    )
    const { result } = renderUseAlbums()

    await waitFor(() => {
      expect(result.current.error?.message).toBe('Albums unavailable')
    })
    expect(result.current.error?.code).toBe(ERROR_CODES.INTERNAL)
  })

  it('surfaces the error message when creating an album fails', async () => {
    server.use(
      http.post(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail(ERROR_CODES.VALIDATION_ERROR, 'name is required'), { status: 422 }),
      ),
    )
    const { result } = renderUseAlbums()

    result.current.createAlbum({ name: '' })

    await waitFor(() => {
      expect(result.current.createError?.message).toBe('name is required')
    })
    expect(result.current.createError?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
  })
})
