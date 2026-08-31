// Unauthenticated users visiting a protected route are redirected to
// /login with a returnTo query param (war-ui-default-spec.md §4).
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { loginUrlFor } from '../auth/returnTo'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    const returnTo = location.pathname + location.search
    return <Navigate to={loginUrlFor(returnTo)} replace />
  }

  return <>{children}</>
}
