// One Staff action button on a Voter, with its in-page confirmation (when it
// has one) and its failure message.
import type { ReactNode } from 'react'
import { Modal } from '../../components/Modal'
import { useVoterAction } from './useVoterAction'

interface VoterActionControlProps {
  testId: string
  label: string
  perform: () => Promise<void>
  onDone: () => void
  // Shown in an in-page confirmation before the action runs; omitted when the
  // action needs none.
  confirmation?: ReactNode
  danger?: boolean
}

export function VoterActionControl({ testId, label, perform, onDone, confirmation, danger }: VoterActionControlProps) {
  const action = useVoterAction(perform, onDone, confirmation !== undefined)
  const buttonClass = danger ? 'button button--danger' : 'button'

  return (
    <>
      <button type="button" className={buttonClass} data-testid={testId} disabled={action.running} onClick={action.request}>
        {label}
      </button>
      {action.error && (
        <p role="alert" data-testid={`${testId}-error`}>
          {action.error}
        </p>
      )}
      <Modal show={action.confirming} onCancel={action.cancel} testId={`${testId}-confirm`}>
        {confirmation}
        <div className="action-bar">
          <button type="button" className={buttonClass} data-testid={`${testId}-confirm-submit`} onClick={action.confirm}>
            {label}
          </button>
          <button type="button" className="button" data-testid={`${testId}-confirm-cancel`} onClick={action.cancel}>
            Cancel
          </button>
        </div>
      </Modal>
    </>
  )
}
