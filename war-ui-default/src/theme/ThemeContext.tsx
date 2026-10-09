// Lets every page tell NavBar and Footer which theme it resolved to,
// including a War's own creator-chosen default -- something they cannot know
// on their own, since they render above <Routes> and never fetch War data.
// Pages with no War in scope publish under the shared 'home' key.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Theme } from './themeCookie'

interface ActiveTheme {
  key: string
  theme: Theme
  setTheme: (theme: Theme) => void
}

interface ThemeContextValue {
  active: ActiveTheme | null
  publish: (active: ActiveTheme) => void
  clear: (key: string) => void
}

// Used before any page has published, and on routes with no theme scope.
export const FALLBACK_THEME: Theme = 'arcade'

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveTheme | null>(null)

  const publish = useCallback((next: ActiveTheme) => setActive(next), [])

  // Guarded by key: on unmount, only clear if nothing newer has already
  // published in the same commit (a War id -> War id transition re-uses the
  // same component instance and never unmounts, so this guard only matters
  // for the rarer same-tick race, not the common case).
  const clear = useCallback((key: string) => {
    setActive((current) => (current?.key === key ? null : current))
  }, [])

  return <ThemeContext.Provider value={{ active, publish, clear }}>{children}</ThemeContext.Provider>
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeContext must be used within a ThemeProvider')
  return ctx
}

// NavBar's read side — null until some War-scoped page has published.
export function useActiveTheme(): { theme: Theme; setTheme: (theme: Theme) => void } | null {
  const { active } = useThemeContext()
  return active
}

// A page's write side. Call unconditionally (before any early return)
// alongside the page's own useTheme(key, fallback) call.
export function usePublishTheme(key: string, theme: Theme, setTheme: (theme: Theme) => void): void {
  const { publish, clear } = useThemeContext()

  useEffect(() => {
    publish({ key, theme, setTheme })
    return () => clear(key)
  }, [key, theme, setTheme, publish, clear])
}
