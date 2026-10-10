// Builders and recipes for the Admin Dashboard acceptance steps.
import type { HandlerRecipe, RecipeResponse } from '../../../src/mocks/scenarios'
import { API } from './mocking'

export function me(flags: { is_moderator?: boolean; is_admin?: boolean }, displayName: string | null = 'Test Voter') {
  return {
    method: 'GET' as const,
    path: `${API}/auth/me`,
    responses: [
      {
        status: 200,
        body: { voter: { id: 'voter-1', display_name: displayName, avatar_url: null, is_moderator: false, is_admin: false, ...flags } },
      },
    ],
  }
}

export function killSwitchGet(enabled: boolean) {
  return { method: 'GET' as const, path: `${API}/kill-switch`, responses: [{ status: 200, body: { enabled } }] }
}

export type LogTarget = { voter?: string; voterName?: string; war?: string; warTitle?: string; warDeleted?: boolean }

export function nulls(target: LogTarget) {
  const orNull = (value?: string) => value ?? null
  return {
    target_voter_id: orNull(target.voter),
    target_voter_name: orNull(target.voterName),
    target_war_id: orNull(target.war),
    target_war_title: orNull(target.warTitle),
    target_war_deleted: target.warDeleted === true,
  }
}

export function logEntry(id: string, action: string, createdAt: string, target: LogTarget = {}) {
  return {
    id,
    action,
    staff_voter_id: 'staff-voter-1',
    staff_name: 'Stella Staff',
    ...nulls(target),
    created_at: createdAt,
  }
}

export function logGet(...pages: { entries: ReturnType<typeof logEntry>[]; next_cursor: string | null }[]) {
  return { method: 'GET' as const, path: `${API}/moderation-log`, responses: pages.map((body) => ({ status: 200, body })) }
}

export function adminWar(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `War ${id}`,
    status: 'published',
    visibility: 'public',
    creator_id: 'creator-1',
    creator_name: 'Casey Creator',
    created_at: '2026-10-01T12:00:00Z',
    removed_at: null,
    unaddressed_report_count: 0,
    ...overrides,
  }
}

export function adminWarDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...adminWar(id),
    contestants: [
      { id: 'c-1', name: 'Rocky', win_count: 7, appearance_count: 10 },
      { id: 'c-2', name: 'Apollo', win_count: 3, appearance_count: 10 },
    ],
    report_count: 2,
    ...overrides,
  }
}

export function adminWarDetailGet(id: string, body: unknown, status = 200) {
  return { method: 'GET' as const, path: `${API}/admin/wars/${id}`, responses: [{ status, body }] }
}

export function report(id: string, warId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    war_id: warId,
    reporter_id: 'reporter-1',
    explanation: `Explanation ${id}`,
    addressed: false,
    filed_at: '2026-10-02T12:00:00Z',
    ...overrides,
  }
}

export function reportsGet(warId: string, reports: ReturnType<typeof report>[]) {
  return { method: 'GET' as const, path: `${API}/wars/${warId}/reports`, responses: [{ status: 200, body: { reports } }] }
}

export function reportPatch(reportId: string, status = 200) {
  return {
    method: 'PATCH' as const,
    path: `${API}/reports/${reportId}`,
    responses: [{ status, body: status === 200 ? {} : { error: 'boom' } }],
  }
}

export const REMOVED_AT = '2026-10-04T12:00:00Z'

export function queueGet(wars: { war_id: string; title: string | null; unaddressed_count: number }[]) {
  return { method: 'GET' as const, path: `${API}/reports/unaddressed`, responses: [{ status: 200, body: { wars } }] }
}

export function adminVoter(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    display_name: `Voter ${id}`,
    avatar_url: null,
    is_moderator: false,
    is_admin: false,
    suspended: false,
    banned: false,
    created_at: '2026-09-01T12:00:00Z',
    war_count: 0,
    ...overrides,
  }
}

export function adminVoterDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...adminVoter(id),
    war_count: 2,
    wars: [
      { id: 'w-1', title: 'Alpha War', status: 'published', removed_at: null },
      { id: 'w-2', title: 'Beta War', status: 'published', removed_at: REMOVED_AT },
    ],
    ...overrides,
  }
}

export function adminVoterGet(id: string, body: unknown, status = 200) {
  return { method: 'GET' as const, path: `${API}/admin/voters/${id}`, responses: [{ status, body }] }
}

export function adminVoteItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    war_id: 'w-1',
    war_title: 'Alpha War',
    matchup_id: `m-${id}`,
    winner_contestant_id: 'c-1',
    winner_name: 'Rocky',
    loser_contestant_id: 'c-2',
    loser_name: 'Apollo',
    cast_at: '2026-10-03T12:00:00Z',
    ...overrides,
  }
}

export function adminVoterVotesGet(id: string, ...pages: { votes: ReturnType<typeof adminVoteItem>[]; next_cursor: string | null }[]) {
  return { method: 'GET' as const, path: `${API}/admin/voters/${id}/votes`, responses: pages.map((body) => ({ status: 200, body })) }
}

export const noVotes = (id: string) => adminVoterVotesGet(id, { votes: [], next_cursor: null })

// --- Paged and filtered lists ---------------------------------------------

export const cursorAfter = (pageNumber: number) => `cursor-${pageNumber}`

// The items split into pages of `size`, each carrying the cursor of the next
// (none on the last). An empty list is one empty page.
export function pagesOf<T>(items: T[], size: number): { items: T[]; next_cursor: string | null }[] {
  const count = Math.max(1, Math.ceil(items.length / size))
  return Array.from({ length: count }, (_, index) => ({
    items: items.slice(index * size, (index + 1) * size),
    next_cursor: index + 1 < count ? cursorAfter(index + 1) : null,
  }))
}

// The responses of a paged list (`key` names the array in its body), in call order.
export function pagedResponses<T>(key: string, items: T[], size = items.length): RecipeResponse[] {
  return pagesOf(items, size || 1).map((page) => ({ status: 200, body: { [key]: page.items, next_cursor: page.next_cursor } }))
}

export function pagedListRecipe<T>(path: string, key: string, items: T[], size?: number): HandlerRecipe {
  return { method: 'GET', path: `${API}${path}`, responses: pagedResponses(key, items, size) }
}

export interface ListFilters<T> {
  // One predicate per value of the `status` query parameter.
  statuses: Record<string, (item: T) => boolean>
  // What a search matches against.
  text: (item: T) => string
}

// The same endpoint filtered as the API filters it: one recipe per status, and
// one per word a search could settle on, each answering the items that match.
export function filteredListRecipes<T>(path: string, key: string, items: T[], filters: ListFilters<T>): HandlerRecipe[] {
  const answering = (query: string, matches: (item: T) => boolean): HandlerRecipe => ({
    method: 'GET',
    path: `${API}${path}`,
    query,
    responses: [{ status: 200, body: { [key]: items.filter(matches), next_cursor: null } }],
  })
  const words = new Set(items.flatMap((item) => filters.text(item).toLowerCase().split(/\s+/)))
  return [
    ...Object.entries(filters.statuses).map(([status, matches]) => answering(`status=${status}`, matches)),
    ...[...words].map((word) => answering(`q=${word}`, (item) => filters.text(item).toLowerCase().includes(word))),
  ]
}
