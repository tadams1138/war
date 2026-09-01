// War overview and contestant gallery, image mode only
// (war-ui-default-spec.md §4, §6, §12). No authentication required.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getWar, type ContestantDetail, type WarDetailResponse } from '../api/client'
import { toUserMessage } from '../api/errors'
import { ContestantAttributes } from '../components/ContestantAttributes'
import { ContestantThumbnail } from '../components/ContestantThumbnail'

type WarDetailState =
  | { status: 'loading' }
  | { status: 'loaded'; war: WarDetailResponse }
  | { status: 'error'; message: string }

export function WarDetail() {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<WarDetailState>({ status: 'loading' })

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getWar(id)
      .then((war) => {
        if (!cancelled) setState({ status: 'loaded', war })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', message: toUserMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>

  const { war } = state
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
