import { ERROR_CODES, fail } from '@snapscale/shared'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { useImages } from './useImages'
import { useProcessImage } from './useProcessImage'

import { API_BASE, fixtures } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { createHookWrapper, seedSession } from '@/test/utils'


const PARAMS = {
  imageId: fixtures.image.id,
  width: 320,
  height: 240,
  filter: 'grayscale',
  quality: 80,
} as const

describe('useProcessImage', () => {
  it('returns the processed image for the requested params', async () => {
    seedSession()
    const { result } = renderHook(() => useProcessImage(), { wrapper: createHookWrapper() })

    result.current.processImage({ ...PARAMS })

    await waitFor(() => {
      expect(result.current.processedImage?.params).toEqual({
        width: 320,
        height: 240,
        filter: 'grayscale',
        quality: 80,
      })
    })
    expect(result.current.processedImage?.imageId).toBe(fixtures.image.id)
  })

  it('refetches the album images after a successful processing', async () => {
    seedSession()
    const { result } = renderHook(
      () => ({ images: useImages(fixtures.album.id), process: useProcessImage() }),
      { wrapper: createHookWrapper() },
    )
    await waitFor(() => {
      expect(result.current.images.images).toHaveLength(1)
    })
    server.use(
      http.get(`${API_BASE}/images`, () =>
        HttpResponse.json({
          success: true,
          data: [fixtures.image, { ...fixtures.image, id: 'ffffffff-1111-4111-8111-111111111111', originalFilename: 'refetched.png' }],
        }),
      ),
    )

    result.current.process.processImage({ ...PARAMS })

    await waitFor(() => {
      expect(result.current.images.images.map((image) => image.originalFilename)).toContain(
        'refetched.png',
      )
    })
  })

  it('surfaces the error code and message when processing fails', async () => {
    seedSession()
    server.use(
      http.post(`${API_BASE}/images/process`, () =>
        HttpResponse.json(fail(ERROR_CODES.VALIDATION_ERROR, 'width must be at least 16'), {
          status: 422,
        }),
      ),
    )
    const { result } = renderHook(() => useProcessImage(), { wrapper: createHookWrapper() })

    result.current.processImage({ ...PARAMS, width: 1 })

    await waitFor(() => {
      expect(result.current.processError?.message).toBe('width must be at least 16')
    })
    expect(result.current.processError?.code).toBe(ERROR_CODES.VALIDATION_ERROR)
  })

  it('forgets the previous result after a reset', async () => {
    seedSession()
    const { result } = renderHook(() => useProcessImage(), { wrapper: createHookWrapper() })
    result.current.processImage({ ...PARAMS })
    await waitFor(() => {
      expect(result.current.processedImage).not.toBeNull()
    })

    result.current.reset()

    await waitFor(() => {
      expect(result.current.processedImage).toBeNull()
    })
  })
})
