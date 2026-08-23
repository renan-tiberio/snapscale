/**
 * Client-side JWT decoding — never verification. There is no secret on the
 * client to verify a signature with; the token already came from a trusted
 * `https://…/auth/file-token` response (`services/auth.ts`). All this reads
 * is the `exp` claim, so `hooks/queries/useFileToken.ts` can refresh ahead
 * of the 60s server-side expiry instead of finding out via a 401.
 */

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (base64.length % 4)) % 4

  return atob(base64 + '='.repeat(paddingLength))
}

/** The `exp` claim in epoch milliseconds, or `null` if `token` isn't a decodable JWT. */
export function decodeJwtExpiryMs(token: string): number | null {
  const parts = token.split('.')
  const payloadSegment = parts[1]

  if (parts.length !== 3 || payloadSegment === undefined) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadSegment)) as { exp?: unknown }

    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

/**
 * `true` only while `token`'s `exp` claim is still in the future. A token
 * that fails to decode is treated as not live — never as an unknown we
 * serve anyway.
 */
export function isJwtLive(token: string, nowMs: number = Date.now()): boolean {
  const expiryMs = decodeJwtExpiryMs(token)

  return expiryMs !== null && expiryMs > nowMs
}
