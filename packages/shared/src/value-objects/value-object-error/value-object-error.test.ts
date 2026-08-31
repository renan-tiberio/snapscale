import { beforeEach, describe, expect, it } from 'vitest'

import { ValueObjectError } from './value-object-error.js'

describe('ValueObjectError', () => {
  let error: ValueObjectError

  beforeEach(() => {
    error = new ValueObjectError({
      name: 'InvalidThingError',
      subject: 'Thing',
      expectation: 'a thing',
    })
  })

  it('is a plain Error, so existing catch sites keep working', () => {
    expect(error).toBeInstanceOf(Error)
  })

  it('builds the message from the subject and the expectation', () => {
    expect(error.message).toBe('Thing must be a thing')
  })

  it('reports the concrete subclass name, not the base name', () => {
    expect(error.name).toBe('InvalidThingError')
  })
})
