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

function nulls(target: { voter?: string; voterName?: string; war?: string; warTitle?: string }) {
  const orNull = (value?: string) => value ?? null
  return {
    target_voter_id: orNull(target.voter),
    target_voter_name: orNull(target.voterName),
    target_war_id: orNull(target.war),
    target_war_title: orNull(target.warTitle),
  }
}

function logEntry(id: string, action: string, createdAt: string, target: { voter?: string; voterName?: string; war?: string; warTitle?: string } = {}) {
  return {
    id,
    action,
    staff_voter_id: 'staff-voter-1',
    staff_name: 'Stella Staff',
    ...nulls(target),
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
    logEntry('e2', 'remove_war', '2026-10-02T12:00:00Z', { war: 'war-removed', warTitle: 'Removed Title' }),
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
  await expect(rows.nth(0)).toContainText('Stella Staff')
  await expect(rows.nth(0)).toContainText('voter-banned')
  await expect(rows.nth(0).locator('time')).toHaveAttribute('datetime', '2026-10-03T12:00:00Z')
  await expect(rows.nth(1)).toContainText('Removed a War')
  await expect(rows.nth(1)).toContainText('Removed Title')
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
    logGet({ entries: [logEntry('e1', 'remove_war', '2026-10-02T12:00:00Z', { war: 'w-1', warTitle: 'Alpha War' })], next_cursor: null }),
    adminWarDetailGet('w-1', adminWarDetail('w-1', { title: 'Alpha War', removed_at: REMOVED_AT })),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')

  // Act
  await page.getByTestId('moderation-log-entry').getByRole('link', { name: 'Alpha War' }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/wars\/w-1$/)
  await expect(page.getByRole('heading', { name: 'Alpha War' })).toBeVisible()
})

test("A moderation log entry targeting a deleted War shows no link", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    logGet({ entries: [logEntry('e1', 'remove_war', '2026-10-02T12:00:00Z', { war: 'w-gone' })], next_cursor: null }),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  const entry = page.getByTestId('moderation-log-entry')
  await expect(entry).toContainText('a deleted War')
  await expect(entry).toContainText('w-gone')
  await expect(entry.locator('a[href="/admin/wars/w-gone"]')).toHaveCount(0)
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

function adminVoter(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    display_name: `Voter ${id}`,
    avatar_url: null,
    is_moderator: false,
    is_admin: false,
    suspended: false,
    banned: false,
    created_at: '2026-09-01T12:00:00Z',
    war_count: 0,
    ...overrides,
  }
}

function adminVotersGet(...pages: { voters: ReturnType<typeof adminVoter>[]; next_cursor: string | null }[]) {
  return { method: 'GET' as const, path: `${API}/admin/voters`, responses: pages.map((body) => ({ status: 200, body })) }
}

test('The Voters list shows badges and War counts', async ({ page }) => {
  // Arrange
  const voters = [
    adminVoter('v-plain', { display_name: 'Plain Pat', war_count: 2 }),
    adminVoter('v-mod', { display_name: 'Mod Max', is_moderator: true }),
    adminVoter('v-admin', { display_name: 'Admin Ada', is_admin: true }),
    adminVoter('v-susp', { display_name: 'Suspended Sam', suspended: true }),
    adminVoter('v-ban', { display_name: 'Banned Bo', banned: true }),
  ]
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(false), quietLog, adminVotersGet({ voters, next_cursor: null })])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  const rows = page.getByTestId('admin-voter-row')
  await expect(rows).toHaveCount(5)
  await expect(rows.nth(0)).toContainText('Plain Pat')
  await expect(rows.nth(0)).toContainText('2 Wars')
  await expect(rows.nth(0).getByTestId('voter-badge')).toHaveCount(0)
  await expect(rows.nth(1).getByTestId('voter-badge')).toHaveText(['Moderator'])
  await expect(rows.nth(2).getByTestId('voter-badge')).toHaveText(['Admin'])
  await expect(rows.nth(3).getByTestId('voter-badge')).toHaveText(['Suspended'])
  await expect(rows.nth(4).getByTestId('voter-badge')).toHaveText(['Banned'])
})

function adminVotersCalls(page: import('@playwright/test').Page) {
  return getCallLog(page).then((log) => log.filter((entry) => /\/admin\/voters(\?|$)/.test(entry.url)))
}

test('Filtering the Voters list by status', async ({ page }) => {
  // Arrange
  const everyone = [adminVoter('v-1', { display_name: 'Alpha' }), adminVoter('v-2', { display_name: 'Beta' })]
  const only = (name: string) => ({ voters: [adminVoter('v-x', { display_name: name })], next_cursor: null })
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVotersGet(
      { voters: everyone, next_cursor: null },
      only('Suspended Sam'),
      only('Banned Bo'),
      only('Staff Stu'),
      { voters: everyone, next_cursor: null },
    ),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  const rows = page.getByTestId('admin-voter-row')
  await expect(rows).toHaveCount(2)
  const select = page.getByTestId('admin-voter-status-filter')

  // Act
  await select.selectOption('suspended')

  // Assert
  await expect(rows).toHaveText([/Suspended Sam/])
  await select.selectOption('banned')
  await expect(rows).toHaveText([/Banned Bo/])
  await select.selectOption('staff')
  await expect(rows).toHaveText([/Staff Stu/])
  await select.selectOption('all')
  await expect(rows).toHaveCount(2)
  const statuses = (await adminVotersCalls(page)).map((entry) => new URL(entry.url).searchParams.get('status'))
  expect(statuses).toEqual([null, 'suspended', 'banned', 'staff', null])
})

test('Searching the Voters list is debounced', async ({ page }) => {
  // Arrange
  const all = [adminVoter('v-1', { display_name: 'Alpha' }), adminVoter('v-2', { display_name: 'Beta' })]
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVotersGet({ voters: all, next_cursor: null }, { voters: [all[1]], next_cursor: null }),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await expect(page.getByTestId('admin-voter-row')).toHaveCount(2)

  // Act
  await page.getByTestId('admin-voter-search').pressSequentially('beta')

  // Assert
  await expect(page.getByTestId('admin-voter-row')).toHaveCount(1)
  const calls = (await adminVotersCalls(page)).filter((entry) => new URL(entry.url).searchParams.has('q'))
  expect(calls).toHaveLength(1)
  expect(new URL(calls[0].url).searchParams.get('q')).toBe('beta')
})

test('Load more appends the next page of Voters', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVotersGet(
      { voters: [adminVoter('v-1', { display_name: 'Alpha' })], next_cursor: 'cursor-2' },
      { voters: [adminVoter('v-2', { display_name: 'Beta' })], next_cursor: null },
    ),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  const rows = page.getByTestId('admin-voter-row')
  await expect(rows).toHaveCount(1)

  // Act
  await page.getByTestId('admin-voters-load-more').click()

  // Assert
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Alpha')
  await expect(rows.nth(1)).toContainText('Beta')
  await expect(page.getByTestId('admin-voters-load-more')).toHaveCount(0)
  const calls = await adminVotersCalls(page)
  expect(new URL(calls[calls.length - 1].url).searchParams.get('cursor')).toBe('cursor-2')
})

function adminVoterDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    ...adminVoter(id),
    war_count: 2,
    wars: [
      { id: 'w-1', title: 'Alpha War', status: 'published', removed_at: null },
      { id: 'w-2', title: 'Beta War', status: 'published', removed_at: REMOVED_AT },
    ],
    ...overrides,
  }
}

function adminVoterGet(id: string, body: unknown, status = 200) {
  return { method: 'GET' as const, path: `${API}/admin/voters/${id}`, responses: [{ status, body }] }
}

function adminVoteItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    war_id: 'w-1',
    war_title: 'Alpha War',
    matchup_id: `m-${id}`,
    winner_contestant_id: 'c-1',
    winner_name: 'Rocky',
    loser_contestant_id: 'c-2',
    loser_name: 'Apollo',
    cast_at: '2026-10-03T12:00:00Z',
    ...overrides,
  }
}

function adminVoterVotesGet(id: string, ...pages: { votes: ReturnType<typeof adminVoteItem>[]; next_cursor: string | null }[]) {
  return { method: 'GET' as const, path: `${API}/admin/voters/${id}/votes`, responses: pages.map((body) => ({ status: 200, body })) }
}

const noVotes = (id: string) => adminVoterVotesGet(id, { votes: [], next_cursor: null })

test("Opening a Voter shows their Staff detail with their Wars", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVotersGet({ voters: [adminVoter('v-1', { display_name: 'Casey Creator', is_moderator: true, war_count: 2 })], next_cursor: null }),
    adminVoterGet('v-1', adminVoterDetail('v-1', { display_name: 'Casey Creator', is_moderator: true })),
    noVotes('v-1'),
    adminWarDetailGet('w-1', adminWarDetail('w-1', { title: 'Alpha War' })),
    reportsGet('w-1', []),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')

  // Act
  await page.getByTestId('admin-voter-row').getByRole('link', { name: 'Casey Creator' }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/voters\/v-1$/)
  await expect(page.getByRole('heading', { name: 'Casey Creator' })).toBeVisible()
  await expect(page.getByTestId('voter-badge')).toHaveText(['Moderator'])
  const wars = page.getByTestId('admin-voter-war-row')
  await expect(wars).toHaveCount(2)
  await expect(wars.nth(0)).toContainText('Alpha War')
  await expect(wars.nth(0).getByTestId('admin-war-removed')).toHaveCount(0)
  await expect(wars.nth(1).getByTestId('admin-war-removed')).toHaveText('Removed')

  // Act
  await wars.nth(0).getByRole('link', { name: 'Alpha War' }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/wars\/w-1$/)
  await expect(page.getByRole('heading', { name: 'Alpha War' })).toBeVisible()
})

test("A Voter's vote history shows the winner and loser of each vote", async ({ page }) => {
  // Arrange
  const votes = [
    adminVoteItem('vote-1'),
    adminVoteItem('vote-2', { war_id: 'w-9', war_title: null, winner_name: 'Creed', loser_name: 'Drago' }),
  ]
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    adminVoterVotesGet('v-1', { votes, next_cursor: null }),
    adminWarDetailGet('w-1', adminWarDetail('w-1', { title: 'Alpha War' })),
    reportsGet('w-1', []),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/voters/v-1')

  // Assert
  const rows = page.getByTestId('admin-vote-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Alpha War')
  await expect(rows.nth(0)).toContainText('Rocky')
  await expect(rows.nth(0)).toContainText('Apollo')
  await expect(rows.nth(0).locator('time')).toHaveAttribute('datetime', '2026-10-03T12:00:00Z')
  await expect(rows.nth(1)).toContainText('Untitled War')
  await expect(rows.nth(1)).toContainText('Creed')
  await expect(rows.nth(1)).toContainText('Drago')

  // Act
  await rows.nth(0).getByRole('link', { name: 'Alpha War' }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/wars\/w-1$/)
  await expect(page.getByRole('heading', { name: 'Alpha War' })).toBeVisible()
})

test("A Voter's vote history pages with Load more", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    adminVoterVotesGet(
      'v-1',
      { votes: [adminVoteItem('vote-1', { winner_name: 'Rocky' })], next_cursor: 'vote-cursor-2' },
      { votes: [adminVoteItem('vote-2', { winner_name: 'Creed' })], next_cursor: null },
    ),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  const rows = page.getByTestId('admin-vote-row')
  await expect(rows).toHaveCount(1)

  // Act
  await page.getByTestId('admin-votes-load-more').click()

  // Assert
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1)).toContainText('Creed')
  await expect(page.getByTestId('admin-votes-load-more')).toHaveCount(0)
  const calls = (await getCallLog(page)).filter((entry) => entry.url.includes('/admin/voters/v-1/votes'))
  expect(new URL(calls[calls.length - 1].url).searchParams.get('cursor')).toBe('vote-cursor-2')
})

function voterPut(path: string, status = 200, body: unknown = {}) {
  return {
    method: 'PUT' as const,
    path: `${API}${path}`,
    responses: [{ status, body: status === 200 ? body : { error: 'boom' } }],
  }
}

function voterPuts(page: import('@playwright/test').Page, suffix: string) {
  return getCallLog(page).then((log) => log.filter((entry) => entry.method === 'PUT' && entry.url.endsWith(suffix)))
}

function voterDetailSequence(id: string, ...bodies: unknown[]) {
  return { method: 'GET' as const, path: `${API}/admin/voters/${id}`, responses: bodies.map((body) => ({ status: 200, body })) }
}

test('Suspending a Voter requires confirmation', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    voterDetailSequence('v-1', adminVoterDetail('v-1'), adminVoterDetail('v-1', { suspended: true })),
    noVotes('v-1'),
    voterPut('/voters/v-1/suspension'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')

  // Act
  await page.getByRole('button', { name: 'Suspend' }).click()

  // Assert — confirmation shown, nothing sent yet
  const dialog = page.getByTestId('voter-suspend-confirm')
  await expect(dialog).toBeVisible()
  expect(await voterPuts(page, '/suspension')).toHaveLength(0)

  // Act
  await page.getByTestId('voter-suspend-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('voter-badge')).toHaveText(['Suspended'])
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Unsuspend' })).toBeVisible()
  const puts = await voterPuts(page, '/suspension')
  expect(puts).toHaveLength(1)
  expect(JSON.parse(puts[0].body ?? '{}')).toEqual({ suspended: true })
})

test('Cancelling the suspension confirmation does nothing', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/suspension'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await page.getByRole('button', { name: 'Suspend' }).click()

  // Act
  await page.getByTestId('voter-suspend-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('voter-suspend-confirm')).toHaveCount(0)
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible()
  expect(await voterPuts(page, '/suspension')).toHaveLength(0)
})

test('A failed suspension shows an error', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/suspension', 500),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await page.getByRole('button', { name: 'Suspend' }).click()

  // Act
  await page.getByTestId('voter-suspend-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('voter-suspend-error')).toContainText('Server error')
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
})

test('Unsuspending a Voter', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    voterDetailSequence('v-1', adminVoterDetail('v-1', { suspended: true }), adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/suspension'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await expect(page.getByTestId('voter-badge')).toHaveText(['Suspended'])

  // Act
  await page.getByRole('button', { name: 'Unsuspend' }).click()

  // Assert
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible()
  const puts = await voterPuts(page, '/suspension')
  expect(puts).toHaveLength(1)
  expect(JSON.parse(puts[0].body ?? '{}')).toEqual({ suspended: false })
})

test('Banning a Voter requires a confirmation that states what is deleted', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    voterDetailSequence('v-1', adminVoterDetail('v-1'), adminVoterDetail('v-1', { banned: true, wars: [], war_count: 0 })),
    noVotes('v-1'),
    voterPut('/voters/v-1/ban'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')

  // Act
  await page.getByRole('button', { name: 'Ban' }).click()

  // Assert — confirmation shown, nothing sent yet
  const dialog = page.getByTestId('voter-ban-confirm')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('permanently deletes every War')
  await expect(dialog).toContainText('every vote')
  await expect(dialog).toContainText('sign-in')
  expect(await voterPuts(page, '/ban')).toHaveLength(0)

  // Act
  await page.getByTestId('voter-ban-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('voter-badge')).toHaveText(['Banned'])
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Unban' })).toBeVisible()
  const puts = await voterPuts(page, '/ban')
  expect(puts).toHaveLength(1)
  expect(JSON.parse(puts[0].body ?? '{}')).toEqual({ banned: true })
})

test('Cancelling the ban confirmation does nothing', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/ban'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await page.getByRole('button', { name: 'Ban' }).click()

  // Act
  await page.getByTestId('voter-ban-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('voter-ban-confirm')).toHaveCount(0)
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ban' })).toBeVisible()
  expect(await voterPuts(page, '/ban')).toHaveLength(0)
})

test('A failed ban shows an error', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/ban', 403),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await page.getByRole('button', { name: 'Ban' }).click()

  // Act
  await page.getByTestId('voter-ban-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('voter-ban-error')).toContainText('Staff access is required')
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
})

test('Unbanning a Voter', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    voterDetailSequence('v-1', adminVoterDetail('v-1', { banned: true }), adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/ban'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await expect(page.getByTestId('voter-badge')).toHaveText(['Banned'])

  // Act
  await page.getByRole('button', { name: 'Unban' }).click()

  // Assert
  const dialog = page.getByTestId('voter-unban-confirm')
  await expect(dialog).toContainText('restores sign-in only')
  await page.getByTestId('voter-unban-confirm-submit').click()
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ban' })).toBeVisible()
  const puts = await voterPuts(page, '/ban')
  expect(puts).toHaveLength(1)
  expect(JSON.parse(puts[0].body ?? '{}')).toEqual({ banned: false })
})

test('An Admin sees role controls on a Voter', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_admin: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/voters/v-1')

  // Assert
  await expect(page.getByRole('button', { name: 'Grant Moderator' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Grant Admin' })).toBeVisible()
})

test('A Moderator does not see role controls', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/voters/v-1')

  // Assert
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Grant|Revoke/ })).toHaveCount(0)
})

test('Granting Moderator sends the grant and updates the badges', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_admin: true }),
    killSwitchGet(false),
    quietLog,
    voterDetailSequence('v-1', adminVoterDetail('v-1'), adminVoterDetail('v-1', { is_moderator: true })),
    noVotes('v-1'),
    voterPut('/voters/v-1/roles/moderator'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)

  // Act
  await page.getByRole('button', { name: 'Grant Moderator' }).click()

  // Assert
  await expect(page.getByTestId('voter-badge')).toHaveText(['Moderator'])
  await expect(page.getByRole('button', { name: 'Revoke Moderator' })).toBeVisible()
  const puts = await voterPuts(page, '/roles/moderator')
  expect(puts).toHaveLength(1)
  expect(JSON.parse(puts[0].body ?? '{}')).toEqual({ granted: true })
})

test('Revoking Admin requires confirmation', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_admin: true }),
    killSwitchGet(false),
    quietLog,
    voterDetailSequence('v-1', adminVoterDetail('v-1', { is_admin: true }), adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/roles/admin'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await expect(page.getByTestId('voter-badge')).toHaveText(['Admin'])

  // Act
  await page.getByRole('button', { name: 'Revoke Admin' }).click()

  // Assert — confirmation shown, nothing sent yet
  const dialog = page.getByTestId('voter-revoke-admin-confirm')
  await expect(dialog).toBeVisible()
  expect(await voterPuts(page, '/roles/admin')).toHaveLength(0)

  // Act
  await page.getByTestId('voter-revoke-admin-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
  const puts = await voterPuts(page, '/roles/admin')
  expect(puts).toHaveLength(1)
  expect(JSON.parse(puts[0].body ?? '{}')).toEqual({ granted: false })
})

test('Cancelling the Revoke Admin confirmation does nothing', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_admin: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1', { is_admin: true })),
    noVotes('v-1'),
    voterPut('/voters/v-1/roles/admin'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await page.getByRole('button', { name: 'Revoke Admin' }).click()

  // Act
  await page.getByTestId('voter-revoke-admin-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('voter-revoke-admin-confirm')).toHaveCount(0)
  await expect(page.getByTestId('voter-badge')).toHaveText(['Admin'])
  expect(await voterPuts(page, '/roles/admin')).toHaveLength(0)
})

test('A refused role change shows an error', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_admin: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/roles/moderator', 403),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')

  // Act
  await page.getByRole('button', { name: 'Grant Moderator' }).click()

  // Assert
  await expect(page.getByTestId('voter-grant-moderator-error')).toContainText('Staff access is required')
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
})

test('Staff cannot suspend or ban themselves or revoke their own Admin role', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_admin: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('voter-1', adminVoterDetail('voter-1', { is_admin: true })),
    noVotes('voter-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/voters/voter-1')

  // Assert
  await expect(page.getByRole('button', { name: 'Grant Moderator' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Suspend|Ban|Revoke Admin/ })).toHaveCount(0)
  await expect(page.getByTestId('voter-sanction-note')).toContainText('your own account')
})

test('Suspend and Ban are not offered against a Staff member', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1', { is_moderator: true })),
    noVotes('v-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/voters/v-1')

  // Assert
  await expect(page.getByTestId('voter-badge')).toHaveText(['Moderator'])
  await expect(page.getByTestId('voter-sanction-note')).toContainText('role must be revoked')
  await expect(page.getByRole('button', { name: /Suspend|Ban/ })).toHaveCount(0)
})

test("A moderation log entry's Voter ids link to the Voter's detail", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    logGet({ entries: [logEntry('e1', 'ban_voter', '2026-10-02T12:00:00Z', { voter: 'v-1', voterName: 'Casey Creator' })], next_cursor: null }),
    adminVoterGet('v-1', adminVoterDetail('v-1', { display_name: 'Casey Creator' })),
    noVotes('v-1'),
    adminVoterGet('staff-voter-1', adminVoterDetail('staff-voter-1', { display_name: 'Stella Staff', is_moderator: true })),
    noVotes('staff-voter-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  const entry = page.getByTestId('moderation-log-entry')

  // Act
  await entry.getByRole('link', { name: 'Casey Creator' }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/voters\/v-1$/)
  await expect(page.getByRole('heading', { name: 'Casey Creator' })).toBeVisible()

  // Act
  await navigateAuthenticated(page, '/admin')
  await page.getByTestId('moderation-log-entry').getByRole('link', { name: 'Stella Staff' }).click()

  // Assert
  await expect(page).toHaveURL(/\/admin\/voters\/staff-voter-1$/)
  await expect(page.getByRole('heading', { name: 'Stella Staff' })).toBeVisible()
})

test("A plain Voter cannot reach a Voter's Staff detail", async ({ page }) => {
  // Arrange
  await useScenario(page, [me({})])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/voters/x')

  // Assert
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Wars' })).toHaveCount(0)
  await expect(page.getByTestId('admin-voter-war-row')).toHaveCount(0)
})

test("An unknown Voter's Staff detail says the Voter doesn't exist", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    adminVoterGet('v-missing', { error: 'not found' }, 404),
    noVotes('v-missing'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/voters/v-missing')

  // Assert
  await expect(page.getByRole('alert')).toHaveText("This Voter doesn't exist")
})

test("A Staff action on a Voter who no longer exists says the Voter doesn't exist", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
    voterPut('/voters/v-1/suspension', 404),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin/voters/v-1')
  await page.getByRole('button', { name: 'Suspend' }).click()

  // Act
  await page.getByTestId('voter-suspend-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('voter-suspend-error')).toHaveText("This Voter doesn't exist")
})

function meCalls(page: import('@playwright/test').Page) {
  return getCallLog(page).then((log) => log.filter((entry) => entry.url.endsWith('/auth/me')))
}

test("The current Voter's identity is fetched once per visit to the Admin Dashboard", async ({ page }) => {
  // Arrange
  await useScenario(page, [me({ is_moderator: true }), killSwitchGet(false), quietLog])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  expect(await meCalls(page)).toHaveLength(1)
})

test("The current Voter's identity is fetched once per visit to a Voter's Staff detail", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_admin: true }),
    killSwitchGet(false),
    quietLog,
    adminVoterGet('v-1', adminVoterDetail('v-1')),
    noVotes('v-1'),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin/voters/v-1')

  // Assert
  await expect(page.getByRole('button', { name: 'Grant Moderator' })).toBeVisible()
  expect(await meCalls(page)).toHaveLength(1)
})

test("Signing in as another Voter does not reuse the previous Voter's identity", async ({ page }) => {
  // Arrange
  const meSequence = {
    method: 'GET' as const,
    path: `${API}/auth/me`,
    responses: [
      { status: 200, body: { voter: { id: 'voter-1', display_name: 'Staff Stu', avatar_url: null, is_moderator: true, is_admin: false } } },
      { status: 200, body: { voter: { id: 'voter-2', display_name: 'Plain Pat', avatar_url: null, is_moderator: false, is_admin: false } } },
    ],
  }
  await useScenario(page, [meSequence, killSwitchGet(false), quietLog])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/admin')
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible()
  await nav(page).getByTestId('nav-identity').click()
  await nav(page).getByTestId('nav-logout').click()
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toBeVisible()

  // Act
  await loginAsTestVoter(page, 'second-voter-token')
  await navigateAuthenticated(page, '/admin')

  // Assert
  await expect(page).toHaveURL(/\/$/)
  await expect(nav(page).getByTestId('nav-identity')).toHaveText('Plain Pat')
  expect(await meCalls(page)).toHaveLength(2)
})
