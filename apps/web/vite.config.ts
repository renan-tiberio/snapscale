import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// React Compiler is wired through the babel config of @vitejs/plugin-react —
// verified in the phase-1 report by grepping the production build output for
// the compiler-injected `react/compiler-runtime` import (see docs/03 §2).
//
// It is skipped only under Vitest (`process.env.VITEST`, set by the runner
// itself): the compiler is a behavior-preserving build-time optimization —
// its correctness is guarded by its own compiler-aware eslint-plugin-react-hooks
// rules, not by app coverage — and its injected memoization cache-check
// branches are close to impossible to fully exercise from black-box component
// tests, which was dragging branch coverage on simple presentational atoms
// down to ~65-77% with no behavioral gap to fix. dev/build/storybook keep the
// compiler on.
const isTest = process.env.VITEST === 'true'

export default defineConfig({
  plugins: [
    react(
      isTest
        ? {}
        : {
            babel: {
              plugins: [['babel-plugin-react-compiler', {}]],
            },
          },
    ),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      '~': new URL('.', import.meta.url).pathname,
    },
  },
  test: {
    // Tests resolve @snapscale/shared from source: `dist` is a build artifact, and turbo's
    // `test` tasks carry no `^build` edge, so a stale one would green the suite. Scoped to
    // `test` so dev, build and storybook keep consuming the published entry point.
    alias: {
      '@snapscale/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/router.tsx',
        'src/vite-env.d.ts',
        'src/**/*.types.ts',
        'src/**/*.stories.tsx',
        'src/test/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
