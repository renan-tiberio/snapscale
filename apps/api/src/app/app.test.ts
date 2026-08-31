import { ERROR_CODES } from '@snapscale/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { App } from '@/app/index.js'

import { buildApp } from '@/app/index.js'

// Every other suite drives the app through `app.inject()`, which hands the request straight
// to the router — so none of them can see a missing CORS layer. A browser can.
const WEB_ORIGIN = 'http://localhost:5173'
const FOREIGN_ORIGIN = 'http://evil.example'

type ErrorBody = {
  readonly success: boolean
  readonly error?: { readonly code: string; readonly message: string }
}

type StatusErrorParams = {
  readonly statusCode: number
  readonly message: string
}

/** Fastify reads `statusCode` off whatever is thrown; this is the shape it arrives in. */
class StatusError extends Error {
  readonly statusCode: number

  constructor({ statusCode, message }: StatusErrorParams) {
    super(message)
    this.statusCode = statusCode
  }
}

const appThrowing = async ({ statusCode, message }: StatusErrorParams): Promise<App> => {
  const app = await buildApp({ logger: false })
  app.get('/__status', () => {
    throw new StatusError({ statusCode, message })
  })
  await app.ready()
  return app
}

describe('buildApp', () => {
  let app: App

  beforeEach(async () => {
    app = await buildApp({ logger: false })
  })

  afterEach(async () => {
    await app.close()
  })

  it('responds 200 with the ok envelope on GET /health', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true, data: { status: 'ok' } })
  })

  it('responds 404 with a NOT_FOUND envelope for an unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/this-route-does-not-exist' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND },
    })
  })

  it('maps an uncaught error to a 500 INTERNAL envelope without leaking the stack', async () => {
    app.get('/__boom', () => {
      throw new Error('kaboom: sensitive internal detail at file.ts:42:7')
    })
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/__boom' })
    const body = response.json() as { success: boolean; error: { code: string; message: string } }

    expect(response.statusCode).toBe(500)
    expect(body).toMatchObject({ success: false, error: { code: ERROR_CODES.INTERNAL } })
    expect(body.error.message).not.toMatch(/at .*:\d+:\d+/)
    expect(body.error.message).not.toContain('kaboom')
  })

  it('maps a zod validation failure to a 422 VALIDATION_ERROR envelope', async () => {
    app
      .withTypeProvider()
      .get(
        '/__validated',
        { schema: { querystring: z.object({ count: z.coerce.number() }) } },
        async (request) => request.query,
      )
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/__validated?count=not-a-number' })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.VALIDATION_ERROR },
    })
  })

  it('serves an OpenAPI document at /docs/json that documents the health route', async () => {
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(response.statusCode).toBe(200)
    expect(document.paths).toHaveProperty('/health')
  })

  it('serves the swagger UI shell at /docs', async () => {
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/docs' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
  })
})

describe('CORS between the web app origin and the api', () => {
  let app: App

  beforeEach(async () => {
    app = await buildApp({ logger: false, webOrigin: WEB_ORIGIN })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('answers the preflight for a JSON POST coming from the web app', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/auth/otp/request',
      headers: {
        origin: WEB_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })

    expect(response.statusCode).toBeLessThan(300)
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
    expect(String(response.headers['access-control-allow-methods'])).toContain('POST')
  })

  it('marks an actual cross-origin response as allowed', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: WEB_ORIGIN },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)
  })

  it('never hands its allow-origin header to an unlisted origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: FOREIGN_ORIGIN },
    })

    // Only "absent" proves the allowlist is enforced; "present but not FOREIGN_ORIGIN" is
    // also satisfied by an `origin: true`/`'*'` config, which is the actual danger here.
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('never grants a preflight from an unlisted origin an allow-origin header', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/auth/otp/request',
      headers: {
        origin: FOREIGN_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })

    // allow-methods/allow-headers are answered regardless of origin, so allow-origin is the
    // only control point that must be absent here as well as on the simple request above.
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows the Authorization header the SPA sends on every guarded call', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/albums',
      headers: {
        origin: WEB_ORIGIN,
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    })

    expect(response.statusCode).toBeLessThan(300)
    expect(String(response.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'authorization',
    )
  })
})

describe('error handler — Fastify-native statusCode errors (docs/03 §4)', () => {
  let app: App

  afterEach(async () => {
    await app.close()
  })

  it('answers a malformed JSON body with 400 VALIDATION_ERROR, not 500 INTERNAL', async () => {
    app = await buildApp({ logger: false })
    app.post('/__json', async (request) => request.body)
    await app.ready()

    const response = await app.inject({
      method: 'POST',
      url: '/__json',
      headers: { 'content-type': 'application/json' },
      payload: '{"a": ',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.VALIDATION_ERROR },
    })
  })

  it.each([
    { statusCode: 400, code: ERROR_CODES.VALIDATION_ERROR },
    { statusCode: 401, code: ERROR_CODES.UNAUTHORIZED },
    { statusCode: 404, code: ERROR_CODES.NOT_FOUND },
    { statusCode: 413, code: ERROR_CODES.VALIDATION_ERROR },
    { statusCode: 415, code: ERROR_CODES.VALIDATION_ERROR },
    { statusCode: 429, code: ERROR_CODES.RATE_LIMITED },
  ])(
    'maps a thrown error with statusCode $statusCode onto $code at that same status',
    async ({ statusCode, code }) => {
      app = await appThrowing({ statusCode, message: 'boom' })

      const response = await app.inject({ method: 'GET', url: '/__status' })

      expect(response.statusCode).toBe(statusCode)
      expect(response.json()).toMatchObject({ success: false, error: { code } })
    },
  )

  it('never echoes the raw library text of a 401 that escaped the guard', async () => {
    app = await appThrowing({
      statusCode: 401,
      message: 'Authorization token is invalid: jwt malformed',
    })

    const response = await app.inject({ method: 'GET', url: '/__status' })
    const body = response.json() as ErrorBody

    expect(response.statusCode).toBe(401)
    expect(body.error?.message).toBe('Invalid or expired token')
    expect(body.error?.message.toLowerCase()).not.toContain('jwt')
  })

  it('keeps 500 INTERNAL for a statusCode >= 500 and never leaks its message', async () => {
    app = await appThrowing({
      statusCode: 503,
      message: 'upstream pg pool exhausted at db/index.ts:42',
    })

    const response = await app.inject({ method: 'GET', url: '/__status' })
    const body = response.json() as ErrorBody

    expect(response.statusCode).toBe(500)
    expect(body.error?.code).toBe(ERROR_CODES.INTERNAL)
    expect(body.error?.message).toBe('Internal server error')
  })

  it('logs a 4xx at warn and a 500 at error — the dashboard signal this fix exists for', async () => {
    const write = vi.fn<(message: string) => void>()

    app = await buildApp({ logger: { stream: { write }, level: 'warn' } })
    app.get('/__client', () => {
      throw new StatusError({ statusCode: 413, message: 'client mistake' })
    })
    app.get('/__server', () => {
      throw new Error('server fault')
    })
    await app.ready()

    await app.inject({ method: 'GET', url: '/__client' })
    await app.inject({ method: 'GET', url: '/__server' })

    const levels = write.mock.calls
      .map(([line]) => JSON.parse(line) as { level: number; msg: string })
      .filter((entry) => entry.msg === 'request rejected' || entry.msg === 'unhandled error')
      .map((entry) => ({ level: entry.level, msg: entry.msg }))

    expect(levels).toEqual([
      { level: 40, msg: 'request rejected' },
      { level: 50, msg: 'unhandled error' },
    ])
  })
})
