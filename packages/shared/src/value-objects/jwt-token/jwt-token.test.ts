import { beforeEach, describe, expect, it } from 'vitest'

import { ValueObjectError } from '../value-object-error/index.js'

import { InvalidJwtTokenError, JwtToken } from './jwt-token.js'

const VALID_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const INVALID_TOKEN_MESSAGE = 'JwtToken must be three dot-separated base64url segments'

describe('JwtToken', () => {
  let token: JwtToken

  beforeEach(() => {
    token = new JwtToken(VALID_TOKEN)
  })

  it('exposes the primitive through the value accessor', () => {
    expect(token.value).toBe(VALID_TOKEN)
  })

  it('accepts the base64url alphabet, including - and _', () => {
    expect(new JwtToken('a-b.c_d.e-f_g').value).toBe('a-b.c_d.e-f_g')
  })

  it('does not hand the primitive out through implicit string coercion', () => {
    expect(String(token)).not.toContain(VALID_TOKEN)
  })

  it('is frozen, so no property can be added or replaced', () => {
    expect(Object.isFrozen(token)).toBe(true)
  })

  it('declares value as a getter with no setter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(JwtToken.prototype, 'value')

    expect(typeof descriptor?.get).toBe('function')
    expect(descriptor?.set).toBeUndefined()
  })

  it.each([
    { label: 'an empty string', value: '' },
    { label: 'a single segment', value: 'onlyone' },
    { label: 'two segments', value: 'header.payload' },
    { label: 'four segments', value: 'a.b.c.d' },
    { label: 'an empty middle segment', value: 'a..c' },
    { label: 'a segment with characters outside base64url', value: 'a b.c.d' },
    { label: 'standard base64 padding', value: 'a.b.c=' },
  ])('rejects $label at construction', ({ value }) => {
    expect(() => new JwtToken(value)).toThrow(InvalidJwtTokenError)
    expect(() => new JwtToken(value)).toThrow(INVALID_TOKEN_MESSAGE)
  })

  it('never repeats the rejected token in the message, which reaches the logs', () => {
    expect(() => new JwtToken('secret.token')).toThrow(INVALID_TOKEN_MESSAGE)
    expect(() => new JwtToken('secret.token')).not.toThrow('secret.token')
  })
})

describe('InvalidJwtTokenError', () => {
  it('is a ValueObjectError, so one catch covers every value object', () => {
    expect(new InvalidJwtTokenError()).toBeInstanceOf(ValueObjectError)
  })

  it('names itself for logs', () => {
    expect(new InvalidJwtTokenError().name).toBe('InvalidJwtTokenError')
  })
})
