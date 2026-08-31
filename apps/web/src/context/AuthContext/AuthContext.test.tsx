import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { AuthProvider, useAuthContext } from './AuthContext'

import type { UserEvent } from '@testing-library/user-event'

import { getItem } from '@/services/storage'
import { TEST_TOKEN, testUser } from '@/test/msw/handlers'
import { writeRawStorageItem } from '@/test/utils'
import { emitAppEvent } from '@/utils/events'

const SessionProbe = () => {
  const { user, isAuthenticated, login, logout } = useAuthContext()

  return (
    <div>
      <p>{isAuthenticated ? `signed in as ${user?.email}` : 'signed out'}</p>
      <button onClick={() => login({ token: TEST_TOKEN, user: testUser })}>sign in</button>
      <button onClick={logout}>sign out</button>
    </div>
  )
}

const renderProbe = () =>
  render(
    <AuthProvider>
      <SessionProbe />
    </AuthProvider>,
  )

describe('AuthContext', () => {
  let user: UserEvent

  beforeEach(() => {
    user = userEvent.setup()
  })

  it('starts signed out when localStorage holds no session', () => {
    renderProbe()

    expect(screen.getByText('signed out')).toBeInTheDocument()
  })

  it('exposes the logged-in user after login', async () => {
    renderProbe()

    await user.click(screen.getByRole('button', { name: 'sign in' }))

    expect(screen.getByText(`signed in as ${testUser.email}`)).toBeInTheDocument()
  })

  it('persists the session so a remount restores it', async () => {
    const { unmount } = renderProbe()
    await user.click(screen.getByRole('button', { name: 'sign in' }))
    unmount()

    renderProbe()

    expect(screen.getByText(`signed in as ${testUser.email}`)).toBeInTheDocument()
  })

  it('signs the user out and forgets the persisted session', async () => {
    renderProbe()
    await user.click(screen.getByRole('button', { name: 'sign in' }))

    await user.click(screen.getByRole('button', { name: 'sign out' }))

    expect(screen.getByText('signed out')).toBeInTheDocument()
    expect(getItem({ key: 'session' })).toBeNull()
  })

  it('signs the user out when the http layer broadcasts a logout', async () => {
    renderProbe()
    await user.click(screen.getByRole('button', { name: 'sign in' }))

    act(() => {
      emitAppEvent({ name: 'auth/logout', payload: undefined })
    })

    expect(await screen.findByText('signed out')).toBeInTheDocument()
  })

  it('starts signed out when the persisted session is corrupted', () => {
    writeRawStorageItem({ key: 'snapscale.session', value: 'not-json' })

    renderProbe()

    expect(screen.getByText('signed out')).toBeInTheDocument()
  })

  it('throws a helpful error when used outside the provider', () => {
    expect(() => render(<SessionProbe />)).toThrow(/AuthProvider/)
  })
})
