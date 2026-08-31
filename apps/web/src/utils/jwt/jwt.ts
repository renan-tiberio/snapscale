import { JwtToken } from '@snapscale/shared'

/**
 * Client-side JWT decoding — never verification. There is no secret on the
 * client to verify a signature with; the token already came from a trusted
 * `https://…/auth/file-token` response (`services/auth`). All this reads
 * is the `exp` claim, so `hooks/queries/useFileToken.ts` can refresh ahead
 * of the server-side expiry instead of finding out via a 401.
 */

const BASE64URL_BLOCK_SIZE = 4
const EPOCH_SECONDS_TO_MS = 1000

type Base64UrlDecodeParams = { segment: string }

const base64UrlDecode = ({ segment }: Base64UrlDecodeParams): string => {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength =
    (BASE64URL_BLOCK_SIZE - (base64.length % BASE64URL_BLOCK_SIZE)) % BASE64URL_BLOCK_SIZE

  return atob(base64 + '='.repeat(paddingLength))
}

type DecodeJwtExpiryMsParams = { token: string }

/** The `exp` claim in epoch milliseconds, or `null` if `token` isn't a decodable JWT. */
export const decodeJwtExpiryMs = ({ token }: DecodeJwtExpiryMsParams): number | null => {
  let jwt: JwtToken

  try {
    jwt = new JwtToken(token)
  } catch {
    return null
  }

  const payloadSegment = jwt.value.split('.')[1]

  if (payloadSegment === undefined) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode({ segment: payloadSegment })) as { exp?: unknown }

    return typeof payload.exp === 'number' ? payload.exp * EPOCH_SECONDS_TO_MS : null
  } catch {
    return null
  }
}

type IsJwtLiveParams = { token: string; nowMs?: number }

/**
 * `true` only while `token`'s `exp` claim is still in the future. A token
 * that fails to decode is treated as not live — never as an unknown we
 * serve anyway.
 */
export const isJwtLive = ({ token, nowMs = Date.now() }: IsJwtLiveParams): boolean => {
  const expiryMs = decodeJwtExpiryMs({ token })

  return expiryMs !== null && expiryMs > nowMs
}
