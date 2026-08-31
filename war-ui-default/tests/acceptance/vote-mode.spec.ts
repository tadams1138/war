// Binds features/vote-mode.feature.
import { expect, test } from '@playwright/test'
import { buildMatchupResponse } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

const WAR_ID = 'war-vote-1'

async function gotoVotePage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, `/wars/${WAR_ID}/vote`)
}

test('A voter is served a matchup', async ({ page }) => {
  // Arrange
  const matchup = buildMatchupResponse({ progress: { voted: 0, total: 5 } })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchup }] },
  ])

  // Act
  await gotoVotePage(page);

  // Assert
  await expect(page.getByTestId('matchup-view')).toBeVisible()
  await expect(page.getByTestId('contestant-card')).toHaveCount(2)
  await expect(page.getByText('0 of 5 matchups')).toBeVisible()
})

test('Navigating to vote silently joins the War', async ({ page }) => {
  // Arrange
  const matchup = buildMatchupResponse()
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchup }] },
  ])

  // Act
  await gotoVotePage(page)
  await expect(page.getByTestId('matchup-view')).toBeVisible()

  // Assert
  const log = await getCallLog(page)
  const joinIndex = log.findIndex((entry) => entry.url.includes('/join'))
  const matchupIndex = log.findIndex((entry) => entry.url.includes('/matchups/next'))
  expect(joinIndex).toBeGreaterThanOrEqual(0)
  expect(matchupIndex).toBeGreaterThan(joinIndex)
  await expect(page.getByText(/join/i)).toHaveCount(0)
})

test('Cards are rendered in the order the API returns', async ({ page }) => {
  // Arrange
  const matchup = buildMatchupResponse({
    matchup: {
      id: 'matchup-order',
      left: { id: 'contestant-b', name: 'Contestant B', media: [] },
      right: { id: 'contestant-a', name: 'Contestant A', media: [] },
    },
  })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchup }] },
  ])

  // Act
  await gotoVotePage(page)

  // Assert
  const cards = page.getByTestId('contestant-card')
  await expect(cards.nth(0)).toContainText('Contestant B')
  await expect(cards.nth(1)).toContainText('Contestant A')
})

test('Both cards are disabled while a vote is in flight', async ({ page }) => {
  // Arrange
  const matchup = buildMatchupResponse({ matchup: { id: 'matchup-flight', left: { id: 'a', name: 'A', media: [] }, right: { id: 'b', name: 'B', media: [] } } })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchup }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/matchups/matchup-flight/vote`,
      responses: [{ status: 201, body: { vote_id: 'v1' }, delayMs: 400 }],
    },
  ])
  await gotoVotePage(page)

  // Act
  await page.getByTestId('contestant-card').nth(0).click()
  await page.getByTestId('contestant-card').nth(1).click({ force: true })

  // Assert — still in flight
  await expect(page.getByTestId('contestant-card').nth(0)).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByTestId('contestant-card').nth(1)).toHaveAttribute('aria-busy', 'true')
  const inFlightLog = (await getCallLog(page)).filter((entry) => entry.url.includes('/vote'))
  expect(inFlightLog).toHaveLength(1)
})

test('Voter casts a vote and the next matchup loads automatically', async ({ page }) => {
  // Arrange
  const matchupOne = buildMatchupResponse({
    matchup: { id: 'matchup-1', left: { id: 'a', name: 'A', media: [] }, right: { id: 'b', name: 'B', media: [] } },
    progress: { voted: 0, total: 2 },
  })
  const matchupTwo = buildMatchupResponse({
    matchup: { id: 'matchup-2', left: { id: 'c', name: 'C', media: [] }, right: { id: 'd', name: 'D', media: [] } },
    progress: { voted: 1, total: 2 },
  })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchupOne }, { status: 200, body: matchupTwo }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/matchups/matchup-1/vote`, responses: [{ status: 201, body: { vote_id: 'v1' } }] },
  ])
  await gotoVotePage(page)

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()

  // Assert
  await expect(page.getByText('1 of 2 matchups')).toBeVisible()
  await expect(page.getByTestId('contestant-card').filter({ hasText: 'C' })).toBeVisible()
  await expect(page.getByTestId('contestant-card').nth(0)).toHaveAttribute('aria-busy', 'false')
})

test('A decided pair is never shown again', async ({ page }) => {
  // Arrange
  const matchupOne = buildMatchupResponse({
    matchup: { id: 'matchup-1', left: { id: 'a', name: 'Once', media: [] }, right: { id: 'b', name: 'B', media: [] } },
    progress: { voted: 0, total: 2 },
  })
  const matchupTwo = buildMatchupResponse({
    matchup: { id: 'matchup-2', left: { id: 'c', name: 'C', media: [] }, right: { id: 'd', name: 'D', media: [] } },
    progress: { voted: 1, total: 2 },
  })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchupOne }, { status: 200, body: matchupTwo }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/matchups/matchup-1/vote`, responses: [{ status: 201, body: { vote_id: 'v1' } }] },
  ])
  await gotoVotePage(page)

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'Once' }).click()

  // Assert — the client refetched (a second matchups/next call happened)
  // rather than replaying a cached first response, and what it rendered
  // from that refetch no longer contains the decided pair. Whether the
  // *server* would actually re-serve a decided pair is enforced by
  // war-api (war-api-spec.md §9.2), not observable from this repo.
  await expect(page.getByText('Once')).toHaveCount(0)
  const nextCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/matchups/next'))
  expect(nextCalls).toHaveLength(2)
})

test('A conflicting vote advances silently', async ({ page }) => {
  // Arrange
  const staleMatchup = buildMatchupResponse({
    matchup: { id: 'matchup-stale', left: { id: 'a', name: 'Stale A', media: [] }, right: { id: 'b', name: 'Stale B', media: [] } },
    progress: { voted: 3, total: 5 },
  })
  const freshMatchup = buildMatchupResponse({
    matchup: { id: 'matchup-fresh', left: { id: 'c', name: 'Fresh C', media: [] }, right: { id: 'd', name: 'Fresh D', media: [] } },
    progress: { voted: 4, total: 5 },
  })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: staleMatchup }, { status: 200, body: freshMatchup }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/matchups/matchup-stale/vote`, responses: [{ status: 409, body: { error: 'conflict' } }] },
  ])
  await gotoVotePage(page)

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'Stale A' }).click()

  // Assert
  await expect(page.getByTestId('contestant-card').filter({ hasText: 'Fresh C' })).toBeVisible()
  await expect(page.getByTestId('vote-error')).toHaveCount(0)
})

test('There is no skip control', async ({ page }) => {
  // Arrange
  const matchup = buildMatchupResponse()
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchup }] },
  ])

  // Act
  await gotoVotePage(page)

  // Assert
  await expect(page.getByText(/skip|abstain|pass\b/i)).toHaveCount(0)
})

test('Voter completes every matchup', async ({ page }) => {
  // Arrange
  const lastMatchup = buildMatchupResponse({
    matchup: { id: 'matchup-last', left: { id: 'a', name: 'A', media: [] }, right: { id: 'b', name: 'B', media: [] } },
    progress: { voted: 4, total: 5 },
  })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: lastMatchup }, { status: 204 }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/matchups/matchup-last/vote`, responses: [{ status: 201, body: { vote_id: 'v1' } }] },
  ])
  await gotoVotePage(page)

  // Act
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()

  // Assert
  await expect(page.getByTestId('vote-complete')).toBeVisible()
  await expect(page.getByTestId('matchup-view')).toHaveCount(0)
  await expect(page.getByTestId('contestant-card')).toHaveCount(0)
})
