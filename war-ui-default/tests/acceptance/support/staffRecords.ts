// The Wars and Voters as Staff see them, queued for the Admin Dashboard
// scenarios. A record given is numbered like every other War or Voter (war-1,
// ...; voter-2, ...; "that War" and "that Voter" are the latest), and later
// Givens edit what was queued in place, so give them before the app boots.
import type { HandlerRecipe } from '../../../src/mocks/scenarios'
import type { World } from '../steps/fixtures'
import { adminWar, adminWarDetail, adminWarDetailGet, REMOVED_AT, reportsGet } from './adminFixtures'
import { API } from './mocking'

export type StaffWar = ReturnType<typeof adminWar>

export function recipeFor(world: World, path: string): HandlerRecipe {
  const recipe = world.recipes.find((candidate) => candidate.path === `${API}${path}` && !candidate.query)
  if (!recipe) throw new Error(`Give the record first: nothing is queued for ${path}`)
  return recipe
}

// The API's Staff detail of the War or Voter in scope.
export function detailRecipe(world: World, record: 'war' | 'voter'): HandlerRecipe {
  return recipeFor(world, record === 'war' ? `/admin/wars/${world.warId}` : `/admin/voters/${world.voterId}`)
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

// Queues the War's Staff detail (with the default contestants) and its reports
// (none yet); listing it is up to the caller.
export function addStaffWar(world: World, row: Record<string, string>): StaffWar {
  const id = world.nextWarId()
  const overrides = warFrom(row)
  world.queue(adminWarDetailGet(id, adminWarDetail(id, overrides)), reportsGet(id, []))
  return adminWar(id, overrides)
}
