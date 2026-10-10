// Steps for features/vote-mode-responsive.feature. Scoped with the feature's
// own tag so no other feature can ever bind to (or collide with) this text.
import { expect, type Locator, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { SIDES, type Side } from '../support/screens'

const { When, Then } = createBdd(test, { tags: '@vote-mode-responsive' })

// .matchup-view distributes its exact pixel budget between two flex-grow
// rows and a fixed (negative-margined) vs-divider -- Chromium's internal
// 1/64px layout snapping can overrun that budget by a sub-pixel amount
// (observed: 0.015625px) with no visible effect (no scrollbar, nothing
// clipped). A viewport-fit assertion tolerates that, not a whole extra
// row of content.
const SUBPIXEL_ROUNDING_TOLERANCE_PX = 0.5

const card = (page: Page, side: Side) => page.getByTestId(`matchup-card-${side}`)
const bio = (page: Page, side: Side) => page.getByTestId(`matchup-bio-${side}`)
const bioText = (page: Page, side: Side) => bio(page, side).getByTestId('contestant-bio')
const footer = (page: Page) => page.locator('.app-footer')

async function box(locator: Locator) {
  const result = await locator.boundingBox()
  expect(result).not.toBeNull()
  return result!
}

async function cardsOnScreen(page: Page, sides: readonly Side[]): Promise<void> {
  const viewportHeight = page.viewportSize()!.height
  for (const side of sides) {
    await expect(card(page, side)).toBeVisible()
    const { y, height } = await box(card(page, side))
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y + height).toBeLessThanOrEqual(viewportHeight + SUBPIXEL_ROUNDING_TOLERANCE_PX)
  }
}

// The vote page opens scrolled past the header only once the matchup is laid out.
const matchupLoaded = (page: Page) => expect(page.getByTestId('matchup-view')).toBeVisible()

When("they click the {side} contestant's bio", async ({ page }, side: Side) => {
  // Act
  await bioText(page, side).click()
})

When('they scroll down to the bios', async ({ page }) => {
  // Act
  await bio(page, 'left').scrollIntoViewIfNeeded()
})

When('they scroll down to the footer', async ({ page }) => {
  // Act
  await footer(page).scrollIntoViewIfNeeded()
})

Then('the page is scrolled past the header', async ({ page }) => {
  // Assert
  await matchupLoaded(page)
  await expect(page.getByTestId('nav-home')).not.toBeInViewport()
})

Then('both contestant cards are on screen', async ({ page }) => {
  // Assert
  await cardsOnScreen(page, SIDES)
})

Then("the {side} contestant's card is on screen", async ({ page }, side: Side) => {
  // Assert
  await cardsOnScreen(page, [side])
})

Then('the contestants are stacked vertically', async ({ page }) => {
  // Assert
  const [left, right] = [await box(card(page, 'left')), await box(card(page, 'right'))]
  expect(right.y).toBeGreaterThanOrEqual(left.y + left.height - SUBPIXEL_ROUNDING_TOLERANCE_PX)
})

Then('the contestants are side by side', async ({ page }) => {
  // Assert
  await matchupLoaded(page)
  const [left, right] = [await box(card(page, 'left')), await box(card(page, 'right'))]
  expect(right.x).toBeGreaterThan(left.x)
  expect(Math.abs(left.y - right.y)).toBeLessThan(5)
})

Then('the page has no horizontal scrollbar', async ({ page }) => {
  // Assert
  const [scrollWidth, clientWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})

Then('the VS divider is visible', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('vs-divider')).toBeVisible()
})

Then("the {side} contestant's bio scrolls within its own area", async ({ page }, side: Side) => {
  // Assert
  await matchupLoaded(page)
  const [scrollHeight, clientHeight] = await bio(page, side).evaluate((el) => [el.scrollHeight, el.clientHeight])
  expect(scrollHeight).toBeGreaterThan(clientHeight)
})

Then("each contestant's bio is on screen", async ({ page }) => {
  // Assert
  for (const side of SIDES) await expect(bioText(page, side)).toBeInViewport()
})

Then('each bio sits beside its own card', async ({ page }) => {
  // Assert
  for (const side of SIDES) expect((await box(bio(page, side))).x).toBeGreaterThan((await box(card(page, side))).x)
})

Then('the bios are below the fold', async ({ page }) => {
  // Assert
  await matchupLoaded(page)
  for (const side of SIDES) await expect(bioText(page, side)).not.toBeInViewport()
})

Then('the footer is below the fold', async ({ page }) => {
  // Assert
  await matchupLoaded(page)
  await expect(footer(page)).not.toBeInViewport()
})

Then('the footer is on screen', async ({ page }) => {
  // Assert
  await expect(footer(page)).toBeInViewport()
})
