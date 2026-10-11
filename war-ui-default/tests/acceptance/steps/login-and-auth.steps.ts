// Steps for features/login-and-auth.feature. Scoped with the feature's own tag
// so no other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { buildMatchupResponse, buildWarDetail } from '../../../src/mocks/fixtures'
import { MOCK_ACCESS_TOKEN } from '../../../src/mocks/handlers'
import { test, type World } from './fixtures'
import { API, getCallLog, waitForCallLog } from '../support/mocking'
import { PROVIDERS, type Provider } from '../support/providers'
import { ok } from '../support/recipes'

const { Given, When, Then } = createBdd(test, { tags: '@login-and-auth' })

const signInButton = (page: Page, provider: Provider) => page.getByTestId(`login-provider-${provider.id}`)

const EXPIRED = { status: 401, body: { error: 'expired' } }

// The expired token surfaces as a 401 on the first request the voter makes,
// here the next War's detail and next matchup. The refresh then succeeds.
Given("the voter's session has expired but can be refreshed", async ({ world }) => {
  // Arrange
  const id = world.nextWarId()
  world.queue(
    { method: 'GET', path: `${API}/wars/${id}`, responses: [EXPIRED, { status: 200, body: buildWarDetail({ id }) }] },
    { method: 'GET', path: `${API}/wars/${id}/matchups/next`, responses: [EXPIRED, { status: 200, body: buildMatchupResponse() }] },
    ok('POST', `${API}/auth/refresh`, { token: 'refreshed' }),
  )
})

When('they select {provider}', async ({ page }, provider: Provider) => {
  // Act
  await signInButton(page, provider).click()
})

// Selecting a provider leaves the SPA for real (a browser navigation). The API
// then redirects back to /auth/callback carrying no token or returnTo of its
// own; the SPA persisted returnTo itself, in sessionStorage, before leaving.
When('they complete sign-in with {provider}', async ({ page }, provider: Provider) => {
  // Act
  await signInButton(page, provider).click()
  await page.goto('/auth/callback')
})

// Makes the next War's two calls, in parallel or one after the other, and
// returns how each ended.
async function makeRequests(page: Page, world: World, inParallel: boolean): Promise<void> {
  world.requestOutcomes = await page.evaluate(
    async ([warId, parallel]) => {
      const client = window.__apiClient!
      const calls = [() => client.getWar(warId as string), () => client.getNextMatchup(warId as string)]
      const settle = (call: () => Promise<unknown>) => call().then(() => 'fulfilled', () => 'rejected')
      if (parallel) return Promise.all(calls.map(settle))
      const outcomes: string[] = []
      for (const call of calls) outcomes.push(await settle(call))
      return outcomes
    },
    [world.warId, inParallel],
  )
}

When('two API requests are in flight at the same time', async ({ page, world }) => {
  // Act
  await makeRequests(page, world, true)
})

When('two API requests are made one after the other', async ({ page, world }) => {
  // Act
  await makeRequests(page, world, false)
})

Then('a sign-in button is shown for each supported provider', async ({ page }) => {
  // Assert
  for (const provider of PROVIDERS) await expect(signInButton(page, provider)).toBeVisible()
})

Then('no sign-in button is shown for {word}', async ({ page }, label: string) => {
  // Assert
  await expect(page.getByTestId(`login-provider-${label.toLowerCase()}`)).toHaveCount(0)
})

Then("the browser navigates to {provider}'s login endpoint", async ({ page }, provider: Provider) => {
  // Assert
  await expect(page).toHaveURL(new RegExp(`${API}/auth/${provider.id}/login`))
})

// The token lives in memory only (war-spec.md §10): a script-readable copy in
// any browser storage is what an XSS payload would exfiltrate.
Then('the access token is not in browser storage', async ({ page }) => {
  // Assert
  const contents = await page.evaluate(async () => {
    const entries = (storage: Storage) => Object.entries(storage)
    const rows = (store: IDBObjectStore) => new Promise<unknown[]>((resolve) => Object.assign(store.getAll(), { onsuccess: (event: Event) => resolve((event.target as IDBRequest).result) }))
    const stores = async (name: string) => {
      const db = await new Promise<IDBDatabase>((resolve) => Object.assign(indexedDB.open(name), { onsuccess: (event: Event) => resolve((event.target as IDBOpenDBRequest).result) }))
      const names = Array.from(db.objectStoreNames)
      return Promise.all(names.map((store) => rows(db.transaction(store).objectStore(store))))
    }
    const databases = (await indexedDB.databases()).map((database) => database.name!)
    return JSON.stringify([entries(localStorage), entries(sessionStorage), document.cookie, await Promise.all(databases.map(stores))])
  })
  expect(contents).not.toContain(MOCK_ACCESS_TOKEN)
})

Then('no token appears in the page URL', async ({ page }) => {
  // Assert
  expect(page.url()).not.toContain(MOCK_ACCESS_TOKEN)
  expect(page.url()).not.toMatch(/[?#&](access_)?token=/)
})

Then('exactly one call is made to refresh the session', async ({ page }) => {
  // Assert
  const refreshes = (await getCallLog(page)).filter((entry) => entry.url.includes('/auth/refresh'))
  expect(refreshes).toHaveLength(1)
})

Then('both requests are retried once the refresh succeeds', async ({ page, world }) => {
  // Assert
  const paths = [`${API}/wars/${world.warId}`, `${API}/wars/${world.warId}/matchups/next`]
  const log = await waitForCallLog(page, (calls) => paths.every((path) => calls.filter((call) => new URL(call.url).pathname === path).length === 2))
  expect(log.filter((call) => paths.includes(new URL(call.url).pathname))).toHaveLength(4)
})

Then('both requests succeed without the voter seeing an error', async ({ page, world }) => {
  // Assert
  expect(world.requestOutcomes).toEqual(['fulfilled', 'fulfilled'])
  await expect(page.getByRole('alert')).toHaveCount(0)
})

Then('the redirect gives the reason {string}', async ({ page }, reason: string) => {
  // Assert
  await expect.poll(() => new URL(page.url()).searchParams.get('reason')).toBe(reason)
})

Then('the sign-in options are shown in a centered panel', async ({ page }) => {
  // Assert
  const panel = page.getByTestId('login-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId('login-provider-google')).toBeVisible()
  const box = (await panel.boundingBox())!
  const pageWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(Math.abs(box.x + box.width / 2 - pageWidth / 2)).toBeLessThanOrEqual(1)
})

Then("each provider's sign-in button shows that provider's logo", async ({ page }) => {
  // Assert
  for (const provider of PROVIDERS) {
    await expect(signInButton(page, provider).getByRole('img', { name: `${provider.label} logo` })).toBeVisible()
  }
})
