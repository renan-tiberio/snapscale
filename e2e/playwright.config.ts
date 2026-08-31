import { defineConfig, devices } from '@playwright/test'

import { WEB_BASE_URL } from './src/env.js'

/**
 * Runs the full gallery journey against the already-running local stack
 * (`README.md`). No `webServer` block: the journey exercises the same
 * api/web processes a developer already has open, so a silent second
 * instance on the same port is worse than a fast failure when nothing is
 * listening.
 *
 * Every origin comes from `src/env.ts`, so overriding `E2E_WEB_URL` /
 * `E2E_API_URL` / `E2E_MAILHOG_URL` retargets the config and the specs together.
 */
export default defineConfig({
  testDir: './tests',
  // One journey, run start to finish against shared, stateful infrastructure:
  // parallelism here would only interleave MailHog inboxes for no gain.
  fullyParallel: false,
  workers: 1, // 1 journey at a time, not 1 test at a time
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  // Processing runs synchronous sharp work by design, so a journey step can
  // legitimately take seconds.
  timeout: 120_000, // 120s for a single test, not the whole suite
  expect: { timeout: 20_000 }, // 20s for a single expect()
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: WEB_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
