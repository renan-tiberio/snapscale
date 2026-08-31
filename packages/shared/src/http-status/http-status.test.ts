import { describe, expect, it } from 'vitest'

import { HTTP_STATUS } from './http-status.js'

describe('HTTP_STATUS', () => {
  it('exposes exactly the statuses the two apps name — sent, or received and mapped', () => {
    expect(HTTP_STATUS).toEqual({
      OK: 200,
      NOT_MODIFIED: 304,
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      NOT_FOUND: 404,
      PAYLOAD_TOO_LARGE: 413,
      UNSUPPORTED_MEDIA_TYPE: 415,
      UNPROCESSABLE_ENTITY: 422,
      TOO_MANY_REQUESTS: 429,
    })
  })
})
