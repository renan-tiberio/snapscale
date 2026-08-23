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
]

export default nodeConfig
