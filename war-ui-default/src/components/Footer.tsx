// Persistent footer (war-spec.md §10.1), rendered once by the shell alongside
// NavBar. Tracks the active theme like NavBar: its colors come from the
// [data-theme] custom properties in themes.css.
import { Link } from 'react-router-dom'
import { FALLBACK_THEME, useActiveTheme } from '../theme/ThemeContext'

const REPO_URL = 'https://github.com/tadams1138/war'
const IMPORT_GUIDE_URL = 'https://github.com/tadams1138/war/blob/master/docs/building-a-war-import.md'

export function Footer() {
  const active = useActiveTheme()
  const theme = active?.theme ?? FALLBACK_THEME

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
