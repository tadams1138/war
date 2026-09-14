// Binds features/theme-switching.feature.
import { expect, test } from '@playwright/test'
import { buildWarDetail } from '../../src/mocks/fixtures'
import { API, useScenario } from './support/mocking'

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
