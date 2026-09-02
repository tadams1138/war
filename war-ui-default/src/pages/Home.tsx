// Browse active public Wars (war-ui-default-spec.md §4, §12).
import { Link } from 'react-router-dom'
import { getWars, type WarSummary } from '../api/client'
import { useAuth } from '../auth/context'
import { WarCard } from '../components/WarCard'
import { useAsyncResource } from '../hooks/useAsyncResource'

export function Home() {
  const { isAuthenticated } = useAuth()
  const state = useAsyncResource(() => getWars(), [])

  return (
    <main>
      <h1>War</h1>
      {!isAuthenticated && (
        <Link to="/login" data-testid="login-cta">
          Login to Vote
        </Link>
      )}
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'loaded' && <HomeWarList wars={state.value.wars} />}
    </main>
  )
}

function HomeWarList({ wars }: { wars: WarSummary[] }) {
  if (wars.length === 0) {
    return <p data-testid="empty-state">No active Wars right now — check back soon.</p>
  }
  return (
    <ul>
      {wars.map((war) => (
        <li key={war.id}>
          <WarCard war={war} />
        </li>
      ))}
    </ul>
  )
}
