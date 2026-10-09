interface DeleteButtonProps {
  show?: boolean
  testId: string
  onClick: () => void
}

// Mirrors ExportButton's shape; shared by WarDetail and EditWar.
export function DeleteButton({ show = true, testId, onClick }: DeleteButtonProps) {
  if (!show) return null
  return (
    <button type="button" className="button button--danger" data-testid={testId} onClick={onClick}>
      Delete
    </button>
  )
}
