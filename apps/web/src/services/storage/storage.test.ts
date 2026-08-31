import { describe, expect, it } from 'vitest'

import { clear, getItem, removeItem, setItem } from './storage'

import type { SessionResponse } from '@snapscale/shared'

import { TEST_TOKEN, testUser } from '@/test/msw/handlers'

const session: SessionResponse = { token: TEST_TOKEN, user: testUser }

describe('storage', () => {
  it('returns null for a key that was never written', () => {
    expect(getItem({ key: 'session' })).toBeNull()
  })

  it('round-trips a typed value through setItem and getItem', () => {
    setItem({ key: 'session', value: session })

    expect(getItem({ key: 'session' })).toEqual(session)
  })

  it('physically prefixes the underlying key with snapscale.', () => {
    setItem({ key: 'session', value: session })

    expect(window.localStorage.getItem('snapscale.session')).not.toBeNull()
  })

  it('removes a stored value', () => {
    setItem({ key: 'session', value: session })
    removeItem({ key: 'session' })

    expect(getItem({ key: 'session' })).toBeNull()
  })

  it('returns null and clears the entry when the stored value is corrupt JSON', () => {
    window.localStorage.setItem('snapscale.session', '{ not json')

    expect(getItem({ key: 'session' })).toBeNull()
    expect(window.localStorage.getItem('snapscale.session')).toBeNull()
  })

  it('returns null and clears the entry when the stored value does not match the schema', () => {
    window.localStorage.setItem('snapscale.session', JSON.stringify({ token: '', user: null }))

    expect(getItem({ key: 'session' })).toBeNull()
    expect(window.localStorage.getItem('snapscale.session')).toBeNull()
  })

  it('clears every entry', () => {
    setItem({ key: 'session', value: session })
    clear()

    expect(getItem({ key: 'session' })).toBeNull()
  })
})
