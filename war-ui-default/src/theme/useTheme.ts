import { useState } from 'react'
import { getThemePreference, setThemePreference, type Theme } from './themeCookie'

/**
 * Resolves to the voter's own override for `key` if they have ever chosen
 * one, else `fallback`. Reads the cookie fresh on every render rather than
 * caching it in state: `fallback` (a War's own theme) is often not known
 * until after this hook's first call (the War is still loading), and a
 * cached override would also survive React Router reusing the same page
 * component across two different Wars — the route param changes without a
 * remount, which a one-time useState initializer would miss entirely.
 */
export function useTheme(key: string, fallback: Theme): [Theme, (theme: Theme) => void] {
  const [, forceRender] = useState(0)
  const theme = getThemePreference(key) ?? fallback

  function choose(next: Theme): void {
    setThemePreference(key, next)
    forceRender((count) => count + 1)
  }

  return [theme, choose]
}
