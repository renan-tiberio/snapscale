import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'

/**
 * Real MailHog in a throwaway container, started once per run from
 * `global-setup.ts` (mirrors Postgres) with random mapped ports, so the
 * suite never depends on the compose instance on 1025/8025
 * (docs/05-decision-log.md decision 11, extended here to email).
 *
 * Must start here, not in a test file's own `beforeAll`: testcontainers
 * 12.1.0 hardcodes a 10s wait for Docker to report the container's port
 * bindings, with no public API to raise it, and that window loses ~1 in 10
 * runs when it contends with sibling test files' CPU-bound work (e.g.
 * `sharp` encodes) under vitest's `maxThreads: 4`. Postgres never showed
 * this flake because it already starts here, before any test worker thread
 * exists to contend with it.
 *
 * This file must not import `vitest` — it is loaded from `global-setup.ts`,
 * which runs in a separate context where doing so corrupts vitest's own
 * worker state. `./mailhog.ts` is where test files use `vitest`'s
 * `inject()` to reach the container this file starts.
 */
const MAILHOG_IMAGE = 'mailhog/mailhog:v1.0.1'
const SMTP_PORT = 1025
const HTTP_PORT = 8025

/** Startup timeout for MailHog's HTTP readiness check — not the hardcoded port-exposure wait described above. */
const STARTUP_TIMEOUT_MS = 60_000 // 1 minute

export type MailhogConnection = {
  readonly host: string
  readonly smtpPort: number
  readonly httpPort: number
}

export type StartedMailhog = {
  readonly connection: MailhogConnection
  stop: () => Promise<void>
}

/**
 * Starts the run's single MailHog container. Called once from
 * `global-setup.ts`'s `setup()`, never from a test file directly.
 */
export const startMailhogContainer = async (): Promise<StartedMailhog> => {
  const container: StartedTestContainer = await new GenericContainer(MAILHOG_IMAGE)
    .withExposedPorts(SMTP_PORT, HTTP_PORT)
    // Waits for MailHog's own HTTP API to answer 200, not just for the TCP
    // port to accept connections — a stronger readiness guarantee than
    // `Wait.forListeningPorts()` for a container `waitForMessagesTo` then
    // immediately polls.
    .withWaitStrategy(Wait.forHttp('/api/v2/messages', HTTP_PORT).forStatusCode(200))
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start()

  return {
    connection: {
      host: container.getHost(),
      smtpPort: container.getMappedPort(SMTP_PORT),
      httpPort: container.getMappedPort(HTTP_PORT),
    },
    stop: async () => {
      await container.stop()
    },
  }
}
