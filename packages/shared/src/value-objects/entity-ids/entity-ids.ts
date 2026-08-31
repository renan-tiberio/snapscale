import { z } from 'zod'

import { ValueObjectError } from '../value-object-error/index.js'

const uuidSchema = z.string().uuid()

export type InvalidEntityIdErrorParams = {
  readonly subject: string
}

export class InvalidEntityIdError extends ValueObjectError {
  constructor({ subject }: InvalidEntityIdErrorParams) {
    super({ name: 'InvalidEntityIdError', subject, expectation: 'a UUID' })
  }
}

type ParseEntityIdParams = {
  readonly subject: string
  readonly value: string
}

const parseEntityId = ({ subject, value }: ParseEntityIdParams): string => {
  if (!uuidSchema.safeParse(value).success) throw new InvalidEntityIdError({ subject })

  return value
}

export class AlbumId {
  readonly #value: string

  constructor(value: string) {
    this.#value = parseEntityId({ subject: 'AlbumId', value })
    Object.freeze(this)
  }

  get value(): string {
    return this.#value
  }
}

export class ImageId {
  readonly #value: string

  constructor(value: string) {
    this.#value = parseEntityId({ subject: 'ImageId', value })
    Object.freeze(this)
  }

  get value(): string {
    return this.#value
  }
}

export class UserId {
  readonly #value: string

  constructor(value: string) {
    this.#value = parseEntityId({ subject: 'UserId', value })
    Object.freeze(this)
  }

  get value(): string {
    return this.#value
  }
}
