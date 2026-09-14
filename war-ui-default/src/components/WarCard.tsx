// Summary tile used on the Home and MyWars pages (the spec, "WarCard"):
// title, category badge, status badge, contestant count,
// and time remaining (when ends_at is set). MyWars ("MyWars Page") is
// the first page in this UI to need the status badge and time-remaining
// fields; Home renders the same full card, it simply has never needed them
// asserted.
import { Link } from 'react-router-dom'
import type { WarSummary } from '../api/client'

interface WarCardProps {
  war: WarSummary
  // True only from MyWars, the one place a WarCard is known to be the
  // viewer's own -- Home renders the same card for every creator's Wars, so
  // this cannot be inferred from `war.status` alone (PROGRESS.md's
  // draft-only editing gap).
  showEditLink?: boolean
}

export function WarCard({ war, showEditLink = false }: WarCardProps) {
  // A div, not the outer <Link> this used to be: an <a> cannot validly
  // contain another interactive element (HTML's content model), and the
  // Edit link below needs to be clickable independently of the
  // card-to-detail-page link, not nested inside it.
  return (
    <div data-testid="war-card" className="war-card">
      <Link to={`/wars/${war.id}`} className="war-card-link">
        <h3>{war.title}</h3>
        {war.category && <p>{war.category}</p>}
        <p data-testid="war-status-badge">{war.status}</p>
        <p>{contestantCountLabel(war.contestant_count)}</p>
        {war.ends_at && <p data-testid="war-time-remaining">{timeRemainingLabel(war.ends_at)}</p>}
      </Link>
      {showEditLink && war.status === 'draft' && (
        <Link to={`/wars/${war.id}/edit`} data-testid="edit-war-link">
          Edit
        </Link>
      )}
    </div>
  )
}

function contestantCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'contestant' : 'contestants'}`
}

// Below a day remaining, rounding up to whole days is actively misleading
// (five minutes left would otherwise read "Ends in 1 day") — switch to
// hours in that range, still rounded up so "a few minutes" reads as at
// least "1 hour" rather than "0 hours".
export function timeRemainingLabel(endsAt: string): string {
  const msRemaining = new Date(endsAt).getTime() - Date.now()
  if (msRemaining <= 0) return 'Ended'
  const hoursRemaining = msRemaining / (1000 * 60 * 60)
  if (hoursRemaining < 24) {
    const hours = Math.max(1, Math.ceil(hoursRemaining))
    return `Ends in ${hours} ${hours === 1 ? 'hour' : 'hours'}`
  }
  const days = Math.ceil(hoursRemaining / 24)
  return `Ends in ${days} ${days === 1 ? 'day' : 'days'}`
}
