import { ERROR_CODES, fail } from '@snapscale/shared'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { API_BASE, fixtures } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { createHookWrapper, seedSession } from '@/test/utils'

import { useImages } from './useImages'

function renderUseImages(albumId: string = fixtures.album.id) {
  seedSession()
  return renderHook(() => useImages(albumId), { wrapper: createHookWrapper() })
}

function pngFile(name: string) {
  return new File(['fake-png-bytes'], name, { type: 'image/png' })
}

describe('useImages', () => {
  it('lists the images of the requested album', async () => {
    const { result } = renderUseImages()

    await waitFor(() => {
      expect(result.current.images.map((image) => image.originalFilename)).toEqual(['sunset.png'])
    })
  })

  it('lists nothing for an album without images', async () => {
    const { result } = renderUseImages(fixtures.secondAlbum.id)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.images).toEqual([])
  })

  it('shows the uploaded image in the list once the cache is invalidated', async () => {
    const { result } = renderUseImages()
    await waitFor(() => {
      expect(result.current.images).toHaveLength(1)
    })

    result.current.uploadImage(pngFile('beach.png'))

    await waitFor(() => {
      expect(result.current.images.map((image) => image.originalFilename)).toContain('beach.png')
    })
  })

  it('surfaces the error code and message when the upload is rejected', async () => {
    server.use(
      http.post(`${API_BASE}/images`, () =>
        HttpResponse.json(fail(ERROR_CODES.VALIDATION_ERROR, 'File too large'), { status: 422 }),
      ),
    )
    const { result } = renderUseImages()

    result.current.uploadImage(pngFile('huge.png'))

    await waitFor(() => {
      expect(result.current.uploadError?.message).toBe('File too large')
    })
    expect(result.current.uploadError?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
  })

  it('surfaces the error message when the list request fails', async () => {
    server.use(
      http.get(`${API_BASE}/images`, () =>
        HttpResponse.json(fail(ERROR_CODES.NOT_FOUND, 'Album not found'), { status: 404 }),
      ),
    )
    const { result } = renderUseImages()

    await waitFor(() => {
      expect(result.current.error?.message).toBe('Album not found')
    })
  })
})
