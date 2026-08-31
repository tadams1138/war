// Generic, data-driven MSW handler builder. Playwright can't hand a live
// closure across the Node↔browser boundary, so a test instead serializes a
// small JSON recipe via `page.addInitScript`, and main.tsx turns it into
// real msw RequestHandlers inside the running app (only when
// VITE_API_MOCKING is enabled — see src/mocks/testHooks.ts).
import { HttpResponse, delay, http, type RequestHandler } from 'msw'

export interface RecipeResponse {
  status: number
  body?: unknown
  headers?: Record<string, string>
  networkError?: boolean
  delayMs?: number
}

export interface HandlerRecipe {
  method: 'GET' | 'POST' | 'DELETE'
  // Full request path, e.g. '/api/v1/wars/war-1/matchups/next'. Matched
  // literally — recipes always target one concrete War/matchup fixture, so
  // there is no need for msw's :param matching here.
  path: string
  // Consumed in call order; the last entry repeats once exhausted, so a
  // scenario only needs to list the responses that differ from each other.
  responses: RecipeResponse[]
}

const METHOD_FNS = { GET: http.get, POST: http.post, DELETE: http.delete } as const

export function buildScenarioHandlers(recipes: HandlerRecipe[]): RequestHandler[] {
  return recipes.map(buildHandler)
}

function buildHandler(recipe: HandlerRecipe): RequestHandler {
  let callIndex = 0
  const methodFn = METHOD_FNS[recipe.method]
  return methodFn(recipe.path, async () => {
    const response = recipe.responses[Math.min(callIndex, recipe.responses.length - 1)]
    callIndex += 1
    return respond(response)
  })
}

async function respond(response: RecipeResponse): Promise<Response> {
  if (response.delayMs) await delay(response.delayMs)
  if (response.networkError) return HttpResponse.error()
  if (response.status === 204 || response.body === undefined) {
    return new HttpResponse(null, { status: response.status, headers: response.headers })
  }
  return HttpResponse.json(response.body, { status: response.status, headers: response.headers })
}
