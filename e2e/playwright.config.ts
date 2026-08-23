import { defineConfig, devices } from '@playwright/test'

import { WEB_BASE_URL } from './src/env.js'

/**
 * Playwright config for the phase-1 exit criterion (`docs/04-implementation-plan.md`
 * task 12): the full gallery journey run against the **already running** local
 * stack.
 *
 * There is deliberately **no `webServer` block**. The stack is assumed to be up
 * before `playwright test` starts — `docker compose up -d` (Postgres 5433 +
 * MailHog 1025/8025) and `pnpm dev` (api on 4000, web on 5173), exactly as
 * `README.md` describes. Letting Playwright boot the stack would mean owning the
 * database, the migrations and the mail server too; the journey is meant to
 * exercise the same processes a developer is already looking at, and a run that
 * silently starts a second api on the same port is worse than a run that fails
 * fast because nothing is listening.
 *
 * Every origin comes from `src/env.ts`, so overriding `E2E_WEB_URL` /
 * `E2E_API_URL` / `E2E_MAILHOG_URL` retargets the config and the specs together.
 */
export default defineConfig({
  testDir: './tests',
  // One journey, run start to finish against shared, stateful infrastructure:
  // parallelism here would only interleave MailHog inboxes for no gain.
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  // The process route is synchronous sharp work on purpose (docs/03 §7), so a
  // journey step can legitimately take seconds.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: WEB_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
