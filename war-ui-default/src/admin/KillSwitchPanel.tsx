// The War-creation kill switch (the spec, §6.7).
import { Modal } from '../components/Modal'
import { useKillSwitch, type UseKillSwitchResult } from './useKillSwitch'

export function KillSwitchPanel({ onChanged }: { onChanged: () => void }) {
  const killSwitch = useKillSwitch(onChanged)
  const { state } = killSwitch

  return (
    <section aria-labelledby="kill-switch-heading">
      <h2 id="kill-switch-heading">War creation kill switch</h2>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
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
    <Modal show={killSwitch.confirming} onCancel={killSwitch.cancel} testId="kill-switch-confirm">
      <p>Enabling the kill switch stops every Voter, including Staff, from creating Wars. Do you want to continue?</p>
      <div className="action-bar">
        <button type="button" className="button button--danger" data-testid="kill-switch-confirm-submit" onClick={killSwitch.confirm}>
          Enable kill switch
        </button>
        <button type="button" className="button" data-testid="kill-switch-confirm-cancel" onClick={killSwitch.cancel}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
