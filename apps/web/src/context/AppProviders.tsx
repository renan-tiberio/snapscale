import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import { AuthProvider } from './AuthContext'
import { createQueryClient } from './queryClient'

import type { ReactNode } from 'react'

/** Every app-wide provider, in one place: server state then session state. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
