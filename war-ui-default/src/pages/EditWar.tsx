// A War's own editing page (spec §6.1: always editable by its creator, in
// any status): metadata, each contestant's name/bio/images, Publish/
// Unpublish, Clear Votes, and Delete. Reachable only from a War's own My
// Wars card -- see useEditWar for why this page cannot itself distinguish
// "not the creator" from "not found" on load (GET /wars/:id already 404s
// either case identically, spec §6.1).
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

function missingForPublish(contestants: ContestantDetail[]): string[] {
  const missing: string[] = []
  if (contestants.length < 2) missing.push('at least 2 contestants')
  return missing
}

export function EditWar() {
  const { id: warId } = useParams<{ id: string }>()
  const safeWarId = warId ?? ''
  const navigate = useNavigate()
  const onPublished = (published: WarSummary) => navigate(`/wars/${published.id}/vote`)
  const editWar = useEditWar(warId, onPublished)
  const deleteFlow = useDeleteWarFlow(safeWarId, () => navigate('/my-wars'))
  const exportFlow = useWarExportDownload(loadedWarOrNull(editWar.state))
  const [selected, setSelected] = useState<Selection>('metadata')
  const [theme, setTheme] = useTheme(safeWarId, initialTheme(editWar.state))
  usePublishTheme(safeWarId, theme, setTheme)
  const metadataFormRef = useRef<EditWarMetadataFormHandle>(null)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [showClearVotesConfirm, setShowClearVotesConfirm] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<ContestantDetail | null>(null)

  if (editWar.state.status === 'loading') return <p>Loading…</p>
  if (editWar.state.status === 'error') return <p role="alert">{editWar.state.message}</p>

  const state = editWar.state

  function handleConfirmPublishToggle(): void {
    setShowPublishConfirm(false)
    if (state.war.status === 'draft') void editWar.publish()
    else void editWar.unpublish()
  }

  function handleConfirmClearVotes(): void {
    setShowClearVotesConfirm(false)
    void editWar.clearVotes()
  }

  // A contestant with no votes on its own matchups is just removed (spec
  // §6.1); one that does carry votes asks first, naming what will be lost,
  // like every other destructive action on this page.
  function requestRemoveContestant(contestant: ContestantDetail): void {
    if (contestant.appearance_count > 0) {
      setPendingRemoval(contestant)
    } else {
      void handleRemove(contestant.id)
    }
  }

  async function handleRemove(contestantId: string): Promise<void> {
    await editWar.removeContestant(contestantId)
    setSelected('metadata')
  }

  function confirmRemoveContestant(): void {
    if (!pendingRemoval) return
    const contestantId = pendingRemoval.id
    setPendingRemoval(null)
    void handleRemove(contestantId)
  }

  return (
    <main data-theme={theme}>
      <h1>Edit {warTitle(state.war.title)}</h1>
      <Toast message={state.toast} />
      <TopActions
        state={state}
        exportFlow={exportFlow}
        deleteFlow={deleteFlow}
        showPublishConfirm={showPublishConfirm}
        showClearVotesConfirm={showClearVotesConfirm}
        onPublishToggleClick={() => setShowPublishConfirm(true)}
        onConfirmPublishToggle={handleConfirmPublishToggle}
        onCancelPublishConfirm={() => setShowPublishConfirm(false)}
        onClearVotesClick={() => setShowClearVotesConfirm(true)}
        onConfirmClearVotes={handleConfirmClearVotes}
        onCancelClearVotesConfirm={() => setShowClearVotesConfirm(false)}
      />
      <div className="edit-war-layout">
        <EditWarNav selected={selected} contestants={state.war.contestants} onSelect={setSelected} />
        <EditWarDetailPane
          selected={selected}
          state={state}
          metadataFormRef={metadataFormRef}
          onSelect={setSelected}
          editWar={editWar}
          onRequestRemove={requestRemoveContestant}
        />
      </div>
      <RemoveContestantConfirmDialog
        contestant={pendingRemoval}
        onConfirm={confirmRemoveContestant}
        onCancel={() => setPendingRemoval(null)}
      />
    </main>
  )
}

// The top-level actions (Export, Delete, Publish/Unpublish, Clear Votes) as
// one row, with each action's own error text and confirmation dialog(s)
// rendered alongside it.
function TopActions({
  state,
  exportFlow,
  deleteFlow,
  showPublishConfirm,
  showClearVotesConfirm,
  onPublishToggleClick,
  onConfirmPublishToggle,
  onCancelPublishConfirm,
  onClearVotesClick,
  onConfirmClearVotes,
  onCancelClearVotesConfirm,
}: {
  state: EditWarLoadedState
  exportFlow: WarExportDownload
  deleteFlow: DeleteWarFlow
  showPublishConfirm: boolean
  showClearVotesConfirm: boolean
  onPublishToggleClick: () => void
  onConfirmPublishToggle: () => void
  onCancelPublishConfirm: () => void
  onClearVotesClick: () => void
  onConfirmClearVotes: () => void
  onCancelClearVotesConfirm: () => void
}) {
  return (
    <>
      <div className="action-bar">
        <ExportButton testId="edit-war-export-button" onClick={exportFlow.trigger} />
        <DeleteButton testId="edit-war-delete-button" onClick={deleteFlow.open} />
        <PublishToggleButton war={state.war} publishing={state.publishing} onClick={onPublishToggleClick} />
        <button type="button" className="button" data-testid="clear-votes-submit" disabled={state.clearingVotes} onClick={onClearVotesClick}>
          Clear Votes
        </button>
      </div>
      {exportFlow.error && <p role="alert">{exportFlow.error}</p>}
      {deleteFlow.error && <p role="alert">{deleteFlow.error}</p>}
      <PublishStatus war={state.war} publishDetails={state.publishDetails} />
      <DeleteWarConfirmDialog show={deleteFlow.showConfirm} onConfirm={deleteFlow.confirm} onCancel={deleteFlow.cancel} testIdPrefix="edit-war" />
      <PublishToggleConfirmDialog
        war={state.war}
        show={showPublishConfirm}
        onConfirm={onConfirmPublishToggle}
        onCancel={onCancelPublishConfirm}
      />
      <ClearVotesConfirmDialog show={showClearVotesConfirm} onConfirm={onConfirmClearVotes} onCancel={onCancelClearVotesConfirm} />
    </>
  )
}

// Publish and Unpublish are the two directions of one toggle (spec §6.1) --
// one button whose label and action follow the War's current status, not
// two separate controls. A closed War can be neither published nor
// unpublished (spec: "nothing reverses" closing), so neither direction is
// offered for one.
function PublishToggleButton({
  war,
  publishing,
  onClick,
}: {
  war: WarDetailResponse
  publishing: boolean
  onClick: () => void
}) {
  if (war.status === 'closed') return null
  const isDraft = war.status === 'draft'
  const disabled = publishing || (isDraft && missingForPublish(war.contestants).length > 0)
  return (
    <button type="button" className="button" data-testid="publish-toggle-submit" disabled={disabled} onClick={onClick}>
      {isDraft ? 'Publish War' : 'Unpublish War'}
    </button>
  )
}

function PublishStatus({ war, publishDetails }: { war: WarDetailResponse; publishDetails: string[] | null }) {
  const missing = war.status === 'draft' ? missingForPublish(war.contestants) : []
  return (
    <>
      {missing.length > 0 && <p data-testid="publish-requirements">To publish this War, add {missing.join(' and ')}.</p>}
      {war.status === 'closed' && <p data-testid="publish-closed-note">This War has closed and can no longer be published or unpublished.</p>}
      {publishDetails && (
        <ul role="alert" data-testid="publish-error">
          {publishDetails.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </>
  )
}

function PublishToggleConfirmDialog({
  war,
  show,
  onConfirm,
  onCancel,
}: {
  war: WarDetailResponse
  show: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const isDraft = war.status === 'draft'
  return (
    <Modal show={show} onCancel={onCancel} testId="publish-toggle-confirm">
      <p>
        {isDraft
          ? 'Publishing makes this War reachable by anyone. You can unpublish it again at any time. Continue?'
          : 'Unpublishing makes this War reachable only by you. You can publish it again at any time. Continue?'}
      </p>
      <div className="action-bar">
        <button type="button" className="button" data-testid="publish-toggle-confirm-submit" onClick={onConfirm}>
          {isDraft ? 'Publish War' : 'Unpublish War'}
        </button>
        <button type="button" className="button" data-testid="publish-toggle-confirm-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

function ClearVotesConfirmDialog({ show, onConfirm, onCancel }: { show: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal show={show} onCancel={onCancel} testId="clear-votes-confirm">
      <p>
        Clear Votes deletes every vote cast in this War and resets every contestant&rsquo;s counters to zero. This
        cannot be undone. Continue?
      </p>
      <div className="action-bar">
        <button type="button" className="button button--danger" data-testid="clear-votes-confirm-submit" onClick={onConfirm}>
          Clear Votes
        </button>
        <button type="button" className="button" data-testid="clear-votes-confirm-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}

function RemoveContestantConfirmDialog({
  contestant,
  onConfirm,
  onCancel,
}: {
  contestant: ContestantDetail | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal show={contestant !== null} onCancel={onCancel} testId="edit-war-contestant-remove-confirm">
      <p>
        Removing {contestant?.name} also clears the {contestant?.appearance_count} vote
        {contestant?.appearance_count === 1 ? '' : 's'} cast on their matchups. This cannot be undone. Continue?
      </p>
      <div className="action-bar">
        <button type="button" className="button button--danger" data-testid="edit-war-contestant-remove-confirm-submit" onClick={onConfirm}>
          Remove contestant
        </button>
        <button type="button" className="button" data-testid="edit-war-contestant-remove-confirm-cancel" onClick={onCancel}>
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
  onSelect,
  editWar,
  onRequestRemove,
}: {
  selected: Selection
  state: EditWarLoadedState
  metadataFormRef: RefObject<EditWarMetadataFormHandle | null>
  onSelect: (selection: Selection) => void
  editWar: ReturnType<typeof useEditWar>
  onRequestRemove: (contestant: ContestantDetail) => void
}) {
  const selectedContestant = state.war.contestants.find((c) => c.id === selected)

  return (
    <div className="edit-war-detail">
      {selected === 'metadata' && (
        <EditWarMetadataForm
          ref={metadataFormRef}
          war={state.war}
          error={state.metadataError}
          saving={state.savingMetadata}
          onSave={editWar.saveMetadata}
          onUploadShareImage={editWar.uploadShareImage}
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
          onRemove={() => onRequestRemove(selectedContestant)}
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
