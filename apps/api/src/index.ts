import { startTelemetry } from '@snapscale/otel'

const main = async (): Promise<void> => {
  const telemetry = await startTelemetry({ serviceName: 'snapscale-api' })

  // Dynamic on purpose: a static import is hoisted, so fastify/pg would load unpatched
  // before `startTelemetry()` installs OpenTelemetry's loader hook.
  const [{ buildApp }, { loadConfig }, { createDatabase }, { createMailer }] = await Promise.all([
    import('@/app/index.js'),
    import('@/config/index.js'),
    import('@/db/index.js'),
    import('@/services/mailer/index.js'),
  ])

  // Validated before the app is built: an invalid environment must crash the boot,
  // never partially start a misconfigured server.
  const config = loadConfig()
  const database = createDatabase({ connectionString: config.DATABASE_URL })
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

  // Without a handler node kills the process outright and `onClose` never runs.
  // `once`, so a second signal during a slow drain still hard-kills.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, 'shutting down')
      void app
        .close()
        .then(() => {
          process.exit(0)
        })
        .catch((error: unknown) => {
          app.log.error(error)
          process.exit(1)
        })
    })
  }

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    await telemetry.shutdown()
    process.exit(1)
  }
}

// Boot errors happen before the logger exists; a bare `void main()` would bury
// `loadConfig()`'s "offending field(s): …" under node's unhandled-rejection trace.
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`api failed to start: ${message}\n`)
  process.exit(1)
})
