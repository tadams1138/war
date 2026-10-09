// Binds features/theme-switching.feature.
import { expect, test, type Page } from '@playwright/test'
import { buildMatchupResponse, buildWarDetail } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'
import { ok, reply } from './support/recipes'
import { nav } from './support/pages'

function themeSelect(page: Page) {
  return nav(page).getByTestId('nav-theme-select')
}

test("A War's detail page renders in its creator-chosen theme by default", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [ok('GET', `${API}/wars/war-1`, detail)])

  // Act
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'fight_card')
  await expect(nav(page)).toHaveAttribute('data-theme', 'fight_card')
})

test("A voter's own theme choice overrides the War's default, only for that War", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [ok('GET', `${API}/wars/war-1`, detail)])

  // Act
  await page.goto('/wars/war-1')
  await themeSelect(page).selectOption('scrapbook')
  await page.reload()

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'scrapbook')
  await expect(nav(page)).toHaveAttribute('data-theme', 'scrapbook')
})

test("A voter's theme choice for one War does not affect a different War", async ({ page }) => {
  // Arrange
  const warOne = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  const warTwo = buildWarDetail({ id: 'war-2', theme: 'arcade' })
  await useScenario(page, [
    ok('GET', `${API}/wars/war-1`, warOne),
    ok('GET', `${API}/wars/war-2`, warTwo),
  ])

  // Act
  await page.goto('/wars/war-1')
  await themeSelect(page).selectOption('scrapbook')
  await page.goto('/wars/war-2')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'arcade')
})

test("A War's vote page renders in its creator-chosen theme", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  const matchup = buildMatchupResponse()
  await useScenario(page, [
    ok('GET', `${API}/wars/war-1`, detail),
    reply('POST', `${API}/wars/war-1/join`, 204),
    ok('GET', `${API}/wars/war-1/matchups/next`, matchup),
  ])

  // Act
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/war-1/vote')
  await expect(page.getByTestId('matchup-view')).toBeVisible()

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'fight_card')
})

test('Home renders in "arcade" until the voter chooses otherwise', async ({ page }) => {
  // Arrange
  await useScenario(page, [ok('GET', `${API}/wars`, { wars: [], next_cursor: null })])

  // Act
  await page.goto('/')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'arcade')
})

test('Choosing a theme on Home does not change what a War\'s own page shows', async ({ page }) => {
  // Arrange
  const warDetail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [
    ok('GET', `${API}/wars`, { wars: [], next_cursor: null }),
    ok('GET', `${API}/wars/war-1`, warDetail),
  ])

  // Act
  await page.goto('/')
  await themeSelect(page).selectOption('scrapbook')
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'fight_card')
})

test('The nav theme menu is present and usable on pages with no War in scope', async ({ page }) => {
  // Arrange
  await useScenario(page, [ok('GET', `${API}/wars`, { wars: [], next_cursor: null })])

  // Act
  await page.goto('/login')

  // Assert
  await expect(themeSelect(page)).toBeVisible()

  // Act
  await themeSelect(page).selectOption('scrapbook')
  await page.goto('/')

  // Assert
  await expect(page.locator('main')).toHaveAttribute('data-theme', 'scrapbook')
})
