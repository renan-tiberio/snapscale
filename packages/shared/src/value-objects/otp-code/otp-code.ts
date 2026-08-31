import { ValueObjectError } from '../value-object-error/index.js'

/** The one declaration of how long a code is: the pattern, the api generator and the UI all read it. */
export const OTP_CODE_LENGTH = 6

/**
 * Also `verifyOtpSchema`'s regex, imported rather than restated: the 422 the boundary returns
 * and this constructor's throw must reject the same strings, or a body that passed validation
 * throws inside the route handler and the client gets a 500 instead.
 */
export const OTP_CODE_PATTERN = new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`)

export class InvalidOtpCodeError extends ValueObjectError {
  constructor() {
    super({
      name: 'InvalidOtpCodeError',
      subject: 'OtpCode',
      expectation: `exactly ${OTP_CODE_LENGTH} digits`,
    })
  }
}

export class OtpCode {
  readonly #value: string

  constructor(value: string) {
    if (!OTP_CODE_PATTERN.test(value)) throw new InvalidOtpCodeError()

    this.#value = value
    Object.freeze(this)
  }

  get value(): string {
    return this.#value
  }
}
