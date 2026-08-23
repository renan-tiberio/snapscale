import { describe, expect, it } from 'vitest'

import { clear, getItem, removeItem, setItem } from './storage'

import type { SessionResponse } from '@snapscale/shared'

import { TEST_TOKEN, testUser } from '@/test/msw/handlers'


const session: SessionResponse = { token: TEST_TOKEN, user: testUser }

describe('storage', () => {
  it('returns null for a key that was never written', () => {
    expect(getItem('session')).toBeNull()
  })

  it('round-trips a typed value through setItem and getItem', () => {
    setItem('session', session)

    expect(getItem('session')).toEqual(session)
  })

  it('physically prefixes the underlying key with snapscale.', () => {
    setItem('session', session)

    expect(window.localStorage.getItem('snapscale.session')).not.toBeNull()
  })

  it('removes a stored value', () => {
    setItem('session', session)
    removeItem('session')

    expect(getItem('session')).toBeNull()
  })

  it('returns null and clears the entry when the stored value is corrupt JSON', () => {
    window.localStorage.setItem('snapscale.session', '{ not json')

    expect(getItem('session')).toBeNull()
    expect(window.localStorage.getItem('snapscale.session')).toBeNull()
  })

  it('returns null and clears the entry when the stored value does not match the schema', () => {
    window.localStorage.setItem('snapscale.session', JSON.stringify({ token: '', user: null }))

    expect(getItem('session')).toBeNull()
    expect(window.localStorage.getItem('snapscale.session')).toBeNull()
  })

  it('clears every entry', () => {
    setItem('session', session)
    clear()

    expect(getItem('session')).toBeNull()
  })
})
