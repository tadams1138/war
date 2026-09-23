// Immediately creates an empty draft War and forwards to its Edit page —
// there is no creation wizard (the spec, "Create War"): every field a
// draft needs, including Publish/Unpublish, lives on the one Edit page.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createWar } from '../api/client'
import { ApiError, toUserMessage } from '../api/errors'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function CreateWar() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  useEffect(() => {
    let cancelled = false
    let retryTimer: number | undefined
    setError(null)
    setWait(null)
    createWar({})
      .then((war) => {
        if (!cancelled) navigate(`/wars/${war.id}/edit`, { replace: true })
      })
      .catch((requestError) => {
        if (cancelled) return
        // Rate limited (the spec, §10.5: "a wait, using the supplied delay
        // — never presented as an error") retries on its own once the
        // delay passes, mirroring useVoteSession's applyRateLimit — no
        // "Try again" click needed for a mere cooldown.
        if (requestError instanceof ApiError && requestError.reason === 'rate-limited') {
          setWait(requestError.message)
          retryTimer = window.setTimeout(() => {
            if (!cancelled) setAttempt((count) => count + 1)
          }, (requestError.retryAfterSeconds ?? 0) * 1000)
          return
        }
        setError(toUserMessage(requestError))
      })
    return () => {
      cancelled = true
      window.clearTimeout(retryTimer)
    }
  }, [attempt, navigate])

  return (
    <main data-theme={theme}>
      {error && (
        <>
          <p role="alert" data-testid="create-war-error">
            {error}
          </p>
          <button type="button" data-testid="create-war-retry" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </>
      )}
      {wait && (
        <p role="status" data-testid="create-war-wait">
          {wait}
        </p>
      )}
      {!error && !wait && <p>Creating your War…</p>}
    </main>
  )
}
