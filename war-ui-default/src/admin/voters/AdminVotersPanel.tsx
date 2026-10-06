// The Staff Voters list (the spec, §6.7): every Voter with role and sanction
// badges and the number of Wars they created.
import { Link } from 'react-router-dom'
import type { AdminVoterItem } from '../../api/client'
import { VoterBadges } from './VoterBadges'
import { useAdminVoters, type AdminVoterStatusFilter } from './useAdminVoters'

const STATUS_OPTIONS: { value: AdminVoterStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
  { value: 'staff', label: 'Staff' },
]

export function AdminVotersPanel() {
  const list = useAdminVoters()

  return (
    <section aria-labelledby="admin-voters-heading">
      <h2 id="admin-voters-heading">Voters</h2>
      <div className="war-list-controls">
        <label>
          Show Voters
          <select
            data-testid="admin-voter-status-filter"
            value={list.statusFilter}
            onChange={(event) => list.setStatusFilter(event.target.value as AdminVoterStatusFilter)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find Voters
          <input
            type="search"
            data-testid="admin-voter-search"
            value={list.searchText}
            onChange={(event) => list.setSearchText(event.target.value)}
            placeholder="Search Voters"
          />
        </label>
      </div>
      {list.status === 'loading' && <p>Loading…</p>}
      {list.error && <p role="alert">{list.error}</p>}
      {list.status === 'loaded' && (
        <>
          <ul className="admin-voters">
            {list.voters.map((voter) => (
              <AdminVoterRow key={voter.id} voter={voter} />
            ))}
          </ul>
          {list.hasMore && (
            <button type="button" className="button" data-testid="admin-voters-load-more" disabled={list.loadingMore} onClick={list.loadMore}>
              Load more
            </button>
          )}
        </>
      )}
    </section>
  )
}

function AdminVoterRow({ voter }: { voter: AdminVoterItem }) {
  return (
    <li data-testid="admin-voter-row">
      <Link to={`/admin/voters/${voter.id}`}>
        <strong>{voter.display_name ?? 'Unnamed Voter'}</strong>
      </Link>
      <VoterBadges voter={voter} />
      <span> · {voter.war_count === 1 ? '1 War' : `${voter.war_count} Wars`}</span>
    </li>
  )
}
