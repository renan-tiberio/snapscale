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

    // The allowlist is the point: echoing any Origin back — or answering
    // with a wildcard `origin: true`/`'*'` config — would make the header
    // decorative rather than a control. Only "absent" proves the allowlist
    // is enforced; "present but not exactly FOREIGN_ORIGIN" is also
    // satisfied by a wildcard config, which is the actual danger here.
    expect(response.headers['access-control-allow-origin']).toBeUndefined()

    await app.close()
  })

  it('never grants a preflight from an unlisted origin an allow-origin header', async () => {
    const app = await buildApp({ logger: false, webOrigin: WEB_ORIGIN })
    await app.ready()

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/auth/otp/request',
      headers: {
        origin: FOREIGN_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })

    // A browser only trusts a preflight response once
    // access-control-allow-origin is present *and* matches — so this header
    // (not allow-methods/allow-headers, which the middleware answers with
    // regardless of origin) is the one control point that must be absent
    // for a foreign origin, on the preflight surface as well as the simple
    // request above. An `origin: true`/`'*'` config would echo or emit a
    // value here instead of leaving it undefined.
    expect(response.headers['access-control-allow-origin']).toBeUndefined()

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
