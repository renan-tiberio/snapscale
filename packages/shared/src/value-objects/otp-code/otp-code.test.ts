import { beforeEach, describe, expect, it } from 'vitest'

import { ValueObjectError } from '../value-object-error/index.js'

import { InvalidOtpCodeError, OtpCode } from './otp-code.js'

const VALID_CODE = '123456'
const INVALID_CODE_MESSAGE = 'OtpCode must be exactly 6 digits'

describe('OtpCode', () => {
  let code: OtpCode

  beforeEach(() => {
    code = new OtpCode(VALID_CODE)
  })

  it('exposes the primitive through the value accessor', () => {
    expect(code.value).toBe(VALID_CODE)
  })

  it('keeps leading zeroes, which a numeric type would drop', () => {
    expect(new OtpCode('000123').value).toBe('000123')
  })

  it('does not hand the primitive out through implicit string coercion', () => {
    expect(String(code)).not.toContain(VALID_CODE)
  })

  it('is frozen, so no property can be added or replaced', () => {
    expect(Object.isFrozen(code)).toBe(true)
  })

  it('declares value as a getter with no setter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(OtpCode.prototype, 'value')

    expect(typeof descriptor?.get).toBe('function')
    expect(descriptor?.set).toBeUndefined()
  })

  it.each([
    { label: 'five digits', value: '12345' },
    { label: 'seven digits', value: '1234567' },
    { label: 'letters', value: 'abcdef' },
    { label: 'an empty string', value: '' },
    { label: 'six digits with surrounding whitespace', value: ' 123456 ' },
  ])('rejects $label at construction', ({ value }) => {
    expect(() => new OtpCode(value)).toThrow(InvalidOtpCodeError)
    expect(() => new OtpCode(value)).toThrow(INVALID_CODE_MESSAGE)
  })

  it('never repeats the rejected code in the message, which reaches the logs', () => {
    expect(() => new OtpCode('99999')).toThrow(INVALID_CODE_MESSAGE)
    expect(() => new OtpCode('99999')).not.toThrow('99999')
  })
})

describe('InvalidOtpCodeError', () => {
  it('is a ValueObjectError, so one catch covers every value object', () => {
    expect(new InvalidOtpCodeError()).toBeInstanceOf(ValueObjectError)
  })

  it('names itself for logs', () => {
    expect(new InvalidOtpCodeError().name).toBe('InvalidOtpCodeError')
  })
})
