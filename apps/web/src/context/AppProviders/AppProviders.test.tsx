import { useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'

import { useAuthContext } from '../AuthContext'

import { AppProviders } from './AppProviders'

const StaleTimeProbe = () => (
  <span data-testid="stale-time">
    {String(useQueryClient().getDefaultOptions().queries?.staleTime)}
  </span>
)

const AuthProbe = () => (
  <span data-testid="authenticated">{String(useAuthContext().isAuthenticated)}</span>
)

const PROBE_QUERY_KEY = ['app-providers-probe'] as const

/** Seeds the query cache on mount and reports, on the next render, whether it survived. */
const CacheSurvivalProbe = () => {
  const client = useQueryClient()
  const cached = client.getQueryData<string>(PROBE_QUERY_KEY) ?? 'gone'

  useEffect(() => {
    client.setQueryData(PROBE_QUERY_KEY, 'seeded')
  }, [client])

  return <span data-testid="cached">{cached}</span>
}

describe('AppProviders', () => {
  it('renders its children', () => {
    render(
      <AppProviders>
        <p>wrapped</p>
      </AppProviders>,
    )

    expect(screen.getByText('wrapped')).toBeInTheDocument()
  })

  it('supplies the app-wide query client, not a bare default one', () => {
    render(
      <AppProviders>
        <StaleTimeProbe />
      </AppProviders>,
    )

    expect(screen.getByTestId('stale-time')).toHaveTextContent('30000')
  })

  it('supplies the auth context, so a child can read the session without its own provider', () => {
    render(
      <AppProviders>
        <AuthProbe />
      </AppProviders>,
    )

    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
  })

  it('keeps one query client across re-renders, so the cache is never dropped', () => {
    const { rerender } = render(
      <AppProviders>
        <CacheSurvivalProbe />
      </AppProviders>,
    )
    expect(screen.getByTestId('cached')).toHaveTextContent('gone')

    rerender(
      <AppProviders>
        <CacheSurvivalProbe />
      </AppProviders>,
    )

    expect(screen.getByTestId('cached')).toHaveTextContent('seeded')
  })
})
