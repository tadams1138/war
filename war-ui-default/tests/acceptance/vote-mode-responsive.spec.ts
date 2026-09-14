// Binds features/vote-mode-responsive.feature.
import { expect, test } from '@playwright/test'
import { buildMatchupResponse } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

test('Both contestant cards stay visible and the page does not scroll sideways on a phone', async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 390, height: 844 })
  const matchup = buildMatchupResponse()
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/war-1/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/war-1/matchups/next`, responses: [{ status: 200, body: matchup }] },
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: { id: 'war-1', title: 'Miss Universe 2026', category: null, status: 'active', visibility: 'public', media_mode: 'image', theme: 'arcade', contestant_schema: [], ends_at: null, contestant_count: 2, contestants: [] } }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/wars/war-1/vote')

  // Assert
  await expect(page.getByTestId('contestant-card').first()).toBeVisible()
  await expect(page.getByTestId('contestant-card').last()).toBeVisible()
  const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})
