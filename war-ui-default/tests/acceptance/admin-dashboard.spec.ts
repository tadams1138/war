// Binds features/admin-dashboard.feature.
import { expect, test } from '@playwright/test'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from './support/mocking'

test('The Admin Dashboard requires authentication', async ({ page }) => {
  // Arrange
  await page.goto('/')

  // Act
  await page.goto('/admin')

  // Assert
  await expect(page).toHaveURL(/\/login\?/)
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/admin')
})

function me(flags: { is_moderator?: boolean; is_admin?: boolean }) {
  return {
    method: 'GET' as const,
    path: `${API}/auth/me`,
    responses: [
      {
        status: 200,
        body: { voter: { id: 'voter-1', display_name: 'Test Voter', avatar_url: null, is_moderator: false, is_admin: false, ...flags } },
      },
    ],
  }
}

function nav(page: import('@playwright/test').Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

test('A plain Voter is redirected Home and sees no dashboard link', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({})])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toHaveCount(0)
  await nav(page).getByTestId('nav-identity').click()
  await expect(nav(page).getByRole('menu')).toBeVisible()
  await expect(nav(page).getByRole('menuitem', { name: 'Admin Dashboard' })).toHaveCount(0)
})

test('A Moderator sees the dashboard link and the dashboard', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_moderator: true })])
  await page.goto('/')
  await loginAsTestVoter(page)
  await nav(page).getByTestId('nav-identity').click()

  // Act
  await nav(page).getByRole('menuitem', { name: 'Admin Dashboard' }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  await expect(nav(page)).toBeVisible()
})

test('An Admin reaches the dashboard', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_admin: true })])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  await expect(nav(page)).toBeVisible()
})

function killSwitchGet(enabled: boolean) {
  return { method: 'GET' as const, path: `${API}/kill-switch`, responses: [{ status: 200, body: { enabled } }] }
}

test('The kill switch panel shows the current state', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(false)])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  await expect(page.getByTestId('kill-switch-state')).toHaveText('Off')
})

function killSwitchPut(status: number, enabled: boolean) {
  return {
    method: 'PUT' as const,
    path: `${API}/kill-switch`,
    responses: [{ status, body: status === 200 ? { enabled } : { error: 'boom' } }],
  }
}

function killSwitchPuts(page: import('@playwright/test').Page) {
  return getCallLog(page).then((log) => log.filter((entry) => entry.method === 'PUT' && entry.url.endsWith('/kill-switch')))
}

test('Enabling the kill switch requires confirmation', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(false), killSwitchPut(200, true)])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await expect(page.getByTestId('kill-switch-state')).toHaveText('Off')

  // Act
  await page.getByRole('button', { name: 'Enable kill switch' }).click()

  // Assert — confirmation shown, nothing sent yet
  await expect(page.getByTestId('kill-switch-confirm')).toBeVisible()
  expect(await killSwitchPuts(page)).toHaveLength(0)

  // Act
  await page.getByTestId('kill-switch-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('kill-switch-state')).toHaveText('On')
  const puts = await waitForCallLog(page, (log) => log.some((entry) => entry.method === 'PUT'))
  expect(JSON.parse(puts.find((entry) => entry.method === 'PUT')?.body ?? '{}')).toEqual({ enabled: true })
})

test('Cancelling the confirmation leaves the kill switch unchanged', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(false), killSwitchPut(200, true)])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await page.getByRole('button', { name: 'Enable kill switch' }).click()

  // Act
  await page.getByTestId('kill-switch-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('kill-switch-confirm')).toHaveCount(0)
  await expect(page.getByTestId('kill-switch-state')).toHaveText('Off')
  expect(await killSwitchPuts(page)).toHaveLength(0)
})

test('Disabling the kill switch needs no confirmation', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(true), killSwitchPut(200, false)])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await expect(page.getByTestId('kill-switch-state')).toHaveText('On')

  // Act
  await page.getByRole('button', { name: 'Disable kill switch' }).click()

  // Assert
  await expect(page.getByTestId('kill-switch-state')).toHaveText('Off')
  await expect(page.getByTestId('kill-switch-confirm')).toHaveCount(0)
})

test('A failed kill switch update shows an error and leaves the state unchanged', async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(false), killSwitchPut(500, false), logGet({ entries: [], next_cursor: null })])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await page.getByRole('button', { name: 'Enable kill switch' }).click()

  // Act
  await page.getByTestId('kill-switch-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('kill-switch-error')).toContainText('Server error')
  await expect(page.getByTestId('kill-switch-state')).toHaveText('Off')
})

function logEntry(id: string, action: string, createdAt: string, target: { voter?: string; war?: string } = {}) {
  return {
    id,
    action,
    staff_voter_id: 'staff-voter-1',
    target_voter_id: target.voter ?? null,
    target_war_id: target.war ?? null,
    created_at: createdAt,
  }
}

function logGet(...pages: { entries: ReturnType<typeof logEntry>[]; next_cursor: string | null }[]) {
  return { method: 'GET' as const, path: `${API}/moderation-log`, responses: pages.map((body) => ({ status: 200, body })) }
}

test('The moderation log lists entries newest first with readable labels', async ({ page }) => {
  // Arrange
  const entries = [
    logEntry('e3', 'ban_voter', '2026-10-03T12:00:00Z', { voter: 'voter-banned' }),
    logEntry('e2', 'remove_war', '2026-10-02T12:00:00Z', { war: 'war-removed' }),
    logEntry('e1', 'brand_new_action', '2026-10-01T12:00:00Z'),
  ]
  await useScenario(page, [me({ is_admin: true }), killSwitchGet(false), logGet({ entries, next_cursor: null })])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  const rows = page.getByTestId('moderation-log-entry')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Banned a Voter')
  await expect(rows.nth(0)).toContainText('staff-voter-1')
  await expect(rows.nth(0)).toContainText('voter-banned')
  await expect(rows.nth(0).locator('time')).toHaveAttribute('datetime', '2026-10-03T12:00:00Z')
  await expect(rows.nth(1)).toContainText('Removed a War')
  await expect(rows.nth(1)).toContainText('war-removed')
  await expect(rows.nth(2)).toContainText('brand_new_action')
})

test('Load more appends the next page and hides once there is no next cursor', async ({ page }) => {
  // Arrange
  const first = [logEntry('e2', 'ban_voter', '2026-10-02T12:00:00Z', { voter: 'v-2' })]
  const second = [logEntry('e1', 'unban_voter', '2026-10-01T12:00:00Z', { voter: 'v-1' })]
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    logGet({ entries: first, next_cursor: 'cursor-2' }, { entries: second, next_cursor: null }),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  const rows = page.getByTestId('moderation-log-entry')
  await expect(rows).toHaveCount(1)

  // Act
  await page.getByRole('button', { name: 'Load more' }).click()

  // Assert
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Banned a Voter')
  await expect(rows.nth(1)).toContainText('Unbanned a Voter')
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0)
  const calls = (await getCallLog(page)).filter((entry) => entry.url.includes('/moderation-log'))
  expect(new URL(calls[calls.length - 1].url).searchParams.get('cursor')).toBe('cursor-2')
})

test('Toggling the kill switch adds its entry to the moderation log', async ({ page }) => {
  // Arrange
  const before = [logEntry('e1', 'ban_voter', '2026-10-01T12:00:00Z', { voter: 'v-1' })]
  const after = [logEntry('e2', 'enable_war_creation_kill_switch', '2026-10-02T12:00:00Z'), ...before]
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    killSwitchPut(200, true),
    logGet({ entries: before, next_cursor: null }, { entries: after, next_cursor: null }),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await expect(page.getByTestId('moderation-log-entry')).toHaveCount(1)
  await page.getByRole('button', { name: 'Enable kill switch' }).click()

  // Act
  await page.getByTestId('kill-switch-confirm-submit').click()

  // Assert
  const rows = page.getByTestId('moderation-log-entry')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Enabled the War-creation kill switch')
})

test("A banned Voter's sign-in shows a banned message", async ({ page }) => {
  // Arrange — no refresh mock: a banned sign-in never reaches the exchange.

  // Act
  await page.goto('/auth/callback?error=banned')

  // Assert
  await expect(page.getByRole('alert')).toContainText('This account has been banned')
  await expect(page.getByRole('alert')).not.toContainText('Sign-in failed')
  const refreshes = (await getCallLog(page)).filter((entry) => entry.url.includes('/auth/refresh'))
  expect(refreshes).toHaveLength(0)
})

function adminWar(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `War ${id}`,
    status: 'published',
    visibility: 'public',
    creator_id: 'creator-1',
    creator_name: 'Casey Creator',
    created_at: '2026-10-01T12:00:00Z',
    removed_at: null,
    unaddressed_report_count: 0,
    ...overrides,
  }
}

function adminWarsGet(...pages: { wars: ReturnType<typeof adminWar>[]; next_cursor: string | null }[]) {
  return { method: 'GET' as const, path: `${API}/admin/wars`, responses: pages.map((body) => ({ status: 200, body })) }
}

const quietLog = logGet({ entries: [], next_cursor: null })

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

function adminWarsCalls(page: import('@playwright/test').Page) {
  return getCallLog(page).then((log) => log.filter((entry) => /\/admin\/wars(\?|$)/.test(entry.url)))
}

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

function adminWarDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...adminWar(id),
    contestants: [
      { id: 'c-1', name: 'Rocky', win_count: 7, appearance_count: 10 },
      { id: 'c-2', name: 'Apollo', win_count: 3, appearance_count: 10 },
    ],
    report_count: 2,
    ...overrides,
  }
}

function adminWarDetailGet(id: string, body: unknown, status = 200) {
  return { method: 'GET' as const, path: `${API}/admin/wars/${id}`, responses: [{ status, body }] }
}

function report(id: string, warId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    war_id: warId,
    reporter_id: 'reporter-1',
    explanation: `Explanation ${id}`,
    addressed: false,
    filed_at: '2026-10-02T12:00:00Z',
    ...overrides,
  }
}

function reportsGet(warId: string, reports: ReturnType<typeof report>[]) {
  return { method: 'GET' as const, path: `${API}/wars/${warId}/reports`, responses: [{ status: 200, body: { reports } }] }
}

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

function reportPatch(reportId: string, status = 200) {
  return {
    method: 'PATCH' as const,
    path: `${API}/reports/${reportId}`,
    responses: [{ status, body: status === 200 ? {} : { error: 'boom' } }],
  }
}

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

function removePost(warId: string, status = 204) {
  return {
    method: 'POST' as const,
    path: `${API}/wars/${warId}/remove`,
    responses: [{ status, body: status === 204 ? undefined : { error: 'boom' } }],
  }
}

function removePosts(page: import('@playwright/test').Page) {
  return getCallLog(page).then((log) => log.filter((entry) => entry.method === 'POST' && entry.url.endsWith('/remove')))
}

const REMOVED_AT = '2026-10-04T12:00:00Z'

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

function queueGet(wars: { war_id: string; title: string | null; unaddressed_count: number }[]) {
  return { method: 'GET' as const, path: `${API}/reports/unaddressed`, responses: [{ status: 200, body: { wars } }] }
}

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

test("A moderation log entry targeting a War links to its detail", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    logGet({ entries: [logEntry('e1', 'remove_war', '2026-10-02T12:00:00Z', { war: 'w-1' })], next_cursor: null }),
    adminWarDetailGet('w-1', adminWarDetail('w-1', { title: 'Alpha War', removed_at: REMOVED_AT })),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')

  // Act
  await page.getByTestId('moderation-log-entry').getByRole('link', { name: /War w-1/ }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/wars\/w-1$/)
  await expect(page.getByRole('heading', { name: 'Alpha War' })).toBeVisible()
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
