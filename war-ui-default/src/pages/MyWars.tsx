// Every War the authenticated voter created, across every status
// (war-spec.md "MyWars Page"). This is what closes the gap war-spec.md names: a
// creator who leaves a draft before it's published has, until this page
// exists, no way to find that draft War again.
import { Link } from 'react-router-dom'
import type { WarSummary } from '../api/client'
import { WarCard } from '../components/WarCard'
import { WarListControls, WarListPagination } from '../components/WarListControls'
import { useWarListPage, type UseWarListPageResult } from '../hooks/useWarListPage'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'
import { AsyncStatus } from '../components/AsyncStatus'

export function MyWars() {
  const listPage = useWarListPage({ creatorMe: true })
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  return (
    <main data-theme={theme}>
      <h1>My Wars</h1>
      <WarListControls listPage={listPage} />
      <AsyncStatus state={listPage.state} />
      {listPage.state.status === 'loaded' && <MyWarsList wars={listPage.state.wars} listPage={listPage} />}
    </main>
  )
}

function MyWarsList({ wars, listPage }: { wars: WarSummary[]; listPage: UseWarListPageResult }) {
  if (wars.length === 0) {
    return (
      <div data-testid="empty-state">
        <p>You haven&rsquo;t created any Wars yet.</p>
        <Link to="/wars/new" data-testid="my-wars-create-war-cta">
          Start a War
        </Link>
        <Link to="/wars/import" data-testid="my-wars-import-war-cta">
          Import a War
        </Link>
      </div>
    )
  }
  return (
    <>
      <ul className="war-grid">
        {wars.map((war) => (
          <li key={war.id}>
            <WarCard war={war} showEditLink />
          </li>
        ))}
      </ul>
      <WarListPagination listPage={listPage} />
    </>
  )
}
