import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { fixtures } from '@/test/msw/handlers'
import { renderApp, seedSession } from '@/test/utils'

describe('ProtectedRoute', () => {
  it('sends an anonymous visitor of the album list to the login screen', async () => {
    renderApp(['/'])

    expect(await screen.findByRole('heading', { name: 'Sign in to SnapScale' })).toBeInTheDocument()
  })

  it('sends an anonymous visitor of an album to the login screen', async () => {
    renderApp([`/albums/${fixtures.album.id}`])

    expect(await screen.findByRole('heading', { name: 'Sign in to SnapScale' })).toBeInTheDocument()
  })

  it('lets an authenticated visitor through to the album list', async () => {
    seedSession()

    renderApp(['/'])

    expect(await screen.findByRole('heading', { name: 'Albums' })).toBeInTheDocument()
  })
})
