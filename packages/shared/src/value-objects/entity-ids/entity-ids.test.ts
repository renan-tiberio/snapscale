import { describe, expect, it } from 'vitest'

import { ValueObjectError } from '../value-object-error/index.js'

import { AlbumId, ImageId, InvalidEntityIdError, UserId } from './entity-ids.js'

const VALID_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

const ENTITY_ID_CASES = [
  {
    subject: 'AlbumId',
    prototype: AlbumId.prototype,
    create: (value: string) => new AlbumId(value),
  },
  {
    subject: 'ImageId',
    prototype: ImageId.prototype,
    create: (value: string) => new ImageId(value),
  },
  { subject: 'UserId', prototype: UserId.prototype, create: (value: string) => new UserId(value) },
]

describe.each(ENTITY_ID_CASES)('$subject', ({ subject, prototype, create }) => {
  it('exposes the primitive through the value accessor', () => {
    expect(create(VALID_UUID).value).toBe(VALID_UUID)
  })

  it('does not hand the primitive out through implicit string coercion', () => {
    expect(String(create(VALID_UUID))).not.toContain(VALID_UUID)
  })

  it('is frozen, so no property can be added or replaced', () => {
    expect(Object.isFrozen(create(VALID_UUID))).toBe(true)
  })

  it('declares value as a getter with no setter', () => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')

    expect(typeof descriptor?.get).toBe('function')
    expect(descriptor?.set).toBeUndefined()
  })

  it.each([
    { label: 'an empty string', value: '' },
    { label: 'a bare number', value: '123' },
    { label: 'a non-uuid string', value: 'not-a-uuid' },
    { label: 'a uuid missing a group', value: '3fa85f64-5717-4562-b3fc' },
  ])('rejects $label at construction', ({ value }) => {
    expect(() => create(value)).toThrow(InvalidEntityIdError)
    expect(() => create(value)).toThrow(`${subject} must be a UUID`)
  })
})

describe('InvalidEntityIdError', () => {
  it('is a ValueObjectError, so one catch covers every value object', () => {
    expect(new InvalidEntityIdError({ subject: 'AlbumId' })).toBeInstanceOf(ValueObjectError)
  })

  it('names itself for logs', () => {
    expect(new InvalidEntityIdError({ subject: 'AlbumId' }).name).toBe('InvalidEntityIdError')
  })

  it('names the entity that rejected the value, so the caller knows which id was wrong', () => {
    expect(() => new ImageId(VALID_UUID.replace('3', 'z'))).toThrow('ImageId must be a UUID')
  })
})
