import nodemailer from 'nodemailer'

/**
 * The narrow surface the otp service needs — deliberately not `nodemailer`'s
 * `Transporter` type, so tests can fake it with a plain object instead of a
 * real transport.
 */
export interface MailOptions {
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly encoding?: string
}

export interface Mailer {
  sendMail: (options: MailOptions) => Promise<void>
}

export interface MailerConfig {
  readonly SMTP_HOST: string
  readonly SMTP_PORT: number
}

/** Nodemailer transport pointed at SMTP config (MailHog locally — see `.env.example`). */
export function createMailer(config: MailerConfig): Mailer {
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: false,
  })

  return {
    sendMail: async (options) => {
      await transporter.sendMail(options)
    },
  }
}

const FROM_ADDRESS = 'SnapScale <no-reply@snapscale.local>'

export interface OtpEmailInput {
  readonly to: string
  readonly code: string
}

/**
 * Sends the code in both the subject and body (`docs/03-technical-design.md`
 * §5) — `encoding: '7bit'` keeps the plain-ASCII body byte-for-byte instead
 * of nodemailer's default quoted-printable/base64 transform, so the code is
 * a literal substring wherever it lands (MailHog's REST API, mail clients).
 */
export async function sendOtpEmail(mailer: Mailer, input: OtpEmailInput): Promise<void> {
  await mailer.sendMail({
    from: FROM_ADDRESS,
    to: input.to,
    subject: `Your SnapScale verification code is ${input.code}`,
    text: `Your SnapScale verification code is ${input.code}. It expires soon — if you didn't request this, ignore this email.`,
    encoding: '7bit',
  })
}
