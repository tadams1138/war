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
import { useRef, useState, type RefObject } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ContestantDetail, PatchContestantPayload, WarDetailResponse, WarSummary } from '../api/client'
import { DeleteButton } from '../components/DeleteButton'
import { DeleteWarConfirmDialog } from '../components/DeleteWarConfirmDialog'
import { ExportButton } from '../components/ExportButton'
import { Modal } from '../components/Modal'
import { Toast } from '../components/Toast'
import { AddContestantForm } from '../editWar/AddContestantForm'
import { EditWarContestant } from '../editWar/EditWarContestant'
import { EditWarMetadataForm, type EditWarMetadataFormHandle } from '../editWar/EditWarMetadataForm'
import { useEditWar, type EditWarLoadedState, type EditWarState } from '../editWar/useEditWar'
import { useWarExportDownload, type WarExportDownload } from '../export/useWarExportDownload'
import { useDeleteWarFlow, type DeleteWarFlow } from '../hooks/useDeleteWarFlow'
import { usePublishTheme } from '../theme/ThemeContext'
import type { Theme } from '../theme/themeCookie'
import { useTheme } from '../theme/useTheme'
import { warTitle } from '../utils/warTitle'

type Selection = 'metadata' | 'add' | string

function initialTheme(state: EditWarState): Theme {
  return state.status === 'loaded' ? state.war.theme : 'arcade'
}

function loadedWarOrNull(state: EditWarState): WarDetailResponse | null {
  return state.status === 'loaded' ? state.war : null
}

function missingForActivation(contestants: ContestantDetail[]): string[] {
  const missing: string[] = []
  if (contestants.length < 2) missing.push('at least 2 contestants')
  return missing
}

export function EditWar() {
  const { id: warId } = useParams<{ id: string }>()
  const safeWarId = warId ?? ''
  const navigate = useNavigate()
  const onActivated = (activated: WarSummary) => navigate(`/wars/${activated.id}/vote`)
  const editWar = useEditWar(warId, onActivated)
  const deleteFlow = useDeleteWarFlow(safeWarId, () => navigate('/my-wars'))
  const exportFlow = useWarExportDownload(loadedWarOrNull(editWar.state))
  const [selected, setSelected] = useState<Selection>('metadata')
  const [theme, setTheme] = useTheme(safeWarId, initialTheme(editWar.state))
  usePublishTheme(safeWarId, theme, setTheme)
  const metadataFormRef = useRef<EditWarMetadataFormHandle>(null)
  const [metadataDirty, setMetadataDirty] = useState(false)
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false)
  const [showActivateConfirm, setShowActivateConfirm] = useState(false)

  if (editWar.state.status === 'loading') return <p>Loading…</p>
  if (editWar.state.status === 'error') return <p role="alert">{editWar.state.message}</p>
  if (editWar.state.status === 'notEditable') {
    return (
      <main data-theme={theme}>
        <p data-testid="edit-war-not-editable">This War is no longer editable.</p>
      </main>
    )
  }

  const state = editWar.state

  // war-spec.md 10.4: Activate must not silently apply on top of metadata
  // edits the creator never saved -- PATCH is rejected the instant a War
  // leaves draft, so those edits would otherwise be unrecoverable.
  function handleActivateClick(): void {
    if (metadataDirty) {
      setShowDirtyConfirm(true)
      return
    }
    setShowActivateConfirm(true)
  }

  function handleSaveThenReview(): void {
    metadataFormRef.current?.submit()
    setShowDirtyConfirm(false)
    setSelected('metadata')
  }

  // Discarding still routes through the same permanence warning every other
  // path to activation goes through -- it resolves the dirty-edits question,
  // not the "this can't be undone" one.
  function handleDiscardAndActivate(): void {
    setShowDirtyConfirm(false)
    setShowActivateConfirm(true)
  }

  function handleConfirmActivate(): void {
    setShowActivateConfirm(false)
    void editWar.activate()
  }

  return (
    <main data-theme={theme}>
      <h1>Edit {warTitle(state.war.title)}</h1>
      <Toast message={state.toast} />
      <TopActions
        state={state}
        exportFlow={exportFlow}
        deleteFlow={deleteFlow}
        showDirtyConfirm={showDirtyConfirm}
        showActivateConfirm={showActivateConfirm}
        onActivateClick={handleActivateClick}
        onSaveThenReview={handleSaveThenReview}
        onDiscardAndActivate={handleDiscardAndActivate}
        onCancelConfirm={() => setShowDirtyConfirm(false)}
        onConfirmActivate={handleConfirmActivate}
        onCancelActivateConfirm={() => setShowActivateConfirm(false)}
      />
      <div className="edit-war-layout">
        <EditWarNav selected={selected} contestants={state.war.contestants} onSelect={setSelected} />
        <EditWarDetailPane
          selected={selected}
          state={state}
          metadataFormRef={metadataFormRef}
          onDirtyChange={setMetadataDirty}
          onSelect={setSelected}
          editWar={editWar}
        />
      </div>
    </main>
  )
}

// The three top-level actions (Export, Delete, Activate) as one row, with
// each action's own error text and confirmation dialog(s) rendered
// alongside it -- these used to be three separate, unstyled divs
// (ExportSection/DeleteWarSection/ActivateSection), which is how they ended
// up stacked vertically and inconsistently styled (PROGRESS.md) instead of
// reading as one action bar.
function TopActions({
  state,
  exportFlow,
  deleteFlow,
  showDirtyConfirm,
  showActivateConfirm,
  onActivateClick,
  onSaveThenReview,
  onDiscardAndActivate,
  onCancelConfirm,
  onConfirmActivate,
  onCancelActivateConfirm,
}: {
  state: EditWarLoadedState
  exportFlow: WarExportDownload
  deleteFlow: DeleteWarFlow
  showDirtyConfirm: boolean
  showActivateConfirm: boolean
  onActivateClick: () => void
  onSaveThenReview: () => void
  onDiscardAndActivate: () => void
  onCancelConfirm: () => void
  onConfirmActivate: () => void
  onCancelActivateConfirm: () => void
}) {
  const missing = missingForActivation(state.war.contestants)
  const canActivate = missing.length === 0
  return (
    <>
      <div className="action-bar">
        <ExportButton testId="edit-war-export-button" onClick={exportFlow.trigger} />
        <DeleteButton testId="edit-war-delete-button" onClick={deleteFlow.open} />
        <button type="button" className="button" data-testid="activate-submit" disabled={!canActivate || state.activating} onClick={onActivateClick}>
          Activate War
        </button>
      </div>
      {exportFlow.error && <p role="alert">{exportFlow.error}</p>}
      {deleteFlow.error && <p role="alert">{deleteFlow.error}</p>}
      <ActivateStatus missing={missing} activateDetails={state.activateDetails} />
      <DeleteWarConfirmDialog show={deleteFlow.showConfirm} onConfirm={deleteFlow.confirm} onCancel={deleteFlow.cancel} testIdPrefix="edit-war" />
      <ActivateDirtyConfirmDialog
        show={showDirtyConfirm}
        onSaveThenReview={onSaveThenReview}
        onDiscardAndActivate={onDiscardAndActivate}
        onCancelConfirm={onCancelConfirm}
      />
      <ActivatePermanenceConfirmDialog
        show={showActivateConfirm}
        onConfirmActivate={onConfirmActivate}
        onCancelActivateConfirm={onCancelActivateConfirm}
      />
    </>
  )
}

function ActivateStatus({ missing, activateDetails }: { missing: string[]; activateDetails: string[] | null }) {
  return (
    <>
      {missing.length > 0 && <p data-testid="activate-requirements">To activate this War, add {missing.join(' and ')}.</p>}
      {activateDetails && (
        <ul role="alert" data-testid="activate-error">
          {activateDetails.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </>
  )
}

function ActivateDirtyConfirmDialog({
  show,
  onSaveThenReview,
  onDiscardAndActivate,
  onCancelConfirm,
}: {
  show: boolean
  onSaveThenReview: () => void
  onDiscardAndActivate: () => void
  onCancelConfirm: () => void
}) {
  return (
    <Modal show={show} onCancel={onCancelConfirm} testId="activate-dirty-confirm">
      <p>You have unsaved War details. Save them, discard them, or cancel before activating.</p>
      <div className="action-bar">
        <button type="button" className="button" data-testid="activate-dirty-save" onClick={onSaveThenReview}>
          Save changes
        </button>
        {/* Discards unsaved edits -- the same "throws away data" danger
            convention as deleting a War (DeleteButton), not because
            activation itself is irreversible (it is, but that's the
            desired outcome, not a destructive one). */}
        <button type="button" className="button button--danger" data-testid="activate-dirty-discard" onClick={onDiscardAndActivate}>
          Discard and activate
        </button>
        <button type="button" className="button" data-testid="activate-dirty-cancel" onClick={onCancelConfirm}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

// The final gate before every activation, regardless of which path led
// here (a clean click, or discarding unsaved edits from the dialog above):
// activation cannot be undone, so the warning is never skipped.
function ActivatePermanenceConfirmDialog({
  show,
  onConfirmActivate,
  onCancelActivateConfirm,
}: {
  show: boolean
  onConfirmActivate: () => void
  onCancelActivateConfirm: () => void
}) {
  return (
    <Modal show={show} onCancel={onCancelActivateConfirm} testId="activate-confirm">
      <p>
        Activating is permanent. Once this War goes live, its contestants and details can no longer be edited. Do
        you want to continue?
      </p>
      <div className="action-bar">
        <button type="button" className="button" data-testid="activate-confirm-submit" onClick={onConfirmActivate}>
          Activate War
        </button>
        <button type="button" className="button" data-testid="activate-confirm-cancel" onClick={onCancelActivateConfirm}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

function EditWarNav({
  selected,
  contestants,
  onSelect,
}: {
  selected: Selection
  contestants: ContestantDetail[]
  onSelect: (selection: Selection) => void
}) {
  return (
    <nav className="edit-war-nav" aria-label="War sections">
      <button
        type="button"
        data-testid="edit-war-nav-metadata"
        aria-current={selected === 'metadata'}
        onClick={() => onSelect('metadata')}
      >
        Metadata
      </button>
      <ul>
        {contestants.map((contestant) => (
          <li key={contestant.id}>
            <button
              type="button"
              data-testid="edit-war-nav-contestant"
              aria-current={selected === contestant.id}
              onClick={() => onSelect(contestant.id)}
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
        onClick={() => onSelect('add')}
      >
        + Add contestant
      </button>
    </nav>
  )
}

function orNull<T>(value: T | null | undefined): T | null {
  return value ?? null
}

function EditWarDetailPane({
  selected,
  state,
  metadataFormRef,
  onDirtyChange,
  onSelect,
  editWar,
}: {
  selected: Selection
  state: EditWarLoadedState
  metadataFormRef: RefObject<EditWarMetadataFormHandle | null>
  onDirtyChange: (dirty: boolean) => void
  onSelect: (selection: Selection) => void
  editWar: ReturnType<typeof useEditWar>
}) {
  const selectedContestant = state.war.contestants.find((c) => c.id === selected)

  async function handleRemove(contestantId: string): Promise<void> {
    await editWar.removeContestant(contestantId)
    onSelect('metadata')
  }

  return (
    <div className="edit-war-detail">
      {selected === 'metadata' && (
        <EditWarMetadataForm
          ref={metadataFormRef}
          war={state.war}
          error={state.metadataError}
          saving={state.savingMetadata}
          onSave={editWar.saveMetadata}
          onDirtyChange={onDirtyChange}
        />
      )}
      {selected === 'add' && (
        <AddContestantForm
          error={state.addContestantError}
          onAdd={editWar.addContestant}
          onAdded={(contestant) => onSelect(contestant.id)}
        />
      )}
      {selectedContestant && (
        <SelectedContestantEditor
          contestant={selectedContestant}
          error={orNull(state.contestantErrors[selectedContestant.id])}
          imageNotice={orNull(state.imageErrors[selectedContestant.id])}
          onSave={(payload) => editWar.saveContestant(selectedContestant.id, payload)}
          onRemove={() => void handleRemove(selectedContestant.id)}
          onAddImages={(files) => void editWar.addImages(selectedContestant.id, files)}
          onRemoveImage={(mediaId) => void editWar.removeImage(selectedContestant.id, mediaId)}
          onMoveImageUp={(mediaId) => void editWar.moveImageUp(selectedContestant.id, mediaId)}
        />
      )}
    </div>
  )
}

function SelectedContestantEditor({
  contestant,
  error,
  imageNotice,
  onSave,
  onRemove,
  onAddImages,
  onRemoveImage,
  onMoveImageUp,
}: {
  contestant: ContestantDetail
  error: string | null
  imageNotice: { message: string; kind: 'error' | 'wait' } | null
  onSave: (payload: PatchContestantPayload) => Promise<void>
  onRemove: () => void
  onAddImages: (files: File[]) => void
  onRemoveImage: (mediaId: string) => void
  onMoveImageUp: (mediaId: string) => void
}) {
  return (
    <ul>
      <EditWarContestant
        key={contestant.id}
        contestant={contestant}
        error={error}
        imageNotice={imageNotice}
        onSave={onSave}
        onRemove={onRemove}
        onAddImages={onAddImages}
        onRemoveImage={onRemoveImage}
        onMoveImageUp={onMoveImageUp}
      />
    </ul>
  )
}
