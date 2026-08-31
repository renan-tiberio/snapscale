import { expect } from '@playwright/test'

import { MAILHOG_BASE_URL } from './env.js'

import type { APIRequestContext } from '@playwright/test'

/**
 * The slice of MailHog's `GET /api/v2/messages` payload this helper relies on.
 * MailHog returns much more (Raw, MIME parts, Created…); only what is asserted
 * on is typed, so an unrelated MailHog change cannot break compilation here.
 */
type MailhogRecipient = {
  readonly Mailbox: string
  readonly Domain: string
}

type MailhogMessage = {
  readonly ID: string
  readonly To: readonly MailhogRecipient[]
  readonly Content: {
    readonly Headers: Record<string, readonly string[] | undefined>
    readonly Body: string
  }
}

type MailhogMessagesResponse = {
  readonly total: number
  readonly count: number
  readonly items: readonly MailhogMessage[]
}

/** How long to wait for an OTP email before failing the test. */
const DEFAULT_TIMEOUT_MS = 20_000 // 20 seconds
/** Gap between polls of the MailHog inbox. */
const POLL_INTERVAL_MS = 250
/** MailHog returns newest-first; one page is plenty for a single-journey inbox. */
const MESSAGE_PAGE_SIZE = 50
/** Skips the `"0."` prefix `Number.toString` always produces before the digits. */
const RANDOM_SUFFIX_START = 2
/** Six base-36 digits is enough entropy to avoid a same-millisecond collision. */
const RANDOM_SUFFIX_END = 8
const RANDOM_SUFFIX_RADIX = 36
const HTTP_OK = 200

const SIX_DIGIT_CODE = /\b(\d{6})\b/

const recipientAddress = ({ recipient }: { recipient: MailhogRecipient }): string =>
  `${recipient.Mailbox}@${recipient.Domain}`.toLowerCase()

const isAddressedTo = ({ message, email }: { message: MailhogMessage; email: string }): boolean =>
  message.To.some((recipient) => recipientAddress({ recipient }) === email.toLowerCase())

/**
 * The api sends the code in both the subject and the plain-text body with
 * `encoding: '7bit'` (`apps/api/src/services/mailer.ts`), so it survives as a
 * literal substring — no quoted-printable decoding needed on this side.
 */
const extractCode = ({ message }: { message: MailhogMessage }): string | null => {
  const subject = message.Content.Headers.Subject?.join(' ') ?? ''
  const match = SIX_DIGIT_CODE.exec(subject) ?? SIX_DIGIT_CODE.exec(message.Content.Body)

  return match?.[1] ?? null
}

const fetchMessages = async ({
  request,
}: {
  request: APIRequestContext
}): Promise<readonly MailhogMessage[]> => {
  const response = await request.get(
    `${MAILHOG_BASE_URL}/api/v2/messages?limit=${String(MESSAGE_PAGE_SIZE)}`,
  )
  expect(response.status(), 'MailHog inbox should be reachable').toBe(HTTP_OK)

  const payload = (await response.json()) as MailhogMessagesResponse

  return payload.items
}

/**
 * Empties the MailHog inbox (`DELETE /api/v1/messages`).
 *
 * Called between tests so "the newest message to this address" can never be a
 * leftover from an earlier run — the unique-email-per-run convention already
 * makes collisions unlikely, this makes them impossible.
 */
export const purgeInbox = async ({ request }: { request: APIRequestContext }): Promise<void> => {
  const response = await request.delete(`${MAILHOG_BASE_URL}/api/v1/messages`)

  expect(response.status(), 'MailHog inbox should be purgeable').toBe(HTTP_OK)
}

export type WaitForOtpCodeParams = {
  readonly request: APIRequestContext
  readonly email: string
  readonly timeoutMs?: number
}

/**
 * Polls MailHog until an email addressed to `email` carries a 6-digit code,
 * and returns that code. The newest matching message wins (MailHog lists
 * messages newest-first), so a resend supersedes the code it replaced.
 *
 * Throws — rather than returning null — when the deadline passes: a missing
 * OTP email is a failed journey, not a soft condition for the caller to branch
 * on.
 */
export const waitForOtpCode = async ({
  request,
  email,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: WaitForOtpCodeParams): Promise<string> => {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const messages = await fetchMessages({ request })
    const match = messages.find((message) => isAddressedTo({ message, email }))
    const code = match === undefined ? null : extractCode({ message: match })

    if (code !== null) {
      return code
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `No OTP email with a 6-digit code arrived for ${email} within ${String(timeoutMs)}ms ` +
          `(MailHog at ${MAILHOG_BASE_URL} held ${String(messages.length)} message(s)).`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
}

/** A per-run address, so every run starts from a brand-new account. */
export const uniqueEmail = ({ prefix = 'journey' }: { prefix?: string } = {}): string => {
  const unique = `${String(Date.now())}-${Math.random()
    .toString(RANDOM_SUFFIX_RADIX)
    .slice(RANDOM_SUFFIX_START, RANDOM_SUFFIX_END)}`

  return `${prefix}-${unique}@snapscale.test`
}
