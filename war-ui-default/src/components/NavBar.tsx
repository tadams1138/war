// Persistent navigation header (the spec, "NavBar"). Rendered once by
// App's shell, wrapping every route including the RequireAuth-protected
// ones — see App.tsx. Renders in the currently active theme: a War-scoped
// page's own theme when one has published via ThemeContext, else the
// 'home'-keyed theme every other route shares.
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { useActiveTheme } from '../theme/ThemeContext'
import { ThemeSwitcher } from '../theme/ThemeSwitcher'
import { IdentityMenu } from './IdentityMenu'
import { Logo } from './Logo'

// Every route that renders a <main data-theme> also publishes it here via
// usePublishTheme, including the 'home'-keyed ones (Home, MyWars, Login,
// CreateWar) — NavBar never resolves a theme itself, so its select and the
// page it's currently sitting on always share the exact same setTheme
// closure and can never drift out of sync with each other. This fallback
// only covers the brief instant before the first page's effect runs, and
// routes with no theme scope at all (AuthCallback).
const NO_ACTIVE_THEME_FALLBACK = { theme: 'arcade' as const, setTheme: () => {} }

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
