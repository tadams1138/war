// Binds features/admin-wars.feature.
import { expect, test } from '@playwright/test'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from './support/mocking'
import { me, killSwitchGet, adminWar, adminWarsGet, quietLog, adminWarsCalls, adminWarDetail, adminWarDetailGet, report, reportsGet, reportPatch, removePost, removePosts, REMOVED_AT, queueGet } from './support/adminFixtures'

test('The Wars list shows Wars of every status with removed and report markers', async ({ page }) => {
  // Arrange
  const wars = [
    adminWar('w-draft', { title: 'Draft War', status: 'draft' }),
    adminWar('w-pub', { title: 'Published War', unaddressed_report_count: 3 }),
    adminWar('w-closed', { title: 'Closed War', status: 'closed' }),
    adminWar('w-gone', { title: 'Gone War', status: 'published', removed_at: '2026-10-02T12:00:00Z' }),
    adminWar('w-untitled', { title: null, status: 'draft' }),
  ]
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(false), quietLog, adminWarsGet({ wars, next_cursor: null })])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  const rows = page.getByTestId('admin-war-row')
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(0)).toContainText('Draft War')
  await expect(rows.nth(0)).toContainText('draft')
  await expect(rows.nth(0)).toContainText('Casey Creator')
  await expect(rows.nth(2)).toContainText('closed')
  await expect(rows.nth(1).getByTestId('admin-war-report-badge')).toHaveText('3')
  await expect(rows.nth(0).getByTestId('admin-war-report-badge')).toHaveCount(0)
  await expect(rows.nth(3).getByTestId('admin-war-removed')).toHaveText('Removed')
  await expect(rows.nth(0).getByTestId('admin-war-removed')).toHaveCount(0)
  await expect(rows.nth(4)).toContainText('Untitled War')
})

test('Filtering the Wars list by status', async ({ page }) => {
  // Arrange
  const all = [adminWar('w-1', { title: 'Alpha War' }), adminWar('w-2', { title: 'Beta War', removed_at: '2026-10-02T12:00:00Z' })]
  const removed = [all[1]]
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarsGet({ wars: all, next_cursor: null }, { wars: removed, next_cursor: null }),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await expect(page.getByTestId('admin-war-row')).toHaveCount(2)

  // Act
  await page.getByLabel('Status').selectOption('removed')

  // Assert
  await expect(page.getByTestId('admin-war-row')).toHaveCount(1)
  await expect(page.getByTestId('admin-war-row')).toContainText('Beta War')
  const calls = await adminWarsCalls(page)
  expect(new URL(calls[calls.length - 1].url).searchParams.get('status')).toBe('removed')
})

test('Searching the Wars list is debounced', async ({ page }) => {
  // Arrange
  const all = [adminWar('w-1', { title: 'Alpha War' }), adminWar('w-2', { title: 'Beta War' })]
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarsGet({ wars: all, next_cursor: null }, { wars: [all[1]], next_cursor: null }),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await expect(page.getByTestId('admin-war-row')).toHaveCount(2)

  // Act
  await page.getByLabel('Search').pressSequentially('beta')

  // Assert
  await expect(page.getByTestId('admin-war-row')).toHaveCount(1)
  const calls = (await adminWarsCalls(page)).filter((entry) => new URL(entry.url).searchParams.has('q'))
  expect(calls).toHaveLength(1)
  expect(new URL(calls[0].url).searchParams.get('q')).toBe('beta')
})

test('Load more appends the next page of Wars', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarsGet(
      { wars: [adminWar('w-1', { title: 'Alpha War' })], next_cursor: 'cursor-2' },
      { wars: [adminWar('w-2', { title: 'Beta War' })], next_cursor: null },
    ),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  const rows = page.getByTestId('admin-war-row')
  await expect(rows).toHaveCount(1)

  // Act
  await page.getByTestId('admin-wars-load-more').click()

  // Assert
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Alpha War')
  await expect(rows.nth(1)).toContainText('Beta War')
  await expect(page.getByTestId('admin-wars-load-more')).toHaveCount(0)
  const calls = await adminWarsCalls(page)
  expect(new URL(calls[calls.length - 1].url).searchParams.get('cursor')).toBe('cursor-2')
})

test('Opening a War shows its Staff detail with contestants and reports', async ({ page }) => {
  // Arrange
  const reports = [report('r-1', 'w-1'), report('r-2', 'w-1', { addressed: true })]
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarsGet({ wars: [adminWar('w-1', { title: 'Alpha War' })], next_cursor: null }),
    adminWarDetailGet('w-1', adminWarDetail('w-1', { title: 'Alpha War' })),
    reportsGet('w-1', reports),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')

  // Act
  await page.getByRole('link', { name: 'Alpha War' }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/wars\/w-1$/)
  await expect(page.getByRole('heading', { name: 'Alpha War' })).toBeVisible()
  const contestants = page.getByTestId('admin-contestant-row')
  await expect(contestants).toHaveCount(2)
  await expect(contestants.nth(0)).toContainText('Rocky')
  await expect(contestants.nth(0)).toContainText('7 wins')
  await expect(contestants.nth(0)).toContainText('10 appearances')
  const rows = page.getByTestId('admin-report-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Explanation r-1')
  await expect(rows.nth(0)).toContainText('Unaddressed')
  await expect(rows.nth(1)).toContainText('Addressed')
})

test('Marking a report addressed and unaddressed', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarDetailGet('w-1', adminWarDetail('w-1')),
    reportsGet('w-1', [report('r-1', 'w-1')]),
    reportPatch('r-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/wars/w-1')
  const row = page.getByTestId('admin-report-row')
  await expect(row).toContainText('Unaddressed')

  // Act
  await row.getByRole('button', { name: 'Mark addressed' }).click()

  // Assert
  await expect(row).toContainText('Addressed')
  await expect(row).not.toContainText('Unaddressed')
  const first = await waitForCallLog(page, (log) => log.some((entry) => entry.method === 'PATCH'))
  expect(JSON.parse(first.find((entry) => entry.method === 'PATCH')?.body ?? '{}')).toEqual({ addressed: true })

  // Act
  await row.getByRole('button', { name: 'Mark unaddressed' }).click()

  // Assert
  await expect(row).toContainText('Unaddressed')
  const patches = await waitForCallLog(page, (log) => log.filter((entry) => entry.method === 'PATCH').length === 2)
  expect(JSON.parse(patches.filter((entry) => entry.method === 'PATCH')[1].body ?? '{}')).toEqual({ addressed: false })
})

test('A failed report update shows an error and leaves the report unchanged', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarDetailGet('w-1', adminWarDetail('w-1')),
    reportsGet('w-1', [report('r-1', 'w-1')]),
    reportPatch('r-1', 500),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/wars/w-1')
  const row = page.getByTestId('admin-report-row')

  // Act
  await row.getByRole('button', { name: 'Mark addressed' }).click()

  // Assert
  await expect(row.getByRole('alert')).toContainText('Server error')
  await expect(row).toContainText('Unaddressed')
})

test('Marking a report addressed when the report is gone says it no longer exists', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarDetailGet('w-1', adminWarDetail('w-1')),
    reportsGet('w-1', [report('r-1', 'w-1')]),
    reportPatch('r-1', 404),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/wars/w-1')
  const row = page.getByTestId('admin-report-row')

  // Act
  await row.getByRole('button', { name: 'Mark addressed' }).click()

  // Assert
  await expect(row.getByRole('alert')).toHaveText("This report doesn't exist")
  await expect(row).toContainText('Unaddressed')
})

test('Removing a War requires confirmation', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    {
      method: 'GET',
      path: `${API}/admin/wars/w-1`,
      responses: [
        { status: 200, body: adminWarDetail('w-1', { title: 'Alpha War' }) },
        { status: 200, body: adminWarDetail('w-1', { title: 'Alpha War', removed_at: REMOVED_AT }) },
      ],
    },
    reportsGet('w-1', []),
    removePost('w-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/wars/w-1')

  // Act
  await page.getByRole('button', { name: 'Remove War' }).click()

  // Assert — confirmation shown, nothing sent yet
  const dialog = page.getByTestId('remove-war-confirm')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('hides')
  await expect(dialog).toContainText('permanently deletes')
  expect(await removePosts(page)).toHaveLength(0)

  // Act
  await page.getByTestId('remove-war-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('admin-war-removed')).toHaveText('Removed')
  await expect(page.getByRole('button', { name: 'Remove War' })).toHaveCount(0)
  await expect(dialog).toHaveCount(0)
  expect(await removePosts(page)).toHaveLength(1)
})

test('Cancelling the removal confirmation does nothing', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarDetailGet('w-1', adminWarDetail('w-1')),
    reportsGet('w-1', []),
    removePost('w-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/wars/w-1')
  await page.getByRole('button', { name: 'Remove War' }).click()

  // Act
  await page.getByTestId('remove-war-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('remove-war-confirm')).toHaveCount(0)
  await expect(page.getByTestId('admin-war-removed')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove War' })).toBeVisible()
  expect(await removePosts(page)).toHaveLength(0)
})

test('A failed removal shows an error', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarDetailGet('w-1', adminWarDetail('w-1')),
    reportsGet('w-1', []),
    removePost('w-1', 404),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/wars/w-1')
  await page.getByRole('button', { name: 'Remove War' }).click()

  // Act
  await page.getByTestId('remove-war-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('remove-war-error')).toContainText("doesn't exist or has been removed")
  await expect(page.getByTestId('admin-war-removed')).toHaveCount(0)
})

test("A removed War's detail offers no Remove action and requests no reports", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarDetailGet('w-1', adminWarDetail('w-1', { removed_at: REMOVED_AT })),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/wars/w-1')

  // Assert
  await expect(page.getByTestId('admin-war-removed')).toHaveText('Removed')
  await expect(page.getByTestId('admin-contestant-row')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Remove War' })).toHaveCount(0)
  const calls = (await getCallLog(page)).filter((entry) => entry.url.includes('/reports'))
  expect(calls).toHaveLength(0)
})

test('The unaddressed reports queue lists Wars and opens their detail', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminWarsGet({ wars: [], next_cursor: null }),
    queueGet([
      { war_id: 'w-1', title: 'Alpha War', unaddressed_count: 4 },
      { war_id: 'w-2', title: null, unaddressed_count: 1 },
    ]),
    adminWarDetailGet('w-1', adminWarDetail('w-1', { title: 'Alpha War' })),
    reportsGet('w-1', []),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')

  // Act
  const entries = page.getByTestId('unaddressed-queue-entry')
  await expect(entries).toHaveCount(2)
  await expect(entries.nth(0)).toContainText('Alpha War')
  await expect(entries.nth(0)).toContainText('4')
  await expect(entries.nth(1)).toContainText('Untitled War')
  await entries.nth(0).getByRole('link').click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/wars\/w-1$/)
  await expect(page.getByRole('heading', { name: 'Alpha War' })).toBeVisible()
})

test('The unaddressed reports queue shows an empty state', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(false), quietLog, adminWarsGet({ wars: [], next_cursor: null }), queueGet([])])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  await expect(page.getByTestId('unaddressed-queue-empty')).toContainText('No reports are waiting')
  await expect(page.getByTestId('unaddressed-queue-entry')).toHaveCount(0)
})

test("A plain Voter cannot reach a War's Staff detail", async ({ page }) => {
  // Arrange
  await useScenario(page, [me({})])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/wars/w-1')

  // Assert
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('admin-contestant-row')).toHaveCount(0)
})
