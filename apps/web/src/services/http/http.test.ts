import { ERROR_CODES, fail, ok } from '@snapscale/shared'
import { http as mswHttp, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { setItem } from '../storage'

import { ApiError, http, readStoredSession, REQUEST_TIMEOUT_MS } from './http'

import { API_BASE, fixtures, TEST_TOKEN, testUser } from '@/test/msw/handlers'
import { server } from '@/test/msw/server'
import { writeRawStorageItem } from '@/test/utils'
import { subscribeAppEvent } from '@/utils/events'

const seedStoredSession = (): void => {
  setItem({ key: 'session', value: { token: TEST_TOKEN, user: testUser } })
}

describe('http', () => {
  it('unwraps the ApiResponse envelope and resolves with the data payload', async () => {
    const response = await http.get({ url: '/albums' })

    expect(response.data).toEqual([fixtures.album, fixtures.secondAlbum])
  })

  it('sends the stored token as a Bearer authorization header', async () => {
    seedStoredSession()
    let authorizationHeader: string | null = null
    let handledRequests = 0
    server.use(
      mswHttp.get(`${API_BASE}/albums`, ({ request }) => {
        handledRequests += 1
        authorizationHeader = request.headers.get('authorization')
        return HttpResponse.json(ok({ data: [] }))
      }),
    )

    await http.get({ url: '/albums' })

    // Without this the header assertion passes vacuously when the handler never runs.
    expect(handledRequests).toBe(1)
    expect(authorizationHeader).toBe(`Bearer ${TEST_TOKEN}`)
  })

  it('omits the authorization header when no session is stored', async () => {
    let authorizationHeader: string | null = null
    let handledRequests = 0
    server.use(
      mswHttp.get(`${API_BASE}/albums`, ({ request }) => {
        handledRequests += 1
        authorizationHeader = request.headers.get('authorization')
        return HttpResponse.json(ok({ data: [] }))
      }),
    )

    await http.get({ url: '/albums' })

    // A null header and a request that never happened are indistinguishable without this.
    expect(handledRequests).toBe(1)
    expect(authorizationHeader).toBeNull()
  })

  it('rejects with an ApiError carrying the contract error code and message', async () => {
    server.use(
      mswHttp.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail({ code: ERROR_CODES.NOT_FOUND, message: 'Album not found' }), {
          status: 404,
        }),
      ),
    )

    await expect(http.get({ url: '/albums' })).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Album not found',
      status: 404,
    })
  })

  it('rejects with an ApiError instance for a failure envelope returned with status 200', async () => {
    server.use(
      mswHttp.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail({ code: ERROR_CODES.INTERNAL, message: 'Something broke' })),
      ),
    )

    await expect(http.get({ url: '/albums' })).rejects.toBeInstanceOf(ApiError)
  })

  it('falls back to the INTERNAL code when the API answers without an envelope', async () => {
    server.use(mswHttp.get(`${API_BASE}/albums`, () => new HttpResponse('boom', { status: 500 })))

    await expect(http.get({ url: '/albums' })).rejects.toMatchObject({ code: ERROR_CODES.INTERNAL })
  })

  it('rejects with a typed ApiError carrying the code and message from a well-formed error envelope', async () => {
    server.use(
      mswHttp.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(
          fail({ code: ERROR_CODES.VALIDATION_ERROR, message: 'name is required' }),
          {
            status: 422,
          },
        ),
      ),
    )

    await expect(http.get({ url: '/albums' })).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'name is required',
      status: 422,
    })
  })

  it.each([
    ['a bare string', 'just-a-string'],
    ['null', null],
    ['an unrelated object shape', { weird: 1 }],
  ])(
    'falls back to a generic INTERNAL ApiError without throwing for garbage payload: %s',
    // eslint-disable-next-line @typescript-eslint/max-params -- vitest's it.each destructures each tuple positionally into the case callback
    async (_label, payload) => {
      server.use(
        mswHttp.get(`${API_BASE}/albums`, () => HttpResponse.json(payload, { status: 500 })),
      )

      await expect(http.get({ url: '/albums' })).rejects.toMatchObject({
        code: ERROR_CODES.INTERNAL,
        message: 'Unexpected error while contacting the API',
        status: 500,
      })
    },
  )

  it('clears the stored session and broadcasts a logout on 401', async () => {
    seedStoredSession()
    const onLogout = vi.fn()
    const unsubscribe = subscribeAppEvent({ name: 'auth/logout', handler: onLogout })
    server.use(
      mswHttp.get(`${API_BASE}/albums`, () =>
        HttpResponse.json(fail({ code: ERROR_CODES.UNAUTHORIZED, message: 'Session expired' }), {
          status: 401,
        }),
      ),
    )

    await expect(http.get({ url: '/albums' })).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    })
    unsubscribe()

    expect(readStoredSession()).toBeNull()
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('reads back a stored session', () => {
    seedStoredSession()

    expect(readStoredSession()).toEqual({ token: TEST_TOKEN, user: testUser })
  })

  it('treats a corrupted stored session as no session', () => {
    writeRawStorageItem({ key: 'snapscale.session', value: '{ not json' })

    expect(readStoredSession()).toBeNull()
  })

  it('treats a stored session that does not match the contract as no session', () => {
    writeRawStorageItem({
      key: 'snapscale.session',
      value: JSON.stringify({ token: '', user: null }),
    })

    expect(readStoredSession()).toBeNull()
  })

  it('ships with a bounded default timeout instead of axios\'s "never" default', () => {
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThan(0)
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000)
  })

  it('aborts a request that never gets a response instead of hanging forever', async () => {
    server.use(mswHttp.get(`${API_BASE}/albums`, () => new Promise<never>(() => undefined)))

    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const pending = expect(http.get({ url: '/albums' })).rejects.toMatchObject({
        code: ERROR_CODES.INTERNAL,
      })
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      await pending
    } finally {
      vi.useRealTimers()
    }
  })
})
