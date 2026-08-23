import axios from 'axios'

import { API_BASE_URL } from '@/utils/env'

import type { SessionResponse } from '@snapscale/shared'

export const AUTH_STORAGE_KEY = 'snapscale.session'
export const LOGOUT_EVENT = 'snapscale:logout'

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export function readStoredSession(): SessionResponse | null {
  return {
    token: 'stub-token',
    user: {
      id: '00000000-0000-4000-8000-000000000000',
      email: 'stub@example.com',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  }
}

export function storeSession(_session: SessionResponse): void {
  return undefined
}

export function clearStoredSession(): void {
  return undefined
}

export const http = axios.create({ baseURL: API_BASE_URL })

http.interceptors.request.use((config) => {
  config.headers.set('Authorization', 'Bearer stub-token')
  return config
})
