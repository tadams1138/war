// Binds features/war-detail.feature.
import { expect, test } from '@playwright/test'
import {
  buildContestant,
  buildMatchupResponse,
  buildMediaItem,
  buildRankingEntry,
  buildRankingsResponse,
  buildWarDetail,
} from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

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

test('The contestant gallery lays out in multiple columns on a laptop-width viewport', async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 1280, height: 800 })
  const detail = buildWarDetail({
    id: 'war-grid',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada' }),
      buildContestant({ id: 'c-2', name: 'Grace' }),
      buildContestant({ id: 'c-3', name: 'Mae' }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-grid`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-grid')

  // Assert — first and second cards sit in the same row, not stacked
  const items = page.getByTestId('contestant-gallery-item')
  const firstBox = await items.nth(0).boundingBox()
  const secondBox = await items.nth(1).boundingBox()
  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThan(5)
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

test("A contestant's formatted bio renders on the War detail page", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: 'war-bio',
    contestants: [
      buildContestant({
        id: 'c-1',
        name: 'Ada',
        bio: 'A **brilliant** mathematician.\n\n- Loves *logic*\n- [Her work](https://example.test/ada)',
      }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-bio`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-bio')

  // Assert
  const bio = page.getByTestId('contestant-bio')
  await expect(bio.locator('strong')).toHaveText('brilliant')
  await expect(bio.locator('em')).toHaveText('logic')
  await expect(bio.locator('li')).toHaveCount(2)
  await expect(bio.locator('a')).toHaveAttribute('href', 'https://example.test/ada')
})

test('Paragraphs in a bio separated by a blank line render with visible vertical space', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: 'war-bio-paragraphs',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada', bio: 'First paragraph.\n\nSecond paragraph.' }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-bio-paragraphs`, responses: [{ status: 200, body: detail }] },
  ])

  // Act
  await page.goto('/wars/war-bio-paragraphs')

  // Assert
  const bio = page.getByTestId('contestant-bio')
  const paragraphs = bio.locator('p')
  await expect(paragraphs).toHaveCount(2)
  const marginBottom = await paragraphs.first().evaluate((el) => parseFloat(getComputedStyle(el).marginBottom))
  expect(marginBottom).toBeGreaterThan(0)
})

test('An adversarial bio never executes and never renders as raw HTML', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: 'war-bio-xss',
    contestants: [
      buildContestant({
        id: 'c-1',
        name: 'Ada',
        bio: 'hello<script>window.__pwned = true</script>world<img src=x onerror="window.__pwned = true">',
      }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-bio-xss`, responses: [{ status: 200, body: detail }] },
  ])

  // Act
  await page.goto('/wars/war-bio-xss')

  // Assert
  const bio = page.getByTestId('contestant-bio')
  await expect(bio).toBeVisible()
  const pwned = await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)
  expect(pwned).toBeUndefined()
  await expect(bio.locator('script')).toHaveCount(0)
  await expect(bio.locator('img[onerror]')).toHaveCount(0)
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

test('Contestant media is capped so the bio stays readable without scrolling', async ({ page }) => {
  // Arrange — a wide viewport with only 2 contestants is the case that
  // previously blew media up to near-half-screen width: an
  // auto-fill/1fr grid stretches each column to fill all the room a wide
  // screen and a short roster leave available.
  await page.setViewportSize({ width: 1600, height: 900 })
  const detail = buildWarDetail({
    id: 'war-wide',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada', bio: 'A brilliant mathematician.' }),
      buildContestant({ id: 'c-2', name: 'Grace', bio: 'A pioneering programmer.' }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-wide`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-wide')

  // Assert
  const firstItem = page.getByTestId('contestant-gallery-item').filter({ hasText: 'Ada' })
  const imageBox = await firstItem.locator('img').boundingBox()
  expect(imageBox).not.toBeNull()
  expect(imageBox!.width).toBeLessThanOrEqual(340)
  const bioBox = await firstItem.getByTestId('contestant-bio').boundingBox()
  expect(bioBox).not.toBeNull()
  expect(bioBox!.y + bioBox!.height).toBeLessThanOrEqual(900)
})

test('A contestant with multiple images is browsable in place', async ({ page }) => {
  // Arrange
  const media = [
    buildMediaItem({ id: 'ada-media-0', display_order: 0 }),
    buildMediaItem({ id: 'ada-media-1', display_order: 1 }),
    buildMediaItem({ id: 'ada-media-2', display_order: 2 }),
  ]
  const detail = buildWarDetail({
    id: 'war-multi-image',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-multi-image`, responses: [{ status: 200, body: detail }] },
  ])

  // Act
  await page.goto('/wars/war-multi-image')
  const item = page.getByTestId('contestant-gallery-item').filter({ hasText: 'Ada' })

  // Assert — paging controls present, and stepping forward swaps the image
  // without leaving the page
  await expect(item.getByTestId('carousel-arrow-next')).toBeVisible()
  await expect(item.locator('img:visible')).toHaveAttribute('src', /ada-media-0/)
  await item.getByTestId('carousel-arrow-next').click()
  await expect(item.locator('img:visible')).toHaveAttribute('src', /ada-media-1/)
  await expect(page).toHaveURL(/\/wars\/war-multi-image$/)
})

// --- Results (formerly a separate Rankings page, now part of War detail —
// war-spec.md 10.1/10.4: "one page, not two") ---

const RESULTS_WAR_ID = 'war-results-1'

test('The detail page shows results alongside the gallery', async ({ page }) => {
  // Arrange
  const rankings = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    status: 'active',
    rankings: [
      buildRankingEntry({ rank: 1, contestant: { id: 'c1', name: 'Contestant One' }, wins: 10, appearances: 12 }),
      buildRankingEntry({ rank: 2, contestant: { id: 'c2', name: 'Contestant Two' }, wins: 8, appearances: 12 }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${RESULTS_WAR_ID}/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto(`/wars/${RESULTS_WAR_ID}`)

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
  // The Image column (spec): c1's media is `c1-media-0` with 400/1600
  // variants (src/mocks/fixtures.ts's buildMediaItem default).
  const image = rows.nth(0).locator('img')
  await expect(image).toHaveAttribute('alt', 'Contestant One')
  await expect(image).toHaveAttribute('src', /c1-media-0\/400\.jpg/)
  await expect(image).toHaveAttribute('srcset', /1600w/)
  await expect(page.getByText(/%/)).toHaveCount(0)
})

test('The UI renders results in the order and ranks the API returns', async ({ page }) => {
  // Arrange — rank 2 listed before rank 1, deliberately out of numeric
  // order, to prove the UI never re-sorts what the API sent.
  const rankings = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    rankings: [
      buildRankingEntry({ rank: 2, contestant: { id: 'c-b', name: 'Contestant B' }, wins: 5, appearances: 9 }),
      buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 9, appearances: 9 }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${RESULTS_WAR_ID}/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto(`/wars/${RESULTS_WAR_ID}`)

  // Assert
  const rows = page.getByTestId('ranking-row')
  await expect(rows.nth(0)).toContainText('Contestant B')
  // Cell-scoped: `toContainText('2')` on the whole row is satisfied by any
  // digit anywhere in it and cannot actually distinguish rank from wins.
  await expect(rows.nth(0).getByRole('cell').nth(0)).toHaveText('2')
  await expect(rows.nth(1)).toContainText('Contestant A')
  await expect(rows.nth(1).getByRole('cell').nth(0)).toHaveText('1')
})

test('Unranked contestants are shown at the bottom of results', async ({ page }) => {
  // Arrange
  const rankings = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    rankings: [
      buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 }),
      buildRankingEntry({ rank: null, contestant: { id: 'c-c', name: 'Contestant C' }, wins: 0, appearances: 0 }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${RESULTS_WAR_ID}/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto(`/wars/${RESULTS_WAR_ID}`)

  // Assert
  const rows = page.getByTestId('ranking-row')
  await expect(rows.nth(1)).toContainText('Contestant C')
  await expect(rows.nth(1).getByRole('cell').nth(0)).toHaveText('—')
})

test('Results poll while the War is active', async ({ page }) => {
  // Arrange
  const first = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 })],
  })
  const second = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 6, appearances: 7 })],
  })
  await page.clock.install()
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${RESULTS_WAR_ID}/rankings`, responses: [{ status: 200, body: first }, { status: 200, body: second }] },
  ])
  await page.goto(`/wars/${RESULTS_WAR_ID}`)
  await expect(page.getByTestId('ranking-row')).toContainText('5')

  // Act
  await page.clock.fastForward(30_000)

  // Assert
  await expect(page.getByTestId('ranking-row')).toContainText('6')
  const rankingsCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/rankings'))
  expect(rankingsCalls.length).toBeGreaterThanOrEqual(2)
})

test('A failed results poll keeps the last loaded leaderboard on screen', async ({ page }) => {
  // Arrange
  const first = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 })],
  })
  const third = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 9, appearances: 10 })],
  })
  await page.clock.install()
  await useScenario(page, [
    {
      method: 'GET',
      path: `${API}/wars/${RESULTS_WAR_ID}/rankings`,
      responses: [
        { status: 200, body: first },
        { status: 503, body: { error: 'server error' } },
        { status: 200, body: third },
      ],
    },
  ])
  await page.goto(`/wars/${RESULTS_WAR_ID}`)
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

test('The leaderboard recovers once a later results poll succeeds', async ({ page }) => {
  // Arrange
  const first = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 })],
  })
  const third = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    status: 'active',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 9, appearances: 10 })],
  })
  await page.clock.install()
  await useScenario(page, [
    {
      method: 'GET',
      path: `${API}/wars/${RESULTS_WAR_ID}/rankings`,
      responses: [
        { status: 200, body: first },
        { status: 503, body: { error: 'server error' } },
        { status: 200, body: third },
      ],
    },
  ])
  await page.goto(`/wars/${RESULTS_WAR_ID}`)
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

test('Results do not poll once the War is closed', async ({ page }) => {
  // Arrange
  const closed = buildRankingsResponse({
    war_id: RESULTS_WAR_ID,
    status: 'closed',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-a', name: 'Contestant A' }, wins: 5, appearances: 6 })],
  })
  await page.clock.install()
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${RESULTS_WAR_ID}/rankings`, responses: [{ status: 200, body: closed }] },
  ])
  await page.goto(`/wars/${RESULTS_WAR_ID}`)
  await expect(page.getByTestId('ranking-row')).toHaveCount(1)

  // Act
  await page.clock.fastForward(30_000)

  // Assert
  const rankingsCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/rankings'))
  expect(rankingsCalls).toHaveLength(1)
})

test("An invite-only War's results require sign-in", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${RESULTS_WAR_ID}/rankings`, responses: [{ status: 401, body: { error: 'unauthorized' } }] },
    { method: 'POST', path: `${API}/auth/refresh`, responses: [{ status: 401, body: { error: 'invalid refresh token' } }] },
  ])

  // Act
  await page.goto(`/wars/${RESULTS_WAR_ID}`)

  // Assert
  await expect(page).toHaveURL(/\/login\?/)
  await expect(page.getByText('Please log in to continue')).toBeVisible()
})

test("A completed vote flow links back to the War's results", async ({ page }) => {
  // Arrange
  const lastMatchup = buildMatchupResponse({
    matchup: { id: 'matchup-last', left: { id: 'a', name: 'A', media: [] }, right: { id: 'b', name: 'B', media: [] } },
    progress: { voted: 4, total: 5 },
  })
  const rankings = buildRankingsResponse({ war_id: RESULTS_WAR_ID })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${RESULTS_WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${RESULTS_WAR_ID}/matchups/next`, responses: [{ status: 200, body: lastMatchup }, { status: 204 }] },
    { method: 'POST', path: `${API}/wars/${RESULTS_WAR_ID}/matchups/matchup-last/vote`, responses: [{ status: 201, body: { vote_id: 'v1' } }] },
    { method: 'GET', path: `${API}/wars/${RESULTS_WAR_ID}/rankings`, responses: [{ status: 200, body: rankings }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, `/wars/${RESULTS_WAR_ID}/vote`)
  await page.getByTestId('contestant-card').filter({ hasText: 'A' }).click()
  await expect(page.getByTestId('vote-complete')).toBeVisible()

  // Act
  await page.getByTestId('view-results-link').click()

  // Assert
  await expect(page).toHaveURL(`/wars/${RESULTS_WAR_ID}`)
  await expect(page.getByTestId('ranking-row')).toHaveCount(rankings.rankings.length)
})
