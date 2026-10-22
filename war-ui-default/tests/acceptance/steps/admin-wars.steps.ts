// Steps for features/admin-wars.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
//
// A War given here is a War the Moderators see, numbered like every other War
// (war-1, war-2, ...; "that War" is the latest). It is queued with its
// detail, and listed to Moderators.
import { expect } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { test, type World } from './fixtures'
import { filteredListRecipes, pagedListRecipe, queueGet } from '../support/adminFixtures'
import { API } from '../support/mocking'
import { expectTextOrNone } from '../support/pages'
import { addAdminWar, type AdminWarRecord } from '../support/adminRecords'

const { Given, Then } = createBdd(test, { tags: '@admin-wars' })

// --- Arrange ---------------------------------------------------------------

// The API filters as the Wars list is filtered: by status (a removed War only
// under "removed") and by the words of a title or a creator's name.
const hasStatus = (status: string) => (war: AdminWarRecord) => war.removed_at === null && war.status === status
const FILTERS = {
  statuses: { draft: hasStatus('draft'), published: hasStatus('published'), closed: hasStatus('closed'), removed: (war: AdminWarRecord) => war.removed_at !== null },
  text: (war: AdminWarRecord) => `${war.title ?? ''} ${war.creator_name}`,
}

// The queue holds the listed Wars that have unaddressed reports.
function queueListed(world: World, wars: AdminWarRecord[], pageSize = wars.length): void {
  const waiting = wars.filter((war) => war.unaddressed_report_count > 0)
  world.queue(
    pagedListRecipe('/admin/wars', 'wars', wars, pageSize),
    ...filteredListRecipes('/admin/wars', 'wars', wars, FILTERS),
    queueGet(waiting.map((war) => ({ war_id: war.id, title: war.title, unaddressed_count: war.unaddressed_report_count }))),
  )
}

Given('the API lists these Wars to Moderators:', async ({ world }, table: DataTable) => {
  // Arrange
  queueListed(world, table.hashes().map((row) => addAdminWar(world, row)))
})

Given('the API lists these Wars to Moderators, {int} per page:', async ({ world }, size: number, table: DataTable) => {
  // Arrange
  queueListed(world, table.hashes().map((row) => addAdminWar(world, row)), size)
})

// Joins the Wars list, as a War of its own.
Given('the API lists a published War titled {string} to Moderators', async ({ world }, title: string) => {
  // Arrange
  const war = addAdminWar(world, { title })
  const list = world.recipes.find((recipe) => recipe.path === `${API}/admin/wars` && !recipe.query)
  if (list) (list.responses[0]!.body as { wars: AdminWarRecord[] }).wars.push(war)
  else world.queue(pagedListRecipe('/admin/wars', 'wars', [war]))
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
