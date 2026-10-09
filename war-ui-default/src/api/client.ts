// Typed API wrapper. Pages and components never call fetch() directly; every
// request goes through one of the functions below. Request/response types
// come from src/api/generated/schema.d.ts (generated from war-api's OpenAPI
// document by `npm run generate:api`) wherever the API documents them.

import type { components, paths } from './generated/schema'
import { ApiError, messageForReason, type ApiErrorReason } from './errors'
import { clearToken, getToken, isRefreshDisabled, notifyUnauthorized, setToken } from './authState'

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

// --- types ------------------------------------------------------------------

export type WarListResponse = paths['/wars']['get']['responses'][200]['content']['application/json']
export type GetWarsParams = NonNullable<paths['/wars']['get']['parameters']['query']>
export type WarDetailResponse = paths['/wars/{id}']['get']['responses'][200]['content']['application/json']
export type NextMatchupResponse =
  paths['/wars/{id}/matchups/next']['get']['responses'][200]['content']['application/json']
export type RankingsResponse = paths['/wars/{id}/rankings']['get']['responses'][200]['content']['application/json']
export type VoterMe = paths['/auth/me']['get']['responses'][200]['content']['application/json']
export type WarSummary = components['schemas']['WarSummary']
export type ContestantDetail = components['schemas']['ContestantDetail']
export type MediaItem = components['schemas']['MediaItem']
export type UploadedImage =
  paths['/wars/{id}/contestants/{cId}/images']['post']['responses'][201]['content']['application/json']
export type PatchWarPayload = paths['/wars/{id}']['patch']['requestBody']['content']['application/json']
export type PatchContestantPayload =
  paths['/wars/{id}/contestants/{cId}']['patch']['requestBody']['content']['application/json']
type VoteForbiddenBody =
  paths['/wars/{id}/matchups/{mId}/vote']['post']['responses'][403]['content']['application/json']

// war-api validates these request bodies by hand (no `schema.body`), so the
// generated document has nothing to derive them from.
export interface CreateWarPayload {
  title?: string
  category?: string | null
  visibility?: 'public' | 'unlisted'
  theme?: 'arcade' | 'fight_card' | 'scrapbook'
  ends_at?: string | null
}
export interface AddContestantPayload {
  name: string
  bio?: string | null
}
// GET /wars/:id/my-progress has no documented response schema either.
export interface VoteProgress {
  voted: number
  total: number
}

export type KillSwitchState = paths['/kill-switch']['get']['responses'][200]['content']['application/json']
export type ModerationLogPage = paths['/moderation-log']['get']['responses'][200]['content']['application/json']
export type ModerationLogEntry = ModerationLogPage['entries'][number]
export type GetModerationLogParams = NonNullable<paths['/moderation-log']['get']['parameters']['query']>
export type AdminWarsPage = paths['/admin/wars']['get']['responses'][200]['content']['application/json']
export type AdminWarItem = AdminWarsPage['wars'][number]
export type GetAdminWarsParams = NonNullable<paths['/admin/wars']['get']['parameters']['query']>
export type AdminWarDetail = paths['/admin/wars/{id}']['get']['responses'][200]['content']['application/json']
export type WarReport =
  paths['/wars/{id}/reports']['get']['responses'][200]['content']['application/json']['reports'][number]
export type UnaddressedReportsWar =
  paths['/reports/unaddressed']['get']['responses'][200]['content']['application/json']['wars'][number]
export type AdminVotersPage = paths['/admin/voters']['get']['responses'][200]['content']['application/json']
export type AdminVoterItem = AdminVotersPage['voters'][number]
export type GetAdminVotersParams = NonNullable<paths['/admin/voters']['get']['parameters']['query']>
export type AdminVoterDetail = paths['/admin/voters/{id}']['get']['responses'][200]['content']['application/json']
export type AdminVoterVotesPage = paths['/admin/voters/{id}/votes']['get']['responses'][200]['content']['application/json']
export type AdminVoterVote = AdminVoterVotesPage['votes'][number]
export type GetAdminVoterVotesParams = NonNullable<paths['/admin/voters/{id}/votes']['get']['parameters']['query']>
export type VoterRole = paths['/voters/{id}/roles/{role}']['put']['parameters']['path']['role']

// --- low-level request pipeline -------------------------------------------------

async function sendRequest(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('network', 0, messageForReason('network'))
  }
}

async function apiFetch(path: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
  const response = await sendRequest(path, init)
  if (response.status === 401 && !isRetry) {
    return handleUnauthorizedAndRetry(path, init)
  }
  return response
}

async function handleUnauthorizedAndRetry(path: string, init: RequestInit): Promise<Response> {
  if (isRefreshDisabled()) {
    throw new ApiError('unauthorized', 401, messageForReason('unauthorized'))
  }
  try {
    await refreshSession()
  } catch {
    throw new ApiError('unauthorized', 401, messageForReason('unauthorized'))
  }
  return apiFetch(path, init, true)
}

// Refresh is single-flight: concurrent 401s share one in-flight
// request rather than each firing their own POST /auth/refresh.
let refreshPromise: Promise<string> | null = null

export async function refreshSession(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

async function performRefresh(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
  if (!response.ok) {
    notifyUnauthorized()
    throw new ApiError('unauthorized', response.status, messageForReason('unauthorized'))
  }
  const body = (await response.json()) as { token: string }
  setToken(body.token)
  return body.token
}

// --- status → typed error mapping ---------------------------------------------

const SIMPLE_REASONS: Partial<Record<number, ApiErrorReason>> = {
  400: 'validation',
  401: 'unauthorized',
  404: 'not-found',
  409: 'conflict',
  422: 'validation',
}

// A classification policy is a pure decision over a parsed 403 body, kept
// synchronous and decoupled from Response.
type Classify403 = (body: unknown) => ApiErrorReason

// For endpoints whose 403 has exactly one possible cause.
function constantClassifier(reason: ApiErrorReason): Classify403 {
  return () => reason
}

// Join's 403 (`{ error: string }`) only means the War isn't published.
const classifyDefault403 = constantClassifier('war-closed')
// Edit routes are never status-gated: a 403 means the caller isn't the creator.
const classifyEditForbidden = constantClassifier('forbidden')
// Every Staff-only endpoint's 403 means the caller isn't Staff.
const classifyStaffForbidden = constantClassifier('staff-only')

// castVote's 403 carries a typed `reason` discriminator. The Record makes a
// regenerated schema with a new enum member a compile error here, rather
// than a silent misclassification.
const VOTE_403_REASONS: Record<VoteForbiddenBody['reason'], ApiErrorReason> = {
  war_not_published: 'war-closed',
  not_joined: 'not-joined',
}

function classifyVote403(body: unknown): ApiErrorReason {
  const reason = (body as Partial<VoteForbiddenBody> | null)?.reason
  return (reason && VOTE_403_REASONS[reason]) || 'war-closed'
}

async function ensureOk(response: Response, classify403: Classify403 = classifyDefault403): Promise<Response> {
  if (response.ok) return response
  const reason = await classifyError(response, classify403)
  const retryAfterSeconds = retryAfterFor(reason, response)
  const details = reason === 'validation' ? await readDetails(response) : undefined
  if (reason === 'unauthorized') notifyUnauthorized()
  throw new ApiError(reason, response.status, messageForReason(reason, retryAfterSeconds), retryAfterSeconds, details)
}

function retryAfterFor(reason: ApiErrorReason, response: Response): number | undefined {
  return reason === 'rate-limited' ? parseRetryAfter(response.headers.get('Retry-After')) : undefined
}

// The `{ error, details }` shape's `details` array, when the body has one.
// Image upload's 422 is a plain `{ error }`, so this returns undefined there.
async function readDetails(response: Response): Promise<string[] | undefined> {
  const body = await safeReadJson<{ details?: unknown }>(response)
  const details = body?.details
  return Array.isArray(details) && details.every((entry) => typeof entry === 'string') ? details : undefined
}

async function classifyError(response: Response, classify403: Classify403): Promise<ApiErrorReason> {
  const simple = SIMPLE_REASONS[response.status]
  if (simple) return simple
  if (response.status === 429) return 'rate-limited'
  if (response.status === 403) return classify403(await safeReadJson<unknown>(response))
  return 'server-error'
}

async function safeReadJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.clone().json()) as T
  } catch {
    return null
  }
}

function parseRetryAfter(headerValue: string | null): number {
  const parsed = Number(headerValue)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

// --- request helpers ------------------------------------------------------------

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

function formInit(file: File | Blob): RequestInit {
  const formData = new FormData()
  formData.append('file', file)
  return { method: 'POST', body: formData }
}

// Serializes every defined param (rather than picking some by name), so a
// param that type-checks always reaches the request.
function queryString(params: object): string {
  const search = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  ).toString()
  return search ? `?${search}` : ''
}

async function request(path: string, init: RequestInit = {}, classify403?: Classify403): Promise<Response> {
  return ensureOk(await apiFetch(path, init), classify403)
}

async function json<T>(path: string, init: RequestInit = {}, classify403?: Classify403): Promise<T> {
  const response = await request(path, init, classify403)
  return (await response.json()) as T
}

// --- War voting -----------------------------------------------------------------

export function getWars(params: GetWarsParams = {}): Promise<WarListResponse> {
  return json(`/wars${queryString(params)}`)
}

export function getWar(warId: string): Promise<WarDetailResponse> {
  return json(`/wars/${warId}`)
}

export async function joinWar(warId: string): Promise<void> {
  await request(`/wars/${warId}/join`, { method: 'POST' })
}

export async function getNextMatchup(warId: string): Promise<NextMatchupResponse | null> {
  const response = await request(`/wars/${warId}/matchups/next`)
  if (response.status === 204) return null
  return (await response.json()) as NextMatchupResponse
}

export async function castVote(warId: string, matchupId: string, winnerId: string): Promise<void> {
  await request(`/wars/${warId}/matchups/${matchupId}/vote`, jsonInit('POST', { winner_id: winnerId }), classifyVote403)
}

export function getRankings(warId: string): Promise<RankingsResponse> {
  return json(`/wars/${warId}/rankings`)
}

export function getMyProgress(warId: string): Promise<VoteProgress> {
  return json(`/wars/${warId}/my-progress`)
}

// --- War editing ----------------------------------------------------------------

export function createWar(payload: CreateWarPayload): Promise<WarSummary> {
  return json('/wars', jsonInit('POST', payload))
}

export function addContestant(warId: string, payload: AddContestantPayload): Promise<ContestantDetail> {
  return json(`/wars/${warId}/contestants`, jsonInit('POST', payload))
}

// One multipart request per file, sequential rather than parallel, so each
// upload's assigned display_order is deterministic (the API appends at the
// next display_order per request).
export async function uploadContestantImages(warId: string, contestantId: string, files: File[]): Promise<UploadedImage[]> {
  const results: UploadedImage[] = []
  for (const file of files) {
    results.push(await json<UploadedImage>(`/wars/${warId}/contestants/${contestantId}/images`, formInit(file)))
  }
  return results
}

export function uploadShareImage(warId: string, file: File | Blob): Promise<WarSummary> {
  return json(`/wars/${warId}/share-image`, formInit(file))
}

export function patchWar(warId: string, payload: PatchWarPayload): Promise<WarSummary> {
  return json(`/wars/${warId}`, jsonInit('PATCH', payload), classifyEditForbidden)
}

export function patchContestant(warId: string, contestantId: string, payload: PatchContestantPayload): Promise<ContestantDetail> {
  return json(`/wars/${warId}/contestants/${contestantId}`, jsonInit('PATCH', payload), classifyEditForbidden)
}

export async function deleteContestant(warId: string, contestantId: string): Promise<void> {
  await request(`/wars/${warId}/contestants/${contestantId}`, { method: 'DELETE' }, classifyEditForbidden)
}

export async function reorderContestantMedia(
  warId: string,
  contestantId: string,
  mediaId: string,
  displayOrder: number,
): Promise<void> {
  await request(
    `/wars/${warId}/contestants/${contestantId}/media/${mediaId}`,
    jsonInit('PATCH', { display_order: displayOrder }),
    classifyEditForbidden,
  )
}

export async function deleteContestantMedia(warId: string, contestantId: string, mediaId: string): Promise<void> {
  await request(`/wars/${warId}/contestants/${contestantId}/media/${mediaId}`, { method: 'DELETE' }, classifyEditForbidden)
}

export function publishWar(warId: string): Promise<WarSummary> {
  return json(`/wars/${warId}/publish`, { method: 'POST' })
}

export function unpublishWar(warId: string): Promise<WarSummary> {
  return json(`/wars/${warId}/unpublish`, { method: 'POST' })
}

export function clearVotes(warId: string): Promise<WarSummary> {
  return json(`/wars/${warId}/clear-votes`, { method: 'POST' })
}

export async function deleteWar(warId: string): Promise<void> {
  await request(`/wars/${warId}`, { method: 'DELETE' }, classifyEditForbidden)
}

// --- Auth -----------------------------------------------------------------------

export function getMe(): Promise<VoterMe> {
  return json('/auth/me')
}

// Logout always succeeds from the voter's point of view: the DELETE is
// best-effort, and its outcome never stops the in-memory token from being
// cleared or reaches the caller as a rejection.
export async function logout(): Promise<void> {
  try {
    await request('/auth/session', { method: 'DELETE' })
  } catch {
    // Deliberately discarded -- see the function comment above.
  } finally {
    clearToken()
  }
}

export function providerLoginUrl(provider: string): string {
  return `${API_BASE_URL}/auth/${provider}/login`
}

// --- Staff-only endpoints (the Admin Dashboard, war-spec.md §6.7) --------------

export function getKillSwitch(): Promise<KillSwitchState> {
  return json('/kill-switch', {}, classifyStaffForbidden)
}

export function setKillSwitch(enabled: boolean): Promise<KillSwitchState> {
  return json('/kill-switch', jsonInit('PUT', { enabled }), classifyStaffForbidden)
}

export function getModerationLog(params: GetModerationLogParams = {}): Promise<ModerationLogPage> {
  return json(`/moderation-log${queryString(params)}`, {}, classifyStaffForbidden)
}

export function getAdminWars(params: GetAdminWarsParams = {}): Promise<AdminWarsPage> {
  return json(`/admin/wars${queryString(params)}`, {}, classifyStaffForbidden)
}

export function getAdminWar(warId: string): Promise<AdminWarDetail> {
  return json(`/admin/wars/${warId}`, {}, classifyStaffForbidden)
}

export async function getWarReports(warId: string): Promise<WarReport[]> {
  return (await json<{ reports: WarReport[] }>(`/wars/${warId}/reports`, {}, classifyStaffForbidden)).reports
}

export async function removeWar(warId: string): Promise<void> {
  await request(`/wars/${warId}/remove`, { method: 'POST' }, classifyStaffForbidden)
}

export async function getUnaddressedReports(): Promise<UnaddressedReportsWar[]> {
  return (await json<{ wars: UnaddressedReportsWar[] }>('/reports/unaddressed', {}, classifyStaffForbidden)).wars
}

export function getAdminVoters(params: GetAdminVotersParams = {}): Promise<AdminVotersPage> {
  return json(`/admin/voters${queryString(params)}`, {}, classifyStaffForbidden)
}

// The shared not-found copy names a War; other entities need their own.
const VOTER_NOT_FOUND_MESSAGE = "This Voter doesn't exist"
const REPORT_NOT_FOUND_MESSAGE = "This report doesn't exist"

// Staff endpoints addressing one entity: a 404 means that entity is missing.
async function requestEntity(path: string, init: RequestInit, notFoundMessage: string): Promise<Response> {
  const response = await apiFetch(path, init)
  if (response.status === 404) throw new ApiError('not-found', 404, notFoundMessage)
  return ensureOk(response, classifyStaffForbidden)
}

async function voterJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await (await requestEntity(path, init, VOTER_NOT_FOUND_MESSAGE)).json()) as T
}

export async function setReportAddressed(reportId: string, addressed: boolean): Promise<void> {
  await requestEntity(`/reports/${reportId}`, jsonInit('PATCH', { addressed }), REPORT_NOT_FOUND_MESSAGE)
}

export function getAdminVoter(voterId: string): Promise<AdminVoterDetail> {
  return voterJson(`/admin/voters/${voterId}`)
}

export function getAdminVoterVotes(voterId: string, params: GetAdminVoterVotesParams = {}): Promise<AdminVoterVotesPage> {
  return voterJson(`/admin/voters/${voterId}/votes${queryString(params)}`)
}

async function putVoterJson(path: string, body: object): Promise<void> {
  await requestEntity(path, jsonInit('PUT', body), VOTER_NOT_FOUND_MESSAGE)
}

export async function setVoterSuspension(voterId: string, suspended: boolean): Promise<void> {
  await putVoterJson(`/voters/${voterId}/suspension`, { suspended })
}

export async function setVoterBan(voterId: string, banned: boolean): Promise<void> {
  await putVoterJson(`/voters/${voterId}/ban`, { banned })
}

export async function setVoterRole(voterId: string, role: VoterRole, granted: boolean): Promise<void> {
  await putVoterJson(`/voters/${voterId}/roles/${role}`, { granted })
}
