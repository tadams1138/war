// The playwright-bdd entry point every step file imports. `world` is the
// per-scenario state steps share: Given steps queue API recipes, and the
// "an authenticated voter" step boots the app with them (recipes must be
// seeded before page.goto, see support/mocking.ts useScenario).
import { test as base } from 'playwright-bdd'
import type { HandlerRecipe } from '../../../src/mocks/scenarios'

export class World {
  readonly recipes: HandlerRecipe[] = []
  booted = false
  // The id of the War the mocked API creates; "redirected to that War's Edit
  // page" asserts against it.
  warId = ''

  queue(...recipes: HandlerRecipe[]): void {
    if (this.booted) throw new Error('API recipes must be given before "an authenticated voter" boots the app')
    this.recipes.push(...recipes)
  }
}

export const test = base.extend<{ world: World }>({
  // eslint-disable-next-line no-empty-pattern
  world: async ({}, use) => {
    await use(new World())
  },
})
