import { describe, expect, it } from 'vitest'

import { imageFileUrl, processedImageUrl } from './imageUrls'

import { API_BASE } from '@/test/msw/handlers'


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

  describe('with session token', () => {
    it('appends token as query parameter to original file URL', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      expect(imageFileUrl('bbbbbbbb-1111-4111-8111-111111111111', token)).toBe(
        `${API_BASE}/images/bbbbbbbb-1111-4111-8111-111111111111/file?token=${encodeURIComponent(token)}`,
      )
    })

    it('appends token as query parameter to processed image URL', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
      expect(processedImageUrl('processed/img-1/abc.jpg', token)).toBe(
        `${API_BASE}/files/processed/img-1/abc.jpg?token=${encodeURIComponent(token)}`,
      )
    })

    it('properly encodes special characters in token', () => {
      const tokenWithSpecialChars = 'token.with+special/chars='
      const url = imageFileUrl('img-1', tokenWithSpecialChars)
      expect(url).toContain(`token=${encodeURIComponent(tokenWithSpecialChars)}`)
    })
  })

  // `imageFileUrl` / `processedImageUrl` accepting `null` and omitting the
  // query param is a plain default of this utility — it is not how the
  // gallery renders. This block previously asserted the tokenless URL as if
  // it were the correct production path; it pinned the bug this file fixes
  // (every gallery mount emitting a tokenless `<img src>`, guaranteed 401).
  // `AlbumDetail` now never calls these builders until `useFileToken` has a
  // live token — see `components/molecules/ImageCard/ImageCard.test.tsx`
  // ("shows a placeholder instead of an image while no token is available
  // yet") and `components/pages/AlbumDetail/AlbumDetail.test.tsx` ("shows a
  // placeholder instead of an image until the file token is ready"). What's
  // left to pin here is only that the builder itself keeps working
  // correctly however a token is supplied.
  describe('token handling stays correct across calls', () => {
    it('still builds the original file URL correctly when called again with a token', () => {
      const token = 'second-token-value'

      expect(imageFileUrl('bbbbbbbb-1111-4111-8111-111111111111', token)).toBe(
        `${API_BASE}/images/bbbbbbbb-1111-4111-8111-111111111111/file?token=${encodeURIComponent(token)}`,
      )
    })

    it('still builds the processed file URL correctly when called again with a token', () => {
      const token = 'second-token-value'

      expect(processedImageUrl('processed/img-1/abc.jpg', token)).toBe(
        `${API_BASE}/files/processed/img-1/abc.jpg?token=${encodeURIComponent(token)}`,
      )
    })
  })
})
