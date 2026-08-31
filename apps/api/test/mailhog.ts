import { inject } from 'vitest'

import type { MailhogConnection } from './mailhog-container.js'

/**
 * Test-file-side access to the run's single MailHog container started by
 * `global-setup.ts` (via `./mailhog-container.ts`). Unlike that file, this
 * one is fine importing `vitest` (`inject`) — test files run in vitest's
 * normal worker context, not the separate `globalSetup` context.
 */

declare module 'vitest' {
  // `type` cannot participate in declaration merging — vitest's `ProvidedContext`
  // can only be augmented via `interface` (docs/06-code-standards.md §2).
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface ProvidedContext {
    /** Connection info for the run's one throwaway MailHog container. */
    mailhogConnection: MailhogConnection
  }
}

export type MailhogMessage = {
  readonly to: readonly string[]
  readonly subject: string
  readonly body: string
}

export type TestMailhog = {
  readonly smtpHost: string
  readonly smtpPort: number
  /** Messages currently in the inbox whose `To` header contains `email`. */
  fetchMessagesTo: (email: string) => Promise<MailhogMessage[]>
  /** Empties the inbox — call between tests so one test never sees another's mail. */
  purge: () => Promise<void>
}

type RawMailhogItem = {
  readonly Content: {
    readonly Headers: {
      readonly To?: readonly string[]
      readonly Subject?: readonly string[]
    }
    readonly Body: string
  }
}

type RawMailhogList = {
  readonly items: readonly RawMailhogItem[]
}

const toMessage = ({ item }: { item: RawMailhogItem }): MailhogMessage => ({
  to: item.Content.Headers.To ?? [],
  subject: item.Content.Headers.Subject?.[0] ?? '',
  body: item.Content.Body,
})

/**
 * Connects a test file to the run's already-started MailHog container
 * (provided by `global-setup.ts`). Cheap and synchronous — no container
 * lifecycle here; call `purge()` between tests for isolation instead.
 */
export const connectToMailhog = (): TestMailhog => {
  const { host, smtpPort, httpPort } = inject('mailhogConnection')
  const apiUrl = `http://${host}:${httpPort}/api/v2/messages`
  const deleteUrl = `http://${host}:${httpPort}/api/v1/messages`

  return {
    smtpHost: host,
    smtpPort,
    fetchMessagesTo: async (email) => {
      const response = await fetch(apiUrl)
      const body = (await response.json()) as RawMailhogList
      return body.items
        .map((item) => toMessage({ item }))
        .filter((message) => message.to.includes(email))
    },
    purge: async () => {
      await fetch(deleteUrl, { method: 'DELETE' })
    },
  }
}

/**
 * SMTP delivery happens over the network even though `requestOtp` awaits
 * `sendMail` before responding — this polls MailHog's REST API for the
 * message instead of assuming it is already indexed the instant the HTTP
 * response for `/auth/otp/request` comes back.
 */
export const waitForMessagesTo = async ({
  mailhog,
  email,
  attempts = 20,
  delayMs = 250,
}: {
  mailhog: TestMailhog
  email: string
  attempts?: number
  delayMs?: number
}): Promise<MailhogMessage[]> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const messages = await mailhog.fetchMessagesTo(email)

    if (messages.length > 0) {
      return messages
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return []
}
