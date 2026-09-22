import { Modal } from './Modal'

interface DeleteWarConfirmDialogProps {
  show: boolean
  onConfirm: () => void
  onCancel: () => void
  testIdPrefix: string
}

export function DeleteWarConfirmDialog({ show, onConfirm, onCancel, testIdPrefix }: DeleteWarConfirmDialogProps) {
  return (
    <Modal show={show} onCancel={onCancel} testId={`${testIdPrefix}-delete-confirm`}>
      <p>Deleting this War is permanent — its contestants are removed too. Do you want to continue?</p>
      <div className="action-bar">
        <button type="button" className="button button--danger" data-testid={`${testIdPrefix}-delete-confirm-submit`} onClick={onConfirm}>
          Delete War
        </button>
        <button type="button" className="button" data-testid={`${testIdPrefix}-delete-confirm-cancel`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
