// Steps for features/create-war.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { buildWarDetail, buildWarSummary } from '../../../src/mocks/fixtures'
import { test, type World } from './fixtures'
import { API, waitForCallLog } from '../support/mocking'
import { ok } from '../support/recipes'

const { Given, When, Then } = createBdd(test, { tags: '@create-war' })

const WAR_ID = 'war-create-1'

function creationRecipes(world: World, postResponses: { status: number; body: unknown; headers?: Record<string, string> }[]) {
  world.warId = WAR_ID
  const detail = buildWarDetail({ id: WAR_ID, title: null, status: 'draft', contestants: [] })
  world.queue({ method: 'POST', path: `${API}/wars`, responses: postResponses }, ok('GET', `${API}/wars/${WAR_ID}`, detail))
}

const createdWar = () => buildWarSummary({ id: WAR_ID, title: null, status: 'draft' })

Given('the API creates an empty draft War', async ({ world }) => {
  // Arrange
  creationRecipes(world, [{ status: 201, body: createdWar() }])
})

Given('the API rate limits the first creation request for 1 second, then accepts the retry', async ({ world }) => {
  // Arrange
  creationRecipes(world, [
    { status: 429, body: { error: 'rate limited' }, headers: { 'Retry-After': '1' } },
    { status: 201, body: createdWar() },
  ])
})

Given('the API rejects the first creation request, then accepts the retry', async ({ world }) => {
  // Arrange
  creationRecipes(world, [
    { status: 500, body: { error: 'server error' } },
    { status: 201, body: createdWar() },
  ])
})

When('they use the retry control', async ({ page }) => {
  // Act
  await page.getByTestId('create-war-retry').click()
})

Then('an empty draft War is created via the API', async ({ page }) => {
  // Assert
  const calls = await waitForCallLog(page, (log) => log.some((call) => call.method === 'POST' && call.url.endsWith('/wars')))
  const createCall = calls.find((call) => call.method === 'POST' && call.url.endsWith('/wars'))
  expect(JSON.parse(createCall?.body || '{}')).toEqual({})
})

Then('a wait is shown, not an error', async ({ page }) => {
  // Assert
  const wait = page.getByTestId('create-war-wait')
  await expect(wait).toContainText('Slow down a moment')
  await expect(wait).toHaveAttribute('role', 'status')
  await expect(page.getByTestId('create-war-error')).toHaveCount(0)
})

Then('creation retries on its own once the supplied delay passes', async ({ page }) => {
  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`, { timeout: 3000 })
})

Then('an error message is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('create-war-error')).toBeVisible()
})

Then('a retry control is offered', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('create-war-retry')).toBeVisible()
})
