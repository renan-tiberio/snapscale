import { beforeEach, describe, expect, it } from 'vitest'

import { ValueObjectError } from '../value-object-error/index.js'

import { Email, InvalidEmailError } from './email.js'

const VALID_EMAIL = 'user@example.com'
const INVALID_EMAIL_MESSAGE = 'Email must be a valid email address'

describe('Email', () => {
  let email: Email

  beforeEach(() => {
    email = new Email(VALID_EMAIL)
  })

  it('exposes the primitive through the value accessor', () => {
    expect(email.value).toBe(VALID_EMAIL)
  })

  it('does not hand the primitive out through implicit string coercion', () => {
    expect(String(email)).not.toContain(VALID_EMAIL)
  })

  it('is frozen, so no property can be added or replaced', () => {
    expect(Object.isFrozen(email)).toBe(true)
  })

  it('declares value as a getter with no setter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Email.prototype, 'value')

    expect(typeof descriptor?.get).toBe('function')
    expect(descriptor?.set).toBeUndefined()
  })

  it.each([
    { label: 'a string with no @', value: 'not-an-email' },
    { label: 'an empty string', value: '' },
    { label: 'an address with no domain', value: 'user@' },
    { label: 'an address containing a space', value: 'user name@example.com' },
  ])('rejects $label at construction', ({ value }) => {
    expect(() => new Email(value)).toThrow(InvalidEmailError)
    expect(() => new Email(value)).toThrow(INVALID_EMAIL_MESSAGE)
  })
})

describe('InvalidEmailError', () => {
  it('is a ValueObjectError, so one catch covers every value object', () => {
    expect(new InvalidEmailError()).toBeInstanceOf(ValueObjectError)
  })

  it('names itself for logs', () => {
    expect(new InvalidEmailError().name).toBe('InvalidEmailError')
  })
})
