import { startTelemetry } from '@snapscale/otel'

async function main(): Promise<void> {
  // Telemetry MUST be started — and its http/pg/fastify auto-instrumentation
  // patches installed on the module loader — before anything that imports
  // `pg`, `fastify`, or `node:http` is loaded. A static `import` at the top
  // of a file is hoisted and resolved before *any* statement in that file
  // runs, so a plain `import { buildApp } from '@/app.js'` above this
  // function would already have pulled in fastify/pg — unpatched — before
  // `startTelemetry()` ever got a chance to run.
  //
  // The fix: `buildApp`/`loadConfig`/`createDatabase`/`createMailer` are
  // loaded with *dynamic* `import()` below, which only resolves at
  // runtime, after `startTelemetry()` has been awaited. That is the only
  // ordering that survives ESM's import-hoisting semantics without
  // reaching for a `--import` preload flag.
  const telemetry = await startTelemetry({ serviceName: 'snapscale-api' })

  const [{ buildApp }, { loadConfig }, { createDatabase }, { createMailer }] = await Promise.all([
    import('@/app.js'),
    import('@/config.js'),
    import('@/db/index.js'),
    import('@/services/mailer.js'),
  ])

  // Validated first, before the app is even built: an invalid environment
  // must crash the boot, never partially start a misconfigured server.
  const config = loadConfig()
  const database = createDatabase(config.DATABASE_URL)
  const mailer = createMailer({ SMTP_HOST: config.SMTP_HOST, SMTP_PORT: config.SMTP_PORT })

  const app = await buildApp({
    db: database.db,
    mailer,
    jwtSecret: config.JWT_SECRET,
    otpTtlSeconds: config.OTP_TTL_SECONDS,
    uploadDir: config.UPLOAD_DIR,
    webOrigin: config.WEB_ORIGIN,
  })

  app.addHook('onClose', async () => {
    await database.close()
    await telemetry.shutdown()
  })

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    await telemetry.shutdown()
    process.exit(1)
  }
}

void main()
