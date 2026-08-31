// Summary tile used on the Home page (war-ui-default-spec.md §6). This
// slice's scope shows title, category, and contestant count only — not the
// status badge or time-remaining fields the full component spec also
// describes (spec §12).
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
      <p>{contestantCountLabel(war.contestant_count)}</p>
    </Link>
  )
}

function contestantCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'contestant' : 'contestants'}`
}
