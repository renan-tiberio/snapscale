import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'

/**
 * Real MailHog in a throwaway container per test file — random mapped ports
 * so the suite never depends on (or collides with) the compose instance on
 * 1025/8025 (`docs/05-decision-log.md` decision 11, extended here to email).
 */
const MAILHOG_IMAGE = 'mailhog/mailhog:v1.0.1'
const SMTP_PORT = 1025
const HTTP_PORT = 8025

export interface MailhogMessage {
  readonly to: readonly string[]
  readonly subject: string
  readonly body: string
}

export interface TestMailhog {
  readonly smtpHost: string
  readonly smtpPort: number
  /** Messages currently in the inbox whose `To` header contains `email`. */
  fetchMessagesTo: (email: string) => Promise<MailhogMessage[]>
  stop: () => Promise<void>
}

interface RawMailhogItem {
  readonly Content: {
    readonly Headers: {
      readonly To?: readonly string[]
      readonly Subject?: readonly string[]
    }
    readonly Body: string
  }
}

interface RawMailhogList {
  readonly items: readonly RawMailhogItem[]
}

function toMessage(item: RawMailhogItem): MailhogMessage {
  return {
    to: item.Content.Headers.To ?? [],
    subject: item.Content.Headers.Subject?.[0] ?? '',
    body: item.Content.Body,
  }
}

export async function startMailhog(): Promise<TestMailhog> {
  const container: StartedTestContainer = await new GenericContainer(MAILHOG_IMAGE)
    .withExposedPorts(SMTP_PORT, HTTP_PORT)
    .withWaitStrategy(Wait.forListeningPorts())
    .start()

  const host = container.getHost()
  const httpPort = container.getMappedPort(HTTP_PORT)
  const apiUrl = `http://${host}:${httpPort}/api/v2/messages`

  return {
    smtpHost: host,
    smtpPort: container.getMappedPort(SMTP_PORT),
    fetchMessagesTo: async (email) => {
      const response = await fetch(apiUrl)
      const body = (await response.json()) as RawMailhogList
      return body.items.map(toMessage).filter((message) => message.to.includes(email))
    },
    stop: async () => {
      await container.stop()
    },
  }
}

/**
 * SMTP delivery happens over the network even though `requestOtp` awaits
 * `sendMail` before responding — this polls MailHog's REST API for the
 * message instead of assuming it is already indexed the instant the HTTP
 * response for `/auth/otp/request` comes back.
 */
export async function waitForMessagesTo(
  mailhog: TestMailhog,
  email: string,
  attempts = 20,
  delayMs = 250,
): Promise<MailhogMessage[]> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const messages = await mailhog.fetchMessagesTo(email)

    if (messages.length > 0) {
      return messages
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  return []
}
