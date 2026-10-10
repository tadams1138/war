// The API calls Gherkin steps name with the {call} parameter type
// (steps/parameters.ts): what the app asks of the API, in the domain's words.
// Add a call here, not a new step.
import type { RecipeResponse } from '../../../src/mocks/scenarios'
import { REMOVED_AT } from './adminFixtures'
import type { Ids } from './pageNames'

export interface CallRef {
  method: 'GET' | 'POST' | 'PUT'
  // Where it goes, under the API, for the War and Voter in scope.
  path: (ids: Ids) => string
  // The body the request must carry.
  body?: Record<string, unknown>
  // What the API answers when it accepts the request (200 with an empty body).
  accepted?: RecipeResponse
  // A call that changes a record: how the API then reports it.
  changes?: { record: 'war' | 'voter'; becomes: Record<string, unknown> }
}

const voterPath = (suffix: string) => ({ voterId }: Ids) => `/voters/${voterId}${suffix}`
const put = (suffix: string, body: Record<string, unknown>, becomes: Record<string, unknown>): CallRef => ({
  method: 'PUT',
  path: voterPath(suffix),
  body,
  changes: { record: 'voter', becomes },
})

export const CALLS: Record<string, CallRef> = {
  'remove that War': {
    method: 'POST',
    path: ({ warId }) => `/wars/${warId}/remove`,
    accepted: { status: 204 },
    changes: { record: 'war', becomes: { removed_at: REMOVED_AT } },
  },
  'suspend that Voter': put('/suspension', { suspended: true }, { suspended: true }),
  'unsuspend that Voter': put('/suspension', { suspended: false }, { suspended: false }),
  // A ban deletes every War the Voter created.
  'ban that Voter': put('/ban', { banned: true }, { banned: true, wars: [], war_count: 0 }),
  'unban that Voter': put('/ban', { banned: false }, { banned: false }),
  'grant that Voter the Moderator role': put('/roles/moderator', { granted: true }, { is_moderator: true }),
  "revoke that Voter's Admin role": put('/roles/admin', { granted: false }, { is_admin: false }),
  "that War's Staff detail": { method: 'GET', path: ({ warId }) => `/admin/wars/${warId}` },
  "that War's reports": { method: 'GET', path: ({ warId }) => `/wars/${warId}/reports` },
  "that Voter's Staff detail": { method: 'GET', path: ({ voterId }) => `/admin/voters/${voterId}` },
  "the current Voter's identity": { method: 'GET', path: () => '/auth/me' },
}
