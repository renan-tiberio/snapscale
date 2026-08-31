import { ValueObjectError } from '../value-object-error/index.js'

const JWT_COMPACT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export class InvalidJwtTokenError extends ValueObjectError {
  constructor() {
    super({
      name: 'InvalidJwtTokenError',
      subject: 'JwtToken',
      expectation: 'three dot-separated base64url segments',
    })
  }
}

/** Shape only — a well-formed token is not a verified one; signatures are checked by the api. */
export class JwtToken {
  readonly #value: string

  constructor(value: string) {
    if (!JWT_COMPACT_PATTERN.test(value)) throw new InvalidJwtTokenError()

    this.#value = value
    Object.freeze(this)
  }

  get value(): string {
    return this.#value
  }
}
