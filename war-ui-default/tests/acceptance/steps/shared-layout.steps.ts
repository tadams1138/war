// Steps for where controls sit and how they look, naming the controls by
// their labels ("Export, Delete and Publish War"): a button or a link, in the
// same words everywhere.
import { expect, type Locator, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { backgroundOf, boxOf, matchupCard } from '../support/pages'

import { SIDES } from '../support/screens'
import { warDetail } from '../support/editWar'
import { navigateAuthenticated } from '../support/mocking'
import { warTitle } from '../../../src/utils/warTitle'

const { Then } = createBdd(test)

const controlLabelled = (page: Page, name: string): Locator =>
  page.getByRole('button', { name, exact: true }).or(page.getByRole('link', { name, exact: true }))

const controls = (page: Page, names: string): Locator[] => names.split(/, | and /).map((name) => controlLabelled(page, name))

Then(/^(.+) sit in one horizontal row, in that order$/, async ({ page }, names: string) => {
  // Assert
  const boxes = await Promise.all(controls(page, names).map(boxOf))
  for (const [index, box] of boxes.entries()) {
    expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThan(5)
    if (index > 0) expect(box.x).toBeGreaterThan(boxes[index - 1]!.x)
  }
})

Then(/^(.+) share consistent button styling$/, async ({ page }, names: string) => {
  // Assert
  const backgrounds = await Promise.all(controls(page, names).map(backgroundOf))
  for (const background of backgrounds) expect(background).toBe(backgrounds[0])
  expect(backgrounds[0]).not.toBe('rgba(0, 0, 0, 0)')
})

Then(/^(.+) is visually set apart from (.+)$/, async ({ page }, name: string, others: string) => {
  // Assert
  const background = await backgroundOf(controlLabelled(page, name))
  for (const other of controls(page, others)) expect(await backgroundOf(other)).not.toBe(background)
})

Then(/^the "([^"]*)" (?:button|link) is above (.+)$/, async ({ page }, name: string, others: string) => {
  // Assert
  const { y } = await boxOf(controlLabelled(page, name))
  for (const other of controls(page, others)) expect(y).toBeLessThan((await boxOf(other)).y)
})

Then(/^the "([^"]*)" (?:button|link) is centered on the page$/, async ({ page }, name: string) => {
  // Assert
  const box = await boxOf(controlLabelled(page, name))
  const pageWidth = await page.evaluate(() => document.body.clientWidth)
  expect(Math.abs(box.x + box.width / 2 - pageWidth / 2)).toBeLessThan(pageWidth * 0.1)
})

Then(/^the "([^"]*)" (?:button|link) is larger than an ordinary button$/, async ({ page }, name: string) => {
  // Assert
  const fontSize = (control: Locator) => control.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
  const ordinary = await page.locator('main').evaluate((main) => {
    const probe = main.appendChild(document.createElement('button'))
    probe.className = 'button'
    const size = parseFloat(getComputedStyle(probe).fontSize)
    probe.remove()
    return size
  })
  expect(await fontSize(controlLabelled(page, name))).toBeGreaterThan(ordinary)
})

Then('both contestant cards are on screen', async ({ page }) => {
  // Arrange
  const viewport = page.viewportSize()!
  // Act
  await expect(page.getByTestId('matchup-view')).toBeVisible()
  // Assert
  for (const side of SIDES) {
    const card = await boxOf(matchupCard(page, side))
    expect(card.y).toBeGreaterThanOrEqual(0)
    expect(card.y + card.height).toBeLessThanOrEqual(viewport.height + 0.5)
    expect(card.x).toBeGreaterThanOrEqual(0)
    expect(card.x + card.width).toBeLessThanOrEqual(viewport.width + 0.5)
  }
})

Then('the War title is on screen above both contestants inside the vote block', async ({ page, world }) => {
  // Arrange
  const block = page.getByTestId('vote-layout')
  const title = block.getByRole('heading', { level: 1, name: warTitle(warDetail(world).title), exact: true })
  // Act
  await expect(title).toBeVisible()
  const heading = await boxOf(title)
  const bounds = await boxOf(block)
  // Assert
  expect(heading.y).toBeGreaterThanOrEqual(0)
  expect(heading.y + heading.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  expect(heading.y).toBeGreaterThanOrEqual(bounds.y)
  expect(heading.y + heading.height).toBeLessThanOrEqual(bounds.y + bounds.height)
  for (const side of SIDES) expect(heading.y + heading.height).toBeLessThanOrEqual((await boxOf(matchupCard(page, side))).y)
})

Then('the vote title has the same font size and weight as the results heading', async ({ page, world }) => {
  // Arrange
  const typography = (heading: Locator) => heading.evaluate((element) => {
    const style = getComputedStyle(element)
    return { size: style.fontSize, weight: style.fontWeight }
  })
  const title = page.getByTestId('vote-layout').getByRole('heading', { level: 1 })
  // Act
  const voteStyle = await typography(title)
  await navigateAuthenticated(page, `/wars/${world.warId}`)
  const results = page.locator('main').getByRole('heading', { level: 1, name: warTitle(warDetail(world).title), exact: true })
  await expect(results).toBeVisible()
  // Assert
  expect(voteStyle).toEqual(await typography(results))
})
