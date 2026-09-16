// Draft-only War editing (the spec's approved scope): metadata plus each
// contestant's name, bio, and images. Reachable only from a draft War's
// card on My Wars (WarCard's showEditLink prop) -- see useEditWar for why
// this page cannot itself distinguish "not the creator" from "editable" on
// load (GET /wars/:id is a public read; ownership is only ever checked by
// the API, at save time).
//
// Two-pane layout: a left nav list (Metadata, each contestant, Add
// contestant) selects what the right pane shows. Only one section renders
// at a time -- a long page stacking every contestant's full editor (bio
// toolbar, live preview, image gallery) top to bottom stopped being
// navigable once a War had more than one or two contestants.
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ContestantDetail, WarSummary } from '../api/client'
import { Toast } from '../components/Toast'
import { AddContestantForm } from '../editWar/AddContestantForm'
import { EditWarContestant } from '../editWar/EditWarContestant'
import { EditWarMetadataForm, type EditWarMetadataFormHandle } from '../editWar/EditWarMetadataForm'
import { useEditWar } from '../editWar/useEditWar'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'
import { warTitle } from '../utils/warTitle'

type Selection = 'metadata' | 'add' | string

export function EditWar() {
  const { id: warId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const onActivated = (activated: WarSummary) => navigate(`/wars/${activated.id}/vote`)
  const {
    state,
    saveMetadata,
    saveContestant,
    addContestant,
    removeContestant,
    addImages,
    removeImage,
    moveImageUp,
    activate,
  } = useEditWar(warId, onActivated)
  const [selected, setSelected] = useState<Selection>('metadata')
  const [theme, setTheme] = useTheme(warId ?? '', state.status === 'loaded' ? state.war.theme : 'arcade')
  usePublishTheme(warId ?? '', theme, setTheme)
  const metadataFormRef = useRef<EditWarMetadataFormHandle>(null)
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false)

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>
  if (state.status === 'notEditable') {
    return (
      <main data-theme={theme}>
        <p data-testid="edit-war-not-editable">This War is no longer editable.</p>
      </main>
    )
  }

  const { war, metadataError, savingMetadata, addContestantError, contestantErrors, activating, activateDetails } = state
  const selectedContestant = war.contestants.find((c) => c.id === selected)

  const missingForActivation: string[] = []
  if (war.contestants.length < 2) missingForActivation.push('at least 2 contestants')
  if (war.contestants.some((contestant) => contestant.media.length === 0)) {
    missingForActivation.push('an image for every contestant')
  }
  const canActivate = missingForActivation.length === 0

  function handleAdded(contestant: ContestantDetail): void {
    setSelected(contestant.id)
  }

  // war-spec.md 10.4: Activate must not silently apply on top of metadata
  // edits the creator never saved -- PATCH is rejected the instant a War
  // leaves draft, so those edits would otherwise be unrecoverable.
  function handleActivateClick(): void {
    if (metadataDirty) {
      setShowDirtyConfirm(true)
      return
    }
    void activate()
  }

  function handleSaveThenReview(): void {
    metadataFormRef.current?.submit()
    setShowDirtyConfirm(false)
    setSelected('metadata')
  }

  function handleDiscardAndActivate(): void {
    setShowDirtyConfirm(false)
    void activate()
  }

  async function handleRemove(contestantId: string): Promise<void> {
    await removeContestant(contestantId)
    setSelected('metadata')
  }

  return (
    <main data-theme={theme}>
      <h1>Edit {warTitle(war.title)}</h1>
      <Toast message={state.toast} />
      <div className="edit-war-activate">
        {!canActivate && (
          <p data-testid="activate-requirements">To activate this War, add {missingForActivation.join(' and ')}.</p>
        )}
        {activateDetails && (
          <ul role="alert" data-testid="activate-error">
            {activateDetails.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          data-testid="activate-submit"
          disabled={!canActivate || activating}
          onClick={handleActivateClick}
        >
          Activate War
        </button>
        {showDirtyConfirm && (
          <div role="alertdialog" data-testid="activate-dirty-confirm">
            <p>
              You have unsaved War details. Save them, discard them, or cancel before activating.
            </p>
            <button type="button" data-testid="activate-dirty-save" onClick={handleSaveThenReview}>
              Save changes
            </button>
            <button type="button" data-testid="activate-dirty-discard" onClick={handleDiscardAndActivate}>
              Discard and activate
            </button>
            <button type="button" data-testid="activate-dirty-cancel" onClick={() => setShowDirtyConfirm(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="edit-war-layout">
        <nav className="edit-war-nav" aria-label="War sections">
          <button
            type="button"
            data-testid="edit-war-nav-metadata"
            aria-current={selected === 'metadata'}
            onClick={() => setSelected('metadata')}
          >
            Metadata
          </button>
          <ul>
            {war.contestants.map((contestant) => (
              <li key={contestant.id}>
                <button
                  type="button"
                  data-testid="edit-war-nav-contestant"
                  aria-current={selected === contestant.id}
                  onClick={() => setSelected(contestant.id)}
                >
                  {contestant.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid="edit-war-nav-add-contestant"
            aria-current={selected === 'add'}
            onClick={() => setSelected('add')}
          >
            + Add contestant
          </button>
        </nav>
        <div className="edit-war-detail">
          {selected === 'metadata' && (
            <EditWarMetadataForm
              ref={metadataFormRef}
              war={war}
              error={metadataError}
              saving={savingMetadata}
              onSave={saveMetadata}
              onDirtyChange={setMetadataDirty}
            />
          )}
          {selected === 'add' && (
            <AddContestantForm error={addContestantError} onAdd={addContestant} onAdded={handleAdded} />
          )}
          {selectedContestant && (
            <ul>
              <EditWarContestant
                key={selectedContestant.id}
                contestant={selectedContestant}
                error={contestantErrors[selectedContestant.id] ?? null}
                onSave={(payload) => saveContestant(selectedContestant.id, payload)}
                onRemove={() => void handleRemove(selectedContestant.id)}
                onAddImages={(files) => void addImages(selectedContestant.id, files)}
                onRemoveImage={(mediaId) => void removeImage(selectedContestant.id, mediaId)}
                onMoveImageUp={(mediaId) => void moveImageUp(selectedContestant.id, mediaId)}
              />
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
