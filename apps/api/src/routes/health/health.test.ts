import Fastify from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { App } from '@/app/index.js'

import { healthRoutes } from '@/routes/health/index.js'

describe('healthRoutes', () => {
  let app: App

  beforeEach(async () => {
    // Registered on a bare instance rather than through `buildApp`, so a failure here is the
    // route module's, not the app wiring's.
    app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>()
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    await app.register(healthRoutes)
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('answers GET /health with the ok envelope carrying the liveness status', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ success: true, data: { status: 'ok' } })
  })

  it('mounts the probe on GET only, so a POST finds no route', async () => {
    const response = await app.inject({ method: 'POST', url: '/health' })

    expect(response.statusCode).toBe(404)
  })
})
