import { describe, expect, it } from 'vitest'

import { API_BASE_URL } from './env'

import { API_BASE } from '@/test/msw/handlers'

describe('env', () => {
  it('falls back to the origin the local API listens on when VITE_API_URL is unset', () => {
    expect(API_BASE_URL).toBe(API_BASE)
  })

  it('is a bare origin, so every caller can append a path without doubling a slash', () => {
    expect(new URL(API_BASE_URL).origin).toBe(API_BASE_URL)
  })
})
