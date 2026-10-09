// Binds features/admin-voters.feature.
import { expect, test } from '@playwright/test'
import { getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'
import { me, killSwitchGet, quietLog, adminWarDetail, adminWarDetailGet, reportsGet, adminVoter, adminVotersGet, adminVotersCalls, adminVoterDetail, adminVoterGet, adminVoteItem, adminVoterVotesGet, noVotes, voterPut, voterPuts, voterDetailSequence, meCalls } from './support/adminFixtures'

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
