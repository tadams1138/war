// A War's abuse reports (war-spec.md §8.5), shown to a Moderator on the War's detail,
// each unaddressed one with a control to mark it addressed.
import { useState } from 'react'
import { getWarReports, markReportAddressed, type WarReport } from '../../api/client'
import { toUserMessage } from '../../api/errors'
import { useAsyncResource } from '../../hooks/useAsyncResource'
import { AsyncStatus } from '../../components/AsyncStatus'
import { ErrorMessage } from '../../components/ErrorMessage'

export function WarReportsSection({ warId }: { warId: string }) {
  const reports = useAsyncResource(() => getWarReports(warId), [warId])

  return (
    <section aria-labelledby="war-reports-heading">
      <h2 id="war-reports-heading">Reports</h2>
      <AsyncStatus state={reports} />
      {reports.status === 'loaded' && (
        <ul className="war-reports">
          {reports.value.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ReportRow({ report }: { report: WarReport }) {
  const [addressed, setAddressed] = useState(report.addressed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function markAddressed() {
    setSaving(true)
    setError(null)
    markReportAddressed(report.id)
      .then(() => setAddressed(true))
      .catch((failure: unknown) => setError(toUserMessage(failure)))
      .finally(() => setSaving(false))
  }

  return (
    <li data-testid="admin-report-row">
      <p>{report.explanation}</p>
      <p>
        <strong>{addressed ? 'Addressed' : 'Unaddressed'}</strong>
        <span> · filed </span>
        <time dateTime={report.filed_at}>{new Date(report.filed_at).toLocaleString()}</time>
      </p>
      {!addressed && (
        <div className="action-bar">
          <button type="button" className="button" disabled={saving} onClick={markAddressed}>
            Mark addressed
          </button>
        </div>
      )}
      <ErrorMessage message={error} />
    </li>
  )
}
