import { describe, expect, it } from 'vitest'

import { getHealthStatus } from '@/services/health/index.js'

describe('getHealthStatus', () => {
  it('reports ok', () => {
    expect(getHealthStatus()).toEqual({ status: 'ok' })
  })
})
