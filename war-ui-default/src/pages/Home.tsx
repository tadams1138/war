// Browse active public Wars (war-ui-default-spec.md §4, §12).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getWars, type WarSummary } from '../api/client'
import { toUserMessage } from '../api/errors'
import { useAuth } from '../auth/context'
import { WarCard } from '../components/WarCard'

type HomeState = { status: 'loading' } | { status: 'loaded'; wars: WarSummary[] } | { status: 'error'; message: string }

export function Home() {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<HomeState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    getWars()
      .then((response) => {
        if (!cancelled) setState({ status: 'loaded', wars: response.wars })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', message: toUserMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main>
      <h1>War</h1>
      {!isAuthenticated && (
        <Link to="/login" data-testid="login-cta">
          Login to Vote
        </Link>
      )}
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'loaded' && <HomeWarList wars={state.wars} />}
    </main>
  )
}

function HomeWarList({ wars }: { wars: WarSummary[] }) {
  if (wars.length === 0) {
    return <p data-testid="empty-state">No active Wars right now — check back soon.</p>
  }
  return (
    <ul>
      {wars.map((war) => (
        <li key={war.id}>
          <WarCard war={war} />
        </li>
      ))}
    </ul>
  )
}
