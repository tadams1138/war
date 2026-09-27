// The authenticated half of NavBar (the spec, "NavBar"): a single
// avatar+name control that opens a menu holding My Wars, Start a War,
// Import a War, and Log out — collapsed by default so the persistent
// chrome stays small. Home lives outside this menu now, as the brand
// mark every visitor sees regardless of auth state (NavBar.tsx).
// Fetches identity once per authenticated session, same as before this
// collapsed behind a menu.
import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { getMe } from '../api/client'
import { useAuth } from '../auth/context'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { resolveVoterIdentity } from './voterIdentity'

export function IdentityMenu() {
  const { logout } = useAuth()
  const identityState = useAsyncResource(() => getMe(), [])
  const identity = resolveVoterIdentity(identityState)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onDocumentMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function closeThen(action?: () => void) {
    return () => {
      setOpen(false)
      action?.()
    }
  }

  return (
    <div className="identity-menu" ref={containerRef}>
      <button
        type="button"
        data-testid="nav-identity"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {identity.avatarUrl && <img src={identity.avatarUrl} alt="" />}
        {identity.displayName}
      </button>
      {open && (
        <div role="menu" aria-label="Account">
          <NavLink role="menuitem" to="/my-wars" onClick={closeThen()}>
            My Wars
          </NavLink>
          <NavLink role="menuitem" to="/wars/new" onClick={closeThen()}>
            Start a War
          </NavLink>
          <NavLink role="menuitem" to="/wars/import" onClick={closeThen()}>
            Import a War
          </NavLink>
          <button type="button" role="menuitem" data-testid="nav-logout" onClick={closeThen(logout)}>
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
