// Binds features/my-wars.feature.
import { expect, test } from '@playwright/test'
import { buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

test('A voter sees every War they created, across every status', async ({ page }) => {
  // Arrange
  const wars = [
    buildWarSummary({ id: 'war-draft', title: 'My Draft War', status: 'draft' }),
    buildWarSummary({ id: 'war-active', title: 'My Active War', status: 'active' }),
    buildWarSummary({ id: 'war-closed', title: 'My Closed War', status: 'closed' }),
  ]
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars } }] }])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/my-wars')

  // Assert — a card for each of the three Wars, each showing its status
  const cards = page.getByTestId('war-card')
  await expect(cards).toHaveCount(3)
  await expect(cards.filter({ hasText: 'My Draft War' }).getByTestId('war-status-badge')).toHaveText('draft')
  await expect(cards.filter({ hasText: 'My Active War' }).getByTestId('war-status-badge')).toHaveText('active')
  await expect(cards.filter({ hasText: 'My Closed War' }).getByTestId('war-status-badge')).toHaveText('closed')
})

test("My Wars does not show another voter's Wars", async ({ page }) => {
  // Arrange — the mocked GET /wars response stands in for the API's own
  // creator=me scoping (the spec), exactly as browse-wars.spec.ts
  // and create-war.spec.ts already mock every other endpoint on this page;
  // this is a UI-level test and does not re-verify the API's own scoping.
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] }])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/my-wars')

  // Assert — the `wars: []` mock alone cannot distinguish a scoped request
  // from an unscoped one that happened to return nothing, so also assert
  // MyWars actually requested creator=me (the one thing this scenario is
  // about).
  await expect(page.getByTestId('war-card')).toHaveCount(0)
  await expect(page.getByTestId('empty-state')).toBeVisible()
  const calls = (await getCallLog(page)).filter((entry) => entry.url.includes('/wars'))
  expect(calls.some((entry) => new URL(entry.url).searchParams.get('creator') === 'me')).toBe(true)
})

test("A War card links to its detail page", async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-draft-1', title: 'My Draft War', status: 'draft' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war] } }] },
    { method: 'GET', path: `${API}/wars/war-draft-1`, responses: [{ status: 200, body: { ...war, contestants: [] } }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/my-wars')

  // Act
  await page.getByTestId('war-card').filter({ hasText: 'My Draft War' }).click()

  // Assert
  await expect(page).toHaveURL(/\/wars\/war-draft-1$/)
  await expect(page.getByRole('heading', { name: 'My Draft War' })).toBeVisible()
})

test('No Wars created yet', async ({ page }) => {
  // Arrange
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] }])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/my-wars')

  // Assert
  await expect(page.getByTestId('empty-state')).toBeVisible()
  await expect(page.getByTestId('my-wars-create-war-cta')).toBeVisible()
})

test('My Wars requires authentication', async ({ page }) => {
  // Act
  await page.goto('/my-wars')

  // Assert
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fmy-wars$/)
})
