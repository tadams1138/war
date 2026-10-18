// Steps for features/vote-mode.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { buildMatchupResponse, buildMediaItem } from '../../../src/mocks/fixtures'
import { test } from './fixtures'
import { API, getCallLog, votesSubmitted, waitForCallLog, type MswCallLogEntry } from '../support/mocking'
import { contestantCard, controlNamed, matchupCard } from '../support/pages'
import { queueProgress, reply, voteRecipe } from '../support/recipes'
import type { Side } from '../support/screens'

const { Given, Then } = createBdd(test, { tags: '@vote-mode' })

const idOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const contestantNamed = (name: string) => ({ id: idOf(name), name, bio: null, media: [buildMediaItem({ id: `${idOf(name)}-media-0` })] })

// The voter has decided `world.matchupCalls.length` matchups when this one is served.
Given('a later matchup between {string} and {string}', async ({ world }, left: string, right: string) => {
  // Arrange
  const { progress } = world.matchupResponse!
  const response = buildMatchupResponse({
    matchup: { id: `matchup-${world.matchupCalls.length + 1}`, left: contestantNamed(left), right: contestantNamed(right) },
    progress: { voted: world.matchupCalls.length, total: progress.total },
  })
  world.matchupResponse = response
  world.matchupCalls.push({ status: 200, body: response })
})

Given('the voter has voted on every matchup in that War', async ({ world }) => {
  // Arrange
  world.queue(reply('POST', `${API}/wars/${world.warId}/join`, 204), reply('GET', `${API}/wars/${world.warId}/matchups/next`, 204))
  const { total } = buildMatchupResponse().progress
  queueProgress(world, total, total)
})

Given('the voter already decided that matchup elsewhere', async ({ world }) => {
  // Arrange
  world.queue(voteRecipe(world.warId, { status: 409, body: { error: 'conflict' } }))
})

Given('the API takes {int} ms to accept a vote', async ({ world }, delayMs: number) => {
  // Arrange
  world.queue(voteRecipe(world.warId, { status: 201, body: { vote_id: 'vote-1' }, delayMs }))
})

const calls = (log: MswCallLogEntry[], method: string, path: string) => log.filter((entry) => entry.method === method && new URL(entry.url).pathname === path)

Then('two contestant cards are shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('contestant-card')).toHaveCount(2)
})

Then('the progress bar shows {string}', async ({ page }, text: string) => {
  // Assert
  await expect(page.getByRole('progressbar')).toHaveText(text)
})

Then('the War is joined on their behalf before the first matchup is requested', async ({ page, world }) => {
  // Assert
  const matchups = `${API}/wars/${world.warId}/matchups/next`
  const log = await waitForCallLog(page, (all) => calls(all, 'GET', matchups).length > 0)
  const [join] = calls(log, 'POST', `${API}/wars/${world.warId}/join`)
  expect(join).toBeDefined()
  expect(log.indexOf(join!)).toBeLessThan(log.indexOf(calls(log, 'GET', matchups)[0]!))
})

Then('no Join control or message is shown', async ({ page }) => {
  // Assert
  await expect(controlNamed(page, /join/i)).toHaveCount(0)
})

Then('no skip, pass or abstain control is displayed', async ({ page }) => {
  // Assert
  await expect(controlNamed(page, /skip|abstain|pass\b/i)).toHaveCount(0)
})

Then('{string} is displayed on the {side}', async ({ page }, name: string, side: Side) => {
  // Assert
  await expect(matchupCard(page, side)).toContainText(name)
})

Then('{string} is not displayed', async ({ page }, name: string) => {
  // Assert
  await expect(contestantCard(page, name)).toHaveCount(0)
})

Then('the next matchup has been requested {int} time(s)', async ({ page, world }, count: number) => {
  // Assert
  const requests = async () => calls(await getCallLog(page), 'GET', `${API}/wars/${world.warId}/matchups/next`).length
  await expect.poll(requests).toBe(count)
})

// Waits for the vote to land: the page's busy state flips before its request
// reaches the network, so reading the log once would race it.
Then('exactly one vote is submitted', async ({ page }) => {
  // Assert
  await expect.poll(async () => (await votesSubmitted(page)).length).toBeGreaterThan(0)
  expect(await votesSubmitted(page)).toHaveLength(1)
})

