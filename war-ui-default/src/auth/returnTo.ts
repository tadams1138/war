// Single source of truth for the /login?returnTo=...&reason=... URL
// contract and the sessionStorage key that carries returnTo across the
// full-page OAuth round trip. Four modules
// agree on this (RequireAuth's redirect, AuthProvider's unauthorized
// redirect, Login's persist-before-navigating-away, AuthCallback's
// read-back).
// features/login-and-auth.feature asserts the exact URL this produces, including
// parameter order, so any change here is a change to a pinned contract.

const RETURN_TO_STORAGE_KEY = 'war:returnTo'

export type LoginRedirectReason = 'session-expired'

export function loginUrlFor(returnTo: string, reason?: LoginRedirectReason): string {
  const encodedReturnTo = encodeURIComponent(returnTo)
  const reasonParam = reason ? `&reason=${reason}` : ''
  return `/login?returnTo=${encodedReturnTo}${reasonParam}`
}

// sessionStorage holds a route path here, never a credential.
export function storeReturnTo(returnTo: string): void {
  sessionStorage.setItem(RETURN_TO_STORAGE_KEY, returnTo)
}

export function consumeReturnTo(): string {
  const stored = sessionStorage.getItem(RETURN_TO_STORAGE_KEY) ?? '/'
  sessionStorage.removeItem(RETURN_TO_STORAGE_KEY)
  return stored
}
