// Binds features/browse-wars.feature.
import { expect, test } from '@playwright/test'
import { buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, useScenario, waitForCallLog } from './support/mocking'

test('Anonymous user browses public Wars', async ({ page }) => {
  // Arrange — contestant_count 1 on the second War also covers the
  // singular label ("1 contestant", not "1 contestants").
  const wars = [
    buildWarSummary({ id: 'war-1', title: 'Miss Universe 2026', category: 'Pageant', contestant_count: 12 }),
    buildWarSummary({ id: 'war-2', title: '2026 Senate Race', category: 'Politics', contestant_count: 1 }),
  ]
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars, next_cursor: null } }] }])

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
  await expect(page.getByTestId('login-cta')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'War', exact: true })).toHaveCount(0)
})

test('Authenticated user browses public Wars', async ({ page }) => {
  // Arrange
  const wars = [
    buildWarSummary({ id: 'war-1', title: 'Miss Universe 2026', category: 'Pageant', contestant_count: 12 }),
  ]
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars, next_cursor: null } }] }])
  await page.goto('/')

  // Act — Home is already mounted; logging in updates the same page
  // reactively (no reload — a real sign-in never reloads Home either,
  // since JWT storage is a JS variable) rather than reloading it,
  // which would wipe the in-memory JWT loginAsTestVoter just set.
  await loginAsTestVoter(page)

  // Assert — features/browse-wars.feature: "a War card is displayed for
  // each War, showing its title, category, and contestant count"
  const card = page.getByTestId('war-card')
  await expect(card).toContainText('Pageant')
  await expect(card).toContainText('12 contestants')
  await expect(page.getByTestId('login-cta')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'War', exact: true })).toHaveCount(0)
})

test('No published Wars for an anonymous visitor', async ({ page }) => {
  // Arrange
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [], next_cursor: null } }] }])

  // Act
  await page.goto('/')

  // Assert
  await expect(page.getByTestId('empty-state')).toBeVisible()
  await expect(page.getByTestId('home-create-war-cta')).toHaveCount(0)
})

test('No published Wars for an authenticated voter', async ({ page }) => {
  // Arrange
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [], next_cursor: null } }] }])
  await page.goto('/')

  // Act
  await loginAsTestVoter(page)

  // Assert
  await expect(page.getByTestId('empty-state')).toBeVisible()
  await expect(page.getByTestId('home-create-war-cta')).toBeVisible()
})

test('A War card offers direct Vote and Results entry points, not a status label', async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-miss-universe', title: 'Miss Universe 2026', status: 'published' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war], next_cursor: null } }] }])
  await page.goto('/')

  // Act
  await loginAsTestVoter(page)

  // Assert
  const card = page.getByTestId('war-card').filter({ hasText: 'Miss Universe 2026' })
  await expect(card.getByTestId('war-vote-link')).toBeVisible()
  await expect(card.getByTestId('war-results-link')).toBeVisible()
  await expect(card.getByTestId('war-status-badge')).toHaveCount(0)
  await expect(card).not.toContainText('published')
})

test("A War card's Vote and Results actions lay out horizontally with consistent themed button styling", async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-miss-universe', title: 'Miss Universe 2026', status: 'published' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war], next_cursor: null } }] }])
  await page.goto('/')

  // Act
  await loginAsTestVoter(page)

  // Assert — a horizontal row, not stacked.
  const card = page.getByTestId('war-card').filter({ hasText: 'Miss Universe 2026' })
  const voteBox = await card.getByTestId('war-vote-link').boundingBox()
  const resultsBox = await card.getByTestId('war-results-link').boundingBox()
  expect(voteBox).not.toBeNull()
  expect(resultsBox).not.toBeNull()
  expect(resultsBox!.x).toBeGreaterThan(voteBox!.x)
  expect(Math.abs(voteBox!.y - resultsBox!.y)).toBeLessThan(5)

  // Assert — both share the same themed button background rather than
  // rendering as plain unstyled links.
  const voteBg = await card.getByTestId('war-vote-link').evaluate((el) => getComputedStyle(el).backgroundColor)
  const resultsBg = await card.getByTestId('war-results-link').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(voteBg).toBe(resultsBg)
  expect(voteBg).not.toBe('rgba(0, 0, 0, 0)')
})

test("A War card's Results link opens its detail page", async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-miss-universe', title: 'Miss Universe 2026', category: 'Pageant' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war], next_cursor: null } }] },
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
  await page.getByTestId('war-card').filter({ hasText: 'Miss Universe 2026' }).getByTestId('war-results-link').click()

  // Assert
  await expect(page).toHaveURL(/\/wars\/war-miss-universe$/)
  await expect(page.getByRole('heading', { name: 'Miss Universe 2026' })).toBeVisible()
})

test('An anonymous visitor tapping Vote is redirected to sign in', async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-miss-universe', title: 'Miss Universe 2026' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war], next_cursor: null } }] }])
  await page.goto('/')

  // Act
  await page.getByTestId('war-card').filter({ hasText: 'Miss Universe 2026' }).getByTestId('war-vote-link').click()

  // Assert
  await expect(page).toHaveURL(/\/login/)
})

test("A War card shows its creator's name when known", async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-1', title: 'Miss Universe 2026', creator_name: 'Ada Lovelace' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war], next_cursor: null } }] },
  ])

  // Act
  await page.goto('/')

  // Assert
  await expect(page.getByTestId('war-card').getByTestId('war-creator-name')).toHaveText('Ada Lovelace')
})

test("A War card shows nothing extra when the creator's name is unknown", async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-1', title: 'Miss Universe 2026', creator_name: null })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war], next_cursor: null } }] },
  ])

  // Act
  await page.goto('/')

  // Assert
  await expect(page.getByTestId('war-card').getByTestId('war-creator-name')).toHaveCount(0)
})

test('Home renders a sort menu and a search box', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [], next_cursor: null } }] },
  ])

  // Act
  await page.goto('/')

  // Assert
  await expect(page.getByTestId('war-sort-select')).toHaveValue('newest')
  await expect(page.getByTestId('war-search-input')).toBeVisible()
})

test('Requests 10 Wars per page', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [], next_cursor: null } }] },
  ])

  // Act
  await page.goto('/')

  // Assert
  const calls = await waitForCallLog(page, (log) => log.some((entry) => entry.url.includes('/wars')))
  const call = calls.find((entry) => entry.url.includes('/wars'))
  expect(new URL(call!.url).searchParams.get('limit')).toBe('10')
})

test('Selecting a different sort re-fetches Wars with the new sort param', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [], next_cursor: null } }] },
  ])
  await page.goto('/')

  // Act
  await page.getByTestId('war-sort-select').selectOption('oldest')

  // Assert
  const calls = await waitForCallLog(page, (log) =>
    log.some((entry) => entry.url.includes('/wars') && new URL(entry.url).searchParams.get('sort') === 'oldest'),
  )
  expect(calls.some((entry) => new URL(entry.url).searchParams.get('sort') === 'oldest')).toBe(true)
})

test('Typing in the search box re-fetches Wars with the q param, after a debounce', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [], next_cursor: null } }] },
  ])
  await page.goto('/')
  const initialCalls = await waitForCallLog(page, (log) => log.some((entry) => entry.url.includes('/wars')))
  const callsBeforeTyping = initialCalls.filter((entry) => entry.url.includes('/wars')).length

  // Act
  await page.getByTestId('war-search-input').fill('pastry')

  // Assert — not fetched on every keystroke
  const callsRightAfterTyping = (await getCallLog(page)).filter((entry) => entry.url.includes('/wars')).length
  expect(callsRightAfterTyping).toBe(callsBeforeTyping)

  // Assert — fetched with q once the debounce settles
  await waitForCallLog(page, (log) =>
    log.some((entry) => entry.url.includes('/wars') && new URL(entry.url).searchParams.get('q') === 'pastry'),
  )
})

test('Next and Prev page through results — Prev re-shows the cached page with no new request', async ({ page }) => {
  // Arrange
  const pageOne = [buildWarSummary({ id: 'war-page-1', title: 'Page One War' })]
  const pageTwo = [buildWarSummary({ id: 'war-page-2', title: 'Page Two War' })]
  await useScenario(page, [
    {
      method: 'GET',
      path: `${API}/wars`,
      responses: [
        { status: 200, body: { wars: pageOne, next_cursor: 'cursor-1' } },
        { status: 200, body: { wars: pageTwo, next_cursor: null } },
      ],
    },
  ])
  await page.goto('/')
  await expect(page.getByTestId('war-card').filter({ hasText: 'Page One War' })).toBeVisible()
  await expect(page.getByTestId('war-prev-button')).toBeDisabled()

  // Act — Next
  await page.getByTestId('war-next-button').click()

  // Assert
  await expect(page.getByTestId('war-card').filter({ hasText: 'Page Two War' })).toBeVisible()
  await expect(page.getByTestId('war-next-button')).toBeDisabled()
  const callsAfterNext = (await getCallLog(page)).filter((entry) => entry.url.includes('/wars')).length

  // Act — Prev
  await page.getByTestId('war-prev-button').click()

  // Assert — the first page reappears, no new request was made
  await expect(page.getByTestId('war-card').filter({ hasText: 'Page One War' })).toBeVisible()
  const callsAfterPrev = (await getCallLog(page)).filter((entry) => entry.url.includes('/wars')).length
  expect(callsAfterPrev).toBe(callsAfterNext)
})
