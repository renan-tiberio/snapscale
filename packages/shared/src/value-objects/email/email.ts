import { z } from 'zod'

import { ValueObjectError } from '../value-object-error/index.js'

/** Also the `email` field of every auth schema, imported rather than restated, so one rule decides. */
export const emailSchema = z.string().email()

export class InvalidEmailError extends ValueObjectError {
  constructor() {
    super({ name: 'InvalidEmailError', subject: 'Email', expectation: 'a valid email address' })
  }
}

export class Email {
  readonly #value: string

  constructor(value: string) {
    if (!emailSchema.safeParse(value).success) throw new InvalidEmailError()

    this.#value = value
    Object.freeze(this)
  }

  get value(): string {
    return this.#value
  }
}
