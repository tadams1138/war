// Steps for features/admin-wars.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
//
// A War given here is a Staff-visible War, numbered like every other War
// (war-1, war-2, ...; "that War" is the latest). It is queued with its Staff
// detail and its (empty) reports, and listed to Staff. Later Givens edit what
// was queued in place, so give them before the app boots.
import { expect } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { test, type World } from './fixtures'
import { adminWarDetail, filteredListRecipes, pagedListRecipe, queueGet, report, reportPatch } from '../support/adminFixtures'
import { API, getCallLog } from '../support/mocking'
import { expectTextOrNone } from '../support/pages'
import { addStaffWar, detailRecipe, recipeFor, type StaffWar } from '../support/staffRecords'

const { Given, Then } = createBdd(test, { tags: '@admin-wars' })

type StaffWarDetail = ReturnType<typeof adminWarDetail>
type WarReport = ReturnType<typeof report>

// --- Arrange ---------------------------------------------------------------

const detailOf = (world: World) => detailRecipe(world, 'war').responses[0]!.body as StaffWarDetail
const reportsOf = (world: World) => (recipeFor(world, `/wars/${world.warId}/reports`).responses[0]!.body as { reports: WarReport[] }).reports

// The API filters as the Staff list is filtered: by status (a removed War only
// under "removed") and by the words of a title or a creator's name.
const hasStatus = (status: string) => (war: StaffWar) => war.removed_at === null && war.status === status
const FILTERS = {
  statuses: { draft: hasStatus('draft'), published: hasStatus('published'), closed: hasStatus('closed'), removed: (war: StaffWar) => war.removed_at !== null },
  text: (war: StaffWar) => `${war.title ?? ''} ${war.creator_name}`,
}

// The queue holds the listed Wars that have unaddressed reports.
function queueListed(world: World, wars: StaffWar[], pageSize = wars.length): void {
  const waiting = wars.filter((war) => war.unaddressed_report_count > 0)
  world.queue(
    pagedListRecipe('/admin/wars', 'wars', wars, pageSize),
    ...filteredListRecipes('/admin/wars', 'wars', wars, FILTERS),
    queueGet(waiting.map((war) => ({ war_id: war.id, title: war.title, unaddressed_count: war.unaddressed_report_count }))),
  )
}

Given('the API lists these Wars to Staff:', async ({ world }, table: DataTable) => {
  // Arrange
  queueListed(world, table.hashes().map((row) => addStaffWar(world, row)))
})

Given('the API lists these Wars to Staff, {int} per page:', async ({ world }, size: number, table: DataTable) => {
  // Arrange
  queueListed(world, table.hashes().map((row) => addStaffWar(world, row)), size)
})

// Joins the Wars list, as a War of its own.
Given(/^a (published|removed) War(?: titled "([^"]*)")?$/, async ({ world }, state: string, title?: string) => {
  // Arrange
  const war = addStaffWar(world, { title: title ?? 'Alpha War', removed: state === 'removed' ? 'yes' : '' })
  const list = world.recipes.find((recipe) => recipe.path === `${API}/admin/wars` && !recipe.query)
  if (list) (list.responses[0]!.body as { wars: StaffWar[] }).wars.push(war)
  else world.queue(pagedListRecipe('/admin/wars', 'wars', [war]))
})

Given('that War has these contestants:', async ({ world }, table: DataTable) => {
  // Arrange
  detailOf(world).contestants = table.hashes().map((row, index) => ({
    id: `contestant-${index + 1}`,
    name: row.name,
    win_count: Number(row.wins),
    appearance_count: Number(row.appearances),
  }))
})

function giveReports(world: World, rows: Record<string, string>[]): void {
  const reports = rows.map((row, index) =>
    report(`report-${world.warId}-${index + 1}`, world.warId, { explanation: row.explanation, addressed: row.state === 'addressed' }),
  )
  reportsOf(world).splice(0, Infinity, ...reports)
}

Given('that War has these reports:', async ({ world }, table: DataTable) => {
  // Arrange
  giveReports(world, table.hashes())
})

Given('that War has an unaddressed report', async ({ world }) => {
  // Arrange
  giveReports(world, [{ explanation: 'Spam in the bio', state: 'unaddressed' }])
})

function answerReportChanges(world: World, status: number): void {
  world.queue(...reportsOf(world).map((given) => reportPatch(given.id, status)))
}

Given("the API accepts changes to that War's reports", async ({ world }) => {
  // Arrange
  answerReportChanges(world, 200)
})

Given("changing that War's reports fails with a server error", async ({ world }) => {
  // Arrange
  answerReportChanges(world, 500)
})

Given("changing that War's reports finds no such report", async ({ world }) => {
  // Arrange
  answerReportChanges(world, 404)
})

Given('no reports are waiting', async ({ world }) => {
  // Arrange
  world.queue(queueGet([]))
})

// --- Assert ----------------------------------------------------------------

Then('the Wars list shows these Wars, in order:', async ({ page }, table: DataTable) => {
  // Assert
  const expected = table.hashes()
  const rows = page.getByTestId('admin-war-row')
  await expect(rows).toHaveCount(expected.length)
  for (const [index, war] of expected.entries()) {
    const row = rows.nth(index)
    await expect(row.getByRole('link')).toHaveText(war.title)
    await expect(row).toContainText(`· ${war.status}`)
    await expect(row).toContainText(`· ${war.creator}`)
    await expectTextOrNone(row.getByTestId('admin-war-report-badge'), war['report badge']!)
    await expectTextOrNone(row.getByTestId('admin-war-removed'), war.marker!)
  }
})

Then('its contestants are shown with their standings', async ({ page, world }) => {
  // Assert
  const expected = detailOf(world).contestants
  const rows = page.getByTestId('admin-contestant-row')
  await expect(rows).toHaveCount(expected.length)
  for (const [index, contestant] of expected.entries()) {
    await expect(rows.nth(index)).toContainText(contestant.name)
    await expect(rows.nth(index)).toContainText(`· ${contestant.win_count} wins · ${contestant.appearance_count} appearances`)
  }
})

Then('its reports are shown with their explanation and addressed state', async ({ page, world }) => {
  // Assert
  const expected = reportsOf(world)
  const rows = page.getByTestId('admin-report-row')
  await expect(rows).toHaveCount(expected.length)
  for (const [index, given] of expected.entries()) {
    await expect(rows.nth(index)).toContainText(given.explanation)
    await expect(rows.nth(index).locator('strong')).toHaveText(given.addressed ? 'Addressed' : 'Unaddressed')
  }
})

Then(/^the report is shown as (addressed|unaddressed)$/, async ({ page }, state: string) => {
  // Assert
  await expect(page.getByTestId('admin-report-row').locator('strong')).toHaveText(state === 'addressed' ? 'Addressed' : 'Unaddressed')
})

// The latest change the API was asked for.
Then(/^the API has been asked to mark the report (addressed|unaddressed)$/, async ({ page, world }, state: string) => {
  // Assert
  const asked = async () => {
    const latest = (await getCallLog(page)).filter((entry) => entry.method === 'PATCH').pop()
    return latest && { path: new URL(latest.url).pathname, body: JSON.parse(latest.body ?? '{}') }
  }
  await expect.poll(asked).toEqual({ path: `${API}/reports/${reportsOf(world)[0]!.id}`, body: { addressed: state === 'addressed' } })
})

Then(/^the War is (not )?shown as Removed$/, async ({ page }, not?: string) => {
  // Assert
  await expectTextOrNone(page.getByTestId('admin-war-removed'), not ? '' : 'Removed')
})

Then('the unaddressed reports queue lists:', async ({ page }, table: DataTable) => {
  // Assert
  const expected = table.hashes()
  const entries = page.getByTestId('unaddressed-queue-entry')
  await expect(entries).toHaveCount(expected.length)
  for (const [index, war] of expected.entries()) {
    await expect(entries.nth(index).getByRole('link')).toHaveText(war.title)
    await expect(entries.nth(index).locator('.badge')).toHaveText(war['unaddressed reports']!)
  }
})

Then('the unaddressed reports queue says nothing is waiting', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('unaddressed-queue-empty')).toContainText('No reports are waiting')
  await expect(page.getByTestId('unaddressed-queue-entry')).toHaveCount(0)
})
