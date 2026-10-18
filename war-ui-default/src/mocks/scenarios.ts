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
  // Answers with the JSON body the request carried (a PUT that returns what
  // it was asked to set), instead of `body`.
  echoRequest?: boolean
  // Answers with `body` updated by the JSON body the request carried (a PATCH
  // that returns the record as it now reads).
  mergeRequest?: boolean
}

export interface HandlerRecipe {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  // Full request path, e.g. '/api/v1/wars/war-1/matchups/next'. Matched
  // literally — recipes always target one concrete War/matchup fixture, so
  // there is no need for msw's :param matching here.
  path: string
  // Optional `name=value&name=value`: the recipe answers only requests that
  // carry every pair (whatever else they carry); any other request falls
  // through to the next matching recipe or the baseline handlers.
  query?: string
  // Consumed in call order; the last entry repeats once exhausted, so a
  // scenario only needs to list the responses that differ from each other.
  responses: RecipeResponse[]
}

const METHOD_FNS = { GET: http.get, POST: http.post, PUT: http.put, PATCH: http.patch, DELETE: http.delete } as const

// A recipe with a query is the more specific one, so it is tried before any
// without, whatever order they were given in.
export function buildScenarioHandlers(recipes: HandlerRecipe[]): RequestHandler[] {
  const specificFirst = [...recipes].sort((a, b) => Number(Boolean(b.query)) - Number(Boolean(a.query)))
  return specificFirst.map(buildHandler)
}

function matchesQuery(request: Request, query: string | undefined): boolean {
  const { searchParams } = new URL(request.url)
  return (query?.split('&') ?? []).every((pair) => {
    const [name, value] = pair.split('=')
    return searchParams.get(name!) === value
  })
}

function buildHandler(recipe: HandlerRecipe): RequestHandler {
  let callIndex = 0
  const methodFn = METHOD_FNS[recipe.method]
  return methodFn(recipe.path, async ({ request }) => {
    if (!matchesQuery(request, recipe.query)) return undefined
    const response = recipe.responses[Math.min(callIndex, recipe.responses.length - 1)]
    callIndex += 1
    return respond(response, request)
  })
}

async function bodyOf(response: RecipeResponse, request: Request): Promise<unknown> {
  if (response.echoRequest) return request.json()
  if (response.mergeRequest) return { ...(response.body as object), ...(await request.json()) }
  return response.body
}

async function respond(response: RecipeResponse, request: Request): Promise<Response> {
  if (response.delayMs) await delay(response.delayMs)
  if (response.networkError) return HttpResponse.error()
  const body = await bodyOf(response, request)
  if (response.status === 204 || body === undefined) {
    return new HttpResponse(null, { status: response.status, headers: response.headers })
  }
  return HttpResponse.json(body, { status: response.status, headers: response.headers })
}
