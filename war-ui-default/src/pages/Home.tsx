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
      {state.status === 'loaded' && <HomeWarList wars={state.value.wars} isAuthenticated={isAuthenticated} />}
    </main>
  )
}

function HomeWarList({ wars, isAuthenticated }: { wars: WarSummary[]; isAuthenticated: boolean }) {
  if (wars.length === 0) {
    return <HomeEmptyState isAuthenticated={isAuthenticated} />
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

// The empty-state copy is auth-aware (§6, "Home Page"): an anonymous
// visitor's only options are to wait or log in (NavBar already covers the
// latter), but a signed-in voter is the one visitor who can make an active
// War exist, so they're pointed at /wars/new instead. This link is in
// addition to NavBar's own persistent Create War link, not in place of it —
// the same deliberate duplication MyWars's empty state already has.
function HomeEmptyState({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return <p data-testid="empty-state">No active Wars right now — check back soon.</p>
  }
  return (
    <div data-testid="empty-state">
      <p>No active Wars right now — create one to get started.</p>
      <Link to="/wars/new" data-testid="create-war-cta">
        Create a War
      </Link>
    </div>
  )
}
