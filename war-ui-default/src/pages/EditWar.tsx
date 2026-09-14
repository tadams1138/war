// Draft-only War editing (the spec's approved scope): metadata plus each
// contestant's name, bio, and images. Reachable only from a draft War's
// card on My Wars (WarCard's showEditLink prop) -- see useEditWar for why
// this page cannot itself distinguish "not the creator" from "editable" on
// load (GET /wars/:id is a public read; ownership is only ever checked by
// the API, at save time).
import { useParams } from 'react-router-dom'
import { EditWarContestant } from '../editWar/EditWarContestant'
import { EditWarMetadataForm } from '../editWar/EditWarMetadataForm'
import { useEditWar } from '../editWar/useEditWar'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'

export function EditWar() {
  const { id: warId } = useParams<{ id: string }>()
  const { state, saveMetadata, saveContestant, addImages, removeImage, moveImageUp } = useEditWar(warId)
  const [theme, setTheme] = useTheme(warId ?? '', state.status === 'loaded' ? state.war.theme : 'arcade')
  usePublishTheme(warId ?? '', theme, setTheme)

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>
  if (state.status === 'notEditable') {
    return (
      <main data-theme={theme}>
        <p data-testid="edit-war-not-editable">This War is no longer editable.</p>
      </main>
    )
  }

  const { war, metadataError, savingMetadata, contestantErrors } = state

  return (
    <main data-theme={theme}>
      <h1>Edit {war.title}</h1>
      <EditWarMetadataForm war={war} error={metadataError} saving={savingMetadata} onSave={saveMetadata} />
      <ul>
        {war.contestants.map((contestant) => (
          <EditWarContestant
            key={contestant.id}
            contestant={contestant}
            error={contestantErrors[contestant.id] ?? null}
            onSave={(payload) => saveContestant(contestant.id, payload)}
            onAddImages={(files) => void addImages(contestant.id, files)}
            onRemoveImage={(mediaId) => void removeImage(contestant.id, mediaId)}
            onMoveImageUp={(mediaId) => void moveImageUp(contestant.id, mediaId)}
          />
        ))}
      </ul>
    </main>
  )
}
