// The Staff actions available on a Voter's detail (the spec, §6.7).
import { setVoterBan, setVoterRole, setVoterSuspension, type AdminVoterDetail, type VoterMe, type VoterRole } from '../../api/client'
import { VoterActionControl } from './VoterActionControl'

interface VoterActionsProps {
  voter: AdminVoterDetail
  onChanged: () => void
}

interface ViewerProps extends VoterActionsProps {
  viewer: VoterMe['voter']
}

// The API refuses to Suspend or Ban the caller or any Staff member (a role
// must be revoked first), and an Admin revoking their own Admin role; the UI
// simply doesn't offer what it knows would be refused.
function sanctionNote(voter: AdminVoterDetail, isSelf: boolean): string | null {
  if (isSelf) return 'You cannot suspend or ban your own account.'
  if (voter.is_moderator || voter.is_admin) {
    return "A Staff member cannot be suspended or banned; their role must be revoked by an Admin first."
  }
  return null
}

export function VoterActions({ voter, viewer, onChanged }: ViewerProps) {
  const isSelf = viewer.id === voter.id
  const note = sanctionNote(voter, isSelf)
  return (
    <div className="action-bar">
      {note ? (
        <p data-testid="voter-sanction-note">{note}</p>
      ) : (
        <>
          <SuspendControl voter={voter} onChanged={onChanged} />
          <BanControl voter={voter} onChanged={onChanged} />
        </>
      )}
      {viewer.is_admin && <RoleControls voter={voter} isSelf={isSelf} onChanged={onChanged} />}
    </div>
  )
}

// Admin-only. An Admin never sees Revoke Admin on their own detail (the spec's
// self-removal guard); the API would refuse it.
function RoleControls({ voter, isSelf, onChanged }: VoterActionsProps & { isSelf: boolean }) {
  return (
    <>
      <RoleControl voter={voter} role="moderator" onChanged={onChanged} />
      {!(isSelf && voter.is_admin) && <RoleControl voter={voter} role="admin" onChanged={onChanged} />}
    </>
  )
}

const REVOKE_ADMIN_CONFIRMATION = (
  <p>Revoking Admin removes this Voter's Admin privileges, including granting and revoking roles. Do you want to continue?</p>
)

const ROLE_LABELS: Record<VoterRole, string> = { moderator: 'Moderator', admin: 'Admin' }
const ROLE_FLAGS = { moderator: 'is_moderator', admin: 'is_admin' } as const satisfies Record<VoterRole, keyof AdminVoterDetail>

function RoleControl({ voter, role, onChanged }: VoterActionsProps & { role: VoterRole }) {
  const held = voter[ROLE_FLAGS[role]]
  const verb = held ? 'Revoke' : 'Grant'
  return (
    <VoterActionControl
      testId={`voter-${verb.toLowerCase()}-${role}`}
      label={`${verb} ${ROLE_LABELS[role]}`}
      perform={() => setVoterRole(voter.id, role, !held)}
      onDone={onChanged}
      confirmation={held && role === 'admin' ? REVOKE_ADMIN_CONFIRMATION : undefined}
    />
  )
}

function SuspendControl({ voter, onChanged }: VoterActionsProps) {
  if (voter.suspended) {
    return (
      <VoterActionControl
        testId="voter-unsuspend"
        label="Unsuspend"
        perform={() => setVoterSuspension(voter.id, false)}
        onDone={onChanged}
      />
    )
  }
  return (
    <VoterActionControl
      testId="voter-suspend"
      label="Suspend"
      perform={() => setVoterSuspension(voter.id, true)}
      onDone={onChanged}
      confirmation={
        <p>
          Suspending this Voter blocks them from creating new Wars. Their existing Wars and votes are untouched, and they
          can still vote. Do you want to continue?
        </p>
      }
    />
  )
}

function BanControl({ voter, onChanged }: VoterActionsProps) {
  if (voter.banned) {
    return (
      <VoterActionControl
        testId="voter-unban"
        label="Unban"
        perform={() => setVoterBan(voter.id, false)}
        onDone={onChanged}
        confirmation={
          <p>
            Unbanning this Voter restores sign-in only. The Wars and votes the ban deleted do not come back. Do you want
            to continue?
          </p>
        }
      />
    )
  }
  return (
    <VoterActionControl
      testId="voter-ban"
      label="Ban"
      danger
      perform={() => setVoterBan(voter.id, true)}
      onDone={onChanged}
      confirmation={
        <p>
          Banning this Voter blocks their sign-in and permanently deletes every War they created and every vote
          they cast. Deleted data does not come back, even if they are unbanned. Do you want to continue?
        </p>
      }
    />
  )
}
