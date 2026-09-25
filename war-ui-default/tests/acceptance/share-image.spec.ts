// Binds features/share-image.feature.
import { expect, test } from '@playwright/test'
import { buildContestant, buildMediaItem, buildWarDetail, buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from './support/mocking'

const WAR_ID = 'war-share-1'
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function gotoEditPage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, `/wars/${WAR_ID}/edit`)
}

// generateShareImage() loads each qualifying contestant's largest image
// through a real <img> element. fixtures.ts's media URLs point at a fake
// CDN domain -- MSW's fetch/XHR interception never sees an <img> load, so
// without this a real browser would try to actually resolve that domain
// and the image would never decode. Routed at the Playwright network layer
// instead, which intercepts every request regardless of how it was made.
async function mockContestantImages(page: import('@playwright/test').Page) {
  await page.route('https://cdn.example.test/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(TINY_PNG_BASE64, 'base64') }),
  )
}

test("Uploading a share image doesn't upload until Save is clicked", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [] })
  const patched = buildWarSummary({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/share-image`, responses: [{ status: 200, body: patched }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: patched }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-share-image-input').setInputFiles({
    name: 'share.png',
    mimeType: 'image/png',
    buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
  })

  // Assert — picking the file alone sends nothing
  await expect(page.getByTestId('edit-war-share-image-preview')).toBeVisible()
  const beforeSave = await getCallLog(page)
  expect(beforeSave.some((c) => c.url.includes('/share-image'))).toBe(false)

  // Act
  await page.getByTestId('edit-war-metadata-submit').click()

  // Assert — Save sends it
  await waitForCallLog(page, (log) => log.some((c) => c.method === 'POST' && c.url.endsWith('/share-image')))
})

test("Generating a share image doesn't upload until Save is clicked, and can be re-rolled", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada', media: [buildMediaItem({ id: 'm-1' })] }),
      buildContestant({ id: 'c-2', name: 'Grace', media: [buildMediaItem({ id: 'm-2' })] }),
    ],
  })
  const patched = buildWarSummary({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/share-image`, responses: [{ status: 200, body: patched }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: patched }] },
  ])
  await mockContestantImages(page)
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-share-image-generate').click()

  // Assert — generating alone sends nothing
  await expect(page.getByTestId('edit-war-share-image-preview')).toBeVisible()
  const beforeSave = await getCallLog(page)
  expect(beforeSave.some((c) => c.url.includes('/share-image'))).toBe(false)

  // Act — re-roll picks a fresh preview without erroring
  await page.getByTestId('edit-war-share-image-generate').click()
  await expect(page.getByTestId('edit-war-share-image-preview')).toBeVisible()

  // Act
  await page.getByTestId('edit-war-metadata-submit').click()

  // Assert
  await waitForCallLog(page, (log) => log.some((c) => c.method === 'POST' && c.url.endsWith('/share-image')))
})

test('Generate is disabled with an explanation when fewer than two contestants have an image', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [buildMediaItem({ id: 'm-1' })] })],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('edit-war-share-image-generate')).toBeDisabled()
  await expect(page.getByTestId('edit-war-share-image-generate-unavailable')).toBeVisible()
})

test('A War card shows its share image when the War has one', async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-with-image', title: 'Has Image', status: 'draft', share_image_url: 'https://cdn.example.test/share.jpg' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war], next_cursor: null } }] }])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/my-wars')

  // Assert
  const card = page.getByTestId('war-card').filter({ hasText: 'Has Image' })
  await expect(card.locator('.war-card-image')).toHaveAttribute('src', 'https://cdn.example.test/share.jpg')
})

test('A War card shows no image slot when the War has none', async ({ page }) => {
  // Arrange
  const war = buildWarSummary({ id: 'war-no-image', title: 'No Image', status: 'draft', share_image_url: null })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [war], next_cursor: null } }] }])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/my-wars')

  // Assert
  const card = page.getByTestId('war-card').filter({ hasText: 'No Image' })
  await expect(card.locator('.war-card-image')).toHaveCount(0)
})
