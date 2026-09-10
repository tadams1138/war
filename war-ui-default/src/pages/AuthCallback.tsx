// The API redirects here after setting the httpOnly refresh cookie,
// carrying no token (the spec step 3). This route
// exchanges that cookie for a JWT and returns the voter to where they
// started.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { refreshSession } from '../api/client'
import { useAuth } from '../auth/context'
import { consumeReturnTo } from '../auth/returnTo'

export function AuthCallback() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
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
  }, [login, navigate])

  if (failed) return <p role="alert">Sign-in failed — please try again.</p>
  return <p>Signing you in…</p>
}
