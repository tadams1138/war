// The current Voter's GET /auth/me result, fetched once per sign-in and
// shared by everything that needs it (the NavBar's IdentityMenu, the Staff
// gate, the Staff Voter detail) through the auth context.
//
// Each result is stamped with the session it was fetched for. A new sign-in
// (even as another Voter, with no sign-out in between) or a sign-out changes
// the session, so a result from an earlier one is never served -- consumers
// see 'loading' until the new fetch settles.
import { useEffect, useState } from 'react'
import { getMe, type VoterMe } from '../api/client'
import { toUserMessage } from '../api/errors'
import type { AsyncResourceState } from '../hooks/useAsyncResource'

type Settled = { session: number; state: Exclude<AsyncResourceState<VoterMe>, { status: 'loading' }> }

const LOADING: AsyncResourceState<VoterMe> = { status: 'loading' }

export function useVoterMe(isAuthenticated: boolean, session: number): AsyncResourceState<VoterMe> {
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    getMe()
      .then((value) => {
        if (!cancelled) setSettled({ session, state: { status: 'loaded', value } })
      })
      .catch((error: unknown) => {
        if (!cancelled) setSettled({ session, state: { status: 'error', message: toUserMessage(error) } })
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, session])

  if (!isAuthenticated || settled === null || settled.session !== session) return LOADING
  return settled.state
}
