// @snapscale/eslint-config — node preset (Fastify services: apps/api, apps/image-processor, apps/auth)
import { base } from './base.js'

/** @type {import('eslint').Linter.Config[]} */
export const nodeConfig = [
  ...base,
  {
    rules: {
      // pino is the structured logger for every service; base's `no-console`
      // still catches stray `console.log` debugging outside pino's boundary.
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  {
    // docs/06-code-standards.md §3 scopes named parameters to signatures we own.
    // Fastify dictates these: `(request, reply)` for handlers, `(error, request,
    // reply)` for the error handler, `(app, options)` for plugins. Changing them
    // is not an option, so the rule is lifted exactly where the framework decides
    // the shape — never for our own functions living in the same folders.
    files: [
      '**/routes/**/*.ts',
      '**/plugins/**/*.ts',
      '**/app.ts',
      '**/app/*.ts',
      '**/error-handler.ts',
      '**/error-handler/*.ts',
    ],
    rules: {
      '@typescript-eslint/max-params': ['error', { max: 3 }],
    },
  },
]

export default nodeConfig
