import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'

/**
 * Real MailHog in a throwaway container, started ONCE per run from
 * `global-setup.ts` (mirroring Postgres, see the comment there) — random
 * mapped ports so the suite never depends on (or collides with) the compose
 * instance on 1025/8025 (`docs/05-decision-log.md` decision 11, extended
 * here to email).
 *
 * FIX-E: this container used to be started fresh inside `auth.test.ts`'s own
 * `beforeAll`. Testcontainers 12.1.0 hardcodes a 10s window — not exposed by
 * `withStartupTimeout()`/`Wait` strategies, see `startContainer()` calling
 * `inspectContainerUntilPortsExposed()` with its literal `timeout = 10_000`
 * default in `generic-container/inspect-container-util-ports-exposed.js` —
 * for the Docker daemon to report a freshly started container's host port
 * bindings. Starting the container inside a test file's `beforeAll` put that
 * 10s window in direct contention with sibling test files already running
 * CPU-bound work (e.g. `sharp` encodes) under vitest's `maxThreads: 4` pool;
 * ~1 in 10 solo `pnpm --filter @snapscale/api test` runs missed the window
 * and threw `Error: Timed out after 10000ms while waiting for container
 * ports to be bound to the host`. Postgres never showed this flake because
 * it already starts in `global-setup`, before any test file's worker thread
 * exists to contend with it. Moving MailHog to the same place removes the
 * contention instead of trying to out-configure an internal, non-public
 * timeout.
 *
 * This file deliberately has NO dependency on the `vitest` package: it is
 * imported from `global-setup.ts`, which vitest runs in a separate context —
 * importing `vitest` itself from there corrupts vitest's internal worker
 * state ("Vitest failed to access its internal state"). `./mailhog.ts`
 * (which test files import) is where `vitest`'s `inject()` is used.
 */
const MAILHOG_IMAGE = 'mailhog/mailhog:v1.0.1'
const SMTP_PORT = 1025
const HTTP_PORT = 8025

/**
 * Applies to the wait strategy below (the "is the app inside actually
 * answering yet" phase) — NOT to the hardcoded port-exposure inspection
 * described above, which no public testcontainers 12.1.0 API can raise.
 * Kept generous and explicit anyway, matching Postgres's container-sized
 * budget, since it is still the right thing to raise for slow pulls/boots.
 */
const STARTUP_TIMEOUT_MS = 60_000

export interface MailhogConnection {
  readonly host: string
  readonly smtpPort: number
  readonly httpPort: number
}

export interface StartedMailhog {
  readonly connection: MailhogConnection
  stop: () => Promise<void>
}

/**
 * Starts the run's single MailHog container. Called once from
 * `global-setup.ts`'s `setup()`, never from a test file directly.
 */
export async function startMailhogContainer(): Promise<StartedMailhog> {
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
