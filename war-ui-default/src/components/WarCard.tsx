// Summary tile used on the Home and MyWars pages (war-ui-default-spec.md
// §6, "WarCard"): title, category badge, status badge, contestant count,
// and time remaining (when ends_at is set). MyWars (§6, "MyWars Page") is
// the first page in this UI to need the status badge and time-remaining
// fields; Home renders the same full card, it simply has never needed them
// asserted (§12).
import { Link } from 'react-router-dom'
import type { WarSummary } from '../api/client'

interface WarCardProps {
  war: WarSummary
}

export function WarCard({ war }: WarCardProps) {
  return (
    <Link to={`/wars/${war.id}`} data-testid="war-card">
      <h3>{war.title}</h3>
      {war.category && <p>{war.category}</p>}
      <p data-testid="war-status-badge">{war.status}</p>
      <p>{contestantCountLabel(war.contestant_count)}</p>
      {war.ends_at && <p data-testid="war-time-remaining">{timeRemainingLabel(war.ends_at)}</p>}
    </Link>
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
