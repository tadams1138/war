// Persistent navigation header (war-ui-default-spec.md §4, §6 "NavBar").
// Rendered once by App's shell, wrapping every route including the
// RequireAuth-protected ones — see App.tsx. NavBar itself reads only
// useAuth().isAuthenticated to choose between two fixed content sets; it
// never renders a partial or transitional state.
import { Link, NavLink } from 'react-router-dom'
import { getMe } from '../api/client'
import { useAuth } from '../auth/context'
import { useAsyncResource } from '../hooks/useAsyncResource'
import { resolveVoterIdentity } from './voterIdentity'

export function NavBar() {
  const { isAuthenticated } = useAuth()

  return (
    <nav aria-label="Primary">
      <NavLink to="/" end>
        Home
      </NavLink>
      {isAuthenticated ? <AuthenticatedNavLinks /> : <Link to="/login">Log in</Link>}
    </nav>
  )
}

// Fetched once per authenticated session — `isAuthenticated` only changes
// on login/logout, not on navigation, so this effect does not refire on
// every route change (§6, "Identity").
function AuthenticatedNavLinks() {
  const { logout } = useAuth()
  const identityState = useAsyncResource(() => getMe(), [])
  const identity = resolveVoterIdentity(identityState)

  return (
    <>
      <NavLink to="/my-wars">My Wars</NavLink>
      <NavLink to="/wars/new">Create War</NavLink>
      <span data-testid="nav-identity">
        {identity.avatarUrl && <img src={identity.avatarUrl} alt="" />}
        {identity.displayName}
      </span>
      <button type="button" data-testid="nav-logout" onClick={logout}>
        Log out
      </button>
    </>
  )
}
