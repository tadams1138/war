// Binds features/browse-wars.feature.
import { expect, test } from '@playwright/test'
import { buildWarSummary } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, useScenario } from './support/mocking'

test('Anonymous user browses public Wars', async ({ page }) => {
  // Arrange — contestant_count 1 on the second War also covers the
  // singular label ("1 contestant", not "1 contestants").
  const wars = [
    buildWarSummary({ id: 'war-1', title: 'Miss Universe 2026', category: 'Pageant', contestant_count: 12 }),
    buildWarSummary({ id: 'war-2', title: '2026 Senate Race', category: 'Politics', contestant_count: 1 }),
  ]
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars } }] }])

  // Act
  await page.goto('/')

  // Assert — features/browse-wars.feature: "a War card is displayed for
  // each War, showing its title, category, and contestant count"
  const cards = page.getByTestId('war-card')
  await expect(cards).toHaveCount(2)
  const missUniverse = cards.filter({ hasText: 'Miss Universe 2026' })
  await expect(missUniverse).toContainText('Pageant')
  await expect(missUniverse).toContainText('12 contestants')
  const senateRace = cards.filter({ hasText: '2026 Senate Race' })
  await expect(senateRace).toContainText('Politics')
  await expect(senateRace).toContainText('1 contestant')
  await expect(page.getByTestId('login-cta')).toBeVisible()
})

test('Authenticated user browses public Wars', async ({ page }) => {
  // Arrange
  const wars = [
    buildWarSummary({ id: 'war-1', title: 'Miss Universe 2026', category: 'Pageant', contestant_count: 12 }),
  ]
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars } }] }])
  await page.goto('/')

  // Act — Home is already mounted; logging in updates the same page
  // reactively (no reload — a real sign-in never reloads Home either,
  // since JWT storage is a JS variable, §2/§7) rather than reloading it,
  // which would wipe the in-memory JWT loginAsTestVoter just set.
  await loginAsTestVoter(page)

  // Assert — features/browse-wars.feature: "a War card is displayed for
  // each War, showing its title, category, and contestant count"
  const card = page.getByTestId('war-card')
  await expect(card).toContainText('Pageant')
  await expect(card).toContainText('12 contestants')
  await expect(page.getByTestId('login-cta')).toHaveCount(0)
})

test('No active Wars', async ({ page }) => {
  // Arrange
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] }])

  // Act
  await page.goto('/')

  // Assert
  await expect(page.getByTestId('empty-state')).toBeVisible()
})

test("A War card links to its detail page", async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-miss-universe', title: 'Miss Universe 2026', category: 'Pageant' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war] } }] },
    {
      method: 'GET',
      path: `${API}/wars/war-miss-universe`,
      responses: [
        {
          status: 200,
          body: { ...war, contestants: [] },
        },
      ],
    },
  ])
  await page.goto('/')

  // Act
  await page.getByTestId('war-card').filter({ hasText: 'Miss Universe 2026' }).click()

  // Assert
  await expect(page).toHaveURL(/\/wars\/war-miss-universe$/)
  await expect(page.getByRole('heading', { name: 'Miss Universe 2026' })).toBeVisible()
})
