// Steps whose text and behaviour are identical in every converted feature.
// Feature-specific steps live in <feature>.steps.ts, scoped by feature tag
// (see create-war.steps.ts); anything here must stay unscoped and generic.
import { expect, type Locator, type Page } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { test, type World } from './fixtures'
import type { WarSummary } from '../../../src/api/client'
import { buildMatchupResponse, buildMediaItem, buildWarDetail, buildWarSummary } from '../../../src/mocks/fixtures'
import { me } from '../support/adminFixtures'
import { contestantFrom, warDetail } from '../support/editWar'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario, votesSubmitted, waitForCallLog } from '../support/mocking'
import { contestantCard, dots, expectSignedOut, matchupCard, nav, nextArrow, sortMenu } from '../support/pages'
import { createdWar, failWarCalls, ok, queueCreation, queueListedWars, reply, voteRecipe } from '../support/recipes'
import type { CallRef } from '../support/calls'
import type { PageRef } from '../support/pageNames'
import type { RoleFlags } from '../support/roles'
import type { Side } from '../support/screens'

const { Given, When, Then } = createBdd(test)

type WarTheme = NonNullable<Parameters<typeof buildWarDetail>[0]>['theme']
type WarStatus = NonNullable<Parameters<typeof buildWarDetail>[0]>['status']

async function boot(page: Page, world: World): Promise<void> {
  if (world.booted) return
  world.booted = true
  await useScenario(page, world.recipes)
}

function summaryFromRow(row: Record<string, string>): Partial<WarSummary> {
  const summary: Partial<WarSummary> = { title: row.title, status: row.status as WarSummary['status'], share_image_url: row['share image'] || null }
  if (row.category) summary.category = row.category
  if (row.contestants) summary.contestant_count = Number(row.contestants)
  return summary
}

function queueWar(world: World, overrides: Parameters<typeof buildWarDetail>[0]): void {
  const id = world.nextWarId()
  world.queue(ok('GET', `${API}/wars/${id}`, buildWarDetail({ id, ...overrides })))
}

// Signed in, navigation must stay client-side: a full page load wipes the
// in-memory session.
async function open(page: Page, world: World, target: PageRef): Promise<void> {
  const path = target.path(world)
  if (world.signedIn) return navigateAuthenticated(page, path)
  await boot(page, world)
  await page.goto(path)
}

// A plain voter is what the baseline GET /auth/me already answers; the others
// have their flags queued.
Given('an authenticated {role}', async ({ page, world }, role: RoleFlags) => {
  // Arrange
  if (role.is_moderator || role.is_admin) world.queue(me(role))
  await boot(page, world)
  await page.goto('/')
  await loginAsTestVoter(page)
  world.signedIn = true
})

Given('a(nother) War', async ({ world }) => {
  // Arrange
  queueWar(world, {})
})

Given('a(nother) {status} War', async ({ world }, status: WarStatus) => {
  // Arrange
  queueWar(world, { status })
})

// One row per contestant: name and optionally "bio", "images" (a count, one by
// default) and "votes" (those cast on its matchups, none by default). They
// replace the War's default contestant.
Given('that War has contestants:', async ({ world }, table: DataTable) => {
  // Arrange
  const war = warDetail(world)
  war.contestants = table.hashes().map((row) => contestantFrom(war.id, row))
  war.contestant_count = war.contestants.length
})

Given('a(nother) War themed {string}', async ({ world }, theme: string) => {
  // Arrange
  queueWar(world, { theme: theme as WarTheme })
})

Given('that War has a matchup to vote on', async ({ world }) => {
  // Arrange
  const response = buildMatchupResponse()
  world.matchupResponse = response
  world.matchupCalls = [{ status: 200, body: response }]
  world.queue(
    reply('POST', `${API}/wars/${world.warId}/join`, 204),
    { method: 'GET', path: `${API}/wars/${world.warId}/matchups/next`, responses: world.matchupCalls },
  )
})

function contestant(world: World, side: Side) {
  if (!world.matchup) throw new Error('Give "that War has a matchup to vote on" first')
  return world.matchup[side]
}

Given('the {side} contestant is named {string}', async ({ world }, side: Side, name: string) => {
  // Arrange
  contestant(world, side).name = name
})

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

// The expired session surfaces as a 401 on the first request the voter makes,
// here every call about the next War.
Given("the voter's session has expired and cannot be refreshed", async ({ world }) => {
  // Arrange
  world.queue(...failWarCalls(world.nextWarId(), { status: 401, body: { error: 'unauthorized' } }), reply('POST', `${API}/auth/refresh`, 401, { error: 'invalid' }))
})

Given('the API accepts votes', async ({ world }) => {
  // Arrange
  world.queue(voteRecipe(world.warId, { status: 201, body: { vote_id: 'vote-1' } }))
})

Given('a {screen} screen', async ({ page }, size: { width: number; height: number }) => {
  // Arrange
  await page.setViewportSize(size)
})

// One row per War: title, status and optionally "category", "contestants" (a
// count) and "share image" (a URL).
Given('the API lists these Wars:', async ({ world }, table: DataTable) => {
  // Arrange
  queueListedWars(world, table.hashes().map(summaryFromRow))
})

Given('the API creates an empty draft War', async ({ world }) => {
  // Arrange
  queueCreation(world, [{ status: 201, body: createdWar() }])
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

When('they vote for {string}', async ({ page }, name: string) => {
  // Act
  await contestantCard(page, name).click()
})

// A real mouse click, not a keyboard press: pointerdown/pointerup on the arrow
// button bubble to the carousel's own tap-to-vote gesture handlers before the
// button's click handler ever runs, a materially different path from the keyboard.
When("they click the next-image arrow on the {side} contestant's card", async ({ page }, side: Side) => {
  // Act
  await nextArrow(page, side).click()
})

When('they choose {string} from the sort menu', async ({ page }, label: string) => {
  // Act
  await sortMenu(page).selectOption({ label })
})

When('they select the {string} button', async ({ page }, name: string) => {
  // Act
  await page.getByRole('button', { name, exact: true }).click()
})

// The confirmation dialog every dangerous action asks first.
const confirmation = (page: Page) => page.getByRole('alertdialog')

When('they confirm', async ({ page }) => {
  // Act
  await confirmation(page).locator('[data-testid$="-submit"]').click()
})

When('they cancel', async ({ page }) => {
  // Act
  await confirmation(page).getByRole('button', { name: 'Cancel' }).click()
})

When('they reload the page', async ({ page }) => {
  // Act
  await page.reload()
})

Then('a confirmation is shown', async ({ page }) => {
  // Assert
  await expect(confirmation(page)).toBeVisible()
})

Then('the confirmation says {string}', async ({ page }, text: string) => {
  // Assert
  await expect(confirmation(page)).toContainText(text)
})

Then('no confirmation is shown', async ({ page }) => {
  // Assert
  await expect(confirmation(page)).toHaveCount(0)
})

const BUTTON_STATES: Record<string, (button: Locator) => Promise<void>> = {
  shown: (button) => expect(button).toBeVisible(),
  hidden: (button) => expect(button).toHaveCount(0),
  enabled: async (button) => {
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
  },
  disabled: async (button) => {
    await expect(button).toBeVisible()
    await expect(button).toBeDisabled()
  },
}

Then(/^the "([^"]*)" button is (shown|hidden|enabled|disabled)$/, async ({ page }, name: string, state: string) => {
  // Assert
  await BUTTON_STATES[state]!(page.getByRole('button', { name, exact: true }))
})

Then('the message {string} is shown', async ({ page }, message: string) => {
  // Assert
  await expect(page.getByText(message, { exact: true })).toBeVisible()
})

Then('the message {string} is not shown', async ({ page }, message: string) => {
  // Assert
  await expect(page.getByText(message, { exact: true })).toHaveCount(0)
})

// Every error the app shows is an alert (a wait is a status, never an alert),
// and it shows where the failed thing was done.
const errorShown = (page: Page, testId: string | undefined) => {
  if (!testId) throw new Error('No error is registered for this (support/pageNames.ts, support/calls.ts)')
  return page.getByRole('alert').and(page.getByTestId(testId))
}

Then('an error is shown on {page}', async ({ page }, target: PageRef) => {
  // Assert
  await expect(errorShown(page, target.error)).toBeVisible()
})

Then('an error is shown for the request to {call}', async ({ page }, call: CallRef) => {
  // Assert
  await expect(errorShown(page, call.error)).toBeVisible()
})

Then('a wait is shown, using the supplied delay, not an error', async ({ page, world }) => {
  // Assert
  const wait = page.getByRole('status').filter({ hasText: 'Slow down a moment' })
  await expect(wait).toHaveText(`Slow down a moment — try again in ${world.retryAfterSeconds}s`)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

Then('the matchup is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('matchup-view')).toBeVisible()
})

Then('the page renders in the {string} theme', async ({ page }, theme: string) => {
  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', theme)
})

Then('no vote is submitted', async ({ page }) => {
  // Assert
  expect(await votesSubmitted(page)).toHaveLength(0)
})

Then("the {side} contestant's card shows image {int}", async ({ page }, side: Side, image: number) => {
  // Assert
  await expect(dots(page, side).nth(image - 1)).toHaveAttribute('data-active', 'true')
  await expect(matchupCard(page, side).locator('.carousel-frame[data-active="true"]').getByTestId('carousel-image')).toBeVisible()
})

// Both cards of the pair, never just one.
async function bothCardsHave(page: Page, attribute: string, value: string): Promise<void> {
  const cards = page.getByTestId('contestant-card')
  await expect(cards).toHaveCount(2)
  for (const card of await cards.all()) await expect(card).toHaveAttribute(attribute, value, { timeout: 3000 })
}

Then('voting is disabled', async ({ page }) => {
  // Assert
  await bothCardsHave(page, 'aria-busy', 'true')
  await bothCardsHave(page, 'aria-disabled', 'true')
})

Then('voting re-enables( once that delay has passed)', async ({ page }) => {
  // Assert
  await bothCardsHave(page, 'aria-busy', 'false')
  await bothCardsHave(page, 'aria-disabled', 'false')
})

Then('the share image is uploaded to that War', async ({ page, world }) => {
  // Assert
  await waitForCallLog(page, (log) => log.some((entry) => entry.method === 'POST' && entry.url.endsWith(`/wars/${world.warId}/share-image`)))
})

async function expectOn(page: Page, world: World, target: PageRef): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe(target.path(world))
  if (target.landmark) await expect(page.getByTestId(target.landmark)).toBeVisible()
}

Then('they are signed out', async ({ page }) => {
  // Assert
  await expectSignedOut(page)
})

Then('they are signed in', async ({ page }) => {
  // Assert
  await expect(nav(page).getByTestId('nav-identity')).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toHaveCount(0)
})

Then('no error message is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('vote-error')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

// What both Staff detail pages (a War's, a Voter's) have: the way back to the
// dashboard, and their records' rows.
Then('no Staff detail is shown', async ({ page }) => {
  // Assert
  await expect(page.getByRole('link', { name: 'Back to Admin Dashboard' })).toHaveCount(0)
  await expect(page.getByTestId('admin-contestant-row')).toHaveCount(0)
  await expect(page.getByTestId('admin-voter-war-row')).toHaveCount(0)
})

Then('an empty state is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('empty-state')).toBeVisible()
})

Then('a link to create a War is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('empty-state').getByRole('link', { name: 'Start a War' })).toBeVisible()
})

Then('the sort menu shows {string}', async ({ page }, label: string) => {
  // Assert
  await expect(sortMenu(page).locator('option:checked')).toHaveText(label)
})

Then('the search box is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('war-search-input')).toBeVisible()
})

Then('the heading {string} is shown', async ({ page }, name: string) => {
  // Assert
  await expect(page.getByRole('heading', { name })).toBeVisible()
})

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
  await expect.poll(() => new URL(page.url()).searchParams.get('returnTo')).toBe(target.path(world))
})
