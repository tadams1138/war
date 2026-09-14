// Where a voter's own theme override lives (the spec, "Theme switching"):
// one small JSON map in a plain (non-HttpOnly) cookie, keyed by War id plus
// a reserved 'home' key for Home/My Wars. Deliberately client-side only —
// the spec requires the override to never sync across devices and never
// change what any other voter sees, so nothing here ever reaches the API.
export const THEMES = ['arcade', 'fight_card', 'scrapbook'] as const
export type Theme = (typeof THEMES)[number]

const COOKIE_NAME = 'war_theme_prefs'

type ThemePrefs = Record<string, Theme>

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

function readPrefs(): ThemePrefs {
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`))
  if (!match) return {}
  try {
    const parsed = JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)))
    if (typeof parsed !== 'object' || parsed === null) return {}
    const prefs: ThemePrefs = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isTheme(value)) prefs[key] = value
    }
    return prefs
  } catch {
    return {}
  }
}

function writePrefs(prefs: ThemePrefs): void {
  const oneYearInSeconds = 60 * 60 * 24 * 365
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(prefs))}; path=/; max-age=${oneYearInSeconds}; SameSite=Lax`
}

/** `key` is a War id, or `'home'` for Home/My Wars. `null` means the voter has never chosen for this key. */
export function getThemePreference(key: string): Theme | null {
  return readPrefs()[key] ?? null
}

export function setThemePreference(key: string, theme: Theme): void {
  writePrefs({ ...readPrefs(), [key]: theme })
}
