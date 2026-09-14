// Binds features/theme-switching.feature.
import { expect, test } from '@playwright/test'
import { buildMatchupResponse, buildRankingsResponse, buildWarDetail } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

test("A War's detail page renders in its creator-chosen theme by default", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'fight_card')
})

test("A voter's own theme choice overrides the War's default, only for that War", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-1')
  await page.getByTestId('theme-option-scrapbook').click()
  await page.reload()

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'scrapbook')
})

test("A voter's theme choice for one War does not affect a different War", async ({ page }) => {
  // Arrange
  const warOne = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  const warTwo = buildWarDetail({ id: 'war-2', theme: 'arcade' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: warOne }] },
    { method: 'GET', path: `${API}/wars/war-2`, responses: [{ status: 200, body: warTwo }] },
  ])

  // Act
  await page.goto('/wars/war-1')
  await page.getByTestId('theme-option-scrapbook').click()
  await page.goto('/wars/war-2')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'arcade')
})

test("A War's vote page renders in its creator-chosen theme", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  const matchup = buildMatchupResponse()
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/war-1/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/war-1/matchups/next`, responses: [{ status: 200, body: matchup }] },
  ])

  // Act
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/war-1/vote')
  await expect(page.getByTestId('matchup-view')).toBeVisible()

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'fight_card')
})

test("A War's rankings page renders in its creator-chosen theme", async ({ page }) => {
  // Arrange
  const rankings = buildRankingsResponse({ war_id: 'war-1', theme: 'scrapbook' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-1/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-1/rankings')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'scrapbook')
})

test('Home renders in "arcade" until the voter chooses otherwise', async ({ page }) => {
  // Arrange
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] }])

  // Act
  await page.goto('/')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'arcade')
})

test('Choosing a theme on Home does not change what a War\'s own page shows', async ({ page }) => {
  // Arrange
  const warDetail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] },
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: warDetail }] },
  ])

  // Act
  await page.goto('/')
  await page.getByTestId('theme-option-scrapbook').click()
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'fight_card')
})
