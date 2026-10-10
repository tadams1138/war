// Steps for features/error-handling.feature. Scoped with the feature's own tag
// so no other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { buildMatchupResponse } from '../../../src/mocks/fixtures'
import type { RecipeResponse } from '../../../src/mocks/scenarios'
import { test, type World } from './fixtures'
import { API } from '../support/mocking'
import { reply } from '../support/recipes'

const { Given, When, Then } = createBdd(test, { tags: '@error-handling' })

const MATCHUP_ID = buildMatchupResponse().matchup.id

function answerVotes(world: World, response: RecipeResponse): void {
  world.queue({ method: 'POST', path: `${API}/wars/${world.warId}/matchups/${MATCHUP_ID}/vote`, responses: [response] })
}

const card = (page: Page, name: string) => page.getByTestId('contestant-card').filter({ hasText: name })

Given('a War whose requests are answered with {int}', async ({ world }, status: number) => {
  // Arrange
  const id = world.nextWarId()
  const body = { error: 'error' }
  world.queue(
    reply('GET', `${API}/wars/${id}`, status, body),
    reply('POST', `${API}/wars/${id}/join`, status, body),
    reply('GET', `${API}/wars/${id}/matchups/next`, status, body),
  )
})

Given('the session cannot be refreshed', async ({ world }) => {
  // Arrange
  world.queue(reply('POST', `${API}/auth/refresh`, 401, { error: 'invalid' }))
})

Given('the API answers votes with {int}', async ({ world }, status: number) => {
  // Arrange
  answerVotes(world, { status, body: { error: 'error' } })
})

Given('the API answers votes with {int} and reason {string}', async ({ world }, status: number, reason: string) => {
  // Arrange
  answerVotes(world, { status, body: { error: 'error', reason } })
})

Given('the API answers votes with {int} and Retry-After {int}', async ({ world }, status: number, seconds: number) => {
  // Arrange
  answerVotes(world, { status, body: { error: 'error' }, headers: { 'Retry-After': String(seconds) } })
})

Given('the API cannot be reached when voting', async ({ world }) => {
  // Arrange
  answerVotes(world, { status: 0, networkError: true })
})

When('they vote for {string}', async ({ page }, name: string) => {
  // Act
  await card(page, name).click()
})

Then('the message {string} is shown', async ({ page }, message: string) => {
  // Assert
  await expect(page.getByText(message, { exact: true })).toBeVisible()
})

Then('the matchup still shows {string}', async ({ page }, name: string) => {
  // Assert
  await expect(card(page, name)).toBeVisible()
})

Then('the message is announced as a status, not an alert', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('vote-error')).toHaveAttribute('role', 'status')
})

Then('voting is disabled', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('contestant-card').first()).toHaveAttribute('aria-busy', 'true')
})

Then('voting re-enables once that delay has passed', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('contestant-card').first()).toHaveAttribute('aria-busy', 'false', { timeout: 3000 })
})
