// Binds features/war-detail.feature.
import { expect, test } from '@playwright/test'
import { buildContestant, buildMediaItem, buildWarDetail } from '../../src/mocks/fixtures'
import { API, useScenario } from './support/mocking'

test('War overview loads with its contestant gallery', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: 'war-1',
    title: 'Miss Universe 2026',
    category: 'Pageant',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada' }),
      buildContestant({ id: 'c-2', name: 'Grace' }),
      buildContestant({ id: 'c-3', name: 'Mae' }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.getByRole('heading', { name: 'Miss Universe 2026' })).toBeVisible()
  await expect(page.getByText('Pageant')).toBeVisible()
  const items = page.getByTestId('contestant-gallery-item')
  await expect(items).toHaveCount(3)
  await expect(items.filter({ hasText: 'Ada' }).locator('img')).toBeVisible()
  await expect(items.filter({ hasText: 'Grace' }).locator('img')).toBeVisible()
  await expect(items.filter({ hasText: 'Mae' }).locator('img')).toBeVisible()
})

test('The primary image is the display_order 0 item, regardless of array order', async ({ page }) => {
  // Arrange — the API returns this contestant's media out of order; the
  // *second* array entry is the one declared display_order: 0.
  const outOfOrderMedia = [
    buildMediaItem({ id: 'second-in-array', display_order: 1 }),
    buildMediaItem({ id: 'actually-primary', display_order: 0 }),
  ]
  const detail = buildWarDetail({
    id: 'war-order',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: outOfOrderMedia })],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-order`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-order')

  // Assert
  const img = page.getByTestId('contestant-gallery-item').filter({ hasText: 'Ada' }).locator('img')
  await expect(img).toHaveAttribute('src', /actually-primary/)
})

test('The War detail page requires no authentication', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', title: 'Miss Universe 2026', contestants: [buildContestant()] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] }])

  // Act — no login step at all
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.getByRole('heading', { name: 'Miss Universe 2026' })).toBeVisible()
  await expect(page.getByTestId('contestant-gallery-item')).toHaveCount(1)
})

test("A War that doesn't exist shows a not-found message", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/missing-war`, responses: [{ status: 404, body: { error: 'not found' } }] },
  ])

  // Act
  await page.goto('/wars/missing-war')

  // Assert
  await expect(page.getByText("This War doesn't exist or has been removed")).toBeVisible()
})
