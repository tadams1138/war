// War overview and results, image mode only (the spec: "War detail is one
// page, not two" — 10.1, 10.4). One merged results list, ordered by rank —
// no separate contestant gallery and no separate "Results" section. No
// authentication required for a public War; an invite-only War's results
// 401, and that 401 is handled entirely by api/client.ts's existing
// unauthorized pipeline, which clears the token and redirects to /login.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getToken } from '../api/authState'
import { getMyProgress, getWar, type ContestantDetail, type WarDetailResponse } from '../api/client'
import { DeleteWarConfirmDialog } from '../components/DeleteWarConfirmDialog'
import { ErrorMessage } from '../components/ErrorMessage'
import { ExportButton } from '../components/ExportButton'
import { ResultsTable } from '../components/ResultsTable'
import { useAsyncResource, type AsyncResourceState } from '../hooks/useAsyncResource'
import { useDeleteWarFlow } from '../hooks/useDeleteWarFlow'
import { useWarExportDownload } from '../export/useWarExportDownload'
import { useRankings, type RankingsState } from '../rankings/useRankings'
import type { Theme } from '../theme/themeCookie'
import { usePublishTheme } from '../theme/ThemeContext'
import { useTheme } from '../theme/useTheme'
import { warTitle } from '../utils/warTitle'

function orEmpty(value: string | undefined): string {
  return value ?? ''
}

function loadWar(id: string | undefined): (() => Promise<WarDetailResponse>) | undefined {
  return id ? () => getWar(id) : undefined
}

function initialTheme(state: AsyncResourceState<WarDetailResponse>): Theme {
  return state.status === 'loaded' ? state.value.theme : 'arcade'
}

export function WarDetail() {
  const { id } = useParams<{ id: string }>()
  const safeId = orEmpty(id)
  const state = useAsyncResource(loadWar(id), [id])
  const rankingsState = useRankings(id)
  const [theme, setTheme] = useTheme(safeId, initialTheme(state))
  usePublishTheme(safeId, theme, setTheme)

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>

  const war = state.value
  return (
    <main data-theme={theme}>
      <h1>{warTitle(war.title)}</h1>
      {war.category && <p>{war.category}</p>}
      <ResultsActions war={war} />
      <ResultsSection state={rankingsState} contestants={war.contestants} />
    </main>
  )
}

// Whether an authenticated voter still has unvoted matchups in this active
// War (spec 10.4: the results page's own Vote entry point) -- skips the
// my-progress request entirely for an anonymous visitor or a War that
// isn't active, rather than firing a request the API would 401 anyway.
function useVoteEligibility(warId: string, status: string): boolean {
  const [eligible, setEligible] = useState(false)

  useEffect(() => {
    setEligible(false)
    if (status !== 'active' || !getToken()) return
    let cancelled = false
    void getMyProgress(warId).then(
      (progress) => {
        if (!cancelled) setEligible(progress.voted < progress.total)
      },
      () => {
        // No vote entry point on a failed check; the results page itself
        // still rendered fine, so this stays silent rather than alerting.
      },
    )
    return () => {
      cancelled = true
    }
  }, [warId, status])

  return eligible
}

function OwnerDraftActions({ warId, onDeleteClick }: { warId: string; onDeleteClick: () => void }) {
  return (
    <>
      <Link to={`/wars/${warId}/edit`} data-testid="war-detail-edit-link">
        Edit
      </Link>
      <button type="button" data-testid="war-detail-delete-button" onClick={onDeleteClick}>
        Delete
      </button>
    </>
  )
}

function ResultsActions({ war }: { war: WarDetailResponse }) {
  const navigate = useNavigate()
  const showVote = useVoteEligibility(war.id, war.status)
  const deleteFlow = useDeleteWarFlow(war.id, () => navigate('/my-wars'))
  const exportFlow = useWarExportDownload(war)
  const showOwnerActions = war.is_owner && war.status === 'draft'

  return (
    <div className="war-detail-actions">
      {showOwnerActions && <OwnerDraftActions warId={war.id} onDeleteClick={deleteFlow.open} />}
      <ExportButton show={war.is_owner} testId="war-detail-export-button" onClick={exportFlow.trigger} />
      {showVote && (
        <Link to={`/wars/${war.id}/vote`} data-testid="war-detail-vote-link">
          Vote
        </Link>
      )}
      <ErrorMessage message={deleteFlow.error} />
      <ErrorMessage message={exportFlow.error} />
      <DeleteWarConfirmDialog
        show={deleteFlow.showConfirm}
        onConfirm={deleteFlow.confirm}
        onCancel={deleteFlow.cancel}
        testIdPrefix="war-detail"
      />
    </div>
  )
}

// Its own load/error state, independent of the War overview above: a
// results fetch failing (or still loading) must never blank out a title and
// category that loaded fine, and vice versa (war-spec.md 10.4's "failed
// poll does not clear already-loaded results" carried down to this
// section's own scope rather than the whole page).
function ResultsSection({ state, contestants }: { state: RankingsState; contestants: ContestantDetail[] }) {
  if (state.status === 'loading') return <p>Loading results…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>
  return <ResultsTable rankings={state.rankings.rankings} contestants={contestants} />
}
