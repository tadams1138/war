// Steps for features/moderate-war.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
//
// The Wars given here are Wars as a Moderator sees them on their detail page,
// numbered like every other War (war-1, ...; "that War" is the latest). Their
// reports are queued by the first Given that mentions them; later Givens edit
// what was queued in place, so give them before the app boots.
import { expect } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { buildWarDetail } from '../../../src/mocks/fixtures'
import { test, type World } from './fixtures'
import { REMOVED_AT, report, reportPatch, reportsGet } from '../support/adminFixtures'
import { API, getCallLog } from '../support/mocking'
import { expectTextOrNone } from '../support/pages'
import { ok } from '../support/recipes'

const { Given, Then } = createBdd(test, { tags: '@moderate-war' })

type WarReport = ReturnType<typeof report>

// --- Arrange ---------------------------------------------------------------

// A removed War is a published one whose detail says when it was removed; nobody
// manages it, whoever looks.
Given('a removed War', async ({ world }) => {
  // Arrange
  const id = world.nextWarId()
  world.queue(ok('GET', `${API}/wars/${id}`, buildWarDetail({ id, removed_at: REMOVED_AT, can_manage: false })))
})

// The reports the API answers for that War, queued empty the first time they are asked for.
function reportsOf(world: World): WarReport[] {
  const path = `${API}/wars/${world.warId}/reports`
  let recipe = world.recipes.find((candidate) => candidate.path === path)
  if (!recipe) {
    recipe = reportsGet(world.warId, [])
    world.queue(recipe)
  }
  return (recipe.responses[0]!.body as { reports: WarReport[] }).reports
}

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

// --- Assert ----------------------------------------------------------------

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
Then('the API has been asked to mark the report addressed', async ({ page, world }) => {
  // Assert
  const asked = async () => {
    const latest = (await getCallLog(page)).filter((entry) => entry.method === 'PATCH').pop()
    return latest && { path: new URL(latest.url).pathname, body: JSON.parse(latest.body ?? '{}') }
  }
  await expect.poll(asked).toEqual({ path: `${API}/reports/${reportsOf(world)[0]!.id}`, body: { addressed: true } })
})

Then(/^the War is (not )?shown as Removed$/, async ({ page }, not?: string) => {
  // Assert
  await expectTextOrNone(page.getByTestId('admin-war-removed'), not ? '' : 'Removed')
})
