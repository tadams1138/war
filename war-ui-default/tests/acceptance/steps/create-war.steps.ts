// Steps for features/create-war.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { waitForCallLog } from '../support/mocking'
import { CREATED_WAR_ID, createdWar, queueCreation } from '../support/recipes'

const { Given, When, Then } = createBdd(test, { tags: '@create-war' })

const RETRY_AFTER_SECONDS = 1

Given('the API rate limits the first creation request for 1 second, then accepts the retry', async ({ world }) => {
  // Arrange
  world.retryAfterSeconds = RETRY_AFTER_SECONDS
  queueCreation(world, [
    { status: 429, body: { error: 'rate limited' }, headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) } },
    { status: 201, body: createdWar() },
  ])
})

Given('the API rejects the first creation request, then accepts the retry', async ({ world }) => {
  // Arrange
  queueCreation(world, [
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

Then('creation retries on its own once the supplied delay passes', async ({ page }) => {
  // Assert
  await expect(page).toHaveURL(`/wars/${CREATED_WAR_ID}/edit`, { timeout: 3000 })
})

Then('a retry control is offered', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('create-war-retry')).toBeVisible()
})
