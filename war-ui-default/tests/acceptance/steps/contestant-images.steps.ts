// Steps for features/contestant-images.feature. Scoped with the feature's own
// tag so no other feature can ever bind to (or collide with) this text.
import { expect, type Locator, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { getCallLog } from '../support/mocking'
import type { Side } from '../support/screens'

const { Given, When, Then } = createBdd(test, { tags: '@contestant-images' })

const SWIPE_BEYOND_THRESHOLD_PX = -50

const carousel = (page: Page, side: Side) => page.getByTestId(`matchup-card-${side}`).getByTestId('carousel-root')
const dots = (page: Page, side: Side) => carousel(page, side).getByTestId('carousel-dot')
const nextArrow = (page: Page, side: Side) => carousel(page, side).getByTestId('carousel-arrow-next')
const previousArrow = (page: Page, side: Side) => carousel(page, side).getByTestId('carousel-arrow-previous')

// Dispatches real pointer events directly at the carousel, rather than
// driving the OS-level cursor via page.mouse — that traversal can cross
// sibling elements mid-drag on a real layout, and what this needs to
// verify is purely how ImageCarousel classifies a given clientX delta, not
// pixel-perfect cursor travel.
type SwipeEnd = 'release' | 'return' | 'cancel'

async function swipe(target: Locator, deltaX: number, end: SwipeEnd = 'release'): Promise<void> {
  const box = (await target.boundingBox())!
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  const pointer = (clientX: number) => ({ pointerId: 1, clientX, clientY: startY, button: 0, bubbles: true })
  await target.dispatchEvent('pointerdown', pointer(startX))
  await target.dispatchEvent('pointermove', pointer(startX + deltaX))
  if (end === 'cancel') return target.dispatchEvent('pointercancel', pointer(startX + deltaX))
  if (end === 'return') await target.dispatchEvent('pointermove', pointer(startX))
  await target.dispatchEvent('pointerup', pointer(end === 'return' ? startX : startX + deltaX))
}

const wasRequested = (urls: string[], side: Side, image: number) => urls.some((url) => url.includes(`cdn.example.test/${side}-media-${image - 1}/`))

Given("the {side} contestant's card has keyboard focus", async ({ page }, side: Side) => {
  // Arrange
  await carousel(page, side).focus()
})

When("they swipe the {side} contestant's card beyond the swipe threshold", async ({ page }, side: Side) => {
  // Act
  await swipe(carousel(page, side), SWIPE_BEYOND_THRESHOLD_PX)
})

When("they begin swiping the {side} contestant's card and release it back over its starting position", async ({ page }, side: Side) => {
  // Act
  await swipe(carousel(page, side), SWIPE_BEYOND_THRESHOLD_PX, 'return')
})

When("they begin swiping the {side} contestant's card and the browser cancels the swipe", async ({ page }, side: Side) => {
  // Act
  await swipe(carousel(page, side), SWIPE_BEYOND_THRESHOLD_PX, 'cancel')
})

When("they tap the {side} contestant's card", async ({ page }, side: Side) => {
  // Act
  await swipe(carousel(page, side), 0)
})

When('they press the {side} arrow key', async ({ page }, side: Side) => {
  // Act
  await page.keyboard.press(side === 'left' ? 'ArrowLeft' : 'ArrowRight')
})

// A real mouse click, not a keyboard press: pointerdown/pointerup on the arrow
// button bubble to the carousel's own tap-to-vote gesture handlers before the
// button's click handler ever runs, a materially different path from the keyboard.
When("they click the next-image arrow on the {side} contestant's card", async ({ page }, side: Side) => {
  // Act
  await nextArrow(page, side).click()
})

Then("the {side} contestant's card shows image {int}", async ({ page }, side: Side, image: number) => {
  // Assert
  await expect(dots(page, side).nth(image - 1)).toHaveAttribute('data-active', 'true')
})

// Polls the durable outcome (a vote request landed, naming the tapped
// contestant), not the transient in-flight state: the mock vote response has
// no delay, so aria-busy can flip back before the first poll observes it.
Then('a vote is submitted for the {side} contestant', async ({ page }, side: Side) => {
  // Assert
  const votes = async () => (await getCallLog(page)).filter((entry) => entry.url.includes('/vote')).map((entry) => entry.body)
  await expect.poll(votes).toEqual([JSON.stringify({ winner_id: `contestant-${side}` })])
})

Then("the {side} contestant's card shows no dot indicators or arrow controls", async ({ page }, side: Side) => {
  // Assert
  await expect(carousel(page, side)).toBeVisible()
  await expect(dots(page, side)).toHaveCount(0)
  await expect(nextArrow(page, side)).toHaveCount(0)
  await expect(previousArrow(page, side)).toHaveCount(0)
})

Then("the {side} contestant's card shows {int} dot indicators and arrow controls", async ({ page }, side: Side, count: number) => {
  // Assert
  await expect(dots(page, side)).toHaveCount(count)
  await expect(nextArrow(page, side)).toBeVisible()
  await expect(previousArrow(page, side)).toBeVisible()
})

Then("the {side} contestant's card remains a single tab stop", async ({ page }, side: Side) => {
  // Assert
  await expect(nextArrow(page, side)).toHaveAttribute('tabindex', '-1')
  await expect(previousArrow(page, side)).toHaveAttribute('tabindex', '-1')
})

Then("the {side} contestant's image {int} has been requested", async ({ world }, side: Side, image: number) => {
  // Assert
  await expect.poll(() => wasRequested(world.requestedUrls, side, image)).toBe(true)
})

Then("the {side} contestant's images {int} to {int} have not been requested", async ({ world }, side: Side, first: number, last: number) => {
  // Assert
  for (let image = first; image <= last; image += 1) expect(wasRequested(world.requestedUrls, side, image)).toBe(false)
})
