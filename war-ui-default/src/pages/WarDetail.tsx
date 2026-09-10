// War overview and contestant gallery, image mode only
// (the spec). No authentication required.
import { useParams } from 'react-router-dom'
import { getWar, type ContestantDetail } from '../api/client'
import { ContestantAttributes } from '../components/ContestantAttributes'
import { ContestantThumbnail } from '../components/ContestantThumbnail'
import { useAsyncResource } from '../hooks/useAsyncResource'

export function WarDetail() {
  const { id } = useParams<{ id: string }>()
  const state = useAsyncResource(id ? () => getWar(id) : undefined, [id])

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>

  const war = state.value
  return (
    <main>
      <h1>{war.title}</h1>
      {war.category && <p>{war.category}</p>}
      <ul>
        {war.contestants.map((contestant) => (
          <li key={contestant.id}>
            <ContestantGalleryItem contestant={contestant} />
          </li>
        ))}
      </ul>
    </main>
  )
}

function ContestantGalleryItem({ contestant }: { contestant: ContestantDetail }) {
  return (
    <div data-testid="contestant-gallery-item">
      <ContestantThumbnail media={contestant.media} name={contestant.name} />
      <h2>{contestant.name}</h2>
      <ContestantAttributes attributes={contestant.attributes} />
    </div>
  )
}
