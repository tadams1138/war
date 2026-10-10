// Steps for features/browse-wars.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { WarSummary } from '../../../src/api/client'
import { buildWarSummary } from '../../../src/mocks/fixtures'
import { test, type World } from './fixtures'
import { API, getCallLog, hasQuery, waitForCallLog } from '../support/mocking'
import { backgroundOf, controlNamed, themedButtonBackground, warCard } from '../support/pages'
import { queueListedWars } from '../support/recipes'

const { Given, When, Then } = createBdd(test, { tags: '@browse-wars' })

const PAGE_SIZE = 10
const SECOND_PAGE_WARS = 1
const defaultWars = [{ title: 'Miss Universe 2026', category: 'Pageant' }, { title: '2026 Senate Race', category: 'Politics' }]

const titlesOnPage = (pageNumber: number) =>
  Array.from({ length: pageNumber === 1 ? PAGE_SIZE : SECOND_PAGE_WARS }, (_, i) => `Page ${pageNumber} War ${i + 1}`)

const warRequests = async (page: Page) => (await getCallLog(page)).filter((entry) => new URL(entry.url).pathname === `${API}/wars`)
const wasRequestedWith = (page: Page, query: string) => waitForCallLog(page, (log) => log.some((entry) => hasQuery(entry, `${API}/wars`, query)))
const card = (page: Page) => page.getByTestId('war-card')
const entryLink = (cardLocator: ReturnType<typeof card>, name: string) => cardLocator.getByTestId(`war-${name.toLowerCase()}-link`)

Given('published public Wars exist', async ({ world }) => {
  // Arrange
  queueListedWars(world, defaultWars)
})

Given('no published public Wars exist', async ({ world }) => {
  // Arrange
  queueListedWars(world, [])
})

Given('a published public War titled {string} exists', async ({ world }, title: string) => {
  // Arrange
  queueListedWars(world, [{ title }])
})

Given('a published public War created by a voter named {string}', async ({ world }, name: string) => {
  // Arrange
  queueListedWars(world, [{ creator_name: name }])
})

Given('a published public War with no known creator name', async ({ world }) => {
  // Arrange
  queueListedWars(world, [{ creator_name: null }])
})

// Two pages: a full first page, then a last page with one War. The list call
// answers in call order, so the second call is the Next page.
function listTwoPages(world: World): void {
  const summaries = (titles: string[]): WarSummary[] => titles.map((title) => buildWarSummary({ id: world.nextWarId(), title }))
  const [first, second] = [summaries(titlesOnPage(1)), summaries(titlesOnPage(2))]
  world.queue({
    method: 'GET',
    path: `${API}/wars`,
    responses: [
      { status: 200, body: { wars: first, next_cursor: 'cursor-1' } },
      { status: 200, body: { wars: second, next_cursor: null } },
    ],
  })
}

Given('more published public Wars exist than fit on one page', async ({ world }) => {
  // Arrange
  listTwoPages(world)
})

When("they select the {string} card's {string} link", async ({ page }, title: string, link: string) => {
  // Act
  await warCard(page, title).getByRole('link', { name: link, exact: true }).click()
})

When('they type {string} into the search box', async ({ page }, text: string) => {
  // Act
  await page.getByTestId('war-search-input').fill(text)
})

const label = (count: number) => `${count} ${count === 1 ? 'contestant' : 'contestants'}`

Then('a War card is shown for each War, with its title, category and contestant count', async ({ page, world }) => {
  // Assert
  await expect(card(page)).toHaveCount(world.listedWars.length)
  for (const war of world.listedWars) {
    const warsCard = warCard(page, war.title ?? '')
    await expect(warsCard).toContainText(war.category ?? '')
    await expect(warsCard.getByText(label(war.contestant_count), { exact: true })).toBeVisible()
  }
})

Then('no {string} call to action or {string} heading is shown', async ({ page }, action: string, heading: string) => {
  // Assert
  await expect(card(page).first()).toBeVisible()
  await expect(controlNamed(page, new RegExp(action, 'i'))).toHaveCount(0)
  await expect(page.getByRole('heading', { name: heading, exact: true })).toHaveCount(0)
})

Then('no link to create a War is displayed', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('empty-state')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start a War' })).toHaveCount(0)
})

Then('the {string} card shows a {string} link and a {string} link', async ({ page }, title: string, first: string, second: string) => {
  // Assert
  for (const name of [first, second]) await expect(entryLink(warCard(page, title), name)).toHaveText(name)
})

Then('the {string} card shows no status badge', async ({ page }, title: string) => {
  // Assert
  await expect(warCard(page, title).getByTestId('war-status-badge')).toHaveCount(0)
})

Then('the {string} card does not show the word {string}', async ({ page }, title: string, word: string) => {
  // Assert
  await expect(warCard(page, title)).not.toContainText(word, { ignoreCase: true })
})

Then("the War card shows the creator's name {string}", async ({ page }, name: string) => {
  // Assert
  await expect(card(page).getByTestId('war-creator-name')).toHaveText(name)
})

Then('the War card shows no creator name', async ({ page }) => {
  // Assert
  await expect(card(page)).toHaveCount(1)
  await expect(card(page).getByTestId('war-creator-name')).toHaveCount(0)
})

Then('Wars are requested sorted {string} first', async ({ page }, sort: string) => {
  // Assert
  await wasRequestedWith(page, `sort=${sort}`)
})

Then('no Wars are requested matching {string} yet', async ({ page }, text: string) => {
  // Assert
  expect((await warRequests(page)).filter((entry) => hasQuery(entry, `${API}/wars`, `q=${text}`))).toHaveLength(0)
})

Then('Wars are requested matching {string} once typing settles', async ({ page }, text: string) => {
  // Assert
  await wasRequestedWith(page, `q=${text}`)
})

Then('Wars are requested {int} per page', async ({ page }, size: number) => {
  // Assert
  await wasRequestedWith(page, `limit=${size}`)
})

Then('Wars have been requested {int} times in all', async ({ page }, count: number) => {
  // Assert
  await expect.poll(async () => (await warRequests(page)).length).toBe(count)
})

Then("the first page's Wars are shown", async ({ page }) => {
  // Assert
  await expect(card(page)).toHaveCount(PAGE_SIZE)
  await expect(card(page)).toContainText(titlesOnPage(1))
})

Then("the second page's Wars are shown", async ({ page }) => {
  // Assert
  await expect(card(page)).toHaveCount(SECOND_PAGE_WARS)
  await expect(card(page)).toContainText(titlesOnPage(2))
})

Then('the {string} button is disabled', async ({ page }, name: string) => {
  // Assert
  await expect(page.getByRole('button', { name, exact: true })).toBeDisabled()
})

Then('the page has the level-one heading {string} above the War cards', async ({ page }, name: string) => {
  // Assert
  const heading = page.getByRole('heading', { level: 1, name, exact: true })
  await expect(heading).toHaveCount(1)
  const firstCard = await card(page).first().elementHandle()
  expect(await heading.evaluate((element, other) => Boolean(element.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), firstCard)).toBe(true)
})

Then('each War card title is a level-two heading', async ({ page, world }) => {
  // Assert
  for (const war of world.listedWars) await expect(page.getByRole('heading', { level: 2, name: war.title ?? '' })).toBeVisible()
})

Then("the {string} card's Vote and Results actions sit side by side", async ({ page }, title: string) => {
  // Assert
  const [vote, results] = [await entryLink(warCard(page, title), 'Vote').boundingBox(), await entryLink(warCard(page, title), 'Results').boundingBox()]
  expect(vote).not.toBeNull()
  expect(results).not.toBeNull()
  expect(results!.x).toBeGreaterThan(vote!.x)
  expect(Math.abs(vote!.y - results!.y)).toBeLessThan(5)
})

Then("the {string} card's Vote and Results actions use the same themed button styling", async ({ page }, title: string) => {
  // Assert
  const themed = await themedButtonBackground(page)
  for (const name of ['Vote', 'Results']) expect(await backgroundOf(entryLink(warCard(page, title), name))).toBe(themed)
})
