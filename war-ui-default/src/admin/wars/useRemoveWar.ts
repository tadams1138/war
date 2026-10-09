// State machine behind the Remove War action (war-spec.md §6.7): an in-page
// confirmation first (removal hides the War and permanently deletes its
// media), then the request; a failure leaves the War as it was and shows why.
import { useState } from 'react'
import { removeWar } from '../../api/client'
import { toUserMessage } from '../../api/errors'

export interface UseRemoveWarResult {
  confirming: boolean
  removing: boolean
  error: string | null
  request: () => void
  confirm: () => void
  cancel: () => void
}

export function useRemoveWar(warId: string, onRemoved: () => void): UseRemoveWarResult {
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function confirm() {
    setConfirming(false)
    setRemoving(true)
    setError(null)
    removeWar(warId)
      .then(onRemoved)
      .catch((failure: unknown) => setError(toUserMessage(failure)))
      .finally(() => setRemoving(false))
  }

  return {
    confirming,
    removing,
    error,
    request: () => setConfirming(true),
    confirm,
    cancel: () => setConfirming(false),
  }
}
