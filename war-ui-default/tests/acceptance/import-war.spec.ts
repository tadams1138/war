// Binds features/import-war.feature (spec §10.4, "Import"). Reverses Export:
// unzips a previously exported file client-side and recreates a draft War
// through the same endpoints EditWar's own UI already calls.
import { strToU8, zipSync } from 'fflate'
import { expect, test } from '@playwright/test'
import { buildContestant, buildWarDetail, buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from './support/mocking'

function validWarJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: 'Miss Universe 2026',
    category: 'Pageant',
    visibility: 'public',
    theme: 'arcade',
    ends_at: null,
    contestants: [
      {
        name: 'Ada',
        bio: 'A brilliant mathematician.',
        media: [{ display_order: 0, aspect_ratio: 0.75, path: 'media/c-1/m-1.jpg' }],
      },
    ],
    ...overrides,
  })
}

function zipBuffer(files: Record<string, Uint8Array | string>): Buffer {
  const encoded: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    encoded[path] = typeof content === 'string' ? strToU8(content) : content
  }
  return Buffer.from(zipSync(encoded))
}

test('Selecting a valid export file imports it and navigates to the new draft’s Edit page', async ({ page }) => {
  // Arrange
  const zip = zipBuffer({ 'war.json': validWarJson(), 'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]) })
  const createdWar = buildWarSummary({ id: 'war-imported', status: 'draft', title: 'Miss Universe 2026' })
  const createdContestant = buildContestant({ id: 'c-imported', name: 'Ada' })
  const importedDetail = buildWarDetail({ id: 'war-imported', status: 'draft', contestants: [createdContestant] })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    { method: 'POST', path: `${API}/wars/war-imported/contestants`, responses: [{ status: 201, body: createdContestant }] },
    {
      method: 'POST',
      path: `${API}/wars/war-imported/contestants/c-imported/images`,
      responses: [{ status: 201, body: { id: 'image-1', display_order: 0 } }],
    },
    { method: 'GET', path: `${API}/wars/war-imported`, responses: [{ status: 200, body: importedDetail }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/import')

  // Act
  await page.getByTestId('import-war-input').setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: zip })

  // Assert
  await expect(page).toHaveURL('/wars/war-imported/edit')
})

test('Selecting a valid export file with a share image uploads it to the new draft', async ({ page }) => {
  // Arrange
  const zip = zipBuffer({
    'war.json': validWarJson({ share_image: 'share-image.jpg' }),
    'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]),
    'share-image.jpg': new Uint8Array([4, 5, 6]),
  })
  const createdWar = buildWarSummary({ id: 'war-imported', status: 'draft', title: 'Miss Universe 2026' })
  const createdContestant = buildContestant({ id: 'c-imported', name: 'Ada' })
  const importedDetail = buildWarDetail({ id: 'war-imported', status: 'draft', contestants: [createdContestant] })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    { method: 'POST', path: `${API}/wars/war-imported/share-image`, responses: [{ status: 200, body: createdWar }] },
    { method: 'POST', path: `${API}/wars/war-imported/contestants`, responses: [{ status: 201, body: createdContestant }] },
    {
      method: 'POST',
      path: `${API}/wars/war-imported/contestants/c-imported/images`,
      responses: [{ status: 201, body: { id: 'image-1', display_order: 0 } }],
    },
    { method: 'GET', path: `${API}/wars/war-imported`, responses: [{ status: 200, body: importedDetail }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/import')

  // Act
  await page.getByTestId('import-war-input').setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: zip })

  // Assert
  await expect(page).toHaveURL('/wars/war-imported/edit')
  const log = await waitForCallLog(page, (entries) => entries.some((entry) => entry.url.includes('/share-image')))
  expect(log.some((entry) => entry.method === 'POST' && entry.url.includes('/wars/war-imported/share-image'))).toBe(true)
})

test('Selecting a file that is not a valid export shows an error and creates nothing', async ({ page }) => {
  // Arrange
  const notAZip = Buffer.from('this is plain text, not a zip file')
  await useScenario(page, [])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/import')

  // Act
  await page.getByTestId('import-war-input').setInputFiles({ name: 'not-a-zip.zip', mimeType: 'application/zip', buffer: notAZip })

  // Assert
  await expect(page.getByTestId('import-war-error')).toBeVisible()
  const postCalls = (await getCallLog(page)).filter((entry) => entry.method === 'POST')
  expect(postCalls).toHaveLength(0)
})
