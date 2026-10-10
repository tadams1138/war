// Steps for features/my-wars.feature. Scoped with the feature's own tag so no
// other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { API, hasQuery, waitForCallLog } from '../support/mocking'
import { warCard } from '../support/pages'

const { When, Then } = createBdd(test, { tags: '@my-wars' })

const sortMenu = (page: Page) => page.getByTestId('war-sort-select')

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

Then("the {string} card's Edit link has a background colour", async ({ page }, title: string) => {
  // Assert
  const link = warCard(page, title).getByTestId('edit-war-link')
  const background = await link.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(background).not.toBe('rgba(0, 0, 0, 0)')
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
