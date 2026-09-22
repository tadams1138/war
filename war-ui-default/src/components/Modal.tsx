import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  show: boolean
  onCancel: () => void
  testId?: string
  children: ReactNode
}

// A native <dialog>, not a hand-rolled backdrop + focus trap + Escape
// handler -- showModal() gives every confirmation popup in this app focus
// trapping, top-layer rendering, and Escape-to-close (the dialog's own
// `cancel` event, wired to `onCancel` below) for free. Mounted only while
// `show` is true, same as every call site already treated "not shown" --
// so the effect calling showModal() runs against a freshly mounted, always
// -closed dialog every time, never an already-open one.
export function Modal({ show, onCancel, testId, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (show) ref.current?.showModal()
  }, [show])

  if (!show) return null

  return (
    <dialog ref={ref} role="alertdialog" data-testid={testId} className="modal" onCancel={onCancel}>
      {children}
    </dialog>
  )
}
