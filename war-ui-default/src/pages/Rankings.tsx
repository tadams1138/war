// The leaderboard page (the spec). No
// authentication required for a public War; an invite-only War's 401
// is handled entirely by api/client.ts's existing unauthorized
// pipeline — it clears the token and redirects to /login with the
// "Please log in to continue" message, the same path every other 401 in
// this app already takes.
import { useParams } from 'react-router-dom'
import { RankingsTable } from '../components/RankingsTable'
import { useRankings } from '../rankings/useRankings'

export function Rankings() {
  const { id: warId } = useParams<{ id: string }>()
  const state = useRankings(warId)

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>

  return (
    <main>
      <h1>Rankings</h1>
      <RankingsTable rankings={state.rankings.rankings} />
    </main>
  )
}
