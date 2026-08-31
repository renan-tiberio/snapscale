import nodemailer from 'nodemailer'

import type { Email, OtpCode } from '@snapscale/shared'

/** Narrower than nodemailer's `Transporter` on purpose, so tests can fake it with a plain object. */
export type MailOptions = {
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly encoding?: string
}

export type Mailer = {
  sendMail: (options: MailOptions) => Promise<void>
}

export type MailerConfig = {
  readonly SMTP_HOST: string
  readonly SMTP_PORT: number
}

/** Nodemailer transport pointed at SMTP config (MailHog locally — see `.env.example`). */
export const createMailer = ({ SMTP_HOST, SMTP_PORT }: MailerConfig): Mailer => {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
  })

  return {
    sendMail: async (options) => {
      await transporter.sendMail(options)
    },
  }
}

const FROM_ADDRESS = 'SnapScale <no-reply@snapscale.local>'

type SendOtpEmailParams = {
  readonly mailer: Mailer
  readonly to: Email
  readonly code: OtpCode
}

/**
 * The code goes in both the subject and the body. `encoding: '7bit'` keeps the plain-ASCII body
 * byte-for-byte instead of nodemailer's default quoted-printable transform, so the code stays a
 * literal substring wherever it lands (MailHog's REST API, mail clients).
 */
export const sendOtpEmail = async ({ mailer, to, code }: SendOtpEmailParams): Promise<void> => {
  await mailer.sendMail({
    from: FROM_ADDRESS,
    to: to.value,
    subject: `Your SnapScale verification code is ${code.value}`,
    text: `Your SnapScale verification code is ${code.value}. It expires soon — if you didn't request this, ignore this email.`,
    encoding: '7bit',
  })
}
