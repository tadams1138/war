// The playwright-bdd entry point every step file imports. `world` is the
// per-scenario state steps share: Given steps queue API recipes, and the
// first navigation boots the app with them (recipes must be seeded before
// page.goto, see support/mocking.ts useScenario).
import { test as base } from 'playwright-bdd'
import type { HandlerRecipe } from '../../../src/mocks/scenarios'
import './parameters'

export class World {
  readonly recipes: HandlerRecipe[] = []
  booted = false
  // Set by "an authenticated voter". Navigation then stays client-side: a
  // full page load would wipe the in-memory session.
  signedIn = false
  // The id of the War in scope; "that War's ... page" resolves against it.
  warId = ''

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
