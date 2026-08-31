import { beforeEach, describe, expect, it } from 'vitest'

import { createQueryClient } from './queryClient'

import type { QueryClient } from '@tanstack/react-query'

describe('createQueryClient', () => {
  let client: QueryClient

  beforeEach(() => {
    client = createQueryClient()
  })

  it('never retries a failed query, so the typed ApiError reaches the UI at once', () => {
    expect(client.getDefaultOptions().queries?.retry).toBe(false)
  })

  it('never retries a failed mutation either', () => {
    expect(client.getDefaultOptions().mutations?.retry).toBe(false)
  })

  it('treats fetched data as fresh for thirty seconds before allowing a refetch', () => {
    expect(client.getDefaultOptions().queries?.staleTime).toBe(30_000)
  })

  it('hands out an independent client per call, so no cache is shared between mounts', () => {
    expect(createQueryClient()).not.toBe(client)
  })
})
