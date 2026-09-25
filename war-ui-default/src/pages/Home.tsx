// Browse published public Wars (war-spec.md §10.4).
import { Link } from 'react-router-dom'
import type { WarSummary } from '../api/client'
import { useAuth } from '../auth/context'
import { WarCard } from '../components/WarCard'
import { WarListControls, WarListPagination } from '../components/WarListControls'
import { useWarListPage, type UseWarListPageResult } from '../hooks/useWarListPage'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function Home() {
  const { isAuthenticated } = useAuth()
  const listPage = useWarListPage()
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  return (
    <main data-theme={theme}>
      <WarListControls listPage={listPage} />
      {listPage.state.status === 'loading' && <p>Loading…</p>}
      {listPage.state.status === 'error' && <p role="alert">{listPage.state.message}</p>}
      {listPage.state.status === 'loaded' && (
        <HomeWarList wars={listPage.state.wars} isAuthenticated={isAuthenticated} listPage={listPage} />
      )}
    </main>
  )
}

function HomeWarList({
  wars,
  isAuthenticated,
  listPage,
}: {
  wars: WarSummary[]
  isAuthenticated: boolean
  listPage: UseWarListPageResult
}) {
  if (wars.length === 0) {
    return <HomeEmptyState isAuthenticated={isAuthenticated} />
  }
  return (
    <>
      <ul className="war-grid">
        {wars.map((war) => (
          <li key={war.id}>
            <WarCard war={war} variant="home" />
          </li>
        ))}
      </ul>
      <WarListPagination listPage={listPage} />
    </>
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
