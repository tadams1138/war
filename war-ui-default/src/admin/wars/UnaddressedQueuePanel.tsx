// The unaddressed-reports queue (war-spec.md §8.5): Wars with reports no Staff
// member has dealt with yet; each opens that War's Staff detail.
import { Link } from 'react-router-dom'
import { getUnaddressedReports, type UnaddressedReportsWar } from '../../api/client'
import { useAsyncResource } from '../../hooks/useAsyncResource'
import { warTitle } from '../../utils/warTitle'
import { AsyncStatus } from '../../components/AsyncStatus'

export function UnaddressedQueuePanel() {
  const queue = useAsyncResource(() => getUnaddressedReports(), [])

  return (
    <section aria-labelledby="unaddressed-queue-heading">
      <h2 id="unaddressed-queue-heading">Unaddressed reports</h2>
      <AsyncStatus state={queue} />
      {queue.status === 'loaded' && <QueueEntries wars={queue.value} />}
    </section>
  )
}

function QueueEntries({ wars }: { wars: UnaddressedReportsWar[] }) {
  if (wars.length === 0) return <p data-testid="unaddressed-queue-empty">No reports are waiting.</p>
  return (
    <ul className="unaddressed-queue">
      {wars.map((entry) => (
        <li key={entry.war_id} data-testid="unaddressed-queue-entry">
          <Link to={`/admin/wars/${entry.war_id}`}>{warTitle(entry.title)}</Link>
          <span className="badge" title="Unaddressed reports">
            {entry.unaddressed_count}
          </span>
        </li>
      ))}
    </ul>
  )
}
