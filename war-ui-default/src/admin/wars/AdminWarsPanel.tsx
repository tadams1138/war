// The Staff Wars list (war-spec.md §6.7): every War of every status, including
// removed ones, with a marker for each and a count of unaddressed reports.
import { Link } from 'react-router-dom'
import type { AdminWarItem } from '../../api/client'
import { warTitle } from '../../utils/warTitle'
import { useAdminWars, type AdminWarStatusFilter } from './useAdminWars'
import { ErrorMessage } from '../../components/ErrorMessage'
import { LoadingMessage } from '../../components/AsyncStatus'

const STATUS_OPTIONS: { value: AdminWarStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
  { value: 'removed', label: 'Removed' },
]

export function AdminWarsPanel() {
  const list = useAdminWars()

  return (
    <section aria-labelledby="admin-wars-heading">
      <h2 id="admin-wars-heading">Wars</h2>
      <div className="war-list-controls">
        <label>
          Status
          <select
            data-testid="admin-war-status-filter"
            value={list.statusFilter}
            onChange={(event) => list.setStatusFilter(event.target.value as AdminWarStatusFilter)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            data-testid="admin-war-search"
            value={list.searchText}
            onChange={(event) => list.setSearchText(event.target.value)}
            placeholder="Search Wars"
          />
        </label>
      </div>
      {list.status === 'loading' && <LoadingMessage />}
      <ErrorMessage message={list.error} />
      {list.status === 'loaded' && (
        <>
          <ul className="admin-wars">
            {list.wars.map((war) => (
              <AdminWarRow key={war.id} war={war} />
            ))}
          </ul>
          {list.hasMore && (
            <button type="button" className="button" data-testid="admin-wars-load-more" disabled={list.loadingMore} onClick={list.loadMore}>
              Load more
            </button>
          )}
        </>
      )}
    </section>
  )
}

function AdminWarRow({ war }: { war: AdminWarItem }) {
  return (
    <li data-testid="admin-war-row">
      <Link to={`/admin/wars/${war.id}`}>
        <strong>{warTitle(war.title)}</strong>
      </Link>
      <span> · {war.status}</span>
      {war.creator_name && <span> · {war.creator_name}</span>}
      {war.removed_at && <span data-testid="admin-war-removed" className="badge"> Removed</span>}
      {war.unaddressed_report_count > 0 && (
        <span data-testid="admin-war-report-badge" className="badge" title="Unaddressed reports">
          {war.unaddressed_report_count}
        </span>
      )}
    </li>
  )
}
