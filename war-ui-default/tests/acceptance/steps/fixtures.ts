// The playwright-bdd entry point every step file imports. `world` is the
// per-scenario state steps share: Given steps queue API recipes, and the
// first navigation boots the app with them (recipes must be seeded before
// page.goto, see support/mocking.ts useScenario).
import { test as base } from 'playwright-bdd'
import type { NextMatchupResponse, WarSummary } from '../../../src/api/client'
import type { HandlerRecipe, RecipeResponse } from '../../../src/mocks/scenarios'
import './parameters'

export class World {
  readonly recipes: HandlerRecipe[] = []
  booted = false
  // Set by "an authenticated voter". Navigation then stays client-side: a
  // full page load would wipe the in-memory session.
  signedIn = false
  // The id of the War in scope (the latest one given); "that War's ... page"
  // resolves against it. Wars are numbered war-1, war-2, ... in the order given.
  warId = ''
  // The latest matchup given ("that War has a matchup to vote on", then each
  // "a later matchup ..."). Later Givens edit it in place: the queued call
  // holds this same object until the app boots.
  matchupResponse: NextMatchupResponse | undefined
  // The next-matchup call's responses, in call order: the matchups given, then
  // possibly "none left". Shared with the queued recipe, so pushing queues more.
  matchupCalls: RecipeResponse[] = []
  // The Wars "the API lists these Wars:" gave, in the order listed.
  listedWars: WarSummary[] = []
  // The share image preview's source just before it was generated again.
  previousPreview: string | null = null
  // How each request made by "two API requests ..." ended: fulfilled or rejected.
  requestOutcomes: string[] = []
  // Every URL the page requested, in order.
  readonly requestedUrls: string[] = []
  private warCount = 0

  get matchup(): NextMatchupResponse['matchup'] | undefined {
    return this.matchupResponse?.matchup
  }

  nextWarId(): string {
    this.warCount += 1
    this.warId = `war-${this.warCount}`
    return this.warId
  }

  queue(...recipes: HandlerRecipe[]): void {
    if (this.booted) throw new Error('API recipes must be given before the app boots (the first navigation or "an authenticated voter")')
    this.recipes.push(...recipes)
  }
}

export const test = base.extend<{ world: World }>({
  world: async ({ page }, use) => {
    const world = new World()
    page.on('request', (request) => world.requestedUrls.push(request.url()))
    await use(world)
  },
})
