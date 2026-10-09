import { useId, type ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  show: boolean
  // Prefix for the dialog's test ids: `<testId>`, `<testId>-submit`, `<testId>-cancel`.
  testId: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  // The prompt, naming what will happen.
  children: ReactNode
}

export function ConfirmDialog({ show, testId, confirmLabel, danger = false, onConfirm, onCancel, children }: ConfirmDialogProps) {
  const messageId = useId()
  return (
    <Modal show={show} onCancel={onCancel} testId={testId} labelledBy={messageId}>
      <div id={messageId}>{children}</div>
      <div className="action-bar">
        <button type="button" className={danger ? 'button button--danger' : 'button'} data-testid={`${testId}-submit`} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="button" data-testid={`${testId}-cancel`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
