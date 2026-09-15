// A transient success indicator for actions with no other visible feedback
// (EditWar's Save buttons just clear a `saving` flag on success -- nothing
// told the user the save actually happened). Shows `message`, then hides
// itself; the caller never has to clear its own state back to null.
import { useEffect, useState } from 'react'

const DISMISS_AFTER_MS = 2000

interface ToastProps {
  message: string | null
}

export function Toast({ message }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [message])

  if (!message) return null

  return (
    <p role="status" data-testid="toast" hidden={!visible}>
      {message}
    </p>
  )
}
