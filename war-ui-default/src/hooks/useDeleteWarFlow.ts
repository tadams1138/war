// Shared by WarDetail's results-page Delete and EditWar's Delete (spec
// §6.1 "Deletion", §10.4): draft-only, creator-only removal, with the same
// permanence confirmation both entry points require before calling the API.
import { useState } from 'react'
import { deleteWar } from '../api/client'
import { toUserMessage } from '../api/errors'

export interface DeleteWarFlow {
  showConfirm: boolean
  error: string | null
  open: () => void
  cancel: () => void
  confirm: () => void
}

export function useDeleteWarFlow(warId: string, onDeleted: () => void): DeleteWarFlow {
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm(): Promise<void> {
    setShowConfirm(false)
    try {
      await deleteWar(warId)
      onDeleted()
    } catch (err) {
      setError(toUserMessage(err))
    }
  }

  return { showConfirm, error, open: () => setShowConfirm(true), cancel: () => setShowConfirm(false), confirm: () => void confirm() }
}
