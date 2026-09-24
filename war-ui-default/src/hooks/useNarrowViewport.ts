// Whether the viewport is at or below the vote page's stacked-layout
// breakpoint (war-spec.md 10.3) -- mirrors the same 640px cutoff
// layout.css's own `@media (max-width: 640px)` rules use, kept as one
// named constant so the two can't drift apart silently.
import { useEffect, useState } from 'react'

export const NARROW_VIEWPORT_BREAKPOINT_PX = 640

function matchesNarrow(): boolean {
  return window.matchMedia(`(max-width: ${NARROW_VIEWPORT_BREAKPOINT_PX}px)`).matches
}

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window === 'undefined' ? false : matchesNarrow()))

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${NARROW_VIEWPORT_BREAKPOINT_PX}px)`)
    const handleChange = () => setNarrow(mql.matches)
    handleChange()
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return narrow
}
