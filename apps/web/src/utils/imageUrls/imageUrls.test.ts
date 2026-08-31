import { describe, expect, it } from 'vitest'

import { imageFileUrl, processedImageUrl } from './imageUrls'

import { API_BASE } from '@/test/msw/handlers'

describe('imageUrls', () => {
  it('builds the original file URL on the configured API origin', () => {
    expect(imageFileUrl({ imageId: 'bbbbbbbb-1111-4111-8111-111111111111' })).toBe(
      `${API_BASE}/images/bbbbbbbb-1111-4111-8111-111111111111/file`,
    )
  })

  it('builds the processed file URL from the stored path', () => {
    expect(processedImageUrl({ storagePath: 'processed/img-1/abc.jpg' })).toBe(
      `${API_BASE}/files/processed/img-1/abc.jpg`,
    )
  })

  describe('with session token', () => {
    it('appends token as query parameter to original file URL', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      expect(imageFileUrl({ imageId: 'bbbbbbbb-1111-4111-8111-111111111111', token })).toBe(
        `${API_BASE}/images/bbbbbbbb-1111-4111-8111-111111111111/file?token=${encodeURIComponent(token)}`,
      )
    })

    it('appends token as query parameter to processed image URL', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      expect(processedImageUrl({ storagePath: 'processed/img-1/abc.jpg', token })).toBe(
        `${API_BASE}/files/processed/img-1/abc.jpg?token=${encodeURIComponent(token)}`,
      )
    })

    it('properly encodes special characters in token', () => {
      const tokenWithSpecialChars = 'token.with+special/chars='
      const url = imageFileUrl({ imageId: 'img-1', token: tokenWithSpecialChars })
      expect(url).toContain(`token=${encodeURIComponent(tokenWithSpecialChars)}`)
    })
  })

  // `null` (the default) omits the query param; that's not how the gallery
  // renders — `AlbumDetail` only calls these once `useFileToken` has a live
  // token. This block only pins that the builder itself stays correct
  // however a token is supplied.
  describe('token handling stays correct across calls', () => {
    it('still builds the original file URL correctly when called again with a token', () => {
      const token = 'second-token-value'

      expect(imageFileUrl({ imageId: 'bbbbbbbb-1111-4111-8111-111111111111', token })).toBe(
        `${API_BASE}/images/bbbbbbbb-1111-4111-8111-111111111111/file?token=${encodeURIComponent(token)}`,
      )
    })

    it('still builds the processed file URL correctly when called again with a token', () => {
      const token = 'second-token-value'

      expect(processedImageUrl({ storagePath: 'processed/img-1/abc.jpg', token })).toBe(
        `${API_BASE}/files/processed/img-1/abc.jpg?token=${encodeURIComponent(token)}`,
      )
    })
  })
})
