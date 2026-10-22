// The Wars and Voters as the Admin Dashboard shows them, queued for the Admin Dashboard
// scenarios. A record given is numbered like every other War or Voter (war-1,
// ...; voter-2, ...; "that War" and "that Voter" are the latest), and later
// Givens edit what was queued in place, so give them before the app boots.
import type { HandlerRecipe } from '../../../src/mocks/scenarios'
import type { World } from '../steps/fixtures'
import { buildWarDetail } from '../../../src/mocks/fixtures'
import { adminWar, REMOVED_AT } from './adminFixtures'
import { API } from './mocking'
import { ok } from './recipes'

type WarStatus = NonNullable<Parameters<typeof buildWarDetail>[0]>['status']

export type AdminWarRecord = ReturnType<typeof adminWar>

export function recipeFor(world: World, path: string): HandlerRecipe {
  const recipe = world.recipes.find((candidate) => candidate.path === `${API}${path}` && !candidate.query)
  if (!recipe) throw new Error(`Give the record first: nothing is queued for ${path}`)
  return recipe
}

// The API's detail of the Voter in scope (for the Admin Dashboard), or (an "edited war")
// the War as its viewer sees it.
export function detailRecipe(world: World, record: 'voter' | 'edited war'): HandlerRecipe {
  const paths = { voter: `/admin/voters/${world.voterId}`, 'edited war': `/wars/${world.warId}` }
  return recipeFor(world, paths[record])
}

const CREATOR = 'Casey Creator'

// A War's columns in a table row, each with its default. A blank title is an
// untitled War.
export function warFrom(row: Record<string, string>) {
  const columns: Record<string, string> = { status: 'published', creator: CREATOR, 'unaddressed reports': '0', ...row }
  return {
    title: columns.title || null,
    status: columns.status,
    creator_name: columns.creator,
    unaddressed_report_count: Number(columns['unaddressed reports']),
    removed_at: columns.removed ? REMOVED_AT : null,
  }
}

// Queues the War's detail, as a Moderator sees it on the War's page (with the default
// contestant; a Moderator manages nothing); listing it is up to the caller.
export function addAdminWar(world: World, row: Record<string, string>): AdminWarRecord {
  const id = world.nextWarId()
  const overrides = warFrom(row)
  const { title, status, removed_at } = overrides
  world.queue(ok('GET', `${API}/wars/${id}`, buildWarDetail({ id, title, status: status as WarStatus, removed_at, can_manage: false })))
  return adminWar(id, overrides)
}
