// Builders for the single-response HandlerRecipe literals that fill most
// acceptance scenarios. Recipes with several responses stay spelled out.
import type { WarSummary } from '../../../src/api/client'
import { buildMatchupResponse, buildWarDetail, buildWarSummary } from '../../../src/mocks/fixtures'
import type { HandlerRecipe, RecipeResponse } from '../../../src/mocks/scenarios'
import type { World } from '../steps/fixtures'
import { API } from './mocking'

export function reply(method: HandlerRecipe['method'], path: string, status: number, body?: unknown): HandlerRecipe {
  return { method, path, responses: [body === undefined ? { status } : { status, body }] }
}

export function ok(method: HandlerRecipe['method'], path: string, body: unknown): HandlerRecipe {
  return reply(method, path, 200, body)
}

// The vote call for the War's current matchup (the default fixture's id).
export function voteRecipe(warId: string, response: RecipeResponse): HandlerRecipe {
  const matchupId = buildMatchupResponse().matchup.id
  return { method: 'POST', path: `${API}/wars/${warId}/matchups/${matchupId}/vote`, responses: [response] }
}

// Every call a War's pages make (its detail, the join, the next matchup)
// answered the same way.
export function failWarCalls(warId: string, response: RecipeResponse): HandlerRecipe[] {
  return [
    { method: 'GET', path: `${API}/wars/${warId}`, responses: [response] },
    { method: 'POST', path: `${API}/wars/${warId}/join`, responses: [response] },
    { method: 'GET', path: `${API}/wars/${warId}/matchups/next`, responses: [response] },
  ]
}

// The API lists these Wars (one page), numbered like every other War given,
// and answers each one's detail so a listed War can be opened.
export function queueListedWars(world: World, wars: Partial<WarSummary>[]): WarSummary[] {
  const listed = wars.map((war) => buildWarSummary({ ...war, id: world.nextWarId() }))
  world.listedWars = listed
  world.queue(
    ok('GET', `${API}/wars`, { wars: listed, next_cursor: null }),
    ...listed.map((war) => ok('GET', `${API}/wars/${war.id}`, buildWarDetail({ ...war, contestants: [] }))),
  )
  return listed
}

// What creating a War answers: the POST (one response per attempt, in order)
// and the draft it creates, empty and untitled. "That War" becomes that draft.
export const CREATED_WAR_ID = 'war-create-1'
export const createdWar = () => buildWarSummary({ id: CREATED_WAR_ID, title: null, status: 'draft' })

export function queueCreation(world: World, postResponses: RecipeResponse[]): void {
  world.warId = CREATED_WAR_ID
  const detail = buildWarDetail({ id: CREATED_WAR_ID, title: null, status: 'draft', contestants: [] })
  world.queue({ method: 'POST', path: `${API}/wars`, responses: postResponses }, ok('GET', `${API}/wars/${CREATED_WAR_ID}`, detail))
}
