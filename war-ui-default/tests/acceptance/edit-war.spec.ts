// Binds features/edit-war.feature. A War is always editable by its
// creator, in any status (spec §6.1) — using the war-api PATCH/media routes
// alongside Publish/Unpublish and Clear Votes. Two-pane layout: a left nav
// list (Metadata, each contestant, Add contestant) selects what the right
// pane shows — only one section renders at a time, Metadata by default.
import { expect, test } from '@playwright/test'
import { buildContestant, buildMatchupResponse, buildMediaItem, buildWarDetail, buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from './support/mocking'

const WAR_ID = 'war-edit-1'

async function gotoEditPage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, `/wars/${WAR_ID}/edit`)
}

async function selectContestant(page: import('@playwright/test').Page, name: string) {
  await page.getByTestId('edit-war-nav-contestant').filter({ hasText: name }).click()
}

test('Metadata is shown by default', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('edit-war-title-input')).toBeVisible()
  await expect(page.getByTestId('edit-war-contestant')).toHaveCount(0)
})

test('Selecting a contestant shows its editor and hides Metadata; only one section shows at a time', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' }), buildContestant({ id: 'c-2', name: 'Grace' })],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await selectContestant(page, 'Ada')

  // Assert
  await expect(page.getByTestId('edit-war-title-input')).toHaveCount(0)
  await expect(page.getByTestId('edit-war-contestant')).toHaveCount(1)
  await expect(page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })).toBeVisible()

  // Act — swap to a different contestant
  await selectContestant(page, 'Grace')

  // Assert — still only one, and it's the new selection
  await expect(page.getByTestId('edit-war-contestant')).toHaveCount(1)
  await expect(page.getByTestId('edit-war-contestant').filter({ hasText: 'Grace' })).toBeVisible()
})

test('Switching to a different contestant shows fresh field values, not the previous selection', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada', bio: 'Ada bio' }),
      buildContestant({ id: 'c-2', name: 'Grace', bio: 'Grace bio' }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const adaItem = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act — edit Ada's fields without saving, then switch to Grace
  await adaItem.getByTestId('edit-war-contestant-name-input').fill('Ada X')
  await adaItem.getByTestId('bio-textarea').fill('Ada scratch bio')
  await selectContestant(page, 'Grace')

  // Assert — Grace's own values show, not leftover edits from Ada
  const graceItem = page.getByTestId('edit-war-contestant').filter({ hasText: 'Grace' })
  await expect(graceItem.getByTestId('edit-war-contestant-name-input')).toHaveValue('Grace')
  await expect(graceItem.getByTestId('bio-textarea')).toHaveValue('Grace bio')
})

test('Removing a contestant with no votes deletes it immediately and returns to Metadata', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' }), buildContestant({ id: 'c-2', name: 'Grace' })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'DELETE', path: `${API}/wars/${WAR_ID}/contestants/c-1`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-contestant-remove').click()

  // Assert — removed immediately, no confirmation dialog
  await expect(page.getByTestId('edit-war-contestant-remove-confirm')).toHaveCount(0)
  await expect(page.getByTestId('edit-war-nav-contestant').filter({ hasText: 'Ada' })).toHaveCount(0)
  await expect(page.getByTestId('edit-war-contestant')).toHaveCount(0)
  const calls = await getCallLog(page)
  expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/contestants/c-1'))).toBe(true)
})

test('Removing a contestant with votes asks for confirmation, naming how many votes will be lost', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'published',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada', appearance_count: 3 }),
      buildContestant({ id: 'c-2', name: 'Grace' }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')

  // Act
  await page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' }).getByTestId('edit-war-contestant-remove').click()

  // Assert — no request fired yet
  await expect(page.getByTestId('edit-war-contestant-remove-confirm')).toContainText('3')
  const calls = await getCallLog(page)
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
})

test('Confirming removal of a contestant with votes deletes it', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'published',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada', appearance_count: 3 }),
      buildContestant({ id: 'c-2', name: 'Grace' }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'DELETE', path: `${API}/wars/${WAR_ID}/contestants/c-1`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  await page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' }).getByTestId('edit-war-contestant-remove').click()

  // Act
  await page.getByTestId('edit-war-contestant-remove-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('edit-war-nav-contestant').filter({ hasText: 'Ada' })).toHaveCount(0)
  const calls = await getCallLog(page)
  expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/contestants/c-1'))).toBe(true)
})

test('Cancelling removal of a contestant with votes leaves it untouched', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'published',
    contestants: [
      buildContestant({ id: 'c-1', name: 'Ada', appearance_count: 3 }),
      buildContestant({ id: 'c-2', name: 'Grace' }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  await page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' }).getByTestId('edit-war-contestant-remove').click()

  // Act
  await page.getByTestId('edit-war-contestant-remove-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('edit-war-contestant-remove-confirm')).toHaveCount(0)
  await expect(page.getByTestId('edit-war-nav-contestant').filter({ hasText: 'Ada' })).toBeVisible()
  const calls = await getCallLog(page)
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
})

test('Add contestant shows a form; submitting adds it to the nav and selects it', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [] })
  const created = buildContestant({ id: 'c-new', name: 'Mae' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants`, responses: [{ status: 201, body: created }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-nav-add-contestant').click()
  await page.getByTestId('add-contestant-name-input').fill('Mae')
  await page.getByTestId('add-contestant-submit').click()

  // Assert
  await expect(page.getByTestId('edit-war-nav-contestant').filter({ hasText: 'Mae' })).toBeVisible()
  await expect(page.getByTestId('edit-war-contestant').filter({ hasText: 'Mae' })).toBeVisible()
})

test('Adding a contestant with a blank name shows a client-side error, no API call', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await page.getByTestId('edit-war-nav-add-contestant').click()

  // Act
  await page.getByTestId('add-contestant-submit').click()

  // Assert
  await expect(page.getByTestId('add-contestant-error')).toBeVisible()
  const calls = await getCallLog(page)
  expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/contestants')).length).toBe(0)
})

test('Changing the title persists it', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', title: 'Old Title' })
  const patched = buildWarSummary({ id: WAR_ID, status: 'draft', title: 'New Title' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: patched }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-title-input').fill('New Title')
  await page.getByTestId('edit-war-metadata-submit').click()

  // Assert — toHaveValue alone would not wait for the save: the input's
  // value is local state, already 'New Title' the instant fill() resolves,
  // regardless of whether the PATCH has even been sent yet.
  await expect(page.getByTestId('edit-war-title-input')).toHaveValue('New Title')
  const calls = await waitForCallLog(page, (log) => log.some((c) => c.method === 'PATCH' && c.url.endsWith(`/wars/${WAR_ID}`)))
  const patchCall = calls.find((c) => c.method === 'PATCH' && c.url.endsWith(`/wars/${WAR_ID}`))
  expect(JSON.parse(patchCall!.body ?? '{}')).toMatchObject({ title: 'New Title' })
})

test('Saving metadata shows a success toast that disappears on its own', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', title: 'Old Title' })
  const patched = buildWarSummary({ id: WAR_ID, status: 'draft', title: 'New Title' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: patched }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-title-input').fill('New Title')
  await page.getByTestId('edit-war-metadata-submit').click()

  // Assert
  const toast = page.getByTestId('toast')
  await expect(toast).toBeVisible()
  await expect(toast).toHaveText('War details saved')
  await expect(toast).toBeHidden()
})

test("Saving a contestant shows a success toast", async ({ page }) => {
  // Arrange
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', bio: 'Old bio' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  const patchedContestant = buildContestant({ id: 'c-1', name: 'Ada Lovelace', bio: 'Old bio' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    {
      method: 'PATCH',
      path: `${API}/wars/${WAR_ID}/contestants/c-1`,
      responses: [{ status: 200, body: patchedContestant }],
    },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-contestant-name-input').fill('Ada Lovelace')
  await item.getByTestId('edit-war-contestant-submit').click()

  // Assert
  const toast = page.getByTestId('toast')
  await expect(toast).toBeVisible()
  await expect(toast).toHaveText('Contestant saved')
})

test('A blank title shows a validation error', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', title: 'Old Title' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    {
      method: 'PATCH',
      path: `${API}/wars/${WAR_ID}`,
      responses: [{ status: 422, body: { error: 'validation error', details: ['title must be a non-empty string'] } }],
    },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-title-input').fill('')
  await page.getByTestId('edit-war-metadata-submit').click()

  // Assert
  await expect(page.getByTestId('edit-war-metadata-error')).toBeVisible()
})

test('Changing visibility to invite-only persists', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', visibility: 'public' })
  const patched = buildWarSummary({ id: WAR_ID, status: 'draft', visibility: 'invite_only' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: patched }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-visibility-select').selectOption('invite_only')
  await page.getByTestId('edit-war-metadata-submit').click()
  // Waits for the save to actually settle (button re-enables either way) —
  // reading the call log right after click() would race the in-flight PATCH.
  await expect(page.getByTestId('edit-war-metadata-submit')).toBeEnabled()

  // Assert
  const calls = await getCallLog(page)
  const patchCall = calls.find((c) => c.method === 'PATCH' && c.url.endsWith(`/wars/${WAR_ID}`))
  expect(JSON.parse(patchCall!.body ?? '{}').visibility).toBe('invite_only')
})

test('Changing the theme persists it', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', theme: 'arcade' })
  const patched = buildWarSummary({ id: WAR_ID, status: 'draft', theme: 'fight_card' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: patched }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-theme-select').selectOption('fight_card')
  await page.getByTestId('edit-war-metadata-submit').click()
  await expect(page.getByTestId('edit-war-metadata-submit')).toBeEnabled()

  // Assert
  const calls = await getCallLog(page)
  const patchCall = calls.find((c) => c.method === 'PATCH' && c.url.endsWith(`/wars/${WAR_ID}`))
  expect(JSON.parse(patchCall!.body ?? '{}').theme).toBe('fight_card')
})

test('Metadata remains editable on a published War', async ({ page }) => {
  // Arrange — editing is never status-gated (spec §6.1)
  const detail = buildWarDetail({ id: WAR_ID, status: 'published', title: 'Old Title' })
  const patched = buildWarSummary({ id: WAR_ID, status: 'published', title: 'New Title' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: patched }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-title-input').fill('New Title')
  await page.getByTestId('edit-war-metadata-submit').click()

  // Assert
  const calls = await waitForCallLog(page, (log) => log.some((c) => c.method === 'PATCH' && c.url.endsWith(`/wars/${WAR_ID}`)))
  expect(calls.some((c) => c.method === 'PATCH')).toBe(true)
})

test('The bio toolbar wraps selected text in bold markdown syntax', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', bio: 'hello world' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  const textarea = item.getByTestId('bio-textarea')

  // Act
  await textarea.click()
  await textarea.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 5))
  await item.getByTestId('bio-format-bold').click()

  // Assert
  await expect(textarea).toHaveValue('**hello** world')
})

test('A heading toolbar button inserts a markdown heading, rendered live', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', bio: 'Section title' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  const textarea = item.getByTestId('bio-textarea')

  // Act
  await textarea.click()
  await textarea.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 13))
  await item.getByTestId('bio-format-heading2').click()

  // Assert
  await expect(textarea).toHaveValue('## Section title')
  await expect(item.getByTestId('bio-preview').locator('h2')).toHaveText('Section title')
})

test('The bio preview updates live as the bio changes, with no save required', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', bio: '' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('bio-textarea').fill('*emphasis*')

  // Assert
  await expect(item.getByTestId('bio-preview').locator('em')).toHaveText('emphasis')
})

test('The bio editor links to the markdown syntax reference', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await selectContestant(page, 'Ada')

  // Assert
  await expect(page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' }).getByTestId('bio-syntax-link')).toBeVisible()
})

test('The bio preview renders lists and a visibly distinct, underlined link', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', bio: '' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('bio-textarea').fill('- one\n- two\n\n[link](https://example.com)')

  // Assert
  const preview = item.getByTestId('bio-preview')
  await expect(preview.locator('li')).toHaveCount(2)
  const link = preview.locator('a')
  await expect(link).toHaveText('link')
  await expect(link).toHaveCSS('text-decoration-line', 'underline')
})

test('A contestant with fewer than the image cap still shows a control to add more', async ({ page }) => {
  // Arrange
  const media = buildMediaItem({ id: 'm-1', display_order: 0 })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [media] })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await selectContestant(page, 'Ada')

  // Assert
  await expect(page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' }).getByTestId('edit-war-image-input')).toBeVisible()
})

test('Adding an image shows it alongside the existing ones, in order', async ({ page }) => {
  // Arrange
  const media = buildMediaItem({ id: 'm-1', display_order: 0 })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [media] })] })
  const uploaded = { id: 'm-2', display_order: 1 }
  const refreshedDetail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [media, buildMediaItem({ id: 'm-2', display_order: 1 })] })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }, { status: 200, body: refreshedDetail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants/c-1/images`, responses: [{ status: 201, body: uploaded }] },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-image-input').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })

  // Assert
  await expect(item.getByTestId('edit-war-contestant-image')).toHaveCount(2)
})

test('A failed image upload shows an error', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada' })] })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/contestants/c-1/images`,
      responses: [{ status: 422, body: { error: 'invalid image upload' } }],
    },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-image-input').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })

  // Assert
  await expect(item.getByTestId('edit-war-image-error')).toBeVisible()
})

test('Rate-limited image upload is shown as a wait, not an error', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada' })] })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/contestants/c-1/images`,
      responses: [{ status: 429, headers: { 'Retry-After': '1' }, body: { error: 'rate limited' } }],
    },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-image-input').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })

  // Assert
  await expect(item.getByTestId('edit-war-image-wait')).toBeVisible()
  await expect(item.getByTestId('edit-war-image-error')).toHaveCount(0)
  await expect(item.getByTestId('edit-war-image-input')).toBeEnabled({ timeout: 2000 })
})

test('Removing an image drops it from the gallery', async ({ page }) => {
  // Arrange
  const media1 = buildMediaItem({ id: 'm-1', display_order: 0 })
  const media2 = buildMediaItem({ id: 'm-2', display_order: 1 })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [media1, media2] })] })
  const refreshedDetail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [media2] })] })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }, { status: 200, body: refreshedDetail }] },
    { method: 'DELETE', path: `${API}/wars/${WAR_ID}/contestants/c-1/media/m-1`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-contestant-image').filter({ has: page.getByTestId('edit-war-image-remove') }).first().getByTestId('edit-war-image-remove').click()

  // Assert
  await expect(item.getByTestId('edit-war-contestant-image')).toHaveCount(1)
})

test('Reordering images persists the new order', async ({ page }) => {
  // Arrange
  const media1 = buildMediaItem({ id: 'm-1', display_order: 0 })
  const media2 = buildMediaItem({ id: 'm-2', display_order: 1 })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [media1, media2] })] })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }, { status: 200, body: detail }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}/contestants/c-1/media/m-1`, responses: [{ status: 204 }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}/contestants/c-1/media/m-2`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-image-move-up').click()

  // Assert
  const calls = await waitForCallLog(page, (log) => log.filter((c) => c.method === 'PATCH' && c.url.includes('/media/')).length >= 2)
  const reorderCalls = calls.filter((c) => c.method === 'PATCH' && c.url.includes('/media/'))
  expect(reorderCalls).toHaveLength(2)
})

test('At the per-contestant image cap, the add-more control is replaced by an explanation', async ({ page }) => {
  // Arrange
  const media = Array.from({ length: 10 }, (_, i) => buildMediaItem({ id: `m-${i}`, display_order: i }))
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada', media })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Assert
  await expect(item.getByTestId('edit-war-image-input')).toHaveCount(0)
  await expect(item.getByTestId('edit-war-image-cap-reached')).toBeVisible()
})

test('Images remain editable on a published War', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'published', contestants: [buildContestant({ id: 'c-1', name: 'Ada' })] })
  const uploaded = { id: 'm-2', display_order: 1 }
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants/c-1/images`, responses: [{ status: 201, body: uploaded }] },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-image-input').setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })

  // Assert
  const calls = await waitForCallLog(page, (log) => log.some((c) => c.method === 'POST' && c.url.includes('/images')))
  expect(calls.some((c) => c.method === 'POST' && c.url.includes('/images'))).toBe(true)
})

test('Export button is shown on the edit page', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('edit-war-export-button')).toBeVisible()
})

test('Clicking Export downloads a zip of the draft War definition', async ({ page }) => {
  // Arrange
  const media = buildMediaItem({ id: 'm-1', variants: [{ width: 400, url: 'https://cdn.example.test/m-1/400.jpg' }] })
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', media: [media] })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await page.route('https://cdn.example.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('fake-image-bytes') }),
  )

  // Act
  await gotoEditPage(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('edit-war-export-button').click()])

  // Assert
  expect(download.suggestedFilename()).toBe(`war-${WAR_ID}.zip`)
})

test('Delete button is shown on the edit page', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('edit-war-delete-button')).toBeVisible()
})

test('Clicking Delete asks for confirmation before removing the War', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-delete-button').click()

  // Assert
  await expect(page.getByTestId('edit-war-delete-confirm')).toBeVisible()
  const deleteCalls = (await getCallLog(page)).filter((entry) => entry.method === 'DELETE' && entry.url.endsWith(`/wars/${WAR_ID}`))
  expect(deleteCalls).toHaveLength(0)
})

test('Confirming delete removes the War and navigates to My Wars', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'DELETE', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars?creator=me`, responses: [{ status: 200, body: { wars: [] } }] },
  ])
  await gotoEditPage(page)
  await page.getByTestId('edit-war-delete-button').click()

  // Act
  await page.getByTestId('edit-war-delete-confirm-submit').click()

  // Assert
  await expect(page).toHaveURL('/my-wars')
  const deleteCalls = (await getCallLog(page)).filter((entry) => entry.method === 'DELETE' && entry.url.endsWith(`/wars/${WAR_ID}`))
  expect(deleteCalls).toHaveLength(1)
})

test('Cancelling delete leaves the War untouched', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await page.getByTestId('edit-war-delete-button').click()

  // Act
  await page.getByTestId('edit-war-delete-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('edit-war-delete-confirm')).toHaveCount(0)
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
  const deleteCalls = (await getCallLog(page)).filter((entry) => entry.method === 'DELETE' && entry.url.endsWith(`/wars/${WAR_ID}`))
  expect(deleteCalls).toHaveLength(0)
})

test('Deleting a published War works the same as deleting a draft', async ({ page }) => {
  // Arrange — Delete works in any status (spec §6.1)
  const detail = buildWarDetail({ id: WAR_ID, status: 'published' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'DELETE', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars?creator=me`, responses: [{ status: 200, body: { wars: [] } }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('edit-war-delete-button').click()
  await page.getByTestId('edit-war-delete-confirm-submit').click()

  // Assert
  await expect(page).toHaveURL('/my-wars')
})

test('The top action row lays out horizontally, shares consistent button styling, and sets Delete apart', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    theme: 'arcade',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' }), buildContestant({ id: 'c-2', name: 'Grace' })],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert — a horizontal row: Publish War sits to the right of Export,
  // both at roughly the same vertical position rather than stacked.
  const exportBox = await page.getByTestId('edit-war-export-button').boundingBox()
  const deleteBox = await page.getByTestId('edit-war-delete-button').boundingBox()
  const publishBox = await page.getByTestId('publish-toggle-submit').boundingBox()
  expect(exportBox).not.toBeNull()
  expect(deleteBox).not.toBeNull()
  expect(publishBox).not.toBeNull()
  expect(publishBox!.x).toBeGreaterThan(exportBox!.x)
  expect(Math.abs(exportBox!.y - publishBox!.y)).toBeLessThan(5)

  // Assert — Export and Publish War share the same themed button background.
  const exportBg = await page.getByTestId('edit-war-export-button').evaluate((el) => getComputedStyle(el).backgroundColor)
  const publishBg = await page.getByTestId('publish-toggle-submit').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(exportBg).toBe(publishBg)
})

test('Publish War is disabled with fewer than 2 contestants', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('publish-toggle-submit')).toBeDisabled()
  await expect(page.getByTestId('publish-requirements')).toContainText('at least 2 contestants')
})

test('Publish War is enabled even when a contestant has no image', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [] }), buildContestant({ id: 'c-2', name: 'Grace' })],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('publish-toggle-submit')).toBeEnabled()
  await expect(page.getByTestId('publish-requirements')).toHaveCount(0)
})

test('Clicking Publish War shows a confirmation naming that it becomes reachable by anyone', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' }), buildContestant({ id: 'c-2', name: 'Grace' })],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('publish-toggle-submit').click()

  // Assert — no publish request fired; the confirmation is shown instead
  await expect(page.getByTestId('publish-toggle-confirm')).toBeVisible()
  const publishCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/publish'))
  expect(publishCalls).toHaveLength(0)
})

test('Cancelling the publish confirmation leaves the draft untouched', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' }), buildContestant({ id: 'c-2', name: 'Grace' })],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await page.getByTestId('publish-toggle-submit').click()

  // Act
  await page.getByTestId('publish-toggle-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('publish-toggle-confirm')).toHaveCount(0)
  const publishCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/publish'))
  expect(publishCalls).toHaveLength(0)
})

test("Confirming Publish War publishes and navigates to the War's vote page", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' }), buildContestant({ id: 'c-2', name: 'Grace' })],
  })
  const published = buildWarSummary({ id: WAR_ID, status: 'published' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/publish`, responses: [{ status: 200, body: published }] },
    // The post-publish redirect lands on VoteMode, which joins and
    // requests the next matchup -- a real one, since a 204 here (no
    // matchups left) now redirects straight on to the results page
    // (VoteMode's useRedirectWhenCompleted), which isn't what this test is
    // checking.
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 200, body: buildMatchupResponse() }] },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('publish-toggle-submit').click()
  await page.getByTestId('publish-toggle-confirm-submit').click()

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/vote`)
})

test("A failed publish shows the API's validation messages", async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada' }), buildContestant({ id: 'c-2', name: 'Grace' })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/publish`,
      responses: [{ status: 422, body: { error: 'validation error', details: ['every contestant needs media'] } }],
    },
  ])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('publish-toggle-submit').click()
  await page.getByTestId('publish-toggle-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('publish-error')).toHaveText('every contestant needs media')
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
})

test('Unpublishing a published War asks for confirmation, naming that it becomes reachable only by them', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'published' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('publish-toggle-submit').click()

  // Assert
  await expect(page.getByTestId('publish-toggle-confirm')).toContainText('reachable only by you')
  const unpublishCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/unpublish'))
  expect(unpublishCalls).toHaveLength(0)
})

test('Confirming unpublish returns the War to draft and stays on the Edit page', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'published' })
  const unpublished = buildWarSummary({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/unpublish`, responses: [{ status: 200, body: unpublished }] },
  ])
  await gotoEditPage(page)
  await page.getByTestId('publish-toggle-submit').click()

  // Act
  await page.getByTestId('publish-toggle-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('publish-toggle-submit')).toHaveText('Publish War')
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
})

test('A closed War offers neither Publish nor Unpublish, and explains why', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'closed' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('publish-toggle-submit')).toHaveCount(0)
  await expect(page.getByTestId('publish-closed-note')).toBeVisible()
})

test('Clear Votes is available in any status', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('clear-votes-submit')).toBeVisible()
})

test('Clicking Clear Votes asks for confirmation before clearing', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'published' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await page.getByTestId('clear-votes-submit').click()

  // Assert
  await expect(page.getByTestId('clear-votes-confirm')).toBeVisible()
  const clearCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/clear-votes'))
  expect(clearCalls).toHaveLength(0)
})

test('Confirming Clear Votes clears every vote and shows a success toast', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'published' })
  const cleared = buildWarSummary({ id: WAR_ID, status: 'published' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }, { status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/clear-votes`, responses: [{ status: 200, body: cleared }] },
  ])
  await gotoEditPage(page)
  await page.getByTestId('clear-votes-submit').click()

  // Act
  await page.getByTestId('clear-votes-confirm-submit').click()

  // Assert
  const toast = page.getByTestId('toast')
  await expect(toast).toBeVisible()
  await expect(toast).toHaveText('Votes cleared')
  const clearCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/clear-votes'))
  expect(clearCalls).toHaveLength(1)
})

test('Cancelling Clear Votes leaves votes untouched', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'published' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await page.getByTestId('clear-votes-submit').click()

  // Act
  await page.getByTestId('clear-votes-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('clear-votes-confirm')).toHaveCount(0)
  const clearCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/clear-votes'))
  expect(clearCalls).toHaveLength(0)
})
