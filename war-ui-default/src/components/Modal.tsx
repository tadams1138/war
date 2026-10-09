import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  show: boolean
  onCancel: () => void
  testId?: string
  // Id of the element that names the dialog.
  labelledBy?: string
  children: ReactNode
}

// A native <dialog>: showModal() gives focus trapping, top-layer rendering
// and Escape-to-close (the `cancel` event, wired to `onCancel`) for free.
// Mounted only while `show` is true, so showModal() always runs against a
// freshly mounted, closed dialog.
export function Modal({ show, onCancel, testId, labelledBy, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (show) ref.current?.showModal()
  }, [show])

  if (!show) return null

  return (
    <dialog ref={ref} role="alertdialog" aria-labelledby={labelledBy} data-testid={testId} className="modal" onCancel={onCancel}>
      {children}
    </dialog>
  )
}
