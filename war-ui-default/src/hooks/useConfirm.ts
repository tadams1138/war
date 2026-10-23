import { useState } from 'react'

// "Ask first" state for a dangerous action: ask(value) opens the dialog,
// confirm() closes it and runs the action on that value, cancel() just closes.
export interface Confirm<T = true> {
  pending: T | null
  ask: (value: T) => void
  confirm: () => void
  cancel: () => void
}

export function useConfirm<T = true>(action: (value: T) => void): Confirm<T> {
  const [pending, setPending] = useState<T | null>(null)
  return {
    pending,
    ask: setPending,
    cancel: () => setPending(null),
    confirm: () => {
      if (pending === null) return
      setPending(null)
      action(pending)
    },
  }
}
