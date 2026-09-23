// Browse published public Wars (the spec).
import { Link } from 'react-router-dom'
import { getWars, type WarSummary } from '../api/client'
import { useAuth } from '../auth/context'
import { WarCard } from '../components/WarCard'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function Home() {
  const { isAuthenticated } = useAuth()
  const state = useAsyncResource(() => getWars(), [])
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  return (
    <main data-theme={theme}>
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
    <ul className="war-grid">
      {wars.map((war) => (
        <li key={war.id}>
          <WarCard war={war} variant="home" />
        </li>
      ))}
    </ul>
  )
}

// The empty-state copy is auth-aware ("Home Page"): an anonymous
// visitor's only options are to wait or log in (NavBar already covers the
// latter), but a signed-in voter is the one visitor who can make a
// published War exist, so they're pointed at /wars/new instead. This link
// is in addition to NavBar's own persistent Create War link, not in place
// of it — the same deliberate duplication MyWars's empty state already has.
function HomeEmptyState({ isAuthenticated }: { isAuthenticated: boolean }) {
  if (!isAuthenticated) {
    return <p data-testid="empty-state">No published Wars right now — check back soon.</p>
  }
  return (
    <div data-testid="empty-state">
      <p>No published Wars right now — create one to get started.</p>
      <Link to="/wars/new" data-testid="home-create-war-cta">
        Create a War
      </Link>
    </div>
  )
}
