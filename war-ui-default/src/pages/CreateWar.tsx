// Immediately creates an empty draft War and forwards to its Edit page —
// there is no creation wizard (the spec, "Create War"): every field a
// draft needs, including Activate, lives on the one Edit page.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createWar } from '../api/client'
import { toUserMessage } from '../api/errors'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function CreateWar() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [theme, setTheme] = useTheme('home', 'arcade')
  usePublishTheme('home', theme, setTheme)

  useEffect(() => {
    let cancelled = false
    setError(null)
    createWar({})
      .then((war) => {
        if (!cancelled) navigate(`/wars/${war.id}/edit`, { replace: true })
      })
      .catch((requestError) => {
        if (!cancelled) setError(toUserMessage(requestError))
      })
    return () => {
      cancelled = true
    }
  }, [attempt, navigate])

  return (
    <main data-theme={theme}>
      {error ? (
        <>
          <p role="alert" data-testid="create-war-error">
            {error}
          </p>
          <button type="button" data-testid="create-war-retry" onClick={() => setAttempt((count) => count + 1)}>
            Try again
          </button>
        </>
      ) : (
        <p>Creating your War…</p>
      )}
    </main>
  )
}
