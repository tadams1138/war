// The append-only moderation log (the spec, §6.7), newest first. Entries carry
// the names of the acting Staff member, the target Voter and the target War's
// title alongside the ids, so the panel shows names without a lookup per id.
// A name links to that Voter's / War's Staff detail. A Voter with no name falls
// back to its id. A null War title with a War id is read as the War having been
// deleted outright (its detail would 404): no link, just the id.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ModerationLogEntry } from '../api/client'
import { actionLabel } from './moderationLogLabels'
import { useModerationLog } from './useModerationLog'

function voterLink(id: string, name: string | null): ReactNode {
  return <Link to={`/admin/voters/${id}`}>{name ?? id}</Link>
}

function warTarget(id: string, title: string | null): ReactNode {
  if (title === null) return <>a deleted War (id {id})</>
  return <Link to={`/admin/wars/${id}`}>{title}</Link>
}

function targetOf(entry: ModerationLogEntry): ReactNode {
  if (entry.target_voter_id) return voterLink(entry.target_voter_id, entry.target_voter_name)
  if (entry.target_war_id) return warTarget(entry.target_war_id, entry.target_war_title)
  return 'No target'
}

export function ModerationLogPanel({ refreshToken }: { refreshToken: number }) {
  const log = useModerationLog(refreshToken)

  return (
    <section aria-labelledby="moderation-log-heading">
      <h2 id="moderation-log-heading">Moderation log</h2>
      {log.status === 'loading' && <p>Loading…</p>}
      {log.error && <p role="alert">{log.error}</p>}
      {log.status === 'loaded' && (
        <>
          <ul className="moderation-log">
            {log.entries.map((entry) => (
              <li key={entry.id} data-testid="moderation-log-entry">
                <strong>{actionLabel(entry.action)}</strong>
                <span> by {voterLink(entry.staff_voter_id, entry.staff_name)}</span>
                <span> · {targetOf(entry)}</span>
                <span> · </span>
                <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
          {log.hasMore && (
            <button type="button" className="button" disabled={log.loadingMore} onClick={log.loadMore}>
              Load more
            </button>
          )}
        </>
      )}
    </section>
  )
}
