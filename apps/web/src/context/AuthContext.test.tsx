import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { AUTH_STORAGE_KEY, LOGOUT_EVENT } from '@/services/http'
import { TEST_TOKEN, testUser } from '@/test/msw/handlers'

import { AuthProvider, useAuthContext } from './AuthContext'

function SessionProbe() {
  const { user, isAuthenticated, login, logout } = useAuthContext()

  return (
    <div>
      <p>{isAuthenticated ? `signed in as ${user?.email}` : 'signed out'}</p>
      <button onClick={() => login({ token: TEST_TOKEN, user: testUser })}>sign in</button>
      <button onClick={logout}>sign out</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <AuthProvider>
      <SessionProbe />
    </AuthProvider>,
  )
}

describe('AuthContext', () => {
  it('starts signed out when localStorage holds no session', () => {
    renderProbe()

    expect(screen.getByText('signed out')).toBeInTheDocument()
  })

  it('exposes the logged-in user after login', async () => {
    const user = userEvent.setup()
    renderProbe()

    await user.click(screen.getByRole('button', { name: 'sign in' }))

    expect(screen.getByText(`signed in as ${testUser.email}`)).toBeInTheDocument()
  })

  it('persists the session so a remount restores it', async () => {
    const user = userEvent.setup()
    const { unmount } = renderProbe()
    await user.click(screen.getByRole('button', { name: 'sign in' }))
    unmount()

    renderProbe()

    expect(screen.getByText(`signed in as ${testUser.email}`)).toBeInTheDocument()
  })

  it('signs the user out and forgets the persisted session', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByRole('button', { name: 'sign in' }))

    await user.click(screen.getByRole('button', { name: 'sign out' }))

    expect(screen.getByText('signed out')).toBeInTheDocument()
    expect(window.localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull()
  })

  it('signs the user out when the http layer broadcasts a logout', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByRole('button', { name: 'sign in' }))

    window.dispatchEvent(new Event(LOGOUT_EVENT))

    expect(await screen.findByText('signed out')).toBeInTheDocument()
  })

  it('starts signed out when the persisted session is corrupted', () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, 'not-json')

    renderProbe()

    expect(screen.getByText('signed out')).toBeInTheDocument()
  })

  it('throws a helpful error when used outside the provider', () => {
    expect(() => render(<SessionProbe />)).toThrow(/AuthProvider/)
  })
})
