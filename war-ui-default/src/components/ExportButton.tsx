interface ExportButtonProps {
  show?: boolean
  testId: string
  onClick: () => void
}

// `show` defaults true: the edit page's own Export button has nothing to
// gate on (that page is only ever useful for a War the viewer can manage), while
// the results page passes `war.can_manage` explicitly (spec §10.4, "Export").
export function ExportButton({ show = true, testId, onClick }: ExportButtonProps) {
  if (!show) return null
  return (
    <button type="button" className="button" data-testid={testId} onClick={onClick}>
      Export
    </button>
  )
}
