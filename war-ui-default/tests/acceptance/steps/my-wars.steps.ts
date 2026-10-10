// Steps for features/my-wars.feature. Scoped with the feature's own tag so no
// other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { buildWarSummary } from '../../../src/mocks/fixtures'
import { test } from './fixtures'
import { API, hasQuery, waitForCallLog } from '../support/mocking'
import { ok } from '../support/recipes'
import { warCard } from '../support/pages'

const { Given, When, Then } = createBdd(test, { tags: '@my-wars' })

const sortMenu = (page: Page) => page.getByTestId('war-sort-select')

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

When('they choose {string} from the sort menu', async ({ page }, label: string) => {
  // Act
  await sortMenu(page).selectOption({ label })
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

// A themed button is any button the theme paints: the Edit link must carry
// the same background a real <button> on the page does, not plain text's none.
Then("the {string} card's Edit link is styled as a themed button", async ({ page }, title: string) => {
  // Assert
  const background = (element: Element) => getComputedStyle(element).backgroundColor
  const link = warCard(page, title).getByTestId('edit-war-link')
  const themedButton = await page.locator('main').evaluate((main) => {
    const probe = main.appendChild(document.createElement('button'))
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  })
  expect(themedButton).not.toBe('rgba(0, 0, 0, 0)')
  expect(await link.evaluate(background)).toBe(themedButton)
})

Then("that other voter's War is not shown", async ({ page }) => {
  // Assert
  await expect(page.getByTestId('war-card').filter({ hasText: OTHER_VOTERS_WAR })).toHaveCount(0)
})

Then('the War cards are shown in this order:', async ({ page }, table: DataTable) => {
  // Assert
  await expect(page.getByTestId('war-card')).toContainText(table.raw().flat())
})

Then('an empty state is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('empty-state')).toBeVisible()
})

Then('a link to create a War is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('my-wars-create-war-cta')).toBeVisible()
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

Then('Wars are requested with {string}', async ({ page }, query: string) => {
  // Assert
  await waitForCallLog(page, (log) => log.some((entry) => hasQuery(entry, `${API}/wars`, query)))
})
