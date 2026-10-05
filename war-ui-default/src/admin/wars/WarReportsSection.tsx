// A War's abuse reports (the spec, §8.5), shown to Staff on the War's detail,
// each with a control to mark it addressed or unaddressed.
import { useState } from 'react'
import { getWarReports, setReportAddressed, type WarReport } from '../../api/client'
import { toUserMessage } from '../../api/errors'
import { useAsyncResource } from '../../hooks/useAsyncResource'

export function WarReportsSection({ warId }: { warId: string }) {
  const reports = useAsyncResource(() => getWarReports(warId), [warId])

  return (
    <section aria-labelledby="war-reports-heading">
      <h2 id="war-reports-heading">Reports</h2>
      {reports.status === 'loading' && <p>Loading…</p>}
      {reports.status === 'error' && <p role="alert">{reports.message}</p>}
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

  function toggle() {
    const next = !addressed
    setSaving(true)
    setError(null)
    setReportAddressed(report.id, next)
      .then(() => setAddressed(next))
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
      <div className="action-bar">
        <button type="button" className="button" disabled={saving} onClick={toggle}>
          {addressed ? 'Mark unaddressed' : 'Mark addressed'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </li>
  )
}
