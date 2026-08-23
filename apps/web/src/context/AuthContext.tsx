import { createContext } from 'react'

import type { SessionResponse, User } from '@snapscale/shared'
import type { ReactNode } from 'react'

export interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (session: SessionResponse) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

const STUB_USER: User = {
  id: '00000000-0000-4000-8000-000000000000',
  email: 'stub@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
}

export function useAuthContext(): AuthContextValue {
  return {
    user: STUB_USER,
    token: 'stub-token',
    isAuthenticated: true,
    login: () => undefined,
    logout: () => undefined,
  }
}
