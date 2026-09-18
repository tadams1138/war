interface DeleteWarConfirmDialogProps {
  show: boolean
  onConfirm: () => void
  onCancel: () => void
  testIdPrefix: string
}

export function DeleteWarConfirmDialog({ show, onConfirm, onCancel, testIdPrefix }: DeleteWarConfirmDialogProps) {
  if (!show) return null
  return (
    <div role="alertdialog" data-testid={`${testIdPrefix}-delete-confirm`}>
      <p>Deleting this War is permanent — its contestants are removed too. Do you want to continue?</p>
      <button type="button" data-testid={`${testIdPrefix}-delete-confirm-submit`} onClick={onConfirm}>
        Delete War
      </button>
      <button type="button" data-testid={`${testIdPrefix}-delete-confirm-cancel`} onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
