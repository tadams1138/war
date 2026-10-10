// Steps for features/error-handling.feature. Scoped with the feature's own tag
// so no other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { RecipeResponse } from '../../../src/mocks/scenarios'
import { test, type World } from './fixtures'
import { API } from '../support/mocking'
import { reply, voteRecipe } from '../support/recipes'

const { Given, When, Then } = createBdd(test, { tags: '@error-handling' })

function answerVotes(world: World, response: RecipeResponse): void {
  world.queue(voteRecipe(world.warId, response))
}

// Answers every request about the next War (its detail, join and next matchup).
function answerWar(world: World, status: number, error: string): void {
  const id = world.nextWarId()
  const body = { error }
  world.queue(
    reply('GET', `${API}/wars/${id}`, status, body),
    reply('POST', `${API}/wars/${id}/join`, status, body),
    reply('GET', `${API}/wars/${id}/matchups/next`, status, body),
  )
}

const card = (page: Page, name: string) => page.getByTestId('contestant-card').filter({ hasText: name })

Given('a War that does not exist', async ({ world }) => {
  // Arrange
  answerWar(world, 404, 'not found')
})

// The expired session surfaces as a 401 on the first request the voter makes,
// here for the next War.
Given("the voter's session has expired and cannot be refreshed", async ({ world }) => {
  // Arrange
  answerWar(world, 401, 'unauthorized')
  world.queue(reply('POST', `${API}/auth/refresh`, 401, { error: 'invalid' }))
})

Given('that War has closed', async ({ world }) => {
  // Arrange
  answerVotes(world, { status: 403, body: { error: 'error', reason: 'war_not_published' } })
})

Given("the voter's automatic join did not take effect", async ({ world }) => {
  // Arrange
  answerVotes(world, { status: 403, body: { error: 'error', reason: 'not_joined' } })
})

Given('the API is rate limiting votes for {int} second(s)', async ({ world }, seconds: number) => {
  // Arrange
  answerVotes(world, { status: 429, body: { error: 'error' }, headers: { 'Retry-After': String(seconds) } })
})

Given('the API rejects a vote as invalid', async ({ world }) => {
  // Arrange
  answerVotes(world, { status: 422, body: { error: 'error' } })
})

Given('the API fails a vote with a server error', async ({ world }) => {
  // Arrange
  answerVotes(world, { status: 503, body: { error: 'error' } })
})

Given('the API cannot be reached to cast a vote', async ({ world }) => {
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
