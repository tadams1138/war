// Binds features/create-war.feature.
import { expect, test } from '@playwright/test'
import { buildWarDetail, buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

const WAR_ID = 'war-create-1'

test('Creating a War immediately creates an empty draft and forwards to its Edit page', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: WAR_ID, title: null, status: 'draft' })
  const detail = buildWarDetail({ id: WAR_ID, title: null, status: 'draft', contestants: [] })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/wars/new')

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
  await expect(page.getByTestId('edit-war-title-input')).toBeVisible()
  const calls = await getCallLog(page)
  const createCall = calls.find((call) => call.method === 'POST' && call.url.endsWith('/wars'))
  expect(createCall).toBeDefined()
  expect(JSON.parse(createCall!.body || '{}')).toEqual({})
})

test('A failed creation shows an error with a retry control', async ({ page }) => {
  // Arrange — the first POST fails, the retried one succeeds
  const createdWar = buildWarSummary({ id: WAR_ID, title: null, status: 'draft' })
  const detail = buildWarDetail({ id: WAR_ID, title: null, status: 'draft', contestants: [] })
  await useScenario(page, [
    {
      method: 'POST',
      path: `${API}/wars`,
      responses: [{ status: 500, body: { error: 'server error' } }, { status: 201, body: createdWar }],
    },
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')
  await expect(page.getByTestId('create-war-error')).toBeVisible()

  // Act
  await page.getByTestId('create-war-retry').click()

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
})

test('Creating a War requires authentication', async ({ page }) => {
  // Act
  await page.goto('/wars/new')

  // Assert
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwars%2Fnew$/)
})
