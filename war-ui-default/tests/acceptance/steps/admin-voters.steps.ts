// Steps for features/admin-voters.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
//
// A Voter given here is numbered voter-2, voter-3, ... ("that Voter" is the
// latest; voter-1 is the signed-in voter). It is queued with its Staff detail
// and an empty vote history, and listed to Staff only by the list steps. Later
// Givens edit what was queued in place, so give them before the app boots.
import { expect } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { warTitle } from '../../../src/utils/warTitle'
import { test, type World } from './fixtures'
import {
  adminVoter,
  adminVoteItem,
  adminVoterDetail,
  adminVoterGet,
  filteredListRecipes,
  noVotes,
  pagedListRecipe,
  pagedResponses,
} from '../support/adminFixtures'
import { expectTextOrNone } from '../support/pages'
import { addStaffWar, recipeFor } from '../support/staffRecords'

const { Given, Then } = createBdd(test, { tags: '@admin-voters' })

type StaffVoter = ReturnType<typeof adminVoter>
type VoterDetail = ReturnType<typeof adminVoterDetail>
type Flags = Record<string, boolean>

// --- Arrange ---------------------------------------------------------------

const BADGE_FLAGS: Record<string, Flags> = {
  Moderator: { is_moderator: true },
  Admin: { is_admin: true },
  Suspended: { suspended: true },
  Banned: { banned: true },
}

const KINDS: Record<string, Flags> = {
  'plain Voter': {},
  'suspended Voter': BADGE_FLAGS.Suspended!,
  'banned Voter': BADGE_FLAGS.Banned!,
  Moderator: BADGE_FLAGS.Moderator!,
  Admin: BADGE_FLAGS.Admin!,
}

const detailOf = (world: World) => recipeFor(world, `/admin/voters/${world.voterId}`).responses[0]!.body as VoterDetail
const votesOf = (world: World) => recipeFor(world, `/admin/voters/${world.voterId}/votes`)

function addVoter(world: World, id: string, overrides: Record<string, unknown>): StaffVoter {
  world.queue(adminVoterGet(id, adminVoterDetail(id, { ...overrides, wars: [] })), noVotes(id))
  return adminVoter(id, overrides)
}

function voterFrom(row: Record<string, string>) {
  return { display_name: row.name, war_count: Number(row['war count'] || 0), ...BADGE_FLAGS[row.badge ?? ''] }
}

// The API filters as the Staff list is filtered: by sanction or role, and by the
// words of a name.
const FILTERS = {
  statuses: {
    suspended: (voter: StaffVoter) => voter.suspended,
    banned: (voter: StaffVoter) => voter.banned,
    staff: (voter: StaffVoter) => voter.is_moderator || voter.is_admin,
  },
  text: (voter: StaffVoter) => voter.display_name,
}

function queueListed(world: World, table: DataTable, pageSize?: number): void {
  const voters = table.hashes().map((row) => addVoter(world, world.nextVoterId(), voterFrom(row)))
  world.queue(pagedListRecipe('/admin/voters', 'voters', voters, pageSize), ...filteredListRecipes('/admin/voters', 'voters', voters, FILTERS))
}

Given('the API lists these Voters to Staff:', async ({ world }, table: DataTable) => {
  // Arrange
  queueListed(world, table)
})

Given('the API lists these Voters to Staff, {int} per page:', async ({ world }, size: number, table: DataTable) => {
  // Arrange
  queueListed(world, table, size)
})

Given(/^(?:a|an|another) (plain Voter|suspended Voter|banned Voter|Moderator|Admin)$/, async ({ world }, kind: string) => {
  // Arrange
  addVoter(world, world.nextVoterId(), KINDS[kind]!)
})

// The detail of the voter who signs in, who Staff can look at like any other.
Given('the signed-in voter is an Admin', async ({ world }) => {
  // Arrange
  addVoter(world, 'voter-1', { display_name: 'Test Voter', ...KINDS.Admin })
})

Given('no Voter exists with the requested id', async ({ world }) => {
  // Arrange
  world.queue(adminVoterGet(world.nextVoterId(), { error: 'not found' }, 404))
})

Given('that Voter created these Wars:', async ({ world }, table: DataTable) => {
  // Arrange
  const wars = table.hashes().map((row) => addStaffWar(world, row))
  Object.assign(detailOf(world), {
    wars: wars.map(({ id, title, status, removed_at }) => ({ id, title, status, removed_at })),
    war_count: wars.length,
  })
})

function giveVotes(world: World, table: DataTable, pageSize?: number): void {
  const votes = table.hashes().map((row, index) => {
    const war = addStaffWar(world, { title: row.War! })
    const cast = row.cast ? { cast_at: row.cast } : {}
    return adminVoteItem(`vote-${index + 1}`, { war_id: war.id, war_title: war.title, winner_name: row.winner, loser_name: row.loser, ...cast })
  })
  votesOf(world).responses = pagedResponses('votes', votes, pageSize)
}

Given('that Voter has cast these votes:', async ({ world }, table: DataTable) => {
  // Arrange
  giveVotes(world, table)
})

Given('that Voter has cast these votes, {int} per page:', async ({ world }, size: number, table: DataTable) => {
  // Arrange
  giveVotes(world, table, size)
})

// --- Assert ----------------------------------------------------------------

Then('the Voters list shows these Voters, in order:', async ({ page }, table: DataTable) => {
  // Assert
  const expected = table.hashes()
  const rows = page.getByTestId('admin-voter-row')
  await expect(rows).toHaveCount(expected.length)
  for (const [index, voter] of expected.entries()) {
    await expect(rows.nth(index).getByRole('link')).toHaveText(voter.name!)
    await expectTextOrNone(rows.nth(index).getByTestId('voter-badge'), voter.badge!)
    await expect(rows.nth(index)).toContainText(`· ${voter.Wars}`)
  }
})

const BADGE_ORDER = ['Moderator', 'Admin', 'Suspended', 'Banned']
const badgesOf = (voter: Record<string, unknown>) => BADGE_ORDER.filter((badge) => Object.keys(BADGE_FLAGS[badge]!).every((flag) => voter[flag]))

Then("the Voter's badges and every War they created are shown, the removed one marked Removed", async ({ page, world }) => {
  // Assert
  const voter = detailOf(world)
  await expect(page.getByTestId('voter-badge')).toHaveText(badgesOf(voter))
  const rows = page.getByTestId('admin-voter-war-row')
  await expect(rows).toHaveCount(voter.wars.length)
  for (const [index, war] of voter.wars.entries()) {
    await expect(rows.nth(index).getByRole('link')).toHaveText(warTitle(war.title))
    await expect(rows.nth(index)).toContainText(`· ${war.status}`)
    await expectTextOrNone(rows.nth(index).getByTestId('admin-war-removed'), war.removed_at ? 'Removed' : '')
  }
})

Then('each vote shows its War, the winner, the loser and when it was cast', async ({ page, world }) => {
  // Assert
  const votes = (votesOf(world).responses[0]!.body as { votes: ReturnType<typeof adminVoteItem>[] }).votes
  const rows = page.getByTestId('admin-vote-row')
  await expect(rows).toHaveCount(votes.length)
  for (const [index, vote] of votes.entries()) {
    await expect(rows.nth(index).getByRole('link')).toHaveText(warTitle(vote.war_title))
    await expect(rows.nth(index).locator('strong')).toHaveText(vote.winner_name)
    await expect(rows.nth(index)).toContainText(`beat ${vote.loser_name}`)
    await expect(rows.nth(index).locator('time')).toHaveAttribute('datetime', vote.cast_at)
  }
})

// Comma-separated, in the order the page shows them.
Then("the Voter's badges are {string}", async ({ page }, badges: string) => {
  // Assert
  await expect(page.getByTestId('voter-badge')).toHaveText(badges.split(', '))
})

Then('the Voter has no badges', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('voter-badge')).toHaveCount(0)
})

Then('no role controls are offered', async ({ page }) => {
  // Assert
  await expect(page.getByRole('button', { name: /Grant|Revoke/ })).toHaveCount(0)
})

// The actions are named in quotes: `no "Suspend", "Ban" or "Revoke Admin" action is offered`.
Then(/^no ((?:"[^"]*"(?:, | or )?)+) action is offered$/, async ({ page }, actions: string) => {
  // Assert
  for (const [, name] of actions.matchAll(/"([^"]*)"/g)) {
    await expect(page.getByRole('button', { name: name!, exact: true })).toHaveCount(0)
  }
})

Then('a note says {string}', async ({ page }, note: string) => {
  // Assert
  await expect(page.getByTestId('voter-sanction-note')).toHaveText(note)
})
