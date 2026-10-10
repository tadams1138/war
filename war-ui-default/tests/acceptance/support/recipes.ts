// Builders for the single-response HandlerRecipe literals that fill most
// acceptance scenarios. Recipes with several responses stay spelled out.
import { buildMatchupResponse } from '../../../src/mocks/fixtures'
import type { HandlerRecipe, RecipeResponse } from '../../../src/mocks/scenarios'
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
