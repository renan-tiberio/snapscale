/**
 * One home for the status codes both apps name: the api sends them, and the web response
 * interceptor branches on `UNAUTHORIZED` to drop the session — a number copied into two
 * apps is a number that can drift in one of them.
 */
export const HTTP_STATUS = {
  OK: 200,
  NOT_MODIFIED: 304,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
} as const
