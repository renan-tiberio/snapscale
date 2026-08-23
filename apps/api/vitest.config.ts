import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // One throwaway Postgres container for the whole run (docs/05 decision 11);
    // pulling/booting it and creating a database per file needs more than the
    // 5s default, so hooks get a container-sized budget.
    globalSetup: ['./test/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // FIX-D: every file in this suite opens its own `pg.Pool`
    // (`src/db/index.ts`, default max 10) against that ONE shared container
    // (Postgres's own default `max_connections` is 100), while several files also run real
    // `sharp` encodes. Vitest's default `maxThreads` is `os.cpus().length`
    // (12 on the host this was diagnosed on) — enough concurrent files to
    // approach the connection ceiling and to slow every file's event loop
    // down under `sharp`'s CPU load. That's what let both sides of
    // `images-process.test.ts`'s idempotency-under-a-race test miss their
    // dedupe lookup at once and hit a real, load-induced insert failure
    // (see the production fix in `services/image-processing.ts`) — a
    // correctness bug the flake exposed, not something to paper over here.
    // Capping to 4 concurrent files keeps the worst case at ~40 pooled
    // connections (60% headroom under 100) and 4-way CPU contention
    // (8 of 12 cores stay free for libvips + the event loop), without
    // serializing the whole suite the way `maxThreads: 1` would.
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
})
