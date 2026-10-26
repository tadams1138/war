import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { buildMatchupResponse, buildVideoMatchupResponse, buildVideoMediaItem, buildWarDetail } from '../../../src/mocks/fixtures'
import { API } from '../support/mocking'
import { ok, reply } from '../support/recipes'
import { test } from './fixtures'

const { Given, When, Then } = createBdd(test, { tags: '@video-mode' })

Given('a matchup in a video War', async ({ world }) => {
  // Arrange
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
})

Then('both video posters are shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('video-poster')).toHaveCount(2)
})

When('the voter starts playback', async ({ page }) => {
  // Act
  await page.getByRole('button', { name: 'Play both videos' }).click()
})

Then('the left video plays first', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('matchup-card-left').getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'playing')
  await expect(page.getByTestId('matchup-card-right').getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'poster')
})

When('the left video ends', async ({ page }) => {
  // Act
  await page.getByTestId('matchup-card-left').getByRole('button', { name: 'Finish video' }).evaluate((button: HTMLButtonElement) => button.click())
})

Then('the right video begins', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('matchup-card-right').getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'playing')
})

Then('neither card is selectable', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('contestant-card').filter({ has: page.getByRole('button', { name: /Vote for/ }) })).toHaveCount(0)
})

When('the right video finishes', async ({ page }) => {
  // Act
  await page.getByTestId('matchup-card-right').getByRole('button', { name: 'Finish video' }).evaluate((button: HTMLButtonElement) => button.click())
})

Then('both cards become selectable', async ({ page }) => {
  // Assert
  await expect(page.getByRole('button', { name: /Vote for/ })).toHaveCount(2)
})

Given('the browser refuses to autoplay the right video', async ({ page }) => {
  // Arrange
  await page.evaluate(() => { (window as unknown as { __mockVideoBehavior: Record<string, string> }).__mockVideoBehavior = { '123456': 'blocked-once' } })
})

Then('a play control is shown on the right card', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('matchup-card-right').getByRole('button', { name: 'Play right video' })).toBeVisible()
})

Then('the voter can start the right video manually', async ({ page }) => {
  // Act
  await page.getByTestId('matchup-card-right').getByRole('button', { name: 'Play right video' }).click()
  // Assert
  await expect(page.getByTestId('matchup-card-right').getByTestId('contestant-card')).toHaveAttribute('data-video-state', 'playing')
})

When('the voter replays the pair', async ({ page }) => {
  // Act
  await page.getByRole('button', { name: 'Replay videos' }).click()
})

Then('both cards remain selectable', async ({ page }) => {
  // Assert
  await expect(page.getByRole('button', { name: /Vote for/ })).toHaveCount(2)
})

Given('the right contestant has no video', async ({ world }) => {
  // Arrange
  world.matchupResponse!.matchup.right.media = []
})

Then('an unavailable state is shown on the right card', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('matchup-card-right').getByRole('status')).toHaveText('Video unavailable')
})

Given('the right video has been made private', async ({ page }) => {
  // Arrange
  await page.evaluate(() => { (window as unknown as { __mockVideoBehavior: Record<string, string> }).__mockVideoBehavior = { '123456': 'unavailable' } })
})

Given('a later video matchup', async ({ world }) => {
  // Arrange
  const next = buildVideoMatchupResponse()
  next.matchup.id = 'matchup-2'
  next.matchup.left.name = 'Third'
  next.matchup.right.name = 'Fourth'
  next.progress.voted = 1
  world.matchupCalls.push({ status: 200, body: next })
})

Then('the previous players are destroyed before the next pair starts', async ({ page }) => {
  // Assert
  await expect.poll(async () => page.evaluate(() => window.__mockVideoStats?.destroyed)).toBe(2)
  await expect(page.getByTestId('video-poster')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Finish video' })).toHaveCount(0)
  expect(await page.evaluate(() => window.__mockVideoStats?.created)).toBe(2)
})

Then('the next video matchup is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('matchup-card-left')).toContainText('Third')
  await expect(page.getByTestId('matchup-card-right')).toContainText('Fourth')
})

When('they select the left video card', async ({ page }) => {
  // Act
  await page.getByTestId('matchup-card-left').getByRole('button', { name: 'Vote for Left Contestant' }).click()
})
