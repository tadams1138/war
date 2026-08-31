// The JWT lives only as an in-memory module variable — never localStorage
// or sessionStorage (war-ui-default-spec.md §2, §7). AuthProvider
// (src/auth/context.tsx) is the only React-facing consumer; api/client.ts
// reads and writes this module directly since it runs outside React.

type UnauthorizedHandler = () => void

let token: string | null = null
let refreshDisabled = false
let unauthorizedHandler: UnauthorizedHandler | null = null

export function getToken(): string | null {
  return token
}

export function setToken(newToken: string): void {
  token = newToken
  refreshDisabled = false
}

export function clearToken(): void {
  token = null
}

export function isRefreshDisabled(): boolean {
  return refreshDisabled
}

export function disableRefresh(): void {
  refreshDisabled = true
}

// AuthProvider registers itself here so client.ts — which has no access to
// the router — can trigger the terminal-failed-refresh redirect (§7).
export function registerUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

// A failed refresh is terminal (§7): clear the token, stop attempting
// further refreshes for this session, and let the registered handler
// redirect to /login.
export function notifyUnauthorized(): void {
  clearToken()
  disableRefresh()
  unauthorizedHandler?.()
}

export function __resetAuthStateForTests(): void {
  token = null
  refreshDisabled = false
  unauthorizedHandler = null
}
