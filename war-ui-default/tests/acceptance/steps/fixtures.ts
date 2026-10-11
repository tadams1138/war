// The playwright-bdd entry point every step file imports. `world` is the
// per-scenario state steps share: Given steps queue API recipes, and the
// first navigation boots the app with them (recipes must be seeded before
// page.goto, see support/mocking.ts useScenario).
import type { Download } from '@playwright/test'
import { test as base } from 'playwright-bdd'
import type { NextMatchupResponse, WarSummary } from '../../../src/api/client'
import type { HandlerRecipe, RecipeResponse } from '../../../src/mocks/scenarios'
import './parameters'

export class World {
  readonly recipes: HandlerRecipe[] = []
  // What the API answers when no Given has said otherwise (a feature's
  // `Before` hook gives them); the recipes above are tried first.
  readonly fallbacks: HandlerRecipe[] = []
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
  // The id of the Voter in scope (the latest one given); "that Voter's ... page"
  // resolves against it. Voters are numbered voter-2, voter-3, ... in the order
  // given: voter-1 is the signed-in voter (the baseline GET /auth/me).
  voterId = ''
  // The wait the API asked for ("rate limits a request ... for 1 second").
  retryAfterSeconds = 0
  // Every file the page offered to download, in order.
  readonly downloads: Download[] = []
  private warCount = 0
  private voterCount = 1

  get matchup(): NextMatchupResponse['matchup'] | undefined {
    return this.matchupResponse?.matchup
  }

  nextWarId(): string {
    this.warCount += 1
    this.warId = `war-${this.warCount}`
    return this.warId
  }

  nextVoterId(): string {
    this.voterCount += 1
    this.voterId = `voter-${this.voterCount}`
    return this.voterId
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
    page.on('download', (download) => world.downloads.push(download))
    await use(world)
  },
})
