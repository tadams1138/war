// A War's results (GET /wars/:id/rankings), derived from the contestants the
// War was given: they are listed in the order given, ranked 1, 2, ... unless
// the row says otherwise, and carry the images the contestant has. The
// recipe's answers are the load and then each poll after it, in order.
import type { RankingsResponse, WarDetailResponse } from '../../../src/api/client'
import { buildRankingEntry, buildRankingsResponse } from '../../../src/mocks/fixtures'
import type { RecipeResponse } from '../../../src/mocks/scenarios'
import type { World } from '../steps/fixtures'
import { contestantNamed, warDetail } from './editWar'
import { API } from './mocking'
import { recipeFor } from './staffRecords'

// One row per contestant: its "name", and optionally its "rank" (blank: unranked),
// "wins" and "appearances".
function rankingFrom(war: WarDetailResponse, row: Record<string, string>, index: number): RankingsResponse['rankings'][number] {
  const { id, name, media } = contestantNamed(war, row.name!)
  const rank = 'rank' in row ? row.rank : String(index + 1)
  return buildRankingEntry({ rank: rank ? Number(rank) : null, contestant: { id, name, media }, wins: Number(row.wins || 0), appearances: Number(row.appearances || 0) })
}

export function resultsAnswer(war: WarDetailResponse, rows: Record<string, string>[]): RecipeResponse {
  const body = buildRankingsResponse({ war_id: war.id, status: war.status as RankingsResponse['status'], theme: war.theme, rankings: rows.map((row, index) => rankingFrom(war, row, index)) })
  return { status: 200, body }
}

// The War's results are these contestants, as of the load.
export function queueResults(world: World, rows: Record<string, string>[]): void {
  const war = warDetail(world)
  const path = `${API}/wars/${war.id}/rankings`
  const queued = world.recipes.find((recipe) => recipe.path === path)
  if (queued) queued.responses = [resultsAnswer(war, rows)]
  else world.queue({ method: 'GET', path, responses: [resultsAnswer(war, rows)] })
}

// What the next poll of the results answers, after those already queued.
export function queuePoll(world: World, answer: (war: WarDetailResponse) => RecipeResponse): void {
  recipeFor(world, `/wars/${world.warId}/rankings`).responses.push(answer(warDetail(world)))
}
