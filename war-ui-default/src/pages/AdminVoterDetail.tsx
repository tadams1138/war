// A single Voter as a Moderator or an Admin sees it (war-spec.md §6.7): their
// roles and sanctions and the Wars they created, and for a Moderator (below)
// their vote history and the moderation page of each War. An Admin who is not a Moderator reaches each War's public detail page instead, and with it a draft or unlisted War. Reached from the Admin
// Dashboard's Voters list and the moderation log.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getAdminVoter, type AdminVoterDetail as AdminVoterDetailData, type VoterMe } from '../api/client'
import { useAuth } from '../auth/context'
import { canModerate } from '../auth/roles'
import { useViewer } from '../auth/useViewer'
import { VoterActions } from '../admin/voters/VoterActions'
import { VoterBadges } from '../admin/voters/VoterBadges'
import { VoterVotesSection } from '../admin/voters/VoterVotesSection'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'
import { warTitle } from '../utils/warTitle'
import { AsyncStatus } from '../components/AsyncStatus'

export function AdminVoterDetail() {
  const { id } = useParams<{ id: string }>()
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)
  // Bumped after an action so the detail is refetched from the API. An action on the
  // viewer's own roles also refetches their identity, which decides what the
  // Admin Dashboard shows them.
  const [refreshToken, setRefreshToken] = useState(0)
  const voter = useAsyncResource(id ? () => getAdminVoter(id) : undefined, [id, refreshToken])
  // The viewer's roles decide which actions are offered.
  const viewer = useViewer()
  const { refreshMe } = useAuth()
  const onChanged = () => {
    setRefreshToken((token) => token + 1)
    if (viewer?.id === id) refreshMe()
  }

  return (
    <main data-theme={theme}>
      <p>
        <Link to="/admin">Back to Admin Dashboard</Link>
      </p>
      <AsyncStatus state={voter} />
      {voter.status === 'loaded' && (
        <VoterBody voter={voter.value} viewer={viewer} onChanged={onChanged} />
      )}
    </main>
  )
}

interface VoterBodyProps {
  voter: AdminVoterDetailData
  viewer: VoterMe['voter'] | null
  onChanged: () => void
}

function VoterBody({ voter, viewer, onChanged }: VoterBodyProps) {
  const moderates = viewer !== null && canModerate(viewer)
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
              <Link to={moderates ? `/admin/wars/${war.id}` : `/wars/${war.id}`}>{warTitle(war.title)}</Link>
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
      {moderates && <VoterVotesSection voterId={voter.id} />}
    </>
  )
}
