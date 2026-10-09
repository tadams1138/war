// Binds features/admin-dashboard.feature.
import { expect, test } from '@playwright/test'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from './support/mocking'
import { nav } from './support/pages'
import { me, killSwitchGet, killSwitchPut, killSwitchPuts, logEntry, logGet, quietLog, adminWarDetail, adminWarDetailGet, REMOVED_AT, adminVoterDetail, adminVoterGet, noVotes, meCalls } from './support/adminFixtures'

test('The Admin Dashboard requires authentication', async ({ page }) => {
  // Arrange
  await page.goto('/')

  // Act
  await page.goto('/admin')

  // Assert
  await expect(page).toHaveURL(/\/login\?/)
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/admin')
})

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
    logGet({ entries: [logEntry('e1', 'remove_war', '2026-10-02T12:00:00Z', { war: 'w-gone', warDeleted: true })], next_cursor: null }),
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

test('A moderation log entry targeting an untitled live War links to it', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    me({ is_moderator: true }),
    killSwitchGet(false),
    logGet({ entries: [logEntry('e1', 'remove_war', '2026-10-02T12:00:00Z', { war: 'w-untitled' })], next_cursor: null }),
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/admin')

  // Assert
  const entry = page.getByTestId('moderation-log-entry')
  await expect(entry).not.toContainText('a deleted War')
  await expect(entry.getByRole('link', { name: 'Untitled War' })).toHaveAttribute('href', '/admin/wars/w-untitled')
})
