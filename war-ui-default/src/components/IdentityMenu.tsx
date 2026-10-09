// The authenticated half of NavBar (war-spec.md §10.2): one avatar+name
// control that opens a menu of My Wars, Start a War, Import a War, Admin
// Dashboard (Staff) and Log out. Follows the ARIA menu pattern: focus moves
// into the menu on open, arrow keys/Home/End move between items, and Escape
// closes it and returns focus to the trigger.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { isStaff } from '../auth/staff'
import { resolveVoterIdentity } from './voterIdentity'

function nextItemIndex(key: string, current: number, count: number): number | null {
  if (key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowUp') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

export function IdentityMenu() {
  const { logout, me: identityState } = useAuth()
  const identity = resolveVoterIdentity(identityState)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent) {
    const items = menuItems()
    const target = nextItemIndex(event.key, items.indexOf(document.activeElement as HTMLElement), items.length)
    if (target === null) return
    event.preventDefault()
    items[target]?.focus()
  }

  useEffect(() => {
    if (!open) return
    menuItems()[0]?.focus()

    function onDocumentMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
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
        ref={triggerRef}
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
        <div ref={menuRef} role="menu" aria-label="Account" onKeyDown={handleMenuKeyDown}>
          <NavLink role="menuitem" to="/my-wars" onClick={closeThen()}>
            My Wars
          </NavLink>
          <NavLink role="menuitem" to="/wars/new" onClick={closeThen()}>
            Start a War
          </NavLink>
          <NavLink role="menuitem" to="/wars/import" onClick={closeThen()}>
            Import a War
          </NavLink>
          {identityState.status === 'loaded' && isStaff(identityState.value) && (
            <NavLink role="menuitem" to="/admin" onClick={closeThen()}>
              Admin Dashboard
            </NavLink>
          )}
          <button type="button" role="menuitem" data-testid="nav-logout" onClick={closeThen(logout)}>
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
