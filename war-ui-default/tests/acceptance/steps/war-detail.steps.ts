// Steps for features/war-detail.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
//
// A War and its contestants are given by shared steps (shared.steps.ts); the
// War's results list them (support/results.ts). A result is addressed by the
// contestant's name, as "the result of "Ada"" ({card}, {bio}).
import { expect, type Locator, type Page } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { test } from './fixtures'
import { contestantNamed, warDetail } from '../support/editWar'
import { API } from '../support/mocking'
import { boxOf, resultRow } from '../support/pages'
import { reply } from '../support/recipes'

const { Given, Then } = createBdd(test, { tags: '@war-detail' })

const results = (page: Page) => page.getByTestId('ranking-row')

// --- Arrange ---------------------------------------------------------------

Given('no War exists', async ({ world }) => {
  // Arrange
  world.queue(reply('GET', `${API}/wars/${world.nextWarId()}`, 404, { error: 'not found' }))
})

Given('the voter created that War', async ({ world }) => {
  // Arrange
  Object.assign(warDetail(world), { is_owner: true, can_manage: true })
})

// In place: the results hold the same images as the War's contestant.
Given('the images of {string} arrive out of display order', async ({ world }, name: string) => {
  // Arrange
  contestantNamed(warDetail(world), name).media.reverse()
})

// A response from before the field was removed: the app must never show it.
Given('the API still sends {string} a legacy attributes field', async ({ world }, name: string) => {
  // Arrange
  Object.assign(contestantNamed(warDetail(world), name), { attributes: [{ key: 'height', label: 'Height', type: 'number', value: 170 }] })
})

// --- Assert: the results ---------------------------------------------------

const COLUMNS: Record<string, (row: Locator, shown: string) => Promise<void>> = {
  rank: (row, shown) => expect(row.getByTestId('ranking-rank')).toHaveText(shown),
  name: (row, shown) => expect(row.locator('.results-name')).toHaveText(shown),
  wins: (row, shown) => expect(row.getByTestId('ranking-wins')).toHaveText(shown),
  appearances: (row, shown) => expect(row.getByTestId('ranking-appearances')).toHaveText(shown),
  // A bar sized to raw wins relative to the leader's, never shown as text.
  'win bar': (row, shown) => expect(row.locator('.win-bar-fill')).toHaveAttribute('style', new RegExp(`width:\\s*${shown}`)),
}

// One row per result, in the order shown, with the columns given.
Then('the results list shows, in order:', async ({ page }, table: DataTable) => {
  // Assert
  const expected = table.hashes()
  await expect(results(page)).toHaveCount(expected.length)
  for (const [index, row] of expected.entries()) {
    for (const [column, shown] of Object.entries(row)) await COLUMNS[column]!(results(page).nth(index), shown)
  }
})

const RESULTS_SHOWN = /^(each result|the result of "[^"]*") shows (an image|no image and no placeholder)$/

Then(RESULTS_SHOWN, async ({ page }, who: string, what: string) => {
  // Assert
  const named = /"(.*)"/.exec(who)
  if (!named) await expect(results(page).first()).toBeVisible()
  const rows = named ? [resultRow(page, named[1]!)] : await results(page).all()
  for (const row of rows) {
    if (what === 'an image') await expectImage(row)
    else await expectNoImage(row)
  }
})

// The image is decorative; the group it sits in carries the contestant's name.
async function expectImage(row: Locator): Promise<void> {
  await expect(row.locator('img')).toBeVisible()
  await expect(row.getByRole('group')).toHaveAttribute('aria-label', new RegExp((await row.locator('.results-name').textContent())!))
}

async function expectNoImage(row: Locator): Promise<void> {
  await expect(row).toBeVisible()
  await expect(row.locator('img')).toHaveCount(0)
  await expect(row.locator('.carousel-frame')).toHaveCount(0)
}

Then('no win percentage is displayed anywhere', async ({ page }) => {
  // Assert
  await expect(page.getByText(/%/)).toHaveCount(0)
})

Then('no attributes list is shown', async ({ page }) => {
  // Assert
  await expect(page.locator('dl')).toHaveCount(0)
  await expect(page.getByText('Height')).toHaveCount(0)
})

Then('no truncation control is offered', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('bio-more-toggle')).toHaveCount(0)
})

// A bio that executed would have set the flag; the page has rendered once its bio is shown.
Then('no script runs', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('contestant-bio')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined()
})

// --- Assert: layout --------------------------------------------------------

Then('the results list is capped in width and centered', async ({ page }) => {
  // Assert
  const list = await boxOf(page.getByTestId('rankings-list'))
  const leftGap = list.x
  const rightGap = page.viewportSize()!.width - (list.x + list.width)
  expect(list.width).toBeLessThanOrEqual(1440)
  expect(Math.abs(leftGap - rightGap)).toBeLessThan(2)
})

Then("each result's statistics render below its bio", async ({ page }) => {
  // Assert
  const row = results(page).first()
  const bio = await boxOf(row.getByTestId('contestant-bio'))
  expect((await boxOf(row.getByTestId('ranking-wins'))).y).toBeGreaterThanOrEqual(bio.y + bio.height)
})

// Beside: left of the bio, and near its top rather than pushed down a full row
// by a stacked poster (the bio sits below the name, so not exactly flush).
Then(/^each result's poster (renders beside|stacks above) its bio$/, async ({ page }, placement: string) => {
  // Assert
  const row = results(page).first()
  const poster = await boxOf(row.locator('.ranking-media'))
  const bio = await boxOf(row.getByTestId('contestant-bio'))
  if (placement === 'stacks above') return expect(poster.y + poster.height).toBeLessThanOrEqual(bio.y)
  expect(poster.x + poster.width).toBeLessThanOrEqual(bio.x)
  expect(Math.abs(poster.y - bio.y)).toBeLessThan(60)
})

// The rank badge overlaps its row's top edge by design, so the gap is measured
// from the category to the row itself.
Then('there is visible space between the category and the first result', async ({ page, world }) => {
  // Assert
  const category = await boxOf(page.getByText(warDetail(world).category!))
  const first = await boxOf(results(page).first())
  expect(first.y - (category.y + category.height)).toBeGreaterThan(16)
})

Then("each result's image is a large, prominent part of its card", async ({ page }) => {
  // Assert
  const row = await boxOf(results(page).first())
  const image = await boxOf(results(page).first().locator('img'))
  expect(image.width / row.width).toBeGreaterThan(0.9)
})
