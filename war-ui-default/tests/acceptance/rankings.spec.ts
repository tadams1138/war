// Binds features/rankings.feature.
import { expect, test } from '@playwright/test'
import { buildMatchupResponse, buildRankingEntry, buildRankingsResponse } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

const WAR_ID = 'war-rankings-1'

test('Rankings load for an anonymous visitor', async ({ page }) => {
  // Arrange
  const rankings = buildRankingsResponse({
    war_id: WAR_ID,
    status: 'active',
    rankings: [
      buildRankingEntry({ rank: 1, contestant: { id: 'c1', name: 'Contestant One' }, wins: 10, appearances: 12 }),
      buildRankingEntry({ rank: 2, contestant: { id: 'c2', name: 'Contestant Two' }, wins: 8, appearances: 12 }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}/rankings`, responses: [{ status: 200, body: rankings }] }])

  // Act
  await page.goto(`/wars/${WAR_ID}/rankings`)

  // Assert
  const rows = page.getByTestId('ranking-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Contestant One')
  await expect(rows.nth(0)).toContainText('10')
  await expect(rows.nth(0)).toContainText('12')
  await expect(page.getByText(/%/)).toHaveCount(0)
})

test('The UI renders rankings in the order and ranks the API returns', async ({ page }) => {
  // Arrange — rank 2 listed before rank 1, deliberately out of numeric
  // order, to prove the UI never re-sorts what the API sent.
  const rankings = buildRankingsResponse({
    war_id: WAR_ID,
    rankings: [
      buildRankingEntry({ rank: 2, contestant: { id: 'c-b', name: 'Contestant B' }, wins: 5, appearances: 9 }),
      buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 9, appearances: 9 }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}/rankings`, responses: [{ status: 200, body: rankings }] }])

  // Act
  await page.goto(`/wars/${WAR_ID}/rankings`)

  // Assert
  const rows = page.getByTestId('ranking-row')
  await expect(rows.nth(0)).toContainText('Contestant B')
  await expect(rows.nth(0)).toContainText('2')
  await expect(rows.nth(1)).toContainText('Contestant A')
  await expect(rows.nth(1)).toContainText('1')
})

test('Unranked contestants are shown at the bottom', async ({ page }) => {
  // Arrange
  const rankings = buildRankingsResponse({
    war_id: WAR_ID,
    rankings: [
      buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 }),
      buildRankingEntry({ rank: null, contestant: { id: 'c-c', name: 'Contestant C' }, wins: 0, appearances: 0 }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}/rankings`, responses: [{ status: 200, body: rankings }] }])

  // Act
  await page.goto(`/wars/${WAR_ID}/rankings`)

  // Assert
  const rows = page.getByTestId('ranking-row')
  await expect(rows.nth(1)).toContainText('Contestant C')
  await expect(rows.nth(1)).toContainText('—')
})

test('Rankings poll while the War is active', async ({ page }) => {
  // Arrange
  const first = buildRankingsResponse({
    war_id: WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 })],
  })
  const second = buildRankingsResponse({
    war_id: WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 6, appearances: 7 })],
  })
  await page.clock.install()
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}/rankings`, responses: [{ status: 200, body: first }, { status: 200, body: second }] },
  ])
  await page.goto(`/wars/${WAR_ID}/rankings`)
  await expect(page.getByTestId('ranking-row')).toContainText('5')

  // Act
  await page.clock.fastForward(30_000)

  // Assert
  await expect(page.getByTestId('ranking-row')).toContainText('6')
  const rankingsCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/rankings'))
  expect(rankingsCalls.length).toBeGreaterThanOrEqual(2)
})

test('Rankings do not poll once the War is closed', async ({ page }) => {
  // Arrange
  const closed = buildRankingsResponse({
    war_id: WAR_ID,
    status: 'closed',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 })],
  })
  await page.clock.install()
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}/rankings`, responses: [{ status: 200, body: closed }] }])
  await page.goto(`/wars/${WAR_ID}/rankings`)
  await expect(page.getByTestId('ranking-row')).toHaveCount(1)

  // Act
  await page.clock.fastForward(30_000)

  // Assert
  const rankingsCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/rankings'))
  expect(rankingsCalls).toHaveLength(1)
})

test('Invite-only rankings require sign-in', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}/rankings`, responses: [{ status: 401, body: { error: 'unauthorized' } }] },
    { method: 'POST', path: `${API}/auth/refresh`, responses: [{ status: 401, body: { error: 'invalid refresh token' } }] },
  ])

  // Act
  await page.goto(`/wars/${WAR_ID}/rankings`)

  // Assert
  await expect(page).toHaveURL(/\/login\?/)
  await expect(page.getByText('Please log in to continue')).toBeVisible()
})

test('A completed vote flow links to rankings', async ({ page }) => {
  // Arrange
  const lastMatchup = buildMatchupResponse({
    matchup: { id: 'matchup-last', left: { id: 'a', name: 'A', media: [] }, right: { id: 'b', name: 'B', media: [] } },
    progress: { voted: 4, total: 5 },
  })
  const rankings = buildRankingsResponse({ war_id: WAR_ID })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: lastMatchup }, { status: 204 }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/matchups/matchup-last/vote`, responses: [{ status: 201, body: { vote_id: 'v1' } }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/rankings`, responses: [{ status: 200, body: rankings }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, `/wars/${WAR_ID}/vote`)
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()
  await expect(page.getByTestId('vote-complete')).toBeVisible()

  // Act
  await page.getByTestId('rankings-link').click()

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/rankings`)
  await expect(page.getByTestId('ranking-row')).toHaveCount(rankings.rankings.length)
})
