// The Admin Dashboard route's gate (war-spec.md §10.1): unauthenticated visits
// go to sign-in (RequireAuth), an authenticated visit by neither a Moderator
// nor an Admin redirects Home.
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { isStaff } from '../auth/staff'
import { RequireAuth } from './RequireAuth'
import { AsyncStatus } from '../components/AsyncStatus'

export function RequireStaff({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <StaffGate>{children}</StaffGate>
    </RequireAuth>
  )
}

function StaffGate({ children }: { children: ReactNode }) {
  const { me } = useAuth()

  if (me.status !== 'loaded') return <AsyncStatus state={me} />
  if (!isStaff(me.value)) return <Navigate to="/" replace />
  return <>{children}</>
}
