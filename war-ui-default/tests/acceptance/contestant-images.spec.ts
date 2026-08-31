// Binds features/contestant-images.feature.
import { expect, test, type Page } from '@playwright/test'
import { buildMediaItem, buildMatchupResponse } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

const WAR_ID = 'war-images-1'

function mediaSet(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) =>
    buildMediaItem({ id: `${prefix}-media-${index}`, display_order: index }),
  )
}

async function gotoVotePage(page: Page) {
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, `/wars/${WAR_ID}/vote`)
}

async function setupMatchup(page: Page, leftMedia: ReturnType<typeof mediaSet>) {
  const matchup = buildMatchupResponse({
    matchup: {
      id: 'matchup-images',
      left: { id: 'left-contestant', name: 'Left', media: leftMedia },
      right: { id: 'right-contestant', name: 'Right', media: mediaSet(1, 'right') },
    },
  })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: matchup }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/matchups/matchup-images/vote`, responses: [{ status: 201, body: { vote_id: 'v1' } }] },
  ])
  await gotoVotePage(page)
}

function leftCarousel(page: Page) {
  return page.getByTestId('contestant-card').filter({ hasText: 'Left' }).getByTestId('carousel-root')
}

// Dispatches real pointer events directly at the carousel, rather than
// driving the OS-level cursor via page.mouse — that traversal can cross
// sibling elements mid-drag on a real layout, and what this needs to
// verify is purely how ImageCarousel classifies a given clientX delta, not
// pixel-perfect cursor travel.
async function swipe(carousel: ReturnType<typeof leftCarousel>, deltaX: number, returnToStart = false) {
  const box = await carousel.boundingBox()
  if (!box) throw new Error('carousel not found')
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  const pointerInit = (clientX: number) => ({ pointerId: 1, clientX, clientY: startY, button: 0, bubbles: true })
  await carousel.dispatchEvent('pointerdown', pointerInit(startX))
  await carousel.dispatchEvent('pointermove', pointerInit(startX + deltaX))
  if (returnToStart) {
    await carousel.dispatchEvent('pointermove', pointerInit(startX))
  }
  await carousel.dispatchEvent('pointerup', pointerInit(returnToStart ? startX : startX + deltaX))
}

test('Swiping browses images without voting', async ({ page }) => {
  // Arrange
  await setupMatchup(page, mediaSet(3, 'left'))
  const carousel = leftCarousel(page)

  // Act
  await swipe(carousel, -50)

  // Assert
  await expect(carousel.getByTestId('carousel-dot').nth(1)).toHaveAttribute('data-active', 'true')
  const voteCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/vote'))
  expect(voteCalls).toHaveLength(0)
})

test('A swipe never casts a vote however it ends', async ({ page }) => {
  // Arrange
  await setupMatchup(page, mediaSet(3, 'left'))
  const carousel = leftCarousel(page)

  // Act — swipes away from the start, then releases back over it
  await swipe(carousel, -50, true)

  // Assert
  const voteCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/vote'))
  expect(voteCalls).toHaveLength(0)
})

test('Tapping votes', async ({ page }) => {
  // Arrange
  await setupMatchup(page, mediaSet(3, 'left'))
  const carousel = leftCarousel(page)

  // Act
  await swipe(carousel, 0)

  // Assert — poll the durable outcome (a vote request landed, naming the
  // tapped contestant), not the transient in-flight state: the mock vote
  // response has no delay, so aria-busy can flip back to false before the
  // first poll ever observes it.
  await expect
    .poll(async () => (await getCallLog(page)).filter((entry) => entry.url.includes('/vote')).map((entry) => entry.body))
    .toEqual([JSON.stringify({ winner_id: 'left-contestant' })])
})

test('A single image shows no carousel affordance', async ({ page }) => {
  // Arrange
  await setupMatchup(page, mediaSet(1, 'left'))

  // Assert
  await expect(leftCarousel(page).getByTestId('carousel-dot')).toHaveCount(0)
  await expect(leftCarousel(page).getByTestId('carousel-arrow-next')).toHaveCount(0)
})

test('Dot indicators and arrows appear with multiple images', async ({ page }) => {
  // Arrange
  await setupMatchup(page, mediaSet(3, 'left'))

  // Assert
  await expect(leftCarousel(page).getByTestId('carousel-dot')).toHaveCount(3)
  await expect(leftCarousel(page).getByTestId('carousel-arrow-next')).toBeVisible()
  await expect(leftCarousel(page).getByTestId('carousel-arrow-previous')).toBeVisible()
})

test('Arrow controls and the keyboard browse images without voting', async ({ page }) => {
  // Arrange
  await setupMatchup(page, mediaSet(3, 'left'))
  const carousel = leftCarousel(page)
  await carousel.focus()

  // Act
  await page.keyboard.press('ArrowRight')

  // Assert
  await expect(carousel.getByTestId('carousel-dot').nth(1)).toHaveAttribute('data-active', 'true')
  const voteCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/vote'))
  expect(voteCalls).toHaveLength(0)
  await expect(carousel.getByTestId('carousel-arrow-next')).toHaveAttribute('tabindex', '-1')
  await expect(carousel.getByTestId('carousel-arrow-previous')).toHaveAttribute('tabindex', '-1')
})

test('Non-primary images are not loaded up front', async ({ page }) => {
  // Arrange
  const requestedImageUrls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('cdn.example.test/left-media')) requestedImageUrls.push(request.url())
  })
  await setupMatchup(page, mediaSet(10, 'left'))
  await expect(leftCarousel(page).getByTestId('carousel-image')).toBeVisible()

  // Assert
  expect(requestedImageUrls.some((url) => url.includes('left-media-0'))).toBe(true)
  for (let index = 1; index < 10; index += 1) {
    expect(requestedImageUrls.some((url) => url.includes(`left-media-${index}/`))).toBe(false)
  }
})

test('Navigating toward an image loads it on demand', async ({ page }) => {
  // Arrange
  const requestedImageUrls: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('cdn.example.test/left-media')) requestedImageUrls.push(request.url())
  })
  await setupMatchup(page, mediaSet(10, 'left'))
  const carousel = leftCarousel(page)
  await expect(carousel.getByTestId('carousel-image')).toBeVisible()

  // Act
  await swipe(carousel, -50)

  // Assert
  await expect.poll(() => requestedImageUrls.some((url) => url.includes('left-media-1/'))).toBe(true)
  for (let index = 2; index < 10; index += 1) {
    expect(requestedImageUrls.some((url) => url.includes(`left-media-${index}/`))).toBe(false)
  }
})
