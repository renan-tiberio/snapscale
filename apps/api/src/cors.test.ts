import { describe, expect, it } from 'vitest'

import { buildApp } from '@/app.js'

/**
 * Every other suite drives the app through `app.inject()`, which hands the
 * request straight to the router — so none of them can see a missing CORS
 * layer. The browser can: the SPA on :5173 calling the api on :4000 is a
 * cross-origin request, and without these headers it never leaves the
 * browser. Hence this suite (docs/03-technical-design.md §4).
 */
const WEB_ORIGIN = 'http://localhost:5173'
const FOREIGN_ORIGIN = 'http://evil.example'

describe('CORS between the web app origin and the api', () => {
  it('answers the preflight for a JSON POST coming from the web app', async () => {
    const app = await buildApp({ logger: false, webOrigin: WEB_ORIGIN })
    await app.ready()

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

    await app.close()
  })

  it('marks an actual cross-origin response as allowed', async () => {
    const app = await buildApp({ logger: false, webOrigin: WEB_ORIGIN })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: WEB_ORIGIN },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN)

    await app.close()
  })

  it('never hands its allow-origin header to an unlisted origin', async () => {
    const app = await buildApp({ logger: false, webOrigin: WEB_ORIGIN })
    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: FOREIGN_ORIGIN },
    })

    // The allowlist is the point: echoing any Origin back would make the
    // header decorative rather than a control.
    expect(response.headers['access-control-allow-origin']).not.toBe(FOREIGN_ORIGIN)

    await app.close()
  })

  it('allows the Authorization header the SPA sends on every guarded call', async () => {
    const app = await buildApp({ logger: false, webOrigin: WEB_ORIGIN })
    await app.ready()

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

    await app.close()
  })
})
