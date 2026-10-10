// Steps whose text and behaviour are identical in every converted feature.
// Feature-specific steps live in <feature>.steps.ts, scoped by feature tag
// (see create-war.steps.ts); anything here must stay unscoped and generic.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test, type World } from './fixtures'
import { loginAsTestVoter, navigateAuthenticated, useScenario } from '../support/mocking'
import type { PageRef } from '../support/pageNames'

const { Given, When, Then } = createBdd(test)

async function boot(page: Page, world: World): Promise<void> {
  if (world.booted) return
  world.booted = true
  await useScenario(page, world.recipes)
}

// Signed in, navigation must stay client-side: a full page load wipes the
// in-memory session.
async function open(page: Page, world: World, target: PageRef): Promise<void> {
  const path = target.path(world.warId)
  if (world.signedIn) return navigateAuthenticated(page, path)
  await boot(page, world)
  await page.goto(path)
}

Given('an authenticated voter', async ({ page, world }) => {
  // Arrange
  await boot(page, world)
  await page.goto('/')
  await loginAsTestVoter(page)
  world.signedIn = true
})

Given('they are on {page}', async ({ page, world }, target: PageRef) => {
  // Arrange
  await open(page, world, target)
})

When('they open {page}', async ({ page, world }, target: PageRef) => {
  // Act
  await open(page, world, target)
})

When('a visitor opens {page}', async ({ page, world }, target: PageRef) => {
  // Act
  await open(page, world, target)
})

Then('they are redirected to {page}', async ({ page, world }, target: PageRef) => {
  // Assert
  await expect.poll(() => new URL(page.url()).pathname).toBe(target.path(world.warId))
  if (target.landmark) await expect(page.getByTestId(target.landmark)).toBeVisible()
})

Then('they are redirected to the login page with returnTo {page}', async ({ page, world }, target: PageRef) => {
  // Assert
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login')
  await expect.poll(() => new URL(page.url()).searchParams.get('returnTo')).toBe(target.path(world.warId))
})
