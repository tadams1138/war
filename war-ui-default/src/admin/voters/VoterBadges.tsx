// Role and sanction badges for a Voter (war-spec.md §6.7).
import type { AdminVoterItem } from '../../api/client'

type BadgeFlags = Pick<AdminVoterItem, 'is_moderator' | 'is_admin' | 'suspended' | 'banned'>

function voterBadgeLabels(voter: BadgeFlags): string[] {
  const labels: string[] = []
  if (voter.is_moderator) labels.push('Moderator')
  if (voter.is_admin) labels.push('Admin')
  if (voter.suspended) labels.push('Suspended')
  if (voter.banned) labels.push('Banned')
  return labels
}

export function VoterBadges({ voter }: { voter: BadgeFlags }) {
  return (
    <>
      {voterBadgeLabels(voter).map((label) => (
        <span key={label} data-testid="voter-badge" className="badge">
          {' '}
          {label}
        </span>
      ))}
    </>
  )
}
