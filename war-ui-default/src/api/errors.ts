// Typed errors thrown by api/client.ts and the user-facing copy they map to.
// Per the spec, filtered to the endpoints this slice calls
// (wars list, war detail, next-matchup, cast-vote, join, auth).

export type ApiErrorReason =
  | 'unauthorized' // 401
  | 'war-closed' // 403 — War is closed to voting
  | 'not-joined' // 403 — voter has not joined the War
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
  // The `{ error, details }` shape's `details` array (the spec), when the
  // failing response carried one. Populated only for a
  // 'validation' reason whose body actually has it — most callers ignore
  // this and use `message` instead (the spec's generic 422 copy); the CreateWar
  // wizard's Activate step is the one deliberate exception that surfaces it
  // verbatim (the spec).
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
export function messageForReason(reason: ApiErrorReason, retryAfterSeconds?: number): string {
  switch (reason) {
    case 'unauthorized':
      return 'Please log in to continue'
    case 'war-closed':
      return 'This War is locked — voting is closed'
    case 'not-joined':
      return 'Join this War to vote'
    case 'not-found':
      return "This War doesn't exist or has been removed"
    case 'conflict':
      return ''
    case 'rate-limited':
      return `Slow down a moment — try again in ${retryAfterSeconds ?? 0}s`
    case 'validation':
      return 'Something went wrong — please try again'
    case 'server-error':
      return 'Server error — please try again shortly'
    case 'network':
      return 'Unable to reach the server — check your connection'
  }
}

// Pages call this instead of repeating `error instanceof ApiError ?
// error.message : messageForReason('network')` themselves — pure
// deduplication, no behavior change (Home.tsx, WarDetail.tsx,
// VoteMode.tsx all had the identical expression).
export function toUserMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : messageForReason('network')
}
