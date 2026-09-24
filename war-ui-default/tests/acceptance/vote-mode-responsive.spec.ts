// Binds features/vote-mode-responsive.feature. The vote page's own layout
// (war-spec.md 10.3): the tap-to-vote block (progress + both cards) fills
// the viewport with no scroll needed to vote, opened already scrolled past
// the header; bios sit outside that block -- below it on a wide viewport,
// beside each card on a narrow one -- and clicking one never casts a vote.
import { expect, test } from '@playwright/test'
import { buildMatchupResponse, buildMediaItem } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

// .matchup-view distributes its exact pixel budget between two flex-grow
// rows and a fixed (negative-margined) vs-divider -- Chromium's internal
// 1/64px layout snapping can overrun that budget by a sub-pixel amount
// (observed: 0.015625px) with no visible effect (no scrollbar, nothing
// clipped). A viewport-fit assertion tolerates that, not a whole extra
// row of content.
const SUBPIXEL_ROUNDING_TOLERANCE_PX = 0.5

async function mockVotePage(page: import('@playwright/test').Page, matchupOverrides: Parameters<typeof buildMatchupResponse>[0] = {}) {
  const matchup = buildMatchupResponse(matchupOverrides)
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/war-1/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/war-1/matchups/next`, responses: [{ status: 200, body: matchup }] },
    { method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: { id: 'war-1', title: 'Miss Universe 2026', category: null, status: 'published', visibility: 'public', media_mode: 'image', theme: 'arcade', ends_at: null, contestant_count: 2, contestants: [] } }] },
  ])
}

async function gotoVotePage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/war-1/vote')
  // Web fonts (Google Fonts, index.html) can still be swapping in after the
  // card is visible -- measuring layout before the swap finishes races the
  // fallback font's own metrics under load (CI's shared runners), not a
  // real regression.
  await page.evaluate(() => document.fonts.ready)
}

test('Both contestant cards stay visible without scrolling on a phone, and the page opens scrolled past the header', async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 390, height: 844 })
  await mockVotePage(page)
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/wars/war-1/vote')
  await expect(page.getByTestId('contestant-card').last()).toBeVisible()

  // Assert — the page opened already scrolled to the tap-to-vote block, so
  // the header is above the fold (war-spec.md 10.3).
  await expect(page.getByTestId('nav-home')).not.toBeInViewport()

  // Assert — both cards' own tap targets are on screen without scrolling.
  const left = await page.getByTestId('matchup-card-left').boundingBox()
  const right = await page.getByTestId('matchup-card-right').boundingBox()
  expect(left).not.toBeNull()
  expect(right).not.toBeNull()
  expect(left!.y).toBeGreaterThanOrEqual(0)
  expect(left!.y + left!.height).toBeLessThanOrEqual(844 + SUBPIXEL_ROUNDING_TOLERANCE_PX)
  expect(right!.y).toBeGreaterThanOrEqual(0)
  expect(right!.y + right!.height).toBeLessThanOrEqual(844 + SUBPIXEL_ROUNDING_TOLERANCE_PX)

  // Assert — no horizontal scroll.
  const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  await expect(page.getByTestId('vs-divider')).toBeVisible()
})

test('On a narrow viewport, each bio sits beside its own card, not below the fold', async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 390, height: 844 })
  await mockVotePage(page, {
    matchup: {
      id: 'matchup-1',
      left: { id: 'contestant-left', name: 'Left Contestant', bio: 'Left bio.', media: [] },
      right: { id: 'contestant-right', name: 'Right Contestant', bio: 'Right bio.', media: [] },
    },
  })

  // Act
  await gotoVotePage(page)

  // Assert — both bios are already on screen, no scroll needed.
  await expect(page.getByTestId('matchup-bio-left').getByTestId('contestant-bio')).toBeInViewport()
  await expect(page.getByTestId('matchup-bio-right').getByTestId('contestant-bio')).toBeInViewport()

  // Assert — bio sits to the right of its own card (beside it, not under it).
  const card = await page.getByTestId('matchup-card-left').boundingBox()
  const bio = await page.getByTestId('matchup-bio-left').boundingBox()
  expect(card).not.toBeNull()
  expect(bio).not.toBeNull()
  expect(bio!.x).toBeGreaterThan(card!.x)
})

test("On a narrow viewport, a long bio scrolls within its own space instead of pushing the other contestant's card off screen", async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 390, height: 844 })
  const longBio = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} of a very long bio.`).join('\n\n')
  await mockVotePage(page, {
    matchup: {
      id: 'matchup-1',
      left: { id: 'contestant-left', name: 'Left Contestant', bio: longBio, media: [] },
      right: { id: 'contestant-right', name: 'Right Contestant', bio: 'Right bio.', media: [] },
    },
  })

  // Act
  await gotoVotePage(page)

  // Assert — the right contestant's card stays fully on screen; the left
  // bio's own overflow scrolls internally rather than growing its row (and
  // everything after it) past the viewport.
  const right = await page.getByTestId('matchup-card-right').boundingBox()
  expect(right).not.toBeNull()
  expect(right!.y + right!.height).toBeLessThanOrEqual(844 + SUBPIXEL_ROUNDING_TOLERANCE_PX)
  const [scrollHeight, clientHeight] = await page
    .getByTestId('matchup-bio-left')
    .evaluate((el) => [el.scrollHeight, el.clientHeight])
  expect(scrollHeight).toBeGreaterThan(clientHeight)
})

test('Clicking a bio never casts a vote', async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 390, height: 844 })
  await mockVotePage(page, {
    matchup: {
      id: 'matchup-1',
      left: { id: 'contestant-left', name: 'Left Contestant', bio: 'A bio long enough to click on.', media: [] },
      right: { id: 'contestant-right', name: 'Right Contestant', bio: null, media: [] },
    },
  })
  await gotoVotePage(page)

  // Act
  await page.getByTestId('matchup-bio-left').getByTestId('contestant-bio').click()

  // Assert
  const calls = await getCallLog(page)
  expect(calls.some((c) => c.method === 'POST' && c.url.includes('/vote'))).toBe(false)
})

test('The matchup lays out side by side above the phone breakpoint, with bios below the fold', async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 1200, height: 800 })
  await mockVotePage(page, {
    matchup: {
      id: 'matchup-1',
      left: { id: 'contestant-left', name: 'Left Contestant', bio: 'Left bio.', media: [buildMediaItem({ id: 'left-media-0' })] },
      right: { id: 'contestant-right', name: 'Right Contestant', bio: 'Right bio.', media: [buildMediaItem({ id: 'right-media-0' })] },
    },
  })

  // Act
  await gotoVotePage(page)

  // Assert — cards side by side: left sits left of right, roughly the same
  // vertical position, proving the wide breakpoint is actually firing.
  const left = await page.getByTestId('matchup-card-left').boundingBox()
  const right = await page.getByTestId('matchup-card-right').boundingBox()
  expect(left).not.toBeNull()
  expect(right).not.toBeNull()
  expect(right!.x).toBeGreaterThan(left!.x)
  expect(Math.abs(left!.y - right!.y)).toBeLessThan(5)

  // Assert — both cards' tap targets are on screen without scrolling.
  expect(left!.y + left!.height).toBeLessThanOrEqual(800)
  expect(right!.y + right!.height).toBeLessThanOrEqual(800)

  // Assert — bios are not yet visible; they're below the fold.
  await expect(page.getByTestId('matchup-bio-left').getByTestId('contestant-bio')).not.toBeInViewport()

  // Act — scroll down to reach them.
  await page.getByTestId('matchup-bio-left').scrollIntoViewIfNeeded()

  // Assert
  await expect(page.getByTestId('matchup-bio-left').getByTestId('contestant-bio')).toBeInViewport()
  await expect(page.getByTestId('matchup-bio-right').getByTestId('contestant-bio')).toBeInViewport()
})

test('The footer is reachable below the fold on both breakpoints', async ({ page }) => {
  // Arrange
  await page.setViewportSize({ width: 390, height: 844 })
  await mockVotePage(page)

  // Act
  await gotoVotePage(page)

  // Assert
  await expect(page.locator('.app-footer')).not.toBeInViewport()
  await page.locator('.app-footer').scrollIntoViewIfNeeded()
  await expect(page.locator('.app-footer')).toBeInViewport()
})
