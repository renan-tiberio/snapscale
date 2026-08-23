import { describe, expect, it, vi } from 'vitest'

import type { MailOptions, Mailer } from '@/services/mailer.js'

import { sendOtpEmail } from '@/services/mailer.js'

describe('sendOtpEmail', () => {
  it('sends the code in both the subject and body, 7bit-encoded, to the given address', async () => {
    const sendMail = vi.fn<Mailer['sendMail']>(async () => undefined)
    const mailer: Mailer = { sendMail }

    await sendOtpEmail(mailer, { to: 'ada@example.com', code: '123456' })

    expect(sendMail).toHaveBeenCalledTimes(1)
    const options = sendMail.mock.calls[0]?.[0] as MailOptions

    expect(options.to).toBe('ada@example.com')
    expect(options.subject).toContain('123456')
    expect(options.text).toContain('123456')
    expect(options.encoding).toBe('7bit')
    expect(options.from).toBeTruthy()
  })
})
