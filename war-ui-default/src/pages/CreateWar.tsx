// The creator chooses the War's permanent media mode before its draft is made.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createWar } from '../api/client'
import { ApiError, toUserMessage } from '../api/errors'
import { FALLBACK_THEME, usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

type MediaMode = 'image' | 'video'

function CreateWarChoice({ onChoose }: { onChoose: (mode: MediaMode) => void }) {
  return <>
    <h1>Start a War</h1>
    <p>Choose how contestants appear. This choice cannot be changed later.</p>
    <button type="button" onClick={() => onChoose('image')}>Create image War</button>
    <div>
      <button type="button" onClick={() => onChoose('video')}>Create video War</button>
      <p data-testid="video-war-guidance">Videos take longer to compare. Start with few contestants and clips around 20 seconds.</p>
    </div>
  </>
}

function CreateWarStatus({ mode, error, wait, onRetry }: { mode: MediaMode | null; error: string | null; wait: string | null; onRetry: () => void }) {
  if (!mode) return null
  if (error) return <>
    <p role="alert" data-testid="create-war-error">{error}</p>
    <button type="button" data-testid="create-war-retry" onClick={onRetry}>Try again</button>
  </>
  if (wait) return <p role="status" data-testid="create-war-wait">{wait}</p>
  return <p>Creating your War…</p>
}

function createDraft(mode: MediaMode) {
  return createWar(mode === 'video' ? { media_mode: 'video' } : {})
}

export function CreateWar() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [mode, setMode] = useState<MediaMode | null>(null)
  const [theme, setTheme] = useTheme('home', FALLBACK_THEME)
  usePublishTheme('home', theme, setTheme)

  useEffect(() => {
    if (!mode) return
    let cancelled = false
    let retryTimer: number | undefined
    setError(null)
    setWait(null)
    createDraft(mode)
      .then((war) => {
        if (!cancelled) navigate(`/wars/${war.id}/edit`, { replace: true })
      })
      .catch((requestError) => {
        if (cancelled) return
        // Rate limited (war-spec.md §10.5: "a wait, using the supplied delay
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
  }, [attempt, mode, navigate])

  return (
    <main data-theme={theme}>
      {!mode && <CreateWarChoice onChoose={setMode} />}
      <CreateWarStatus mode={mode} error={error} wait={wait} onRetry={() => setAttempt((count) => count + 1)} />
    </main>
  )
}
