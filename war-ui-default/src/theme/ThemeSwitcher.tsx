// Lets a voter override the theme they see for one scope — a specific War,
// or 'home' for every other route (the spec, "Theme switching"). Lives in
// NavBar so it's reachable from anywhere; has no persistence logic of its
// own — the caller owns the useTheme()/ThemeContext call and passes both
// props down.
import { THEME_LABELS, THEMES, type Theme } from './themeCookie'

interface ThemeSwitcherProps {
  theme: Theme
  onChange: (theme: Theme) => void
}

export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  return (
    <select
      data-testid="nav-theme-select"
      aria-label="Theme"
      value={theme}
      onChange={(event) => onChange(event.target.value as Theme)}
    >
      {THEMES.map((option) => (
        <option key={option} value={option}>
          {THEME_LABELS[option]}
        </option>
      ))}
    </select>
  )
}
