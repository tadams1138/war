// Binds features/error-handling.feature.
import { expect, test, type Page } from '@playwright/test'
import { buildMatchupResponse } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'
import type { RecipeResponse } from '../../src/mocks/scenarios'

const WAR_ID = 'war-errors-1'
const MATCHUP_ID = 'matchup-errors'

async function gotoVotePageWithMatchup(page: Page, voteResponse: RecipeResponse) {
  const matchup = buildMatchupResponse({
    matchup: { id: MATCHUP_ID, left: { id: 'a', name: 'A', media: [] }, right: { id: 'b', name: 'B', media: [] } },
  })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchup }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/matchups/${MATCHUP_ID}/vote`, responses: [voteResponse] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, `/wars/${WAR_ID}/vote`)
}

test('Session expiry sends the voter to log in again', async ({ page }) => {
  // Arrange — /login has no data fetch of its own on mount, so the
  // request below is the only thing that can trigger the 401.
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 401, body: { error: 'expired' } }] },
    { method: 'POST', path: `${API}/auth/refresh`, responses: [{ status: 401, body: { error: 'invalid' } }] },
  ])
  await page.goto('/login')
  await loginAsTestVoter(page)

  // Act
  await page.evaluate(() => window.__apiClient!.getWars().catch(() => undefined))

  // Assert
  await expect(page).toHaveURL(/\/login\?/)
  await expect(page.getByText('Please log in to continue')).toBeVisible()
})

test('Voting is blocked with a closed-War message', async ({ page }) => {
  // Arrange
  await gotoVotePageWithMatchup(page, { status: 403, body: { error: 'War is not active', reason: 'war_not_active' } })

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()

  // Assert
  await expect(page.getByTestId('vote-error')).toHaveText('This War is locked — voting is closed')
  // "no vote request succeeds" (features/error-handling.feature) — the
  // matchup that failed to record a vote must still be the one on screen,
  // not silently replaced by the next one.
  await expect(page.getByTestId('contestant-card').filter({ hasText: 'A' })).toBeVisible()
})

test('Voting shows a join message as a defensive fallback', async ({ page }) => {
  // Arrange
  await gotoVotePageWithMatchup(page, { status: 403, body: { error: 'Voter has not joined this War', reason: 'not_joined' } })

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()

  // Assert
  await expect(page.getByTestId('vote-error')).toHaveText('Join this War to vote')
})

test('A missing War shows a not-found message', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/missing-war`, responses: [{ status: 404, body: { error: 'not found' } }] },
    { method: 'POST', path: `${API}/wars/missing-war/join`, responses: [{ status: 404, body: { error: 'not found' } }] },
    { method: 'GET', path: `${API}/wars/missing-war/matchups/next`, responses: [{ status: 404, body: { error: 'not found' } }] },
  ])
  // Act — the War detail page (no auth needed)
  await page.goto('/wars/missing-war')

  // Assert
  await expect(page.getByText("This War doesn't exist or has been removed")).toBeVisible()

  // Act — the vote page (requires auth; a fresh boot is needed anyway
  // since the previous goto reloaded the page)
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/missing-war/vote')

  // Assert
  await expect(page.getByText("This War doesn't exist or has been removed")).toBeVisible()
})

test('Rate-limited voting is shown as a wait, not an error', async ({ page }) => {
  // Arrange
  await gotoVotePageWithMatchup(page, {
    status: 429,
    body: { error: 'rate limited' },
    headers: { 'Retry-After': '1' },
  })

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()

  // Assert
  const errorText = page.getByTestId('vote-error')
  await expect(errorText).toContainText('Slow down a moment')
  await expect(errorText).toHaveAttribute('role', 'status')
  await expect(page.getByTestId('contestant-card').nth(0)).toHaveAttribute('aria-busy', 'true')

  // voting re-enables automatically once the delay has passed
  await expect(page.getByTestId('contestant-card').nth(0)).toHaveAttribute('aria-busy', 'false', { timeout: 3000 })
})

test('An unexpected validation failure shows a generic retry message', async ({ page }) => {
  // Arrange
  await gotoVotePageWithMatchup(page, { status: 422, body: { error: 'invalid winner' } })

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()

  // Assert
  await expect(page.getByTestId('vote-error')).toHaveText('Something went wrong — please try again')
})

test('A server error shows a generic retry message', async ({ page }) => {
  // Arrange
  await gotoVotePageWithMatchup(page, { status: 503 })

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()

  // Assert
  await expect(page.getByTestId('vote-error')).toHaveText('Server error — please try again shortly')
})

test('A network failure shows a connectivity message', async ({ page }) => {
  // Arrange
  await gotoVotePageWithMatchup(page, { status: 0, networkError: true })

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()

  // Assert
  await expect(page.getByTestId('vote-error')).toHaveText('Unable to reach the server — check your connection')
})
