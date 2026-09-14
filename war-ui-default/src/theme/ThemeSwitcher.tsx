// Lets a voter override the theme they see for one scope — a specific War,
// or 'home' for Home/My Wars (the spec, "Theme switching"). Has no
// persistence logic of its own; the page that renders this owns the
// useTheme() call and passes both props down.
import { THEMES, type Theme } from './themeCookie'

const LABELS: Record<Theme, string> = {
  arcade: 'Arcade Showdown',
  fight_card: 'Fight Card',
  scrapbook: 'Tape & Prints',
}

interface ThemeSwitcherProps {
  theme: Theme
  onChange: (theme: Theme) => void
}

export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  return (
    <div data-testid="theme-switcher" role="radiogroup" aria-label="Theme">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          data-testid={`theme-option-${option}`}
          aria-pressed={option === theme}
          onClick={() => onChange(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  )
}
