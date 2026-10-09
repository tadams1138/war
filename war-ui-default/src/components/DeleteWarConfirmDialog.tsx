import { ConfirmDialog } from './ConfirmDialog'

interface DeleteWarConfirmDialogProps {
  show: boolean
  onConfirm: () => void
  onCancel: () => void
  testIdPrefix: string
}

export function DeleteWarConfirmDialog({ show, onConfirm, onCancel, testIdPrefix }: DeleteWarConfirmDialogProps) {
  return (
    <ConfirmDialog show={show} testId={`${testIdPrefix}-delete-confirm`} confirmLabel="Delete War" danger onConfirm={onConfirm} onCancel={onCancel}>
      <p>Deleting this War is permanent — its contestants, media, and votes are all removed too. Do you want to continue?</p>
    </ConfirmDialog>
  )
}
