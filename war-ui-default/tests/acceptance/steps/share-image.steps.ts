// Steps for features/share-image.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { buildContestant, buildMediaItem, buildWarDetail } from '../../../src/mocks/fixtures'
import { test } from './fixtures'
import { API, getCallLog } from '../support/mocking'
import { ok } from '../support/recipes'
import { warCard } from '../support/pages'

const { Given, When, Then } = createBdd(test, { tags: '@share-image' })

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function contestantWithImage(index: number) {
  return buildContestant({ id: `c-${index}`, name: `Contestant ${index}`, media: [buildMediaItem({ id: `m-${index}` })] })
}

Given('a draft War with {int} contestant(s) with an image', async ({ page, world }, count: number) => {
  // Arrange
  // Generating a share image decodes each contestant's image through a real
  // <img>. MSW never sees an <img> load, and the fixtures' CDN host does not
  // resolve, so the CDN is answered at the Playwright network layer instead.
  await page.route('https://cdn.example.test/**', (route) => route.fulfill({ contentType: 'image/png', body: TINY_PNG }))
  const id = world.nextWarId()
  const contestants = Array.from({ length: count }, (_, index) => contestantWithImage(index + 1))
  world.queue(ok('GET', `${API}/wars/${id}`, buildWarDetail({ id, status: 'draft', contestants })))
})

When('they choose a share image file', async ({ page }) => {
  // Act
  await page.getByTestId('edit-war-share-image-input').setInputFiles({ name: 'share.png', mimeType: 'image/png', buffer: TINY_PNG })
})

const generate = (page: Page) => page.getByTestId('edit-war-share-image-generate')
const preview = (page: Page) => page.getByTestId('edit-war-share-image-preview')

When('they generate a share image', async ({ page }) => {
  // Act
  await generate(page).click()
})

When('they generate a share image again', async ({ page, world }) => {
  // Act
  world.previousPreview = await preview(page).getAttribute('src')
  await generate(page).click()
})

When('they click Save', async ({ page }) => {
  // Act
  await page.getByTestId('edit-war-metadata-submit').click()
})

Then('a share image preview is shown', async ({ page }) => {
  // Assert
  await expect(preview(page)).toBeVisible()
})

Then('a fresh share image preview is shown', async ({ page, world }) => {
  // Assert
  expect(world.previousPreview).not.toBeNull()
  await expect(preview(page)).toBeVisible()
  await expect(preview(page)).not.toHaveAttribute('src', world.previousPreview!)
})

Then('no share image has been uploaded', async ({ page }) => {
  // Assert
  const log = await getCallLog(page)
  expect(log.some((entry) => entry.url.includes('/share-image'))).toBe(false)
})

Then('the generate control is disabled', async ({ page }) => {
  // Assert
  await expect(generate(page)).toBeDisabled()
})

Then('an explanation is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('edit-war-share-image-generate-unavailable')).toBeVisible()
})

Then('the {string} card displays the image {string}', async ({ page }, title: string, url: string) => {
  // Assert
  await expect(warCard(page, title).locator('.war-card-image')).toHaveAttribute('src', url)
})

Then('the {string} card has no image slot', async ({ page }, title: string) => {
  // Assert
  await expect(warCard(page, title).locator('.war-card-image')).toHaveCount(0)
})
