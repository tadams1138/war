// Steps for features/admin-dashboard.feature. Scoped with the feature's own
// tag so no other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import type { HandlerRecipe } from '../../../src/mocks/scenarios'
import { test, type World } from './fixtures'
import {
  adminVoterDetail,
  adminVoterGet,
  adminWarDetail,
  adminWarDetailGet,
  killSwitchGet,
  logEntry,
  logGet,
  meCalls,
  noVotes,
  pagesOf,
  REMOVED_AT,
  type LogTarget,
} from '../support/adminFixtures'
import { API, getCallLog, loginAsTestVoter, waitForCallLog } from '../support/mocking'
import { nav } from '../support/pages'
import { reply } from '../support/recipes'

const { Given, When, Then } = createBdd(test, { tags: '@admin-dashboard' })

const entries = (page: Page) => page.getByTestId('moderation-log-entry')
const heading = (page: Page) => page.getByRole('heading', { name: 'Admin Dashboard' })
const puts = (page: Page) => getCallLog(page).then((log) => log.filter((entry) => entry.method === 'PUT' && entry.url.endsWith('/kill-switch')))

// --- Arrange ---------------------------------------------------------------

type LogPage = Parameters<typeof logGet>[0]

// The log is read in call order, so every page given joins one recipe.
function addLogPages(world: World, ...pages: LogPage[]): void {
  const existing = world.recipes.find((recipe) => recipe.path === `${API}/moderation-log`)
  if (existing) existing.responses.push(...logGet(...pages).responses)
  else world.queue(logGet(...pages))
}

function entriesFrom(world: World, table: DataTable) {
  return table.hashes().map((row, index) => {
    const target: LogTarget = {}
    if (row['target Voter']) target.voter = row['target Voter']
    if (row['target War']) Object.assign(target, { war: world.nextWarId(), warTitle: row['target War'] })
    return logEntry(`entry-${index}`, row.action, row.when, target)
  })
}

Given('the War-creation kill switch is {state}', async ({ world }, enabled: boolean) => {
  // Arrange
  world.queue(killSwitchGet(enabled))
})

// A PUT answers with the state it was asked to set, as the API does.
Given('the API accepts changes to the kill switch', async ({ world }) => {
  // Arrange
  world.queue({ method: 'PUT', path: `${API}/kill-switch`, responses: [{ status: 200, echoRequest: true }] })
})

Given('changing the kill switch fails with a server error', async ({ world }) => {
  // Arrange
  world.queue(reply('PUT', `${API}/kill-switch`, 500, { error: 'boom' }))
})

// "then holds" is what the log answers the next time it is read.
Given('the moderation log (then )holds these entries, newest first:', async ({ world }, table: DataTable) => {
  // Arrange
  addLogPages(world, { entries: entriesFrom(world, table), next_cursor: null })
})

Given('the moderation log holds these entries, newest first, {int} per page:', async ({ world }, size: number, table: DataTable) => {
  // Arrange
  addLogPages(world, ...pagesOf(entriesFrom(world, table), size).map((page) => ({ entries: page.items, next_cursor: page.next_cursor })))
})

function logTargeting(world: World, target: LogTarget): void {
  addLogPages(world, { entries: [logEntry('entry-1', 'remove_war', '2026-10-02T12:00:00Z', target)], next_cursor: null })
}

Given('a moderation log entry targets a War titled {string}', async ({ world }, title: string) => {
  // Arrange
  const id = world.nextWarId()
  logTargeting(world, { war: id, warTitle: title })
  world.queue(adminWarDetailGet(id, adminWarDetail(id, { title, removed_at: REMOVED_AT })))
})

Given('a moderation log entry targets a War that no longer exists', async ({ world }) => {
  // Arrange
  logTargeting(world, { war: world.nextWarId(), warDeleted: true })
})

Given('a moderation log entry targets a live War that has no title', async ({ world }) => {
  // Arrange
  logTargeting(world, { war: world.nextWarId() })
})

// The Voter and the acting Staff member each have a detail page to land on.
Given('a moderation log entry targets the Voter {string}', async ({ world }, name: string) => {
  // Arrange
  addLogPages(world, { entries: [logEntry('entry-1', 'ban_voter', '2026-10-02T12:00:00Z', { voter: 'v-1', voterName: name })], next_cursor: null })
  world.queue(
    adminVoterGet('v-1', adminVoterDetail('v-1', { display_name: name })),
    noVotes('v-1'),
    adminVoterGet('staff-voter-1', adminVoterDetail('staff-voter-1', { display_name: 'Stella Staff', is_moderator: true })),
    noVotes('staff-voter-1'),
  )
})

const identity = (name: string, flags: object) => ({ status: 200, body: { voter: { id: name, display_name: name, avatar_url: null, is_moderator: false, is_admin: false, ...flags } } })

// Each sign-in fetches the identity again; they are answered in order.
Given('the first Voter to sign in is the Moderator {string} and the next is the Voter {string}', async ({ world }, staff: string, plain: string) => {
  // Arrange
  const recipe: HandlerRecipe = { method: 'GET', path: `${API}/auth/me`, responses: [identity(staff, { is_moderator: true }), identity(plain, {})] }
  world.queue(recipe)
})

// --- Act -------------------------------------------------------------------

When('they choose to {word} the kill switch', async ({ page }, action: string) => {
  // Act
  await page.getByRole('button', { name: `${action[0]!.toUpperCase()}${action.slice(1)} kill switch` }).click()
})

When('they log out', async ({ page }) => {
  // Act
  await nav(page).getByTestId('nav-identity').click()
  await nav(page).getByTestId('nav-logout').click()
})

When('another voter signs in', async ({ page }) => {
  // Act
  await loginAsTestVoter(page, 'second-voter-token')
})

// The API redirects back to the callback route flagged `error=banned`.
When('sign-in ends with the account reported as banned', async ({ page }) => {
  // Act
  await page.goto('/auth/callback?error=banned')
})

// --- Assert ----------------------------------------------------------------

Then('the Admin Dashboard is shown beneath the navigation header', async ({ page }) => {
  // Assert
  await expect.poll(() => new URL(page.url()).pathname).toBe('/admin')
  await expect(heading(page)).toBeVisible()
  const [title, header] = [await heading(page).boundingBox(), await nav(page).boundingBox()]
  expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
})

Then('no Admin Dashboard is shown', async ({ page }) => {
  // Assert
  await expect(heading(page)).toHaveCount(0)
})

Then('the kill switch is (still )shown as {state}', async ({ page }, enabled: boolean) => {
  // Assert
  await expect(page.getByTestId('kill-switch-state')).toHaveText(enabled ? 'On' : 'Off')
})

Then('the API has not been asked to change the kill switch', async ({ page }) => {
  // Assert
  expect(await puts(page)).toHaveLength(0)
})

Then('the API has been asked to turn the kill switch {state}', async ({ page }, enabled: boolean) => {
  // Assert
  const log = await waitForCallLog(page, (calls) => calls.some((entry) => entry.method === 'PUT'))
  expect(JSON.parse(log.find((entry) => entry.method === 'PUT')?.body ?? '{}')).toEqual({ enabled })
})

Then('the kill switch shows the error {string}', async ({ page }, message: string) => {
  // Assert
  await expect(page.getByTestId('kill-switch-error')).toHaveText(message)
})

Then('the moderation log lists {int} entry/entries', async ({ page }, count: number) => {
  // Assert
  await expect(entries(page)).toHaveCount(count)
})

Then('the moderation log lists these entries, newest first:', async ({ page }, table: DataTable) => {
  // Assert
  const expected = table.hashes()
  await expect(entries(page)).toHaveCount(expected.length)
  for (const [index, row] of expected.entries()) {
    const entry = entries(page).nth(index)
    for (const text of [row['action label'], row.by, row.target]) await expect(entry).toContainText(text)
    await expect(entry.locator('time')).toHaveAttribute('datetime', row.when)
  }
})

Then('a message says this account has been banned rather than that sign-in failed', async ({ page }) => {
  // Assert
  await expect(page.getByRole('alert')).toContainText('This account has been banned')
  await expect(page.getByRole('alert')).not.toContainText('Sign-in failed')
})

Then('the session is not refreshed', async ({ page }) => {
  // Assert
  expect((await getCallLog(page)).filter((entry) => entry.url.includes('/auth/refresh'))).toHaveLength(0)
})

Then('the entry says a deleted War was targeted, with its id and no link', async ({ page, world }) => {
  // Assert
  await expect(entries(page)).toContainText(['a deleted War'])
  await expect(entries(page)).toContainText([world.warId])
  await expect(entries(page).locator(`a[href="/admin/wars/${world.warId}"]`)).toHaveCount(0)
})

Then('the entry names it as an untitled War and links to its Staff detail', async ({ page, world }) => {
  // Assert
  await expect(entries(page)).not.toContainText('a deleted War')
  await expect(entries(page).getByRole('link', { name: 'Untitled War' })).toHaveAttribute('href', `/admin/wars/${world.warId}`)
})

Then("the current Voter's identity was requested {int} time(s)", async ({ page }, count: number) => {
  // Assert
  await expect.poll(async () => (await meCalls(page)).length).toBe(count)
})
