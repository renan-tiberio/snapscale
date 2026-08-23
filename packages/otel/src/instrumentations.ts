import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify'

import type { Instrumentation, InstrumentationConfig } from '@opentelemetry/instrumentation'

/**
 * Every instrumentation `@opentelemetry/auto-instrumentations-node@0.79.0`
 * bundles, minus `http` and `pg` — captured from the package's own
 * dependency list (`npm view @opentelemetry/auto-instrumentations-node@0.79.0
 * dependencies`), not guessed. `getNodeAutoInstrumentations()`'s
 * `InstrumentationBase` constructor calls `enable()` — i.e. installs the
 * require-in-the-middle patch — synchronously for every instrumentation
 * whose config doesn't disable it, *before* any array filtering could run.
 * A post-hoc `.filter()` on its return value (the first version of this
 * file) therefore still silently patched dns/fs/redis/etc. — caught via the
 * live boot proof in the U10 report. Every name below must be disabled
 * up front instead.
 *
 * `@opentelemetry/instrumentation-fastify` isn't in this list: bundled
 * Fastify instrumentation was dropped from auto-instrumentations-node after
 * v0.71.0 (verified against the npm registry: v0.72.0+ no longer depend on
 * it), so it's added directly below.
 *
 * The disabled config alone is not enough, though:
 * `@opentelemetry/instrumentation`'s `registerInstrumentations()` (called by
 * `NodeSDK#start()`) force-enables *every instrumentation in the array it is
 * given*, regardless of that instrumentation's own `enabled` config — see
 * `autoLoaderUtils.js#enableInstrumentations`, which reads
 * `if (!instrumentation.getConfig().enabled) instrumentation.enable()`. So
 * this module also filters the returned array down to http/pg — disabled
 * instrumentations must never reach the array NodeSDK registers, not just
 * carry `enabled: false`.
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

function buildAutoInstrumentationsConfig(): Record<string, InstrumentationConfig> {
  const config: Record<string, InstrumentationConfig> = {
    '@opentelemetry/instrumentation-http': { enabled: true },
    '@opentelemetry/instrumentation-pg': { enabled: true },
  }
  for (const name of DISABLED_AUTO_INSTRUMENTATION_NAMES) {
    config[`@opentelemetry/instrumentation-${name}`] = { enabled: false }
  }
  return config
}

/** Scope: http, fastify, pg (docs/04 task 10) — nothing else. */
export function createInstrumentations(): Instrumentation[] {
  const auto = getNodeAutoInstrumentations(buildAutoInstrumentationsConfig()).filter(
    (instrumentation) => KEPT_AUTO_INSTRUMENTATION_NAMES.has(instrumentation.instrumentationName),
  )

  return [...auto, new FastifyInstrumentation()]
}
