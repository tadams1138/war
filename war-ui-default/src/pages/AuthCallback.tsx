// The API redirects here after setting the httpOnly refresh cookie,
// carrying no token (the spec step 3). This route
// exchanges that cookie for a JWT and returns the voter to where they
// started. A banned Voter is never issued a session (§6.7); a redirect
// carrying `error=banned` shows that explicitly instead of attempting the
// exchange and reporting a generic failure.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { refreshSession } from '../api/client'
import { useAuth } from '../auth/context'
import { consumeReturnTo } from '../auth/returnTo'

export function AuthCallback() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  const [searchParams] = useSearchParams()
  const banned = searchParams.get('error') === 'banned'

  useEffect(() => {
    if (banned) return
    let cancelled = false
    refreshSession()
      .then((token) => {
        if (cancelled) return
        login(token)
        navigate(consumeReturnTo(), { replace: true })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [banned, login, navigate])

  if (banned) return <p role="alert">This account has been banned and cannot sign in.</p>
  if (failed) return <p role="alert">Sign-in failed — please try again.</p>
  return <p>Signing you in…</p>
}
