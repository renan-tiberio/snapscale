export type ValueObjectErrorParams = {
  readonly name: string
  readonly subject: string
  readonly expectation: string
}

/**
 * Base for every value-object rejection, so one `catch` can recognise them all.
 * The rejected value is deliberately absent from the message: OTP codes and JWTs
 * come through here, and messages end up in logs.
 */
export class ValueObjectError extends Error {
  constructor({ name, subject, expectation }: ValueObjectErrorParams) {
    super(`${subject} must be ${expectation}`)
    this.name = name
  }
}
