import { ERROR_CODES, fail } from '@snapscale/shared'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAlbums } from './useAlbums'

import type { UseAlbumsResult } from './useAlbums'
import type { RenderHookResult } from '@testing-library/react'

import { API_BASE, fixtures } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { createHookWrapper, seedSession } from '@/test/utils'

describe('useAlbums', () => {
  let result: RenderHookResult<UseAlbumsResult, unknown>['result']

  const renderUseAlbums = () =>
    renderHook(() => useAlbums(), { wrapper: createHookWrapper() }).result

  beforeEach(() => {
    seedSession()
  })

  describe('against the seeded album list', () => {
    beforeEach(() => {
      result = renderUseAlbums()
    })

    it('lists the albums returned by the API', async () => {
      await waitFor(() => {
        expect(result.current.albums.map((album) => album.name)).toEqual(['Holidays', 'Work'])
      })
    })

    it('shows the created album in the list once the cache is invalidated', async () => {
      await waitFor(() => {
        expect(result.current.albums).toHaveLength(2)
      })

      result.current.createAlbum({ name: 'Trip to Porto' })

      await waitFor(() => {
        expect(result.current.albums.map((album) => album.name)).toContain('Trip to Porto')
      })
    })

    it('shows the new name after renaming an album', async () => {
      await waitFor(() => {
        expect(result.current.albums).toHaveLength(2)
      })

      result.current.updateAlbum({ id: fixtures.album.id, input: { name: 'Summer' } })

      await waitFor(() => {
        expect(result.current.albums.map((album) => album.name)).toEqual(['Summer', 'Work'])
      })
    })

    it('drops the deleted album from the list', async () => {
      await waitFor(() => {
        expect(result.current.albums).toHaveLength(2)
      })

      result.current.deleteAlbum({ id: fixtures.album.id })

      await waitFor(() => {
        expect(result.current.albums.map((album) => album.name)).toEqual(['Work'])
      })
    })
  })

  it('surfaces the error code and message when the list request fails', async () => {
    server.use(
      http.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail({ code: ERROR_CODES.INTERNAL, message: 'Albums unavailable' }), {
          status: 500,
        }),
      ),
    )
    result = renderUseAlbums()

    await waitFor(() => {
      expect(result.current.error?.message).toBe('Albums unavailable')
    })
    expect(result.current.error?.code).toBe(ERROR_CODES.INTERNAL)
  })

  it('surfaces the error message when creating an album fails', async () => {
    server.use(
      http.post(`${API_BASE}/albums`, () =>
        HttpResponse.json(
          fail({ code: ERROR_CODES.VALIDATION_ERROR, message: 'name is required' }),
          { status: 422 },
        ),
      ),
    )
    result = renderUseAlbums()

    result.current.createAlbum({ name: '' })

    await waitFor(() => {
      expect(result.current.createError?.message).toBe('name is required')
    })
    expect(result.current.createError?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
  })
})
