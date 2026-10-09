// A single War as Staff see it (war-spec.md §6.7, §8.5): standings, reports and
// the Remove action. Reached from the Admin Dashboard's lists.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAdminWar, type AdminWarDetail as AdminWarDetailData } from '../api/client'
import { RemoveWarControl } from '../admin/wars/RemoveWarControl'
import { WarReportsSection } from '../admin/wars/WarReportsSection'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'
import { warTitle } from '../utils/warTitle'
import { AsyncStatus } from '../components/AsyncStatus'

export function AdminWarDetail() {
  const { id } = useParams<{ id: string }>()
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)
  // Bumped after a Staff action so the detail is refetched from the API.
  const [refreshToken, setRefreshToken] = useState(0)
  const war = useAsyncResource(id ? () => getAdminWar(id) : undefined, [id, refreshToken])

  return (
    <main data-theme={theme}>
      <p>
        <Link to="/admin">Back to Admin Dashboard</Link>
      </p>
      <AsyncStatus state={war} />
      {war.status === 'loaded' && <WarBody war={war.value} onChanged={() => setRefreshToken((token) => token + 1)} />}
    </main>
  )
}

function WarBody({ war, onChanged }: { war: AdminWarDetailData; onChanged: () => void }) {
  const removed = war.removed_at !== null
  return (
    <>
      <h1>{warTitle(war.title)}</h1>
      <p>
        {war.status} · {war.visibility}
        {war.creator_name && <span> · by {war.creator_name}</span>}
        {removed && (
          <span data-testid="admin-war-removed" className="badge">
            {' '}
            Removed
          </span>
        )}
      </p>
      {!removed && <RemoveWarControl warId={war.id} onRemoved={onChanged} />}
      <section aria-labelledby="war-contestants-heading">
        <h2 id="war-contestants-heading">Contestants</h2>
        <ul>
          {war.contestants.map((contestant) => (
            <li key={contestant.id} data-testid="admin-contestant-row">
              <strong>{contestant.name}</strong>
              <span>
                {' '}
                · {contestant.win_count} wins · {contestant.appearance_count} appearances
              </span>
            </li>
          ))}
        </ul>
      </section>
      {/* The public-namespace reports route 404s for a removed War. */}
      {!removed && <WarReportsSection warId={war.id} />}
    </>
  )
}
