import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { buildMatchupResponse, buildVideoMatchupResponse, buildVideoMediaItem, buildWarDetail } from '../../../src/mocks/fixtures'
import { blockVideoScripts, endVideo, installFakeVideoProviders, reachClipEnd, setVideoBehavior, videoStats } from '../support/fakeVideoProviders'
import { API } from '../support/mocking'
import { ok, reply, voteRecipe } from '../support/recipes'
import type { Side } from '../support/screens'
import { test, type World } from './fixtures'

const { Given, When, Then } = createBdd(test, { tags: '@video-mode' })

const videoId = (world: World, side: Side): string => world.matchup![side].media[0].video_id!

Given('a matchup in a video War', async ({ page, world }) => {
  // Arrange
  await installFakeVideoProviders(page)
  const id = world.nextWarId()
  const matchup = buildMatchupResponse()
  world.matchupResponse = matchup
  world.matchupCalls = [{ status: 200, body: matchup }]
  matchup.matchup.left.media = [buildVideoMediaItem({ id: 'left-video', provider: 'youtube', video_id: 'left-id' })]
  matchup.matchup.right.media = [buildVideoMediaItem({ id: 'right-video', provider: 'vimeo', video_id: '123456' })]
  world.queue(
    ok('GET', `${API}/wars/${id}`, buildWarDetail({ id, media_mode: 'video' })),
    reply('POST', `${API}/wars/${id}/join`, 204),
    { method: 'GET', path: `${API}/wars/${id}/matchups/next`, responses: world.matchupCalls },
  )
  // Act: performed by the scenario's When steps.
  // Assert: verified by the scenario's Then steps.
})

Then('both video posters are shown', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect(page.getByTestId('video-poster')).toHaveCount(2)
})

Then('the left video plays first', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect(page.getByTestId('matchup-card-left').getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'playing')
  await expect(page.getByTestId('matchup-card-right').getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'poster')
})

When('the {side} video ends', async ({ page, world }, side: Side) => {
  // Arrange: use the scenario fixtures.
  // Act
  await endVideo(page, videoId(world, side))
  // Assert: verified by the scenario's Then steps.
})

Then('the right video begins', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect(page.getByTestId('matchup-card-right').getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'playing')
})

Then('both cards become selectable', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  const votes = page.getByRole('button', { name: /Vote for/ })
  await expect(votes).toHaveCount(2)
  await expect(votes.nth(0)).toBeEnabled()
  await expect(votes.nth(1)).toBeEnabled()
})

Given('the browser refuses to autoplay the {side} video', async ({ page, world }, side: Side) => {
  // Arrange
  await setVideoBehavior(page, videoId(world, side), 'blocked-once')
  // Act: performed by the scenario's When steps.
  // Assert: verified by the scenario's Then steps.
})

Then('a play control is shown on the {side} card', async ({ page }, side: Side) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect(page.getByTestId(`matchup-card-${side}`).getByRole('button', { name: `Play ${side} video` })).toBeVisible()
})

Then('the voter can start the {side} video manually', async ({ page, world }, side: Side) => {
  // Arrange
  const id = videoId(world, side)
  await reachClipEnd(page, id, 3)
  // Act
  await page.getByTestId(`matchup-card-${side}`).getByRole('button', { name: `Play ${side} video` }).click()
  // Assert
  await expect(page.getByTestId(`matchup-card-${side}`).getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'playing')
  await expect.poll(() => page.evaluate((video) => window.__fakeVideo!.times[video], id)).toBe(0)
})

When('the voter replays the pair', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act
  await page.getByRole('button', { name: 'Replay videos' }).click()
  // Assert: verified by the scenario's Then steps.
})

Then('both cards remain selectable', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  const votes = page.getByRole('button', { name: /Vote for/ })
  await expect(votes).toHaveCount(2)
  await expect(votes.nth(0)).toBeEnabled()
  await expect(votes.nth(1)).toBeEnabled()
})

Given('the {side} contestant has no video', async ({ world }, side: Side) => {
  // Arrange
  world.matchupResponse!.matchup[side].media = []
  // Act: performed by the scenario's When steps.
  // Assert: verified by the scenario's Then steps.
})

Then('an unavailable state is shown on the {side} card', async ({ page }, side: Side) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect(page.getByTestId(`matchup-card-${side}`).getByRole('status')).toHaveText('Video unavailable')
})

Given('the {side} video has been made private', async ({ page, world }, side: Side) => {
  // Arrange
  await setVideoBehavior(page, videoId(world, side), 'unavailable')
  // Act: performed by the scenario's When steps.
  // Assert: verified by the scenario's Then steps.
})

Given('the videos are clips ending after 5 seconds', async ({ world }) => {
  // Arrange
  for (const side of ['left', 'right'] as const) world.matchup![side].media[0].end_seconds = 5
  // Act: performed by the scenario's When steps.
  // Assert: verified by the scenario's Then steps.
})

When('the {side} clip reaches its end time', async ({ page, world }, side: Side) => {
  // Arrange: use the scenario fixtures.
  // Act
  await reachClipEnd(page, videoId(world, side), 5)
  // Assert: verified by the scenario's Then steps.
})

Given('the video players cannot be loaded', async ({ page }) => {
  // Arrange
  await blockVideoScripts(page)
  // Act: performed by the scenario's When steps.
  // Assert: verified by the scenario's Then steps.
})

Given('a later video matchup', async ({ world }) => {
  // Arrange
  const next = buildVideoMatchupResponse()
  next.matchup.id = 'matchup-2'
  next.matchup.left.name = 'Third'
  next.matchup.right.name = 'Fourth'
  next.progress.voted = 1
  next.matchup.left.media = [buildVideoMediaItem({ id: 'later-left', provider: 'youtube', video_id: 'later-left-id' })]
  next.matchup.right.media = [buildVideoMediaItem({ id: 'later-right', provider: 'vimeo', video_id: '654321' })]
  world.matchupResponse!.prefetch = { matchup_id: next.matchup.id, media: [...next.matchup.left.media, ...next.matchup.right.media] }
  world.matchupCalls.push({ status: 200, body: next })
  // Act: performed by the scenario's When steps.
  // Assert: verified by the scenario's Then steps.
})

Then("the later matchup's video posters were fetched ahead", async ({ world }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect.poll(() => world.requestedUrls.some((url) => url.includes('later-left-poster'))).toBe(true)
  expect(world.requestedUrls.some((url) => url.includes('later-right-poster'))).toBe(true)
})

Then('the previous players are destroyed before the next pair starts', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect.poll(async () => (await videoStats(page)).destroyed).toBe(2)
  await expect(page.getByTestId('video-poster')).toHaveCount(2)
  await expect.poll(async () => (await videoStats(page)).created).toBe(3)
  expect((await videoStats(page)).events).toEqual([
    'created:left-id', 'created:123456', 'destroyed:left-id', 'destroyed:123456', 'created:later-left-id',
  ])
  await expect(page.getByTestId('matchup-card-left').getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'playing')
})

Then('the next video matchup is shown', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect(page.getByTestId('matchup-card-left')).toContainText('Third')
  await expect(page.getByTestId('matchup-card-right')).toContainText('Fourth')
})

When('they select the left video card', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act
  await page.getByTestId('matchup-card-left').getByRole('button', { name: 'Vote for Left Contestant' }).click()
  // Assert: verified by the scenario's Then steps.
})

When('the voter skips the first video', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act
  await page.getByRole('button', { name: 'Next video \u203a' }).click()
  // Assert: verified by the scenario's Then steps.
})

Then('the first player is stopped', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect.poll(async () => (await videoStats(page)).destroyed).toBe(1)
})

Then('only replay is offered', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect(page.getByRole('button', { name: 'Replay videos' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next video \u203a' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Play both videos' })).toHaveCount(0)
})

When('the voter clicks the right poster', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act
  await page.getByTestId('matchup-card-right').getByRole('button', { name: 'Skip to right video' }).click()
  // Assert: verified by the scenario's Then steps.
})

Given('the video vote takes time to accept', async ({ world }) => {
  // Arrange
  world.queue(voteRecipe(world.warId, { status: 201, body: { vote_id: 'vote-1' }, delayMs: 1500 }))
  // Act: performed by the scenario's When steps.
  // Assert: verified by the scenario's Then steps.
})

Then('both video vote buttons are disabled', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  const votes = page.getByRole('button', { name: /Vote for/ })
  await expect(votes).toHaveCount(2)
  await expect(votes.nth(0)).toBeDisabled()
  await expect(votes.nth(1)).toBeDisabled()
  expect((await videoStats(page)).destroyed).toBe(1)
})

Then('replay is not yet offered', async ({ page }) => {
  // Arrange: use the scenario fixtures.
  // Act: observe the rendered result.
  // Assert
  await expect(page.getByRole('button', { name: 'Play right video', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replay videos' })).toHaveCount(0)
})
