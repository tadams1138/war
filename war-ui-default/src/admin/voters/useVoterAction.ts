// State machine behind one Staff action on a Voter (war-spec.md §6.7): an
// optional in-page confirmation first, then the request; a failure leaves the
// Voter as it was and shows why.
import { useState } from 'react'
import { toUserMessage } from '../../api/errors'

export interface UseVoterActionResult {
  confirming: boolean
  running: boolean
  error: string | null
  request: () => void
  confirm: () => void
  cancel: () => void
}

export function useVoterAction(perform: () => Promise<void>, onDone: () => void, needsConfirmation: boolean): UseVoterActionResult {
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run() {
    setConfirming(false)
    setRunning(true)
    setError(null)
    perform()
      .then(onDone)
      .catch((failure: unknown) => setError(toUserMessage(failure)))
      .finally(() => setRunning(false))
  }

  return {
    confirming,
    running,
    error,
    request: needsConfirmation ? () => setConfirming(true) : run,
    confirm: run,
    cancel: () => setConfirming(false),
  }
}
