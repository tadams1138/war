// The append-only moderation log (the spec, §6.7), newest first. The API's
// entries carry Voter and War ids only; this panel shows those ids as they
// are rather than fanning out one lookup per id.
import type { ModerationLogEntry } from '../api/client'
import { actionLabel } from './moderationLogLabels'
import { useModerationLog } from './useModerationLog'

function targetOf(entry: ModerationLogEntry): string {
  if (entry.target_voter_id) return `Voter ${entry.target_voter_id}`
  if (entry.target_war_id) return `War ${entry.target_war_id}`
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
                <span> by Staff {entry.staff_voter_id}</span>
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
