/**
 * Builds JWT-*shaped* test tokens — `header.payload.signature`, base64url
 * encoded, unsigned. `utils/jwt.ts` never verifies a signature (the client
 * has no secret to verify with); it only reads the `exp` claim out of the
 * payload, so an unsigned token is indistinguishable from a real one for
 * every test in this suite.
 */
function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function createTestJwt(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(payload))

  return `${header}.${body}.test-signature`
}

/**
 * A `scope: 'file'` test token whose `exp` claim is `ttlMs` from now —
 * negative `ttlMs` produces an already-expired token, mirroring the real
 * `GET /auth/file-token` contract (`apps/api/src/routes/file-token.ts`).
 */
export function createFileTokenWithTtlMs(ttlMs: number, nowMs: number = Date.now()): string {
  return createTestJwt({ sub: 'test-user', scope: 'file', exp: Math.floor((nowMs + ttlMs) / 1000) })
}
