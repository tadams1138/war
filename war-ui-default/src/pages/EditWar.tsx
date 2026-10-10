// A War's own editing page (war-spec.md §6.1: always editable by its
// creator, in any status): metadata, each contestant's name/bio/images,
// Publish/Unpublish, Clear Votes, and Delete. GET /wars/:id 404s for "not
// the creator" and "not found" alike, so this page cannot tell them apart.
//
// Two-pane layout: a nav list (Metadata, each contestant, Add contestant)
// selects the one section the right pane shows -- stacking every
// contestant's editor was unnavigable past a couple of contestants.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ContestantDetail, PatchContestantPayload, WarDetailResponse, WarSummary } from '../api/client'
import { AsyncStatus } from '../components/AsyncStatus'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DeleteButton } from '../components/DeleteButton'
import { DeleteWarConfirmDialog } from '../components/DeleteWarConfirmDialog'
import { ErrorMessage } from '../components/ErrorMessage'
import { ExportButton } from '../components/ExportButton'
import { Toast } from '../components/Toast'
import { AddContestantForm } from '../editWar/AddContestantForm'
import { EditWarContestant } from '../editWar/EditWarContestant'
import { EditWarMetadataForm } from '../editWar/EditWarMetadataForm'
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

const MIN_CONTESTANTS_TO_PUBLISH = 2

function lacksContestantsToPublish(contestants: ContestantDetail[]): boolean {
  return contestants.length < MIN_CONTESTANTS_TO_PUBLISH
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
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)
  const [showClearVotesConfirm, setShowClearVotesConfirm] = useState(false)
  const [pendingRemoval, setPendingRemoval] = useState<ContestantDetail | null>(null)

  if (editWar.state.status !== 'loaded') return <AsyncStatus state={editWar.state} />

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
    if (await editWar.removeContestant(contestantId)) setSelected('metadata')
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
      <ErrorMessage message={exportFlow.error} />
      <ErrorMessage message={deleteFlow.error} />
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
  const disabled = publishing || (isDraft && lacksContestantsToPublish(war.contestants))
  return (
    <button type="button" className="button" data-testid="publish-toggle-submit" disabled={disabled} onClick={onClick}>
      {isDraft ? 'Publish War' : 'Unpublish War'}
    </button>
  )
}

function PublishStatus({ war, publishDetails }: { war: WarDetailResponse; publishDetails: string[] | null }) {
  const needsContestants = war.status === 'draft' && lacksContestantsToPublish(war.contestants)
  return (
    <>
      {needsContestants && (
        <p data-testid="publish-requirements">To publish this War, add at least {MIN_CONTESTANTS_TO_PUBLISH} contestants.</p>
      )}
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
    <ConfirmDialog
      show={show}
      testId="publish-toggle-confirm"
      confirmLabel={isDraft ? 'Publish War' : 'Unpublish War'}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>
        {isDraft
          ? 'Publishing makes this War reachable by anyone. You can unpublish it again at any time. Continue?'
          : 'Unpublishing makes this War reachable only by you. You can publish it again at any time. Continue?'}
      </p>
    </ConfirmDialog>
  )
}

function ClearVotesConfirmDialog({ show, onConfirm, onCancel }: { show: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog show={show} testId="clear-votes-confirm" confirmLabel="Clear Votes" danger onConfirm={onConfirm} onCancel={onCancel}>
      <p>
        Clear Votes deletes every vote cast in this War and resets every contestant&rsquo;s counters to zero. This
        cannot be undone. Continue?
      </p>
    </ConfirmDialog>
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
    <ConfirmDialog
      show={contestant !== null}
      testId="edit-war-contestant-remove-confirm"
      confirmLabel="Remove contestant"
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>
        Removing {contestant?.name} also clears the {contestant?.appearance_count} vote
        {contestant?.appearance_count === 1 ? '' : 's'} cast on their matchups. This cannot be undone. Continue?
      </p>
    </ConfirmDialog>
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

function EditWarDetailPane({
  selected,
  state,
  onSelect,
  editWar,
  onRequestRemove,
}: {
  selected: Selection
  state: EditWarLoadedState
  onSelect: (selection: Selection) => void
  editWar: ReturnType<typeof useEditWar>
  onRequestRemove: (contestant: ContestantDetail) => void
}) {
  return (
    <div className="edit-war-detail">
      {/* Hidden, not unmounted, while another pane is selected: the form's unsaved edits live in its own state. */}
      <div hidden={selected !== 'metadata'}>
        <EditWarMetadataForm
          war={state.war}
          error={state.metadataError}
          saving={state.savingMetadata}
          onSave={editWar.saveMetadata}
          onUploadShareImage={editWar.uploadShareImage}
        />
      </div>
      {selected === 'add' && (
        <AddContestantForm
          error={state.addContestantError}
          onAdd={editWar.addContestant}
          onAdded={(contestant) => onSelect(contestant.id)}
        />
      )}
      <SelectedContestantEditor selected={selected} state={state} editWar={editWar} onRequestRemove={onRequestRemove} />
    </div>
  )
}

function SelectedContestantEditor({
  selected,
  state,
  editWar,
  onRequestRemove,
}: {
  selected: Selection
  state: EditWarLoadedState
  editWar: ReturnType<typeof useEditWar>
  onRequestRemove: (contestant: ContestantDetail) => void
}) {
  const contestant = state.war.contestants.find((c) => c.id === selected)
  if (!contestant) return null
  return (
    <ul>
      <EditWarContestant
        key={contestant.id}
        contestant={contestant}
        error={state.contestantErrors[contestant.id] ?? null}
        imageNotice={state.imageErrors[contestant.id] ?? null}
        onSave={(payload: PatchContestantPayload) => editWar.saveContestant(contestant.id, payload)}
        onRemove={() => onRequestRemove(contestant)}
        onAddImages={(files) => void editWar.addImages(contestant.id, files)}
        onRemoveImage={(mediaId) => void editWar.removeImage(contestant.id, mediaId)}
        onMoveImageUp={(mediaId) => void editWar.moveImageUp(contestant.id, mediaId)}
      />
    </ul>
  )
}
