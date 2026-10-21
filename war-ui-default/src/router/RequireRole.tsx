// A role-gated route (war-spec.md §10.1): unauthenticated visits go to sign-in
// (RequireAuth), and an authenticated visit by a Voter the `allow` rule does
// not admit redirects Home.
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/context'
import type { Roles } from '../auth/roles'
import { RequireAuth } from './RequireAuth'
import { AsyncStatus } from '../components/AsyncStatus'

interface RequireRoleProps {
  allow: (voter: Roles) => boolean
  children: ReactNode
}

export function RequireRole({ allow, children }: RequireRoleProps) {
  return (
    <RequireAuth>
      <RoleGate allow={allow}>{children}</RoleGate>
    </RequireAuth>
  )
}

function RoleGate({ allow, children }: RequireRoleProps) {
  const { me } = useAuth()

  if (me.status !== 'loaded') return <AsyncStatus state={me} />
  if (!allow(me.value.voter)) return <Navigate to="/" replace />
  return <>{children}</>
}
