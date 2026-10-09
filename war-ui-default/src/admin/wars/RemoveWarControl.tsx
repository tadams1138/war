// The Remove War action and its in-page confirmation (war-spec.md §6.7).
import { ConfirmDialog } from '../../components/ConfirmDialog'
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
      <ConfirmDialog
        show={remove.confirming}
        testId="remove-war-confirm"
        confirmLabel="Remove War"
        danger
        onConfirm={remove.confirm}
        onCancel={remove.cancel}
      >
        <p>
          Removing this War hides it from everyone and permanently deletes its media. This cannot be undone. Do you
          want to continue?
        </p>
      </ConfirmDialog>
    </>
  )
}
