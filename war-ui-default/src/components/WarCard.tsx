// Summary tile used on the Home and MyWars pages (the spec, "WarCard"):
// title, category badge, contestant count, and time remaining (when
// ends_at is set). MyWars ("MyWars Page") additionally needs a status badge
// and a single link to the War's detail page, since it lists every status a
// War can hold. Home's own Wars are all published by construction (the
// page's query already filters to published), so repeating "published" on
// every card is noise, not information (war-spec.md 10.4) -- Home instead
// offers direct Vote and Results entry points in place of the status badge
// and the single detail-page link.
import { Link } from 'react-router-dom'
import type { WarSummary } from '../api/client'
import { warTitle } from '../utils/warTitle'

interface WarCardProps {
  war: WarSummary
  // True only from MyWars, the one place a WarCard is known to be the
  // viewer's own -- Home renders the same card for every creator's Wars, so
  // this cannot be inferred from `war.status` alone.
  showEditLink?: boolean
  // 'my-wars' (default) keeps the status badge and single link to detail.
  // 'home' drops the status badge and offers Vote/Results entry points
  // instead (war-spec.md 10.4).
  variant?: 'my-wars' | 'home'
}

export function WarCard({ war, showEditLink = false, variant = 'my-wars' }: WarCardProps) {
  return variant === 'home' ? <HomeWarCard war={war} /> : <MyWarsWarCard war={war} showEditLink={showEditLink} />
}

function WarCardDetails({ war }: { war: WarSummary }) {
  return (
    <>
      {war.share_image_url && <img className="war-card-image" src={war.share_image_url} alt="" />}
      <h3>{warTitle(war.title)}</h3>
      {war.category && <p>{war.category}</p>}
      <p>{contestantCountLabel(war.contestant_count)}</p>
      {war.creator_name && <p data-testid="war-creator-name">{war.creator_name}</p>}
      {war.ends_at && <p data-testid="war-time-remaining">{timeRemainingLabel(war.ends_at)}</p>}
    </>
  )
}

function HomeWarCard({ war }: { war: WarSummary }) {
  return (
    <div data-testid="war-card" className="war-card">
      <WarCardDetails war={war} />
      <div className="action-bar">
        <Link to={`/wars/${war.id}/vote`} data-testid="war-vote-link" className="button">
          Vote
        </Link>
        <Link to={`/wars/${war.id}`} data-testid="war-results-link" className="button">
          Results
        </Link>
      </div>
    </div>
  )
}

function MyWarsWarCard({ war, showEditLink }: { war: WarSummary; showEditLink: boolean }) {
  // A div, not an outer <Link>: an <a> cannot validly contain another
  // interactive element (HTML's content model), and the Edit link below
  // needs to be clickable independently of the card-to-detail-page link,
  // not nested inside it.
  return (
    <div data-testid="war-card" className="war-card">
      <Link to={`/wars/${war.id}`} className="war-card-link">
        <WarCardDetails war={war} />
        <p data-testid="war-status-badge">{war.status}</p>
      </Link>
      {showEditLink && (
        <div className="action-bar">
          <Link to={`/wars/${war.id}/edit`} className="button" data-testid="edit-war-link">
            Edit
          </Link>
        </div>
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
