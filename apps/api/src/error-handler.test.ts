import { ERROR_CODES } from '@snapscale/shared'
import { describe, expect, it } from 'vitest'

import type { App } from '@/app.js'

import { buildApp } from '@/app.js'

/**
 * The `setErrorHandler` branch that reads `error.statusCode` (app.ts).
 * Everything Fastify itself raises — a malformed JSON body, the multipart
 * `FST_*_LIMIT` family, an unsupported media type, the rate limiter, a jwt
 * error that escapes the guard — arrives here as an `Error` carrying a
 * `statusCode`, and used to collapse into a single 500 INTERNAL. That is not
 * just a wrong status: phase 2 reads the error-rate dashboard, and a client
 * mistake counted as a server fault poisons it.
 */

interface ErrorBody {
  readonly success: boolean
  readonly error?: { readonly code: string; readonly message: string }
}

/** Builds an app with one route that throws an error carrying `statusCode`. */
async function appThrowing(statusCode: number, message: string): Promise<App> {
  const app = await buildApp({ logger: false })
  app.get('/__status', () => {
    const error = new Error(message) as Error & { statusCode: number }
    error.statusCode = statusCode
    throw error
  })
  await app.ready()
  return app
}

describe('error handler — Fastify-native statusCode errors (docs/03 §4)', () => {
  it('answers a malformed JSON body with 400 VALIDATION_ERROR, not 500 INTERNAL', async () => {
    const app = await buildApp({ logger: false })
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

    await app.close()
  })

  it.each([
    [400, ERROR_CODES.VALIDATION_ERROR],
    [401, ERROR_CODES.UNAUTHORIZED],
    [404, ERROR_CODES.NOT_FOUND],
    [413, ERROR_CODES.VALIDATION_ERROR],
    [415, ERROR_CODES.VALIDATION_ERROR],
    [429, ERROR_CODES.RATE_LIMITED],
  ])('maps a thrown error with statusCode %i onto %s at that same status', async (statusCode, code) => {
    const app = await appThrowing(statusCode, 'boom')

    const response = await app.inject({ method: 'GET', url: '/__status' })

    expect(response.statusCode).toBe(statusCode)
    expect(response.json()).toMatchObject({ success: false, error: { code } })

    await app.close()
  })

  it('never echoes the raw library text of a 401 that escaped the guard', async () => {
    const app = await appThrowing(401, 'Authorization token is invalid: jwt malformed')

    const response = await app.inject({ method: 'GET', url: '/__status' })
    const body = response.json() as ErrorBody

    expect(response.statusCode).toBe(401)
    expect(body.error?.message).toBe('Invalid or expired token')
    expect(body.error?.message.toLowerCase()).not.toContain('jwt')

    await app.close()
  })

  it('keeps 500 INTERNAL for a statusCode >= 500 and never leaks its message', async () => {
    const app = await appThrowing(503, 'upstream pg pool exhausted at db/index.ts:42')

    const response = await app.inject({ method: 'GET', url: '/__status' })
    const body = response.json() as ErrorBody

    expect(response.statusCode).toBe(500)
    expect(body.error?.code).toBe(ERROR_CODES.INTERNAL)
    expect(body.error?.message).toBe('Internal server error')

    await app.close()
  })

  it('logs a 4xx at warn and a 500 at error — the dashboard signal this fix exists for', async () => {
    const lines: string[] = []
    const stream = { write: (message: string) => void lines.push(message) }

    const app = await buildApp({ logger: { stream, level: 'warn' } })
    app.get('/__client', () => {
      const error = new Error('client mistake') as Error & { statusCode: number }
      error.statusCode = 413
      throw error
    })
    app.get('/__server', () => {
      throw new Error('server fault')
    })
    await app.ready()

    await app.inject({ method: 'GET', url: '/__client' })
    await app.inject({ method: 'GET', url: '/__server' })
    await app.close()

    const levels = lines
      .map((line) => JSON.parse(line) as { level: number; msg: string })
      .filter((entry) => entry.msg === 'request rejected' || entry.msg === 'unhandled error')
      .map((entry) => ({ level: entry.level, msg: entry.msg }))

    expect(levels).toEqual([
      { level: 40, msg: 'request rejected' },
      { level: 50, msg: 'unhandled error' },
    ])
  })
})
