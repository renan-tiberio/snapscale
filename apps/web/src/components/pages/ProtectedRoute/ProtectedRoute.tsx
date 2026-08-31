import { Navigate, Outlet } from 'react-router'

import { useAuth } from '@/hooks/queries/useAuth'

/** Pathless layout route: anonymous visitors never reach the gallery screens. */
export const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
