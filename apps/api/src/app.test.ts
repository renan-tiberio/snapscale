import { ERROR_CODES } from '@snapscale/shared'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { buildApp } from '@/app.js'

describe('buildApp', () => {
  it('responds 200 with the ok envelope on GET /health', async () => {
    const app = await buildApp({ logger: false })

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true, data: { status: 'ok' } })

    await app.close()
  })

  it('responds 404 with a NOT_FOUND envelope for an unknown route', async () => {
    const app = await buildApp({ logger: false })

    const response = await app.inject({ method: 'GET', url: '/this-route-does-not-exist' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: ERROR_CODES.NOT_FOUND },
    })

    await app.close()
  })

  it('maps an uncaught error to a 500 INTERNAL envelope without leaking the stack', async () => {
    const app = await buildApp({ logger: false })
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

    await app.close()
  })

  it('maps a zod validation failure to a 422 VALIDATION_ERROR envelope', async () => {
    const app = await buildApp({ logger: false })
    app.withTypeProvider().get(
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

    await app.close()
  })

  it('serves an OpenAPI document at /docs/json that documents the health route', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/docs/json' })
    const document = response.json() as { paths: Record<string, unknown> }

    expect(response.statusCode).toBe(200)
    expect(document.paths).toHaveProperty('/health')

    await app.close()
  })

  it('serves the swagger UI shell at /docs', async () => {
    const app = await buildApp({ logger: false })
    await app.ready()

    const response = await app.inject({ method: 'GET', url: '/docs' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')

    await app.close()
  })
})
