// The War-creation kill switch (war-spec.md §6.7).
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useKillSwitch, type UseKillSwitchResult } from './useKillSwitch'
import { AsyncStatus } from '../components/AsyncStatus'

export function KillSwitchPanel({ onChanged }: { onChanged: () => void }) {
  const killSwitch = useKillSwitch(onChanged)
  const { state } = killSwitch

  return (
    <section aria-labelledby="kill-switch-heading">
      <h2 id="kill-switch-heading">War creation kill switch</h2>
      <AsyncStatus state={state} />
      {state.status === 'loaded' && <KillSwitchControls enabled={state.value} killSwitch={killSwitch} />}
      {killSwitch.actionError && (
        <p role="alert" data-testid="kill-switch-error">
          {killSwitch.actionError}
        </p>
      )}
      <EnableConfirmDialog killSwitch={killSwitch} />
    </section>
  )
}

function KillSwitchControls({ enabled, killSwitch }: { enabled: boolean; killSwitch: UseKillSwitchResult }) {
  return (
    <>
      <p>
        Kill switch: <strong data-testid="kill-switch-state">{enabled ? 'On' : 'Off'}</strong>
      </p>
      <p>{enabled ? 'No one can create a War right now.' : 'Anyone may create Wars.'}</p>
      <div className="action-bar">
        <button type="button" className="button" disabled={killSwitch.saving} onClick={() => killSwitch.requestChange(!enabled)}>
          {enabled ? 'Disable kill switch' : 'Enable kill switch'}
        </button>
      </div>
    </>
  )
}

function EnableConfirmDialog({ killSwitch }: { killSwitch: UseKillSwitchResult }) {
  return (
    <ConfirmDialog
      show={killSwitch.confirming}
      testId="kill-switch-confirm"
      confirmLabel="Enable kill switch"
      danger
      onConfirm={killSwitch.confirm}
      onCancel={killSwitch.cancel}
    >
      <p>Enabling the kill switch stops every Voter, including Staff, from creating Wars. Do you want to continue?</p>
    </ConfirmDialog>
  )
}
