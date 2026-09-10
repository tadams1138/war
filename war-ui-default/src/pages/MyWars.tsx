// Every War the authenticated voter created, across every status
// (the spec "MyWars Page"). This is what closes the
// gap the CreateWar wizard's own spec text names: a creator who abandons
// the wizard before Activate has, until this page exists, no way to find
// that draft War again.
import { Link } from 'react-router-dom'
import { getWars, type WarSummary } from '../api/client'
import { WarCard } from '../components/WarCard'
import { useAsyncResource } from '../hooks/useAsyncResource'

export function MyWars() {
  const state = useAsyncResource(() => getWars({ creator: 'me' }), [])

  return (
    <main>
      <h1>My Wars</h1>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'loaded' && <MyWarsList wars={state.value.wars} />}
    </main>
  )
}

function MyWarsList({ wars }: { wars: WarSummary[] }) {
  if (wars.length === 0) {
    return (
      <div data-testid="empty-state">
        <p>You haven&rsquo;t created any Wars yet.</p>
        <Link to="/wars/new" data-testid="my-wars-create-war-cta">
          Create a War
        </Link>
      </div>
    )
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
