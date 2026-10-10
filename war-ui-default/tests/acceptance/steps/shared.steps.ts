// Steps whose text and behaviour are identical in every converted feature.
// Feature-specific steps live in <feature>.steps.ts, scoped by feature tag
// (see create-war.steps.ts); anything here must stay unscoped and generic.
import { expect, type Page } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { test, type World } from './fixtures'
import { buildMatchupResponse, buildMediaItem, buildWarDetail, buildWarSummary } from '../../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from '../support/mocking'
import { ok, reply, voteRecipe } from '../support/recipes'
import type { PageRef } from '../support/pageNames'
import type { Side } from '../support/screens'

const { Given, When, Then } = createBdd(test)

type WarTheme = NonNullable<Parameters<typeof buildWarDetail>[0]>['theme']
type WarStatus = NonNullable<Parameters<typeof buildWarSummary>[0]>['status']

async function boot(page: Page, world: World): Promise<void> {
  if (world.booted) return
  world.booted = true
  await useScenario(page, world.recipes)
}

function queueWar(world: World, overrides: Parameters<typeof buildWarDetail>[0]): void {
  const id = world.nextWarId()
  world.queue(ok('GET', `${API}/wars/${id}`, buildWarDetail({ id, ...overrides })))
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

Given('a(nother) War', async ({ world }) => {
  // Arrange
  queueWar(world, {})
})

Given('a(nother) War themed {string}', async ({ world }, theme: string) => {
  // Arrange
  queueWar(world, { theme: theme as WarTheme })
})

Given('that War has a matchup to vote on', async ({ world }) => {
  // Arrange
  const response = buildMatchupResponse()
  world.matchup = response.matchup
  world.queue(reply('POST', `${API}/wars/${world.warId}/join`, 204), ok('GET', `${API}/wars/${world.warId}/matchups/next`, response))
})

function contestant(world: World, side: Side) {
  if (!world.matchup) throw new Error('Give "that War has a matchup to vote on" first')
  return world.matchup[side]
}

Given("the {side} contestant's bio is {string}", async ({ world }, side: Side, bio: string) => {
  // Arrange
  contestant(world, side).bio = bio
})

Given("the {side} contestant's bio is very long", async ({ world }, side: Side) => {
  // Arrange
  contestant(world, side).bio = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} of a very long bio.`).join('\n\n')
})

Given('the {side} contestant has {int} image(s)', async ({ world }, side: Side, count: number) => {
  // Arrange
  contestant(world, side).media = Array.from({ length: count }, (_, i) => buildMediaItem({ id: `${side}-media-${i}`, display_order: i }))
})

Given('the API accepts votes', async ({ world }) => {
  // Arrange
  world.queue(voteRecipe(world.warId, { status: 201, body: { vote_id: 'vote-1' } }))
})

Given('a {screen} screen', async ({ page }, size: { width: number; height: number }) => {
  // Arrange
  await page.setViewportSize(size)
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

Given('the API lists no Wars', async ({ world }) => {
  // Arrange
  world.queue(ok('GET', `${API}/wars`, { wars: [], next_cursor: null }))
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

Then('no vote is submitted', async ({ page }) => {
  // Assert
  const votes = (await getCallLog(page)).filter((entry) => entry.method === 'POST' && entry.url.includes('/vote'))
  expect(votes).toHaveLength(0)
})

Then('the share image is uploaded to that War', async ({ page, world }) => {
  // Assert
  await waitForCallLog(page, (log) => log.some((entry) => entry.method === 'POST' && entry.url.endsWith(`/wars/${world.warId}/share-image`)))
})

async function expectOn(page: Page, world: World, target: PageRef): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe(target.path(world.warId))
  if (target.landmark) await expect(page.getByTestId(target.landmark)).toBeVisible()
}

Then('{page} is shown', async ({ page, world }, target: PageRef) => {
  // Assert
  await expectOn(page, world, target)
})

Then('they are redirected to {page}', async ({ page, world }, target: PageRef) => {
  // Assert
  await expectOn(page, world, target)
})

Then('they are redirected to the login page with returnTo {page}', async ({ page, world }, target: PageRef) => {
  // Assert
  await expect.poll(() => new URL(page.url()).pathname).toBe('/login')
  await expect.poll(() => new URL(page.url()).searchParams.get('returnTo')).toBe(target.path(world.warId))
})
