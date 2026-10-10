// Steps for features/my-wars.feature. Scoped with the feature's own tag so no
// other feature can ever bind to (or collide with) this text.
import { expect } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { buildWarSummary } from '../../../src/mocks/fixtures'
import { test } from './fixtures'
import { API, hasQuery, waitForCallLog } from '../support/mocking'
import { ok } from '../support/recipes'
import { backgroundOf, themedButtonBackground, warCard } from '../support/pages'

const { Given, When, Then } = createBdd(test, { tags: '@my-wars' })

const OTHER_VOTERS_WAR = "Another Voter's War"
const noWars = { wars: [], next_cursor: null }

// The mocked API stands in for war-api's own creator=me scoping: it answers
// only requests that ask for creator=me with the voter's own Wars, and every
// other request with whatever else it was given.
Given('the voter has created no Wars', async ({ world }) => {
  // Arrange
  world.queue({ ...ok('GET', `${API}/wars`, noWars), query: 'creator=me' })
})

Given('another voter has created a published public War', async ({ world }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-other', title: OTHER_VOTERS_WAR, status: 'published', visibility: 'public' })
  world.queue(ok('GET', `${API}/wars`, { wars: [war], next_cursor: null }))
})

Given('the API lists them in reverse when sorted oldest first', async ({ world }) => {
  // Arrange
  const reversed = [...world.listedWars].reverse()
  world.queue({ ...ok('GET', `${API}/wars`, { wars: reversed, next_cursor: null }), query: 'creator=me&sort=oldest' })
})

When('they click the {string} card', async ({ page }, title: string) => {
  // Act
  await warCard(page, title).click()
})

Then('{int} War card(s) is/are shown', async ({ page }, count: number) => {
  // Assert
  await expect(page.getByTestId('war-card')).toHaveCount(count)
})

Then('the {string} card shows the status {string}', async ({ page }, title: string, status: string) => {
  // Assert
  await expect(warCard(page, title).getByTestId('war-status-badge')).toHaveText(status)
})

Then('the {string} card shows an Edit link', async ({ page }, title: string) => {
  // Assert
  await expect(warCard(page, title).getByTestId('edit-war-link')).toBeVisible()
})

Then("the {string} card's Edit link is styled as a themed button", async ({ page }, title: string) => {
  // Assert
  expect(await backgroundOf(warCard(page, title).getByTestId('edit-war-link'))).toBe(await themedButtonBackground(page))
})

Then("that other voter's War is not shown", async ({ page }) => {
  // Assert
  await expect(page.getByTestId('war-card').filter({ hasText: OTHER_VOTERS_WAR })).toHaveCount(0)
})

Then('the War cards are shown in this order:', async ({ page }, table: DataTable) => {
  // Assert
  await expect(page.getByTestId('war-card')).toContainText(table.raw().flat())
})

Then('Wars are requested with {string}', async ({ page }, query: string) => {
  // Assert
  await waitForCallLog(page, (log) => log.some((entry) => hasQuery(entry, `${API}/wars`, query)))
})
