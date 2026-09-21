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
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from './support/mocking'

test('War overview loads with its results', async ({ page }) => {
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
  const rankings = buildRankingsResponse({
    war_id: 'war-1',
    rankings: [
      buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada' }, wins: 2, appearances: 2 }),
      buildRankingEntry({ rank: 2, contestant: { id: 'c-2', name: 'Grace' }, wins: 1, appearances: 2 }),
      buildRankingEntry({ rank: 3, contestant: { id: 'c-3', name: 'Mae' }, wins: 0, appearances: 2 }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-1/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.getByRole('heading', { name: 'Miss Universe 2026' })).toBeVisible()
  await expect(page.getByText('Pageant')).toBeVisible()
  const rows = page.getByTestId('ranking-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.filter({ hasText: 'Ada' }).locator('img')).toBeVisible()
  await expect(rows.filter({ hasText: 'Grace' }).locator('img')).toBeVisible()
  await expect(rows.filter({ hasText: 'Mae' }).locator('img')).toBeVisible()
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
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' })],
  })
  const rankings = buildRankingsResponse({
    war_id: 'war-order',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada', media: outOfOrderMedia }, wins: 1, appearances: 1 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-order`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-order/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-order')

  // Assert
  const img = page.getByTestId('ranking-row').filter({ hasText: 'Ada' }).locator('img')
  await expect(img).toHaveAttribute('src', /actually-primary/)
})

test('The War detail page requires no authentication', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-1', title: 'Miss Universe 2026', contestants: [buildContestant({ id: 'c-1' })] })
  const rankings = buildRankingsResponse({
    war_id: 'war-1',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Contestant One' }, wins: 0, appearances: 0 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-1/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act — no login step at all
  await page.goto('/wars/war-1')

  // Assert
  await expect(page.getByRole('heading', { name: 'Miss Universe 2026' })).toBeVisible()
  await expect(page.getByTestId('ranking-row')).toHaveCount(1)
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
  const rankings = buildRankingsResponse({
    war_id: 'war-bio',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada' }, wins: 0, appearances: 0 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-bio`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-bio/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

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
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', bio: 'First paragraph.\n\nSecond paragraph.' })],
  })
  const rankings = buildRankingsResponse({
    war_id: 'war-bio-paragraphs',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada' }, wins: 0, appearances: 0 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-bio-paragraphs`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-bio-paragraphs/rankings`, responses: [{ status: 200, body: rankings }] },
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
  const rankings = buildRankingsResponse({
    war_id: 'war-bio-xss',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada' }, wins: 0, appearances: 0 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-bio-xss`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-bio-xss/rankings`, responses: [{ status: 200, body: rankings }] },
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

test('Bio, image, and stat groups hold their allotted share of the row width', async ({ page }) => {
  // Arrange — a wide viewport proves the group widths are fixed
  // proportions of the row, not content- or viewport-dependent (previously
  // a card-grid layout blew media up to near-half-screen width here).
  await page.setViewportSize({ width: 1600, height: 900 })
  const detail = buildWarDetail({
    id: 'war-wide',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada', bio: 'A brilliant mathematician.' }),
      buildContestant({ id: 'c-2', name: 'Grace', bio: 'A pioneering programmer.' }),
    ],
  })
  const rankings = buildRankingsResponse({
    war_id: 'war-wide',
    rankings: [
      buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada' }, wins: 1, appearances: 1 }),
      buildRankingEntry({ rank: 2, contestant: { id: 'c-2', name: 'Grace' }, wins: 0, appearances: 1 }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-wide`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-wide/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-wide')

  // Assert — bio gets about half the row, image about a quarter, and the
  // wins/appearances/win-share group shares the rest, regardless of how
  // wide the viewport is. Rank now overlays the image itself (a badge on
  // its corner), rather than claiming a separate narrow slice.
  const listBox = await page.getByTestId('rankings-list').boundingBox()
  expect(listBox).not.toBeNull()
  const firstRow = page.getByTestId('ranking-row').filter({ hasText: 'Ada' })
  const imageBox = await firstRow.locator('img').boundingBox()
  expect(imageBox).not.toBeNull()
  expect(imageBox!.width / listBox!.width).toBeGreaterThan(0.2)
  expect(imageBox!.width / listBox!.width).toBeLessThan(0.3)
  const bioBox = await firstRow.getByTestId('contestant-bio').boundingBox()
  expect(bioBox).not.toBeNull()
  expect(bioBox!.width / listBox!.width).toBeGreaterThan(0.4)
  expect(bioBox!.width / listBox!.width).toBeLessThan(0.6)
  expect(bioBox!.y + bioBox!.height).toBeLessThanOrEqual(900)
})

test("On a narrow viewport, a result's image is a large, prominent part of its card", async ({ page }) => {
  // Arrange — the original complaint: a fixed-percentage column gave a
  // phone-width viewport a barely-visible thumbnail, not a large image.
  await page.setViewportSize({ width: 390, height: 844 })
  const detail = buildWarDetail({
    id: 'war-narrow',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' })],
  })
  const rankings = buildRankingsResponse({
    war_id: 'war-narrow',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada' }, wins: 1, appearances: 1 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-narrow`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-narrow/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-narrow')

  // Assert
  const row = page.getByTestId('ranking-row').filter({ hasText: 'Ada' })
  const rowBox = await row.boundingBox()
  const imageBox = await row.locator('img').boundingBox()
  expect(rowBox).not.toBeNull()
  expect(imageBox).not.toBeNull()
  expect(imageBox!.width / rowBox!.width).toBeGreaterThan(0.9)
})

test('A long bio is truncated with a More affordance that expands it', async ({ page }) => {
  // Arrange
  const longBio =
    'Luke Skywalker leads a mission to rescue his friend Han Solo from the clutches of Jabba the Hutt, while the Emperor prepares to crush the Rebellion with a more powerful Death Star.'
  const detail = buildWarDetail({
    id: 'war-long-bio',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', bio: longBio })],
  })
  const rankings = buildRankingsResponse({
    war_id: 'war-long-bio',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada' }, wins: 1, appearances: 1 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-long-bio`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-long-bio/rankings`, responses: [{ status: 200, body: rankings }] },
  ])
  await page.goto('/wars/war-long-bio')
  const row = page.getByTestId('ranking-row').filter({ hasText: 'Ada' })
  const toggle = row.getByTestId('bio-more-toggle')
  await expect(toggle).toHaveText('More')

  // Act
  await toggle.click()

  // Assert
  await expect(toggle).toHaveText('Less')
  await expect(row.getByTestId('contestant-bio')).toContainText('Death Star')
})

test('A short bio has no truncation affordance', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: 'war-short-bio',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', bio: 'A brilliant mathematician.' })],
  })
  const rankings = buildRankingsResponse({
    war_id: 'war-short-bio',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada' }, wins: 1, appearances: 1 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-short-bio`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-short-bio/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-short-bio')

  // Assert
  const row = page.getByTestId('ranking-row').filter({ hasText: 'Ada' })
  await expect(row.getByTestId('bio-more-toggle')).toHaveCount(0)
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
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' })],
  })
  const rankings = buildRankingsResponse({
    war_id: 'war-multi-image',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada', media }, wins: 0, appearances: 0 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-multi-image`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-multi-image/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-multi-image')
  const row = page.getByTestId('ranking-row').filter({ hasText: 'Ada' })

  // Assert — paging controls present, and stepping forward swaps the image
  // without leaving the page
  await expect(row.getByTestId('carousel-arrow-next')).toBeVisible()
  await expect(row.locator('img:visible')).toHaveAttribute('src', /ada-media-0/)
  await row.getByTestId('carousel-arrow-next').click()
  await expect(row.locator('img:visible')).toHaveAttribute('src', /ada-media-1/)
  await expect(page).toHaveURL(/\/wars\/war-multi-image$/)
})

test('A contestant with no media shows no image at all', async ({ page }) => {
  // Arrange — media is optional (a contestant can activate without any),
  // so a bare result row must never invent a placeholder image.
  const detail = buildWarDetail({
    id: 'war-no-media',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [] })],
  })
  const rankings = buildRankingsResponse({
    war_id: 'war-no-media',
    rankings: [buildRankingEntry({ rank: 1, contestant: { id: 'c-1', name: 'Ada', media: [] }, wins: 0, appearances: 0 })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-no-media`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-no-media/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-no-media')

  // Assert
  const row = page.getByTestId('ranking-row').filter({ hasText: 'Ada' })
  await expect(row).toBeVisible()
  await expect(row.locator('img')).toHaveCount(0)
})

// --- Results ---

const RESULTS_WAR_ID = 'war-results-1'

test('The detail page shows results with rank, image, wins, appearances, and a win-share bar', async ({ page }) => {
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
  // Testid-scoped, not whole-row `toContainText`: '10' and '12' both being
  // digits in the row would let Wins and Appearances pass transposed.
  const firstRow = rows.nth(0)
  await expect(firstRow.getByTestId('ranking-rank')).toHaveText('1')
  await expect(firstRow.locator('.results-name')).toHaveText('Contestant One')
  await expect(firstRow.getByTestId('ranking-wins')).toHaveText('10')
  await expect(firstRow.getByTestId('ranking-appearances')).toHaveText('12')
  // The Image column (spec): c1's media is `c1-media-0` with 400/1600
  // variants (src/mocks/fixtures.ts's buildMediaItem default). The image
  // itself is decorative (alt=""); the carousel group it sits in carries
  // the accessible name instead.
  const image = rows.nth(0).locator('img')
  await expect(image).toHaveAttribute('src', /c1-media-0\/400\.jpg/)
  await expect(image).toHaveAttribute('srcset', /1600w/)
  await expect(rows.nth(0).getByRole('group')).toHaveAttribute('aria-label', /Contestant One/)
  // Win share is a bar sized to raw wins relative to the leader's — never
  // wins over appearances (§7 rejects that as a display value) — and is
  // never rendered as text.
  await expect(rows.nth(0).locator('.win-bar-fill')).toHaveAttribute('style', /width:\s*100%/)
  await expect(rows.nth(1).locator('.win-bar-fill')).toHaveAttribute('style', /width:\s*80%/)
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
  // Testid-scoped: `toContainText('2')` on the whole row is satisfied by any
  // digit anywhere in it and cannot actually distinguish rank from wins.
  await expect(rows.nth(0).getByTestId('ranking-rank')).toHaveText('2')
  await expect(rows.nth(1)).toContainText('Contestant A')
  await expect(rows.nth(1).getByTestId('ranking-rank')).toHaveText('1')
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
  await expect(rows.nth(1).getByTestId('ranking-rank')).toHaveText('—')
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
  await expect(rows.nth(0).getByTestId('ranking-wins')).toHaveText('5')

  // Act — the second poll (the failing one)
  await page.clock.fastForward(30_000)

  // Assert — the wins column still reflects the first, successfully loaded
  // response; no error state has replaced the table.
  await expect(rows.nth(0).getByTestId('ranking-wins')).toHaveText('5')
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Act — a third poll, still on the same 30s schedule, that succeeds
  await page.clock.fastForward(30_000)

  // Assert — polling was never stopped by the failure in between
  await expect(rows.nth(0).getByTestId('ranking-wins')).toHaveText('9')
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
  await expect(rows.nth(0).getByTestId('ranking-wins')).toHaveText('5')
  // The failed poll — the "whose last poll failed" precondition
  await page.clock.fastForward(30_000)
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Act — the next poll succeeds
  await page.clock.fastForward(30_000)

  // Assert
  await expect(rows.nth(0).getByTestId('ranking-wins')).toHaveText('9')
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

test("A War's creator sees Edit and Delete on its results page while it's a draft", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-own-draft', status: 'draft', is_owner: true })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-own-draft`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-own-draft')

  // Assert
  await expect(page.getByTestId('war-detail-edit-link')).toBeVisible()
  await expect(page.getByTestId('war-detail-delete-button')).toBeVisible()
})

test('A non-creator sees no Edit or Delete on a draft War\'s results page', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-other-draft', status: 'draft', is_owner: false })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-other-draft`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-other-draft')

  // Assert
  await expect(page.getByTestId('war-detail-edit-link')).toHaveCount(0)
  await expect(page.getByTestId('war-detail-delete-button')).toHaveCount(0)
})

test('Delete from the results page asks for confirmation before removing the War', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-own-draft', status: 'draft', is_owner: true })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-own-draft`, responses: [{ status: 200, body: detail }] }])
  await page.goto('/wars/war-own-draft')

  // Act
  await page.getByTestId('war-detail-delete-button').click()

  // Assert
  await expect(page.getByTestId('war-detail-delete-confirm')).toBeVisible()
  const deleteCalls = (await getCallLog(page)).filter((entry) => entry.method === 'DELETE')
  expect(deleteCalls).toHaveLength(0)
})

test('Confirming delete removes the War and returns to My Wars', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-own-draft', status: 'draft', is_owner: true })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-own-draft`, responses: [{ status: 200, body: detail }] },
    { method: 'DELETE', path: `${API}/wars/war-own-draft`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars?creator=me`, responses: [{ status: 200, body: { wars: [] } }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/war-own-draft')
  await page.getByTestId('war-detail-delete-button').click()

  // Act
  await page.getByTestId('war-detail-delete-confirm-submit').click()

  // Assert
  await expect(page).toHaveURL('/my-wars')
  const deleteCalls = (await getCallLog(page)).filter((entry) => entry.method === 'DELETE')
  expect(deleteCalls).toHaveLength(1)
})

test('Cancelling delete leaves the War untouched', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-own-draft', status: 'draft', is_owner: true })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-own-draft`, responses: [{ status: 200, body: detail }] }])
  await page.goto('/wars/war-own-draft')
  await page.getByTestId('war-detail-delete-button').click()

  // Act
  await page.getByTestId('war-detail-delete-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('war-detail-delete-confirm')).toHaveCount(0)
  await expect(page).toHaveURL('/wars/war-own-draft')
  const deleteCalls = (await getCallLog(page)).filter((entry) => entry.method === 'DELETE')
  expect(deleteCalls).toHaveLength(0)
})

test("An authenticated voter who hasn't finished voting sees a Vote entry point", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-partial', status: 'active', is_owner: false })
  const rankings = buildRankingsResponse({ war_id: 'war-partial' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-partial`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-partial/rankings`, responses: [{ status: 200, body: rankings }] },
    { method: 'GET', path: `${API}/wars/war-partial/my-progress`, responses: [{ status: 200, body: { voted: 1, total: 3 } }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/wars/war-partial')

  // Assert
  await expect(page.getByTestId('war-detail-vote-link')).toBeVisible()
})

test('A voter who has finished voting sees no Vote entry point', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-complete', status: 'active', is_owner: false })
  const rankings = buildRankingsResponse({ war_id: 'war-complete' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-complete`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-complete/rankings`, responses: [{ status: 200, body: rankings }] },
    { method: 'GET', path: `${API}/wars/war-complete/my-progress`, responses: [{ status: 200, body: { voted: 3, total: 3 } }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/war-complete')
  await waitForCallLog(page, (log) => log.some((entry) => entry.url.includes('/my-progress')))

  // Assert
  await expect(page.getByTestId('war-detail-vote-link')).toHaveCount(0)
})

test("A creator sees Export on their own War's results page regardless of status", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-own-closed', status: 'closed', is_owner: true })
  const rankings = buildRankingsResponse({ war_id: 'war-own-closed' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-own-closed`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-own-closed/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-own-closed')

  // Assert
  await expect(page.getByTestId('war-detail-export-button')).toBeVisible()
})

test('Clicking Export downloads a zip of the War definition', async ({ page }) => {
  // Arrange
  const media = buildMediaItem({ id: 'm-1', variants: [{ width: 400, url: 'https://cdn.example.test/m-1/400.jpg' }] })
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', media: [media] })
  const detail = buildWarDetail({ id: 'war-export', status: 'draft', is_owner: true, contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-export`, responses: [{ status: 200, body: detail }] }])
  await page.route('https://cdn.example.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake-image-bytes') }),
  )
  await page.goto('/wars/war-export')

  // Act
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('war-detail-export-button').click()])

  // Assert
  expect(download.suggestedFilename()).toBe('war-war-export.zip')
})

test('A non-creator sees no Export button', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-other', status: 'active', is_owner: false })
  const rankings = buildRankingsResponse({ war_id: 'war-other' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-other`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-other/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-other')

  // Assert
  await expect(page.getByTestId('war-detail-export-button')).toHaveCount(0)
})

test('An anonymous visitor sees no Vote entry point', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: 'war-anon', status: 'active', is_owner: false })
  const rankings = buildRankingsResponse({ war_id: 'war-anon' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/war-anon`, responses: [{ status: 200, body: detail }] },
    { method: 'GET', path: `${API}/wars/war-anon/rankings`, responses: [{ status: 200, body: rankings }] },
  ])

  // Act
  await page.goto('/wars/war-anon')

  // Assert
  await expect(page.getByTestId('war-detail-vote-link')).toHaveCount(0)
})
