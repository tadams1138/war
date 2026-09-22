interface DeleteButtonProps {
  show?: boolean
  testId: string
  onClick: () => void
}

// Mirrors ExportButton's shape. Replaces two hand-rolled Delete buttons
// (WarDetail and EditWar) that had already drifted out of sync in styling
// once -- one shared definition instead of two copies is what keeps them
// from drifting again.
export function DeleteButton({ show = true, testId, onClick }: DeleteButtonProps) {
  if (!show) return null
  return (
    <button type="button" className="button button--danger" data-testid={testId} onClick={onClick}>
      Delete
    </button>
  )
}
