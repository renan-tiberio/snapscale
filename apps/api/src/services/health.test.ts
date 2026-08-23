import { describe, expect, it } from 'vitest'

import { getHealthStatus } from '@/services/health.js'

describe('getHealthStatus', () => {
  it('reports ok', () => {
    expect(getHealthStatus()).toEqual({ status: 'ok' })
  })
})
