// Whether the viewport is at or below the vote page's stacked-layout
// breakpoint (war-spec.md §10.3). Must match the `@media (max-width: 640px)`
// rules in layout.css.
import { useEffect, useState } from 'react'

const NARROW_QUERY = '(max-width: 640px)'

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches)

  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY)
    const handleChange = () => setNarrow(mql.matches)
    handleChange()
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return narrow
}
