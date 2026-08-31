import { ERROR_CODES } from '@snapscale/shared'
import { describe, expect, it } from 'vitest'

import { ApiError } from '../http'

import { getFileToken, requestOtp, verifyOtp } from './auth'

import { TEST_FILE_TOKEN, TEST_TOKEN, testUser, VALID_OTP } from '@/test/msw/handlers'

describe('auth service', () => {
  it('reports an OTP request as accepted for an address it has never seen', async () => {
    await expect(requestOtp({ email: 'stranger@example.com' })).resolves.toEqual({
      requested: true,
    })
  })

  it('exchanges a valid code for the session token and its user', async () => {
    const session = await verifyOtp({ email: testUser.email, code: VALID_OTP })

    expect(session).toEqual({ token: TEST_TOKEN, user: testUser })
  })

  it('rejects an invalid code with an UNAUTHORIZED ApiError', async () => {
    const rejected = verifyOtp({ email: testUser.email, code: '000000' })

    await expect(rejected).rejects.toBeInstanceOf(ApiError)
    await expect(rejected).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid or expired code',
      status: 401,
    })
  })

  it('fetches the file-scoped token, which is never the session token', async () => {
    const response = await getFileToken()

    expect(response.token).toBe(TEST_FILE_TOKEN)
    expect(response.token).not.toBe(TEST_TOKEN)
  })
})
