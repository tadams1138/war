// The Remove War action and its in-page confirmation (the spec, §6.7).
import { Modal } from '../../components/Modal'
import { useRemoveWar } from './useRemoveWar'

export function RemoveWarControl({ warId, onRemoved }: { warId: string; onRemoved: () => void }) {
  const remove = useRemoveWar(warId, onRemoved)

  return (
    <>
      <div className="action-bar">
        <button type="button" className="button button--danger" disabled={remove.removing} onClick={remove.request}>
          Remove War
        </button>
      </div>
      {remove.error && (
        <p role="alert" data-testid="remove-war-error">
          {remove.error}
        </p>
      )}
      <Modal show={remove.confirming} onCancel={remove.cancel} testId="remove-war-confirm">
        <p>
          Removing this War hides it from everyone and permanently deletes its media. This cannot be undone. Do you
          want to continue?
        </p>
        <div className="action-bar">
          <button type="button" className="button button--danger" data-testid="remove-war-confirm-submit" onClick={remove.confirm}>
            Remove War
          </button>
          <button type="button" className="button" data-testid="remove-war-confirm-cancel" onClick={remove.cancel}>
            Cancel
          </button>
        </div>
      </Modal>
    </>
  )
}
