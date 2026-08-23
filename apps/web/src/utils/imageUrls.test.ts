import { describe, expect, it } from 'vitest'

import { API_BASE } from '@/test/msw/handlers'

import { imageFileUrl, processedImageUrl } from './imageUrls'

describe('imageUrls', () => {
  it('builds the original file URL on the configured API origin', () => {
    expect(imageFileUrl('bbbbbbbb-1111-4111-8111-111111111111')).toBe(
      `${API_BASE}/images/bbbbbbbb-1111-4111-8111-111111111111/file`,
    )
  })

  it('builds the processed file URL from the stored path', () => {
    expect(processedImageUrl('processed/img-1/abc.jpg')).toBe(
      `${API_BASE}/files/processed/img-1/abc.jpg`,
    )
  })
})
