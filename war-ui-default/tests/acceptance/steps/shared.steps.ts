// Steps whose text and behaviour are identical in every converted feature.
// Feature-specific steps live in <feature>.steps.ts, scoped by feature tag
// (see create-war.steps.ts); anything here must stay unscoped and generic.
import { expect, type Page } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { test, type World } from './fixtures'
import { buildMatchupResponse, buildWarDetail, buildWarSummary } from '../../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from '../support/mocking'
import { ok, reply } from '../support/recipes'
import type { PageRef } from '../support/pageNames'

const { Given, When, Then } = createBdd(test)

type WarTheme = NonNullable<Parameters<typeof buildWarDetail>[0]>['theme']
type WarStatus = NonNullable<Parameters<typeof buildWarSummary>[0]>['status']

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

Given('a(nother) War themed {string}', async ({ world }, theme: string) => {
  // Arrange
  const id = world.nextWarId()
  world.queue(ok('GET', `${API}/wars/${id}`, buildWarDetail({ id, theme: theme as WarTheme })))
})

Given('that War has a matchup to vote on', async ({ world }) => {
  // Arrange
  world.queue(
    reply('POST', `${API}/wars/${world.warId}/join`, 204),
    ok('GET', `${API}/wars/${world.warId}/matchups/next`, buildMatchupResponse()),
  )
})

// One row per War: title, status and optionally "share image" (a URL). Queues
// the list and each War's detail, so a listed War can be opened.
Given('the API lists these Wars:', async ({ world }, table: DataTable) => {
  // Arrange
  const wars = table.hashes().map((row) =>
    buildWarSummary({
      id: world.nextWarId(),
      title: row.title,
      status: row.status as WarStatus,
      share_image_url: row['share image'] || null,
    }),
  )
  world.queue(
    ok('GET', `${API}/wars`, { wars, next_cursor: null }),
    ...wars.map((war) => ok('GET', `${API}/wars/${war.id}`, buildWarDetail({ ...war, contestants: [] }))),
  )
})

Given('the API accepts a share image upload', async ({ world }) => {
  // Arrange
  world.queue(ok('POST', `${API}/wars/${world.warId}/share-image`, buildWarSummary({ id: world.warId, status: 'draft' })))
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

When('they reload the page', async ({ page }) => {
  // Act
  await page.reload()
})

Then('the matchup is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('matchup-view')).toBeVisible()
})

Then('the share image is uploaded to that War', async ({ page, world }) => {
  // Assert
  await waitForCallLog(page, (log) => log.some((entry) => entry.method === 'POST' && entry.url.endsWith(`/wars/${world.warId}/share-image`)))
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
