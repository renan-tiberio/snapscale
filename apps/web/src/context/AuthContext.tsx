import { createContext, useContext, useEffect, useState } from 'react'


import type { SessionResponse, User } from '@snapscale/shared'
import type { ReactNode } from 'react'

import {
  clearStoredSession,
  LOGOUT_EVENT,
  readStoredSession,
  storeSession,
} from '@/services/http'

export interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (session: SessionResponse) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Session state, backed by localStorage and by the http layer's logout broadcast. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(readStoredSession)

  useEffect(() => {
    function handleLogout() {
      setSession(null)
    }

    window.addEventListener(LOGOUT_EVENT, handleLogout)

    return () => {
      window.removeEventListener(LOGOUT_EVENT, handleLogout)
    }
  }, [])

  function login(next: SessionResponse) {
    storeSession(next)
    setSession(next)
  }

  function logout() {
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

export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext)

  if (value === null) {
    throw new Error('useAuthContext must be used inside an <AuthProvider>')
  }

  return value
}
