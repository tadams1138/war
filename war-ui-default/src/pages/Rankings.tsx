// The leaderboard page (the spec). No
// authentication required for a public War; an invite-only War's 401
// is handled entirely by api/client.ts's existing unauthorized
// pipeline — it clears the token and redirects to /login with the
// "Please log in to continue" message, the same path every other 401 in
// this app already takes.
import { useParams } from 'react-router-dom'
import { RankingsTable } from '../components/RankingsTable'
import { useRankings } from '../rankings/useRankings'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { useTheme } from '../theme/useTheme'

export function Rankings() {
  const { id: warId } = useParams<{ id: string }>()
  const state = useRankings(warId)
  const [theme, setTheme] = useTheme(
    warId ?? '',
    state.status === 'loaded' ? state.rankings.theme : 'arcade',
  )

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>

  return (
    <main data-theme={theme}>
      <ThemeSwitcher theme={theme} onChange={setTheme} />
      <h1>Rankings</h1>
      <RankingsTable rankings={state.rankings.rankings} />
    </main>
  )
}
