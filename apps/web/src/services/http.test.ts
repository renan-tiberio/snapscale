import { ERROR_CODES, fail, ok } from '@snapscale/shared'
import { http as mswHttp, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { API_BASE, fixtures, TEST_TOKEN, testUser } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'

import { ApiError, AUTH_STORAGE_KEY, http, LOGOUT_EVENT, readStoredSession } from './http'

function seedStoredSession() {
  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ token: TEST_TOKEN, user: testUser }),
  )
}

describe('http', () => {
  it('unwraps the ApiResponse envelope and resolves with the data payload', async () => {
    const response = await http.get('/albums')

    expect(response.data).toEqual([fixtures.album, fixtures.secondAlbum])
  })

  it('sends the stored token as a Bearer authorization header', async () => {
    seedStoredSession()
    const authorizationHeaders: (string | null)[] = []
    server.use(
      mswHttp.get(`${API_BASE}/albums`, ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json(ok([]))
      }),
    )

    await http.get('/albums')

    expect(authorizationHeaders).toEqual([`Bearer ${TEST_TOKEN}`])
  })

  it('omits the authorization header when no session is stored', async () => {
    const authorizationHeaders: (string | null)[] = []
    server.use(
      mswHttp.get(`${API_BASE}/albums`, ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json(ok([]))
      }),
    )

    await http.get('/albums')

    expect(authorizationHeaders).toEqual([null])
  })

  it('rejects with an ApiError carrying the contract error code and message', async () => {
    server.use(
      mswHttp.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail(ERROR_CODES.NOT_FOUND, 'Album not found'), { status: 404 }),
      ),
    )

    await expect(http.get('/albums')).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Album not found',
      status: 404,
    })
  })

  it('rejects with an ApiError instance for a failure envelope returned with status 200', async () => {
    server.use(
      mswHttp.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail(ERROR_CODES.INTERNAL, 'Something broke')),
      ),
    )

    await expect(http.get('/albums')).rejects.toBeInstanceOf(ApiError)
  })

  it('falls back to the INTERNAL code when the API answers without an envelope', async () => {
    server.use(
      mswHttp.get(`${API_BASE}/albums`, () => new HttpResponse('boom', { status: 500 })),
    )

    await expect(http.get('/albums')).rejects.toMatchObject({ code: ERROR_CODES.INTERNAL })
  })

  it('clears the stored session and broadcasts a logout on 401', async () => {
    seedStoredSession()
    const onLogout = vi.fn()
    window.addEventListener(LOGOUT_EVENT, onLogout)
    server.use(
      mswHttp.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail(ERROR_CODES.UNAUTHORIZED, 'Session expired'), { status: 401 }),
      ),
    )

    await expect(http.get('/albums')).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    })
    window.removeEventListener(LOGOUT_EVENT, onLogout)

    expect(readStoredSession()).toBeNull()
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('reads back a stored session', () => {
    seedStoredSession()

    expect(readStoredSession()).toEqual({ token: TEST_TOKEN, user: testUser })
  })

  it('treats a corrupted stored session as no session', () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, '{ not json')

    expect(readStoredSession()).toBeNull()
  })

  it('treats a stored session that does not match the contract as no session', () => {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: '', user: null }))

    expect(readStoredSession()).toBeNull()
  })
})
