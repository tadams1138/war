// Binds features/login-and-auth.feature.
import { expect, test } from '@playwright/test'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

const PROVIDERS = ['google', 'apple', 'facebook', 'microsoft', 'twitter']

test('Voter selects an OAuth provider', async ({ page }) => {
  // Arrange
  await page.goto('/login')

  // Assert — a sign-in button for every supported provider
  for (const provider of PROVIDERS) {
    await expect(page.getByTestId(`login-provider-${provider}`)).toBeVisible()
  }

  // Act
  await Promise.all([
    page.waitForURL(new RegExp(`${API}/auth/google/login`)),
    page.getByTestId('login-provider-google').click(),
  ])

  // Assert
  expect(page.url()).toContain(`${API}/auth/google/login`)
})

test('A completed sign-in returns the voter to where they started', async ({ page }) => {
  // Arrange
  await page.goto('/login?returnTo=%2Fwars%2Fabc-123%2Fvote')

  // Act — selecting a provider leaves the SPA for real (browser
  // navigation), same as the previous scenario; the API then redirects
  // back to /auth/callback carrying no token or returnTo of its own
  // (war-ui-default-spec.md §7 step 3) — the SPA persisted returnTo itself
  // before leaving, in sessionStorage.
  await page.getByTestId('login-provider-google').click()
  await page.goto('/auth/callback')

  // Assert
  await expect(page).toHaveURL(/\/wars\/abc-123\/vote$/)
  await expect(page).not.toHaveURL(/login/)
})

test('The JWT is never written to durable storage', async ({ page }) => {
  // Arrange
  await page.goto('/login?returnTo=%2F')

  // Act
  await page.getByTestId('login-provider-google').click()
  await page.goto('/auth/callback')
  await page.waitForURL('/')

  // Assert
  const storageSnapshot = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }))
  expect(storageSnapshot.local).not.toContain('mock-refreshed-token')
  expect(storageSnapshot.session).not.toContain('mock-refreshed-token')
})

test('No token ever appears in a URL', async ({ page }) => {
  // Arrange
  await page.goto('/login?returnTo=%2F')

  // Act
  await page.getByTestId('login-provider-google').click()
  await page.goto('/auth/callback')
  await page.waitForURL('/')

  // Assert
  expect(page.url()).not.toContain('mock-refreshed-token')
  expect(page.url()).not.toMatch(/[?#&](access_)?token=/)
})

test('Unauthenticated visit to a protected route redirects to login', async ({ page }) => {
  // Act
  await page.goto('/wars/abc-123/vote')

  // Assert
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwars%2Fabc-123%2Fvote$/)
})

test('Concurrent 401s trigger exactly one refresh', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    {
      method: 'GET',
      path: `${API}/wars`,
      responses: [{ status: 401, body: { error: 'expired' } }, { status: 200, body: { wars: [] } }],
    },
    {
      method: 'GET',
      path: `${API}/wars/war-1`,
      responses: [
        { status: 401, body: { error: 'expired' } },
        { status: 200, body: { id: 'war-1', title: 'W', category: null, status: 'active', visibility: 'public', media_mode: 'image', contestant_schema: [], ends_at: null, contestants: [] } },
      ],
    },
    { method: 'POST', path: `${API}/auth/refresh`, responses: [{ status: 200, body: { token: 'refreshed' } }] },
  ])
  // /login has no data fetch of its own on mount, unlike Home — booting
  // there keeps the sequenced /wars responses above untouched until this
  // test's own calls consume them.
  await page.goto('/login')
  await loginAsTestVoter(page)

  // Act
  const results = await page.evaluate(async () => {
    const client = window.__apiClient!
    const outcomes = await Promise.allSettled([client.getWars(), client.getWar('war-1')])
    return outcomes.map((outcome) => outcome.status)
  })

  // Assert
  expect(results).toEqual(['fulfilled', 'fulfilled'])
  const refreshCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/auth/refresh'))
  expect(refreshCalls).toHaveLength(1)
})

test('A failed refresh is terminal', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 401, body: { error: 'expired' } }] },
    { method: 'POST', path: `${API}/auth/refresh`, responses: [{ status: 401, body: { error: 'invalid refresh token' } }] },
  ])
  await page.goto('/login')
  await loginAsTestVoter(page)
  // WarDetail doesn't fetch /wars (the list), so it's a neutral page to be
  // "on" for this test's own sequenced calls below, and gives returnTo
  // something concrete to carry.
  await navigateAuthenticated(page, '/wars/neutral-page')

  // Act
  await page.evaluate(async () => {
    const client = window.__apiClient!
    await client.getWars().catch(() => undefined)
    await client.getWars().catch(() => undefined)
  })

  // Assert
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwars%2Fneutral-page&reason=session-expired$/)
  const refreshCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/auth/refresh'))
  expect(refreshCalls).toHaveLength(1)
})
