// War overview and results, image mode only (the spec: "War detail is one
// page, not two" — 10.1, 10.4). One merged results list, ordered by rank —
// no separate contestant gallery and no separate "Results" section. No
// authentication required for a public War; an invite-only War's results
// 401, and that 401 is handled entirely by api/client.ts's existing
// unauthorized pipeline, which clears the token and redirects to /login.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getToken } from '../api/authState'
import { getMyProgress, getWar, type ContestantDetail, type VoteProgress, type WarDetailResponse } from '../api/client'
import { DeleteButton } from '../components/DeleteButton'
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
  // Called unconditionally, ahead of the loading/error returns below (rules
  // of hooks) -- '' as a status before the War has loaded never matches
  // 'published', so the hook itself no-ops until there's a real War to ask
  // my-progress about.
  const progress = useVoteProgress(safeId, state.status === 'loaded' ? state.value.status : '')

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>

  const war = state.value
  return (
    <main data-theme={theme}>
      <CompletionNotice progress={progress} />
      <h1>{warTitle(war.title)}</h1>
      {war.category && <p>{war.category}</p>}
      <VoteCallout war={war} progress={progress} />
      <ResultsActions war={war} />
      <ResultsSection state={rankingsState} contestants={war.contestants} />
    </main>
  )
}

// A big, centered call to action at the top of the page, not one action
// among several in the action row below -- this is the one thing the page
// most wants a visitor to do. Shown to an anonymous visitor too (tapping it
// sends them to sign in and back, RequireAuth's existing behavior on the
// vote route), so results pages get the same "come vote" pull Home's own
// cards already have. An anonymous visitor always sees it for a published
// War -- there's no progress to check without a token. An authenticated
// voter sees it only while they still have unvoted matchups.
function VoteCallout({ war, progress }: { war: WarDetailResponse; progress: VoteProgress | 'anonymous' | null }) {
  const voted = asVoteProgress(progress)
  const showVote = war.status === 'published' && (progress === 'anonymous' || (voted !== null && voted.voted < voted.total))
  if (!showVote) return null
  return (
    <div className="vote-callout">
      <Link to={`/wars/${war.id}/vote`} className="button button--large" data-testid="war-detail-vote-link">
        Vote
      </Link>
    </div>
  )
}

// Narrows away the 'anonymous' sentinel -- shared by CompletionNotice and
// VoteCallout, and keeps each of their own boolean expressions to two
// operators instead of three (CLAUDE.md's cyclomatic-complexity rule).
function asVoteProgress(progress: VoteProgress | 'anonymous' | null): VoteProgress | null {
  return progress !== null && progress !== 'anonymous' ? progress : null
}

// Replaces the Vote entry point once an authenticated voter has cast every
// vote (war-spec.md §10.4) -- also what a voter who just cast their final
// vote on the vote page sees, since finishing there redirects here
// (VoteMode's useRedirectWhenCompleted) rather than showing its own screen.
function CompletionNotice({ progress }: { progress: VoteProgress | 'anonymous' | null }) {
  const voted = asVoteProgress(progress)
  const completed = voted !== null && voted.total > 0 && voted.voted === voted.total
  if (!completed) return null
  return <p data-testid="vote-completion-notice">You&rsquo;ve voted on every matchup — thank you!</p>
}

// The results page's own copy of the voter's progress in this War --
// 'anonymous' for a visitor with no token (VoteCallout still shows for
// them, CompletionNotice never does), null while not applicable (the War
// isn't published) or not yet loaded. Skips the my-progress request
// entirely for a War that isn't published, rather than firing a request
// the API would 401 anyway.
function useVoteProgress(warId: string, status: string): VoteProgress | 'anonymous' | null {
  const [progress, setProgress] = useState<VoteProgress | 'anonymous' | null>(null)

  useEffect(() => {
    if (status !== 'published') {
      setProgress(null)
      return
    }
    if (!getToken()) {
      setProgress('anonymous')
      return
    }
    setProgress(null)
    let cancelled = false
    void getMyProgress(warId).then(
      (next) => {
        if (!cancelled) setProgress(next)
      },
      () => {
        // Neither the Vote link nor the completion notice show on a failed
        // check; the results page itself still rendered fine, so this
        // stays silent rather than alerting.
      },
    )
    return () => {
      cancelled = true
    }
  }, [warId, status])

  return progress
}

// Edit and Delete are never status-gated (spec §6.1) -- shown to the
// creator regardless of the War's current status.
function OwnerActions({ warId, onDeleteClick }: { warId: string; onDeleteClick: () => void }) {
  return (
    <>
      <Link to={`/wars/${warId}/edit`} className="button" data-testid="war-detail-edit-link">
        Edit
      </Link>
      <DeleteButton testId="war-detail-delete-button" onClick={onDeleteClick} />
    </>
  )
}

function ResultsActions({ war }: { war: WarDetailResponse }) {
  const navigate = useNavigate()
  const deleteFlow = useDeleteWarFlow(war.id, () => navigate('/my-wars'))
  const exportFlow = useWarExportDownload(war)
  return (
    <>
      <div className="action-bar">
        {war.is_owner && <OwnerActions warId={war.id} onDeleteClick={deleteFlow.open} />}
        <ExportButton show={war.is_owner} testId="war-detail-export-button" onClick={exportFlow.trigger} />
      </div>
      <ErrorMessage message={deleteFlow.error} />
      <ErrorMessage message={exportFlow.error} />
      <DeleteWarConfirmDialog
        show={deleteFlow.showConfirm}
        onConfirm={deleteFlow.confirm}
        onCancel={deleteFlow.cancel}
        testIdPrefix="war-detail"
      />
    </>
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
