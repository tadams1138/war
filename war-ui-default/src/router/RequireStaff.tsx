// The Admin Dashboard route's gate (the spec, §10.1): unauthenticated visits
// go to sign-in (RequireAuth), an authenticated visit by neither a Moderator
// nor an Admin redirects Home.
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { getMe } from '../api/client'
import { isStaff } from '../auth/staff'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { RequireAuth } from './RequireAuth'

export function RequireStaff({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <StaffGate>{children}</StaffGate>
    </RequireAuth>
  )
}

function StaffGate({ children }: { children: ReactNode }) {
  const me = useAsyncResource(() => getMe(), [])

  if (me.status === 'loading') return <p>Loading…</p>
  if (me.status === 'error') return <p role="alert">{me.message}</p>
  if (!isStaff(me.value)) return <Navigate to="/" replace />
  return <>{children}</>
}
