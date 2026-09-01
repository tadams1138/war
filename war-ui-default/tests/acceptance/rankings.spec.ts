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
  // Cell-scoped, not whole-row `toContainText`: '10' and '12' both being
  // digits in the row would let Wins and Appearances pass transposed.
  const firstRowCells = rows.nth(0).getByRole('cell')
  await expect(firstRowCells.nth(0)).toHaveText('1')
  await expect(firstRowCells.nth(2)).toHaveText('Contestant One')
  await expect(firstRowCells.nth(3)).toHaveText('10')
  await expect(firstRowCells.nth(4)).toHaveText('12')
  // The Image column (spec §6): c1's media is `c1-media-0` with 400/1600
  // variants (src/mocks/fixtures.ts's buildMediaItem default).
  const image = rows.nth(0).locator('img')
  await expect(image).toHaveAttribute('alt', 'Contestant One')
  await expect(image).toHaveAttribute('src', /c1-media-0\/400\.jpg/)
  await expect(image).toHaveAttribute('srcset', /1600w/)
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
  // Cell-scoped: `toContainText('2')` on the whole row is satisfied by any
  // digit anywhere in it and cannot actually distinguish rank from wins.
  await expect(rows.nth(0).getByRole('cell').nth(0)).toHaveText('2')
  await expect(rows.nth(1)).toContainText('Contestant A')
  await expect(rows.nth(1).getByRole('cell').nth(0)).toHaveText('1')
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
  await expect(rows.nth(1).getByRole('cell').nth(0)).toHaveText('—')
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

test('A failed poll keeps the last loaded leaderboard on screen', async ({ page }) => {
  // Arrange
  const first = buildRankingsResponse({
    war_id: WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 })],
  })
  const third = buildRankingsResponse({
    war_id: WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 9, appearances: 10 })],
  })
  await page.clock.install()
  await useScenario(page, [
    {
      method: 'GET',
      path: `${API}/wars/${WAR_ID}/rankings`,
      responses: [
        { status: 200, body: first },
        { status: 503, body: { error: 'server error' } },
        { status: 200, body: third },
      ],
    },
  ])
  await page.goto(`/wars/${WAR_ID}/rankings`)
  const rows = page.getByTestId('ranking-row')
  await expect(rows.nth(0).getByRole('cell').nth(3)).toHaveText('5')

  // Act — the second poll (the failing one)
  await page.clock.fastForward(30_000)

  // Assert — the wins column still reflects the first, successfully loaded
  // response; no error state has replaced the table.
  await expect(rows.nth(0).getByRole('cell').nth(3)).toHaveText('5')
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Act — a third poll, still on the same 30s schedule, that succeeds
  await page.clock.fastForward(30_000)

  // Assert — polling was never stopped by the failure in between
  await expect(rows.nth(0).getByRole('cell').nth(3)).toHaveText('9')
  const rankingsCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/rankings'))
  expect(rankingsCalls.length).toBeGreaterThanOrEqual(3)
})

test('The leaderboard recovers once a later poll succeeds', async ({ page }) => {
  // Arrange
  const first = buildRankingsResponse({
    war_id: WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 })],
  })
  const third = buildRankingsResponse({
    war_id: WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 9, appearances: 10 })],
  })
  await page.clock.install()
  await useScenario(page, [
    {
      method: 'GET',
      path: `${API}/wars/${WAR_ID}/rankings`,
      responses: [
        { status: 200, body: first },
        { status: 503, body: { error: 'server error' } },
        { status: 200, body: third },
      ],
    },
  ])
  await page.goto(`/wars/${WAR_ID}/rankings`)
  const rows = page.getByTestId('ranking-row')
  await expect(rows.nth(0).getByRole('cell').nth(3)).toHaveText('5')
  // The failed poll — the "whose last poll failed" precondition
  await page.clock.fastForward(30_000)
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Act — the next poll succeeds
  await page.clock.fastForward(30_000)

  // Assert
  await expect(rows.nth(0).getByRole('cell').nth(3)).toHaveText('9')
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
