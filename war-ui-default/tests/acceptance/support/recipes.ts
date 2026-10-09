// Builders for the single-response HandlerRecipe literals that fill most
// acceptance scenarios. Recipes with several responses stay spelled out.
import type { HandlerRecipe } from '../../../src/mocks/scenarios'

export function reply(method: HandlerRecipe['method'], path: string, status: number, body?: unknown): HandlerRecipe {
  return { method, path, responses: [body === undefined ? { status } : { status, body }] }
}

export function ok(method: HandlerRecipe['method'], path: string, body: unknown): HandlerRecipe {
  return reply(method, path, 200, body)
}
