// A single Voter as Staff see it (the spec, §6.7): their roles and sanctions,
// the Wars they created, and (below) their vote history. Reached from the
// Admin Dashboard's Voters list and the moderation log.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAdminVoter, type AdminVoterDetail as AdminVoterDetailData, type VoterMe } from '../api/client'
import { useAuth } from '../auth/context'
import { VoterActions } from '../admin/voters/VoterActions'
import { VoterBadges } from '../admin/voters/VoterBadges'
import { VoterVotesSection } from '../admin/voters/VoterVotesSection'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'
import { warTitle } from '../utils/warTitle'

export function AdminVoterDetail() {
  const { id } = useParams<{ id: string }>()
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)
  // Bumped after a Staff action so the detail is refetched from the API.
  const [refreshToken, setRefreshToken] = useState(0)
  const voter = useAsyncResource(id ? () => getAdminVoter(id) : undefined, [id, refreshToken])
  // The viewer decides which actions are offered; the page reads fine without it.
  const viewer = useViewer()

  return (
    <main data-theme={theme}>
      <p>
        <Link to="/admin">Back to Admin Dashboard</Link>
      </p>
      {voter.status === 'loading' && <p>Loading…</p>}
      {voter.status === 'error' && <p role="alert">{voter.message}</p>}
      {voter.status === 'loaded' && (
        <VoterBody
          voter={voter.value}
          viewer={viewer}
          onChanged={() => setRefreshToken((token) => token + 1)}
        />
      )}
    </main>
  )
}

function useViewer(): VoterMe['voter'] | null {
  const { me } = useAuth()
  return me.status === 'loaded' ? me.value.voter : null
}

interface VoterBodyProps {
  voter: AdminVoterDetailData
  viewer: VoterMe['voter'] | null
  onChanged: () => void
}

function VoterBody({ voter, viewer, onChanged }: VoterBodyProps) {
  return (
    <>
      <h1>{voter.display_name ?? 'Unnamed Voter'}</h1>
      <p>
        <VoterBadges voter={voter} />
      </p>
      {viewer && <VoterActions voter={voter} viewer={viewer} onChanged={onChanged} />}
      <section aria-labelledby="voter-wars-heading">
        <h2 id="voter-wars-heading">Wars</h2>
        <ul>
          {voter.wars.map((war) => (
            <li key={war.id} data-testid="admin-voter-war-row">
              <Link to={`/admin/wars/${war.id}`}>{warTitle(war.title)}</Link>
              <span> · {war.status}</span>
              {war.removed_at && (
                <span data-testid="admin-war-removed" className="badge">
                  {' '}
                  Removed
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <VoterVotesSection voterId={voter.id} />
    </>
  )
}
