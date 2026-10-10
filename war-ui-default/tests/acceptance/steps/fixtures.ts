// The playwright-bdd entry point every step file imports. `world` is the
// per-scenario state steps share: Given steps queue API recipes, and the
// first navigation boots the app with them (recipes must be seeded before
// page.goto, see support/mocking.ts useScenario).
import { test as base } from 'playwright-bdd'
import type { NextMatchupResponse } from '../../../src/api/client'
import type { HandlerRecipe } from '../../../src/mocks/scenarios'
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
  // The matchup "that War has a matchup to vote on" queued. Later Givens edit
  // it in place: the queued call holds this same object until the app boots.
  matchup: NextMatchupResponse['matchup'] | undefined
  // How each request made by "two API requests ..." ended: fulfilled or rejected.
  requestOutcomes: string[] = []
  private warCount = 0

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
  // eslint-disable-next-line no-empty-pattern
  world: async ({}, use) => {
    await use(new World())
  },
})
