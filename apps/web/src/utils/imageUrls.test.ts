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

  describe('without session token', () => {
    it('builds original file URL without token when not provided', () => {
      const url = imageFileUrl('bbbbbbbb-1111-4111-8111-111111111111', null)
      expect(url).toBe(
        `${API_BASE}/images/bbbbbbbb-1111-4111-8111-111111111111/file`,
      )
      expect(url).not.toContain('token=')
    })

    it('builds processed image URL without token when not provided', () => {
      const url = processedImageUrl('processed/img-1/abc.jpg', null)
      expect(url).toBe(
        `${API_BASE}/files/processed/img-1/abc.jpg`,
      )
      expect(url).not.toContain('token=')
    })
  })
})
