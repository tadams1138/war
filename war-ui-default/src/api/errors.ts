// Typed errors thrown by api/client.ts and the user-facing copy they map to,
// filtered to the endpoints this slice calls (wars list, war detail,
// next-matchup, cast-vote, join, auth).

export type ApiErrorReason =
  | 'unauthorized' // 401
  | 'war-closed' // 403 — War is closed to voting
  | 'not-joined' // 403 — voter has not joined the War
  | 'forbidden' // 403 — the caller isn't the War's creator
  | 'not-found' // 404
  | 'conflict' // 409 — already voted; handled silently by the caller
  | 'rate-limited' // 429
  | 'validation' // 422 (and a malformed request body)
  | 'server-error' // 5xx
  | 'network' // fetch could not reach the server at all

export class ApiError extends Error {
  readonly reason: ApiErrorReason
  readonly status: number
  readonly retryAfterSeconds?: number
  // The `{ error, details }` shape's `details` array, when the failing
  // response carried one. Populated only for a 'validation' reason whose
  // body actually has it — most callers ignore this and use `message`
  // instead (the generic 422 copy); Edit War's Publish action
  // (src/editWar/useEditWar.ts) is the one deliberate exception that
  // surfaces it verbatim.
  readonly details?: string[]

  constructor(reason: ApiErrorReason, status: number, message: string, retryAfterSeconds?: number, details?: string[]) {
    super(message)
    this.name = 'ApiError'
    this.reason = reason
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
    this.details = details
  }
}

// Pure mapping from a typed reason to the exact user-facing copy in the spec's
// table. `conflict` has no message — MatchupView advances silently instead.
// A lookup table, not a switch: every branch here is a fixed string, so a
// `Record` keeps this at zero cyclomatic complexity instead of one branch per
// reason, and a missing key is a compile error rather than a silent
// `undefined` return.
const REASON_MESSAGES: Record<ApiErrorReason, (retryAfterSeconds?: number) => string> = {
  unauthorized: () => 'Please log in to continue',
  'war-closed': () => 'This War is locked — voting is closed',
  'not-joined': () => 'Join this War to vote',
  forbidden: () => "This isn't your War",
  'not-found': () => "This War doesn't exist or has been removed",
  conflict: () => '',
  'rate-limited': (retryAfterSeconds) => `Slow down a moment — try again in ${retryAfterSeconds ?? 0}s`,
  validation: () => 'Something went wrong — please try again',
  'server-error': () => 'Server error — please try again shortly',
  network: () => 'Unable to reach the server — check your connection',
}

export function messageForReason(reason: ApiErrorReason, retryAfterSeconds?: number): string {
  return REASON_MESSAGES[reason](retryAfterSeconds)
}

// Pages call this instead of repeating `error instanceof ApiError ?
// error.message : messageForReason('network')` themselves — pure
// deduplication, no behavior change (Home.tsx, WarDetail.tsx,
// VoteMode.tsx all had the identical expression).
export function toUserMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : messageForReason('network')
}
