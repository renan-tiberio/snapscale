import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const TEST_TIMEOUT_MS = 30_000 // 30 seconds
const HOOK_TIMEOUT_MS = 120_000 // 2 minutes — a cold Postgres image pull happens inside a hook

/** Load-bearing: every file opens its own `pg.Pool` against the one container, and runs `sharp`. */
const MAX_TEST_THREADS = 4
const MIN_TEST_THREADS = 1

const COVERAGE_THRESHOLD_PERCENT = 80

const PACKAGES_DIR = new URL('../../packages/', import.meta.url)

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    // Tests resolve the workspace packages from source: `dist` is a build artifact, and
    // turbo's `test` tasks carry no `^build` edge, so a stale one would green the suite.
    alias: {
      '@snapscale/shared': fileURLToPath(new URL('shared/src/index.ts', PACKAGES_DIR)),
      '@snapscale/otel': fileURLToPath(new URL('otel/src/index.ts', PACKAGES_DIR)),
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // One throwaway Postgres container for the whole run.
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: TEST_TIMEOUT_MS,
    hookTimeout: HOOK_TIMEOUT_MS,
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: MAX_TEST_THREADS,
        minThreads: MIN_TEST_THREADS,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: COVERAGE_THRESHOLD_PERCENT,
        branches: COVERAGE_THRESHOLD_PERCENT,
        functions: COVERAGE_THRESHOLD_PERCENT,
        statements: COVERAGE_THRESHOLD_PERCENT,
      },
    },
  },
})
