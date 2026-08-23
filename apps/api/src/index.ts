import { buildApp } from '@/app.js'
import { loadConfig } from '@/config.js'

async function main(): Promise<void> {
  // Validated first, before the app is even built: an invalid environment
  // must crash the boot, never partially start a misconfigured server.
  const config = loadConfig()
  const app = await buildApp()

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void main()
