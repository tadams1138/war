// The API calls Gherkin steps name with the {call} parameter type
// (steps/parameters.ts): what the app asks of the API, in the domain's words.
// A call about one contestant ends with its name in quotes ('remove the
// contestant "Ada"'); the name arrives as `subject`. Add a call here, not a
// new step.
import type { WarDetailResponse } from '../../../src/api/client'
import { buildContestant, buildMediaItem } from '../../../src/mocks/fixtures'
import type { RecipeResponse } from '../../../src/mocks/scenarios'
import type { World } from '../steps/fixtures'
import { REMOVED_AT } from './adminFixtures'
import { contestantIdOf, contestantNamed, imageIdOf, warDetail, withContestant } from './editWar'
import type { Ids } from './pageNames'

export interface RequestDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  // Where it goes, under the API, for the War and Voter in scope.
  path: (ids: Ids, subject: string) => string
  // The body the request must carry.
  body?: Record<string, unknown>
}

export interface CallDef extends RequestDef {
  // Requests the call makes besides this one, all answered alike.
  alongside?: RequestDef[]
  // Test id of the error the app shows where the call was made when it fails.
  error?: string
  // What the API answers when it accepts the request (200 with an empty body).
  accepted?: RecipeResponse | ((world: World, subject: string) => RecipeResponse)
  // A call that changes a record: how the API then reports it. The record is
  // a Staff detail ('war', 'voter') or the War as its creator sees it.
  changes?: {
    record: 'war' | 'voter' | 'edited war'
    becomes: Record<string, unknown> | ((current: WarDetailResponse, subject: string) => Record<string, unknown>)
  }
}

export interface CallRef extends CallDef {
  // The contestant a call about one is made for.
  subject: string
}

const voterPath = (suffix: string) => ({ voterId }: Ids) => `/voters/${voterId}${suffix}`
const put = (suffix: string, body: Record<string, unknown>, becomes: Record<string, unknown>): CallDef => ({
  method: 'PUT',
  path: voterPath(suffix),
  body,
  changes: { record: 'voter', becomes },
})

const warPath = (suffix = '') => ({ warId }: Ids) => `/wars/${warId}${suffix}`
const contestantPath = (suffix = '') => ({ warId }: Ids, name: string) => `/wars/${warId}/contestants/${contestantIdOf(warId, name)}${suffix}`
const imagePath = (position: number) => ({ warId }: Ids, name: string) => {
  const contestant = contestantIdOf(warId, name)
  return `/wars/${warId}/contestants/${contestant}/media/${imageIdOf(contestant, position)}`
}

// The War as the API then answers for it.
const answers = (overrides: Partial<WarDetailResponse> = {}, mergeRequest = false) => (world: World): RecipeResponse => ({
  status: 200,
  body: { ...warDetail(world), ...overrides },
  mergeRequest,
})

const IMAGE_ERROR = 'edit-war-image-error'
const orderOf = (position: number) => ({ display_order: position })
// Each of the two images takes the other's place.
const reorderedBy = (media: WarDetailResponse['contestants'][number]['media']) => {
  const [first, second] = [...media].sort((a, b) => a.display_order - b.display_order)
  const places = new Map([[first!.id, second!.display_order], [second!.id, first!.display_order]])
  return media.map((item) => ({ ...item, display_order: places.get(item.id) ?? item.display_order }))
}

export const CALLS: Record<string, CallDef> = {
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
  "that War's results": { method: 'GET', path: warPath('/rankings') },
  "the voter's progress in that War": { method: 'GET', path: warPath('/my-progress') },
  "that Voter's Staff detail": { method: 'GET', path: ({ voterId }) => `/admin/voters/${voterId}` },
  "the current Voter's identity": { method: 'GET', path: () => '/auth/me' },
  // The answer to a save is the record as the request now has it.
  "save that War's details": { method: 'PATCH', path: warPath(), accepted: answers({}, true) },
  'publish that War': { method: 'POST', path: warPath('/publish'), accepted: answers({ status: 'published' }) },
  'unpublish that War': { method: 'POST', path: warPath('/unpublish'), accepted: answers({ status: 'draft' }) },
  'clear the votes of that War': { method: 'POST', path: warPath('/clear-votes'), accepted: answers() },
  'delete that War': { method: 'DELETE', path: warPath(), accepted: { status: 204 } },
  'add a contestant': {
    method: 'POST',
    path: warPath('/contestants'),
    accepted: (world) => ({
      status: 201,
      body: buildContestant({ id: `${world.warId}-new-contestant`, name: '', media: [] }),
      mergeRequest: true,
    }),
  },
  'save the contestant': {
    method: 'PATCH',
    path: contestantPath(),
    accepted: (world, name) => ({ status: 200, body: contestantNamed(warDetail(world), name), mergeRequest: true }),
  },
  'remove the contestant': { method: 'DELETE', path: contestantPath(), accepted: { status: 204 }, error: 'edit-war-contestant-error' },
  'add an image to the contestant': {
    method: 'POST',
    path: contestantPath('/images'),
    error: IMAGE_ERROR,
    accepted: (world, name) => {
      const { id, media } = contestantNamed(warDetail(world), name)
      return { status: 201, body: { id: imageIdOf(id, media.length + 1), ...orderOf(media.length) } }
    },
    changes: {
      record: 'edited war',
      becomes: (war, name) =>
        withContestant(war, name, ({ id, media }) => ({
          media: [...media, buildMediaItem({ id: imageIdOf(id, media.length + 1), display_order: media.length })],
        })),
    },
  },
  'remove the first image of the contestant': {
    method: 'DELETE',
    path: imagePath(1),
    error: IMAGE_ERROR,
    accepted: { status: 204 },
    changes: { record: 'edited war', becomes: (war, name) => withContestant(war, name, ({ media }) => ({ media: media.slice(1) })) },
  },
  'move up the second image of the contestant': {
    method: 'PATCH',
    path: imagePath(2),
    error: IMAGE_ERROR,
    body: orderOf(0),
    alongside: [{ method: 'PATCH', path: imagePath(1), body: orderOf(1) }],
    accepted: { status: 204 },
    changes: { record: 'edited war', becomes: (war, name) => withContestant(war, name, ({ media }) => ({ media: reorderedBy(media) })) },
  },
}
