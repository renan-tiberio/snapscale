import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify'

import type { Instrumentation, InstrumentationConfig } from '@opentelemetry/instrumentation'

/**
 * Auto-instrumentations-node's constructors patch modules synchronously at
 * construction time — before any post-hoc `.filter()` on the returned array
 * can run — so every instrumentation but http/pg must be disabled through
 * the config object itself. `NodeSDK#start()` then force-enables every
 * instrumentation still present in the returned array regardless of its own
 * `enabled` flag, so the array is filtered down to http/pg as well.
 * `@opentelemetry/instrumentation-fastify` isn't bundled here (dropped after
 * v0.71.0), so it's added separately below.
 */
const DISABLED_AUTO_INSTRUMENTATION_NAMES = [
  'amqplib',
  'aws-lambda',
  'aws-sdk',
  'bunyan',
  'cassandra-driver',
  'connect',
  'cucumber',
  'dataloader',
  'dns',
  'express',
  'generic-pool',
  'graphql',
  'grpc',
  'hapi',
  'ioredis',
  'kafkajs',
  'knex',
  'koa',
  'lru-memoizer',
  'memcached',
  'mongodb',
  'mongoose',
  'mysql2',
  'mysql',
  'nestjs-core',
  'net',
  'openai',
  'oracledb',
  'pino',
  'redis',
  'restify',
  'router',
  'runtime-node',
  'socket.io',
  'tedious',
  'undici',
  'winston',
]

const KEPT_AUTO_INSTRUMENTATION_NAMES = new Set([
  '@opentelemetry/instrumentation-http',
  '@opentelemetry/instrumentation-pg',
])

const buildAutoInstrumentationsConfig = (): Record<string, InstrumentationConfig> => ({
  '@opentelemetry/instrumentation-http': { enabled: true },
  '@opentelemetry/instrumentation-pg': { enabled: true },
  ...Object.fromEntries(
    DISABLED_AUTO_INSTRUMENTATION_NAMES.map(
      (name) => [`@opentelemetry/instrumentation-${name}`, { enabled: false }] as const,
    ),
  ),
})

// Scope: http, fastify, pg — nothing else.
export const createInstrumentations = (): Instrumentation[] => {
  const auto = getNodeAutoInstrumentations(buildAutoInstrumentationsConfig()).filter(
    (instrumentation) => KEPT_AUTO_INSTRUMENTATION_NAMES.has(instrumentation.instrumentationName),
  )

  return [...auto, new FastifyInstrumentation()]
}
