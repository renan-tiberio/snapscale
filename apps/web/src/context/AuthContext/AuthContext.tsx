import { createContext, useContext, useState } from 'react'

import type { SessionResponse, User } from '@snapscale/shared'
import type { ReactNode } from 'react'

import { useAppEvent } from '@/hooks/useAppEvent'
import { clearStoredSession, readStoredSession, storeSession } from '@/services/http'

export type AuthContextValue = {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (session: SessionResponse) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

type AuthProviderProps = { children: ReactNode }

/** Session state, backed by localStorage and by the http layer's logout broadcast. */
export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<SessionResponse | null>(readStoredSession)

  useAppEvent({ name: 'auth/logout', handler: () => setSession(null) })

  const login = (next: SessionResponse): void => {
    storeSession(next)
    setSession(next)
  }

  const logout = (): void => {
    clearStoredSession()
    setSession(null)
  }

  const value: AuthContextValue = {
    user: session?.user ?? null,
    token: session?.token ?? null,
    isAuthenticated: session !== null,
    login,
    logout,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

export const useAuthContext = (): AuthContextValue => {
  const value = useContext(AuthContext)

  if (value === null) {
    throw new Error('useAuthContext must be used inside an <AuthProvider>')
  }

  return value
}
