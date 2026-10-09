// Publishes window.__auth for the acceptance harness (tests/acceptance/support/mocking.ts's
// loginAsTestVoter/navigateAuthenticated) to reach an authenticated route
// without a real OAuth round trip. Only active in the mock build
// (VITE_API_MOCKING=enabled); a no-op in production.
import { useEffect } from 'react'

export function useAuthTestHooks(login: (token: string) => void, navigate: (path: string) => void): void {
  useEffect(() => {
    if (import.meta.env.VITE_API_MOCKING !== 'enabled') return
    window.__auth = { login, navigate: (path: string) => navigate(path) }
    return () => {
      delete window.__auth
    }
  }, [login, navigate])
}
