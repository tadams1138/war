interface ExportButtonProps {
  show?: boolean
  testId: string
  onClick: () => void
}

// `show` defaults true: the edit page's own Export button has nothing to
// gate on (that page is only ever reachable for a War the voter owns), while
// the results page passes `war.is_owner` explicitly (spec §10.4, "Export").
export function ExportButton({ show = true, testId, onClick }: ExportButtonProps) {
  if (!show) return null
  return (
    <button type="button" className="button" data-testid={testId} onClick={onClick}>
      Export
    </button>
  )
}
