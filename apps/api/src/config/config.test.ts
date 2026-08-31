import { describe, expect, it } from 'vitest'

import { loadConfig } from './config.js'

const validEnv = {
  DATABASE_URL: 'postgres://snapscale:snapscale@localhost:5432/snapscale_api',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  JWT_SECRET: 'test-secret',
  UPLOAD_DIR: '/tmp/snapscale-uploads',
}

describe('loadConfig', () => {
  it('parses a valid environment and applies the documented defaults', () => {
    const config = loadConfig({ env: validEnv })

    expect(config).toMatchObject({
      PORT: 4000,
      OTP_TTL_SECONDS: 600,
      SMTP_PORT: 1025,
      DATABASE_URL: validEnv.DATABASE_URL,
      SMTP_HOST: validEnv.SMTP_HOST,
      JWT_SECRET: validEnv.JWT_SECRET,
      UPLOAD_DIR: validEnv.UPLOAD_DIR,
    })
  })

  it('respects an explicit PORT override instead of the default', () => {
    const config = loadConfig({ env: { ...validEnv, PORT: '5050' } })

    expect(config.PORT).toBe(5050)
  })

  it('respects an explicit OTP_TTL_SECONDS override instead of the default', () => {
    const config = loadConfig({ env: { ...validEnv, OTP_TTL_SECONDS: '120' } })

    expect(config.OTP_TTL_SECONDS).toBe(120)
  })

  it('crashes naming the field when JWT_SECRET is missing', () => {
    const { JWT_SECRET, ...envWithoutSecret } = validEnv
    void JWT_SECRET // only the removal matters — read it so lint sees it used

    expect(() => loadConfig({ env: envWithoutSecret })).toThrowError(/JWT_SECRET/)
  })

  it('crashes naming the field when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...envWithoutDb } = validEnv
    void DATABASE_URL // only the removal matters — read it so lint sees it used

    expect(() => loadConfig({ env: envWithoutDb })).toThrowError(/DATABASE_URL/)
  })

  it('crashes naming the field when SMTP_PORT is not a number', () => {
    expect(() => loadConfig({ env: { ...validEnv, SMTP_PORT: 'not-a-port' } })).toThrowError(
      /SMTP_PORT/,
    )
  })

  it('crashes naming every offending field when several are missing', () => {
    expect(() => loadConfig({ env: {} })).toThrowError(
      /DATABASE_URL.*SMTP_HOST.*SMTP_PORT.*JWT_SECRET.*UPLOAD_DIR|UPLOAD_DIR.*JWT_SECRET.*SMTP_PORT.*SMTP_HOST.*DATABASE_URL/s,
    )
  })
})
