// Persistent navigation header (war-spec.md §10.2), rendered once by App's
// shell around every route. Renders in the active theme published via
// ThemeContext.
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { FALLBACK_THEME, useActiveTheme } from '../theme/ThemeContext'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { IdentityMenu } from './IdentityMenu'
import { Logo } from './Logo'

// Every themed page publishes its theme and setTheme, so the switcher and
// the page share one closure. This covers the instant before the first
// page's effect runs, and routes with no theme scope (AuthCallback).
const NO_ACTIVE_THEME_FALLBACK = { theme: FALLBACK_THEME, setTheme: () => {} }

export function NavBar() {
  const { isAuthenticated } = useAuth()
  const active = useActiveTheme()
  const { theme, setTheme } = active ?? NO_ACTIVE_THEME_FALLBACK

  return (
    <nav className="nav-bar" aria-label="Primary" data-theme={theme}>
      <Link to="/" className="brand-mark" data-testid="nav-home" aria-label="Home">
        <Logo />
        <span className="brand-wordmark" aria-hidden="true">WAR</span>
      </Link>
      <div className="nav-bar-actions">
        <ThemeSwitcher theme={theme} onChange={setTheme} />
        {isAuthenticated ? <IdentityMenu /> : <Link to="/login">Log in</Link>}
      </div>
    </nav>
  )
}
