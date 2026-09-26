// Persistent footer (the spec, §10.1: rendered once by the shell alongside
// NavBar, not added page by page). Tracks the active theme the same way
// NavBar does -- its background/text color come from the [data-theme]
// custom properties in themes.css, so an unthemed footer would render
// wrong (or invisible) against a dark theme's page background.
import { Link } from 'react-router-dom'
import { useActiveTheme } from '../theme/ThemeContext'

const REPO_URL = 'https://github.com/tadams1138/war'
const IMPORT_GUIDE_URL = 'https://github.com/tadams1138/war/blob/master/docs/building-a-war-import.md'

const NO_ACTIVE_THEME_FALLBACK = 'arcade' as const

export function Footer() {
  const active = useActiveTheme()
  const theme = active?.theme ?? NO_ACTIVE_THEME_FALLBACK

  return (
    <footer className="app-footer" data-theme={theme}>
      <p>© {new Date().getFullYear()} Tom Adams</p>
      <a href={REPO_URL} target="_blank" rel="noreferrer">
        war on GitHub
      </a>
      <a href={IMPORT_GUIDE_URL} target="_blank" rel="noreferrer">
        Building a War import (guide for AI implementers)
      </a>
      <Link to="/privacy">Privacy Policy</Link>
      <Link to="/terms">Terms of Service</Link>
      <Link to="/data-deletion">Data Deletion</Link>
    </footer>
  )
}
