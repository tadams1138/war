// Steps for a rendered bio, named with the {bio} parameter type
// (support/bios.ts): identical wherever a bio is shown (the Edit page's
// preview, the War detail's results list).
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import type { BioRef } from '../support/bios'

const { Then } = createBdd(test)

const LISTS: Record<string, string> = { bulleted: 'ul li', numbered: 'ol li' }

Then('{bio} says {string}', async ({ page }, bio: BioRef, text: string) => {
  // Assert
  await expect(bio(page)).toContainText(text)
})

Then('{bio} shows the level-{int} heading {string}', async ({ page }, bio: BioRef, level: number, text: string) => {
  // Assert
  await expect(bio(page).getByRole('heading', { level, name: text })).toBeVisible()
})

Then('{bio} shows {string} in bold', async ({ page }, bio: BioRef, text: string) => {
  // Assert
  await expect(bio(page).locator('strong')).toHaveText(text)
})

Then('{bio} shows {string} emphasised', async ({ page }, bio: BioRef, text: string) => {
  // Assert
  await expect(bio(page).locator('em')).toHaveText(text)
})

Then('{bio} shows a {word} list of {int} items', async ({ page }, bio: BioRef, kind: string, count: number) => {
  // Assert
  await expect(bio(page).locator(LISTS[kind]!)).toHaveCount(count)
})

Then('{bio} shows the link {string}, underlined unlike the text around it', async ({ page }, bio: BioRef, text: string) => {
  // Assert
  await expect(bio(page).getByRole('link', { name: text })).toHaveCSS('text-decoration-line', 'underline')
  await expect(bio(page)).toHaveCSS('text-decoration-line', 'none')
})

Then('{bio} links {string} to {string}', async ({ page }, bio: BioRef, text: string, href: string) => {
  // Assert
  await expect(bio(page).getByRole('link', { name: text })).toHaveAttribute('href', href)
})

// Polled: a re-render can swap the bio's nodes mid-read, and a detached node has no computed style (NaN).
Then('{bio} separates its paragraphs with visible vertical space', async ({ page }, bio: BioRef) => {
  // Assert
  const paragraphs = bio(page).locator('p')
  await expect(paragraphs).toHaveCount(2)
  await expect.poll(() => paragraphs.first().evaluate((element) => parseFloat(getComputedStyle(element).marginBottom))).toBeGreaterThan(0)
})

Then('{bio} renders none of its markup as a script, an image or an event handler', async ({ page }, bio: BioRef) => {
  // Assert
  await expect(bio(page)).toBeVisible()
  await expect(bio(page).locator('script, img, [onerror]')).toHaveCount(0)
})
