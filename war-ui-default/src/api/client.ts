// Typed API wrapper — war-ui-default-spec.md §5. Pages and components never
// call fetch() directly; every request this slice needs goes through one of
// the functions below. Request/response body types come from
// src/api/generated/schema.d.ts, generated from war-api's live OpenAPI
// document by `npm run generate:api` (§5.1) — nothing here hand-writes a
// shape the API is supposed to define.

import type { components, paths } from './generated/schema'
import { ApiError, messageForReason, type ApiErrorReason } from './errors'
import { clearToken, getToken, isRefreshDisabled, notifyUnauthorized, setToken } from './authState'

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

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
export type ResolvedAttribute = components['schemas']['ResolvedAttribute']
type VoteForbiddenBody =
  paths['/wars/{id}/matchups/{mId}/vote']['post']['responses'][403]['content']['application/json']
// war-api's Fastify routes validate CreateWar-slice request bodies by hand,
// not through a `schema.body` option (war-api-spec.md §11.2.1) — so, unlike
// the response types above, there is nothing in the generated document to
// derive these from. Hand-written to match the documented body shapes
// (§7.2, §7.3) exactly, same fields the wizard collects.
export interface CreateWarPayload {
  title: string
  category?: string | null
  visibility?: 'public' | 'invite_only'
  ends_at?: string | null
}
export interface AddContestantPayload {
  name: string
  bio?: string | null
}
export type UploadedImage =
  paths['/wars/{id}/contestants/{cId}/images']['post']['responses'][201]['content']['application/json']

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

// Refresh is single-flight (§7): concurrent 401s share one in-flight
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

// --- status → typed error mapping (§8, filtered to this slice's endpoints) -----

const SIMPLE_REASONS: Partial<Record<number, ApiErrorReason>> = {
  401: 'unauthorized',
  404: 'not-found',
  409: 'conflict',
  422: 'validation',
  400: 'validation',
}

// A classification policy is a pure decision over a parsed body — kept
// synchronous and decoupled from Response so each classifier narrows its
// own shape at its own boundary instead of repeating HTTP/JSON plumbing.
type Classify403 = (body: unknown) => ApiErrorReason

async function ensureOk(response: Response, classify403: Classify403 = classifyDefault403): Promise<Response> {
  if (response.ok) return response
  const reason = await classifyError(response, classify403)
  const retryAfterSeconds = reason === 'rate-limited' ? parseRetryAfter(response.headers.get('Retry-After')) : undefined
  const details = reason === 'validation' ? await readDetails(response) : undefined
  if (reason === 'unauthorized') notifyUnauthorized()
  throw new ApiError(reason, response.status, messageForReason(reason, retryAfterSeconds), retryAfterSeconds, details)
}

// The `{ error, details }` shape's `details` array (war-api-spec.md
// §11.2.1), when the body actually has one — `POST
// /wars/:id/contestants/:cId/images`'s 422 never does (a plain `{ error }`
// shape, deliberately), so this simply returns undefined there rather than
// branching per endpoint.
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
  if (response.status >= 500) return 'server-error'
  return 'server-error'
}

// The safe fallback for a 403 whose endpoint has no discriminator field —
// join's is the only caller today, and its 403 (`{ error: string }`,
// schema.d.ts) genuinely has only one possible cause (the War isn't
// active), so there is nothing to discriminate; 'war-closed' is simply
// correct, not a guess.
function classifyDefault403(): ApiErrorReason {
  return 'war-closed'
}

// castVote's 403 carries a typed `reason` (schema.d.ts:
// "war_not_active" | "not_joined") — a real discriminator, not a message
// to parse. The Record below makes a regenerated schema with a new enum
// member a compile error here, rather than a silent misclassification.
const VOTE_403_REASONS: Record<VoteForbiddenBody['reason'], ApiErrorReason> = {
  war_not_active: 'war-closed',
  not_joined: 'not-joined',
}

function classifyVote403(body: unknown): ApiErrorReason {
  const reason = (body as Partial<VoteForbiddenBody> | null)?.reason
  return (reason && VOTE_403_REASONS[reason]) || 'war-closed'
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

// --- typed wrapper functions -----------------------------------------------

// `creator: 'me'` is the only param this slice's callers use (MyWars,
// war-ui-default-spec.md §6) — status/category/cursor/limit exist on the
// generated querystring type too (war-api-spec.md §7.2) but nothing here
// calls with them yet, so only `creator` is read out below.
export async function getWars(params: GetWarsParams = {}): Promise<WarListResponse> {
  const query = params.creator ? `?creator=${encodeURIComponent(params.creator)}` : ''
  const response = await ensureOk(await apiFetch(`/wars${query}`))
  return response.json() as Promise<WarListResponse>
}

export async function getWar(warId: string): Promise<WarDetailResponse> {
  const response = await ensureOk(await apiFetch(`/wars/${warId}`))
  return response.json() as Promise<WarDetailResponse>
}

export async function joinWar(warId: string): Promise<void> {
  await ensureOk(await apiFetch(`/wars/${warId}/join`, { method: 'POST' }))
}

export async function getNextMatchup(warId: string): Promise<NextMatchupResponse | null> {
  const response = await ensureOk(await apiFetch(`/wars/${warId}/matchups/next`))
  if (response.status === 204) return null
  return response.json() as Promise<NextMatchupResponse>
}

export async function castVote(warId: string, matchupId: string, winnerId: string): Promise<void> {
  await ensureOk(
    await apiFetch(`/wars/${warId}/matchups/${matchupId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner_id: winnerId }),
    }),
    classifyVote403,
  )
}

export async function getRankings(warId: string): Promise<RankingsResponse> {
  const response = await ensureOk(await apiFetch(`/wars/${warId}/rankings`))
  return response.json() as Promise<RankingsResponse>
}

export async function createWar(payload: CreateWarPayload): Promise<WarSummary> {
  const response = await ensureOk(
    await apiFetch('/wars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
  return response.json() as Promise<WarSummary>
}

export async function addContestant(warId: string, payload: AddContestantPayload): Promise<ContestantDetail> {
  const response = await ensureOk(
    await apiFetch(`/wars/${warId}/contestants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  )
  return response.json() as Promise<ContestantDetail>
}

// One multipart request per file (war-api-spec.md §11.2.1) — sequential,
// not parallel, so each upload's assigned display_order is deterministic
// (the API appends at "the next display_order" per request it handles).
export async function uploadContestantImages(warId: string, contestantId: string, files: File[]): Promise<UploadedImage[]> {
  const results: UploadedImage[] = []
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)
    const response = await ensureOk(
      await apiFetch(`/wars/${warId}/contestants/${contestantId}/images`, { method: 'POST', body: formData }),
    )
    results.push((await response.json()) as UploadedImage)
  }
  return results
}

export async function activateWar(warId: string): Promise<WarSummary> {
  const response = await ensureOk(await apiFetch(`/wars/${warId}/activate`, { method: 'POST' }))
  return response.json() as Promise<WarSummary>
}

export async function getMe(): Promise<VoterMe> {
  const response = await ensureOk(await apiFetch('/auth/me'))
  return response.json() as Promise<VoterMe>
}

export async function logout(): Promise<void> {
  await ensureOk(await apiFetch('/auth/session', { method: 'DELETE' }))
  clearToken()
}

export function providerLoginUrl(provider: string): string {
  return `${API_BASE_URL}/auth/${provider}/login`
}
