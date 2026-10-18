// Steps for where controls sit and how they look, naming the controls by
// their labels ("Export, Delete and Publish War"): a button or a link, in the
// same words everywhere.
import { expect, type Locator, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { backgroundOf, boxOf } from '../support/pages'

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
