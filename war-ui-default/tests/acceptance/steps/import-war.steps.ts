// Steps for features/import-war.feature (spec §10.4, "Import"). Scoped with the
// feature's own tag so no other feature can ever bind to this text.
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { buildContestant, buildWarDetail, buildWarSummary } from '../../../src/mocks/fixtures'
import { test } from './fixtures'
import { API, getCallLog, waitForCallLog, type MswCallLogEntry } from '../support/mocking'
import { ok, reply } from '../support/recipes'
import { validWarJson, zipBuffer } from '../support/exportArchive'

const { Given, When, Then } = createBdd(test, { tags: '@import-war' })

const WAR_ID = 'war-imported'
const importedWar = () => buildWarSummary({ id: WAR_ID, status: 'draft', title: 'Miss Universe 2026' })
const importedContestant = () => buildContestant({ id: 'c-imported', name: 'Ada' })

const exported = JSON.parse(validWarJson()) as { title: string; category: string; contestants: { name: string }[] }

function posted(log: MswCallLogEntry[], urlEnd: string): unknown[] {
  return log.filter((entry) => entry.method === 'POST' && entry.url.endsWith(urlEnd)).map((entry) => JSON.parse(entry.body || '{}'))
}

Given('the API accepts an imported War', async ({ world }) => {
  // Arrange
  world.warId = WAR_ID
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [importedContestant()] })
  world.queue(
    reply('POST', `${API}/wars`, 201, importedWar()),
    reply('POST', `${API}/wars/${WAR_ID}/contestants`, 201, importedContestant()),
    reply('POST', `${API}/wars/${WAR_ID}/contestants/c-imported/images`, 201, { id: 'image-1', display_order: 0 }),
    ok('GET', `${API}/wars/${WAR_ID}`, detail),
  )
})

When('they choose a valid War export file', async ({ page }) => {
  // Act
  const zip = zipBuffer({ 'war.json': validWarJson(), 'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]) })
  await page.getByTestId('import-war-input').setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: zip })
})

When('they choose a file that is not a valid War export', async ({ page }) => {
  // Act
  const notAZip = Buffer.from('this is plain text, not a zip file')
  await page.getByTestId('import-war-input').setInputFiles({ name: 'not-a-zip.zip', mimeType: 'application/zip', buffer: notAZip })
})

When('they choose a valid War export file that includes a share image', async ({ page }) => {
  // Act
  const zip = zipBuffer({
    'war.json': validWarJson({ share_image: 'share-image.jpg' }),
    'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]),
    'share-image.jpg': new Uint8Array([4, 5, 6]),
  })
  await page.getByTestId('import-war-input').setInputFiles({ name: 'export.zip', mimeType: 'application/zip', buffer: zip })
})

Then('a new draft War is created from it', async ({ page }) => {
  // Assert
  const log = await waitForCallLog(page, (calls) => posted(calls, `/wars/${WAR_ID}/contestants`).length > 0)
  expect(posted(log, '/wars')).toEqual([expect.objectContaining({ title: exported.title, category: exported.category })])
  expect(posted(log, `/wars/${WAR_ID}/contestants`)).toEqual([expect.objectContaining({ name: exported.contestants[0]!.name })])
})

Then('an error is shown', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('import-war-error')).toBeVisible()
})

Then('no War is created', async ({ page }) => {
  // Assert
  const postCalls = (await getCallLog(page)).filter((entry) => entry.method === 'POST')
  expect(postCalls).toHaveLength(0)
})
