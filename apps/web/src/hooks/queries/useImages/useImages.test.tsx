import { ERROR_CODES, fail } from '@snapscale/shared'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { useImages } from './useImages'

import type { UseImagesResult } from './useImages'
import type { RenderHookResult } from '@testing-library/react'

import { API_BASE, fixtures } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { createHookWrapper, seedSession } from '@/test/utils'

type RenderUseImagesParams = { albumId?: string }

const pngFile = ({ name }: { name: string }) =>
  new File(['fake-png-bytes'], name, { type: 'image/png' })

describe('useImages', () => {
  let result: RenderHookResult<UseImagesResult, unknown>['result']

  const renderUseImages = ({ albumId = fixtures.album.id }: RenderUseImagesParams = {}) =>
    renderHook(() => useImages({ albumId }), { wrapper: createHookWrapper() }).result

  beforeEach(() => {
    seedSession()
  })

  describe('for an album the API knows', () => {
    beforeEach(() => {
      result = renderUseImages()
    })

    it('lists the images of the requested album', async () => {
      await waitFor(() => {
        expect(result.current.images.map((image) => image.originalFilename)).toEqual(['sunset.png'])
      })
    })

    it('shows the uploaded image in the list once the cache is invalidated', async () => {
      await waitFor(() => {
        expect(result.current.images).toHaveLength(1)
      })

      result.current.uploadImage({ file: pngFile({ name: 'beach.png' }) })

      await waitFor(() => {
        expect(result.current.images.map((image) => image.originalFilename)).toContain('beach.png')
      })
    })

    it('surfaces the error code and message when the upload is rejected', async () => {
      server.use(
        http.post(`${API_BASE}/images`, () =>
          HttpResponse.json(
            fail({ code: ERROR_CODES.VALIDATION_ERROR, message: 'File too large' }),
            { status: 422 },
          ),
        ),
      )

      result.current.uploadImage({ file: pngFile({ name: 'huge.png' }) })

      await waitFor(() => {
        expect(result.current.uploadError?.message).toBe('File too large')
      })
      expect(result.current.uploadError?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    })
  })

  it('lists nothing for an album without images', async () => {
    result = renderUseImages({ albumId: fixtures.secondAlbum.id })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.images).toEqual([])
  })

  it('surfaces the error message when the list request fails', async () => {
    server.use(
      http.get(`${API_BASE}/images`, () =>
        HttpResponse.json(fail({ code: ERROR_CODES.NOT_FOUND, message: 'Album not found' }), {
          status: 404,
        }),
      ),
    )
    result = renderUseImages()

    await waitFor(() => {
      expect(result.current.error?.message).toBe('Album not found')
    })
  })
})
