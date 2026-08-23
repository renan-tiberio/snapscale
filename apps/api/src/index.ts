import { buildApp } from '@/app.js'
import { loadConfig } from '@/config.js'
import { createDatabase } from '@/db/index.js'
import { createMailer } from '@/services/mailer.js'

async function main(): Promise<void> {
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
  })

  app.addHook('onClose', async () => {
    await database.close()
  })

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void main()
