// Binds features/edit-war.feature. Draft-only editing (the spec's approved
// scope decision) of a War's metadata and its contestants' name, bio, and
// images — using the war-api PATCH/media routes that already existed but had
// no UI route calling them (PROGRESS.md). Two-pane layout: a left nav list
// (Metadata, each contestant, Add contestant) selects what the right pane
// shows — only one section renders at a time, Metadata by default.
import { expect, test } from '@playwright/test'
import { buildContestant, buildMediaItem, buildWarDetail, buildWarSummary } from '../../src/mocks/fixtures'
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

test('An active War shows a "no longer editable" message, not a form', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'active' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('edit-war-not-editable')).toBeVisible()
  await expect(page.getByTestId('edit-war-title-input')).toHaveCount(0)
})

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

test('Removing a contestant deletes it and returns to Metadata', async ({ page }) => {
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

  // Assert
  await expect(page.getByTestId('edit-war-nav-contestant').filter({ hasText: 'Ada' })).toHaveCount(0)
  await expect(page.getByTestId('edit-war-contestant')).toHaveCount(0)
  const calls = await getCallLog(page)
  expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/contestants/c-1'))).toBe(true)
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

test('Clicking Delete asks for confirmation before removing the draft', async ({ page }) => {
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

test('Confirming delete removes the draft and navigates to My Wars', async ({ page }) => {
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

test('Cancelling delete leaves the draft untouched', async ({ page }) => {
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

test('Activate is disabled with fewer than 2 contestants', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [buildContestant({ id: 'c-1', name: 'Ada' })] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('activate-submit')).toBeDisabled()
  await expect(page.getByTestId('activate-requirements')).toContainText('at least 2 contestants')
})

test('Activate is enabled even when a contestant has no image', async ({ page }) => {
  // Arrange
  const withImage = buildContestant({ id: 'c-1', name: 'Ada' })
  const noImage = buildContestant({ id: 'c-2', name: 'Grace', media: [] })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [withImage, noImage] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

  // Assert
  await expect(page.getByTestId('activate-submit')).toBeEnabled()
  await expect(page.getByTestId('activate-requirements')).toHaveCount(0)
})

test('Clicking Activate shows a permanence warning before activating', async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act — no unsaved edits, so this is not the dirty-confirm step
  await page.getByTestId('activate-submit').click()

  // Assert — no activation request fired; the permanence warning is shown instead
  await expect(page.getByTestId('activate-confirm')).toBeVisible()
  const activateCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/activate'))
  expect(activateCalls).toHaveLength(0)
})

test('Cancelling the permanence warning leaves the draft untouched', async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await page.getByTestId('activate-submit').click()

  // Act
  await page.getByTestId('activate-confirm-cancel').click()

  // Assert
  await expect(page.getByTestId('activate-confirm')).toHaveCount(0)
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
  const activateCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/activate'))
  expect(activateCalls).toHaveLength(0)
})

test("Confirming the permanence warning activates and navigates to the War's vote page", async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  const activated = buildWarSummary({ id: WAR_ID, status: 'active' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/activate`, responses: [{ status: 200, body: activated }] },
    // The post-activation redirect lands on VoteMode, which joins and
    // requests the first matchup on mount -- stub both so that page
    // renders cleanly rather than surfacing an unrelated error.
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await page.getByTestId('activate-submit').click()

  // Act
  await page.getByTestId('activate-confirm-submit').click()

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/vote`)
})

test("A failed activation shows the API's validation messages", async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/activate`,
      responses: [{ status: 422, body: { error: 'validation error', details: ['every contestant needs media'] } }],
    },
  ])
  await gotoEditPage(page)
  await page.getByTestId('activate-submit').click()

  // Act
  await page.getByTestId('activate-confirm-submit').click()

  // Assert
  await expect(page.getByTestId('activate-error')).toHaveText('every contestant needs media')
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
})

test('Clicking Activate with unsaved metadata edits shows a confirm step, not an immediate activation', async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await page.getByTestId('edit-war-title-input').fill('A brand new title')

  // Act
  await page.getByTestId('activate-submit').click()

  // Assert — no activation request fired; the confirm step is shown instead
  await expect(page.getByTestId('activate-dirty-confirm')).toBeVisible()
  const activateCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/activate'))
  expect(activateCalls).toHaveLength(0)
})

test('Cancelling the confirm step leaves the draft untouched, edits intact', async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await page.getByTestId('edit-war-title-input').fill('A brand new title')
  await page.getByTestId('activate-submit').click()

  // Act
  await page.getByTestId('activate-dirty-cancel').click()

  // Assert
  await expect(page.getByTestId('activate-dirty-confirm')).toHaveCount(0)
  await expect(page.getByTestId('edit-war-title-input')).toHaveValue('A brand new title')
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
})

test('Discarding from the confirm step activates anyway', async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  const activated = buildWarSummary({ id: WAR_ID, status: 'active' })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/activate`, responses: [{ status: 200, body: activated }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await page.getByTestId('edit-war-title-input').fill('A brand new title')
  await page.getByTestId('activate-submit').click()
  await page.getByTestId('activate-dirty-discard').click()

  // Act — discarding still routes through the same permanence warning
  // every other path to activation goes through.
  await expect(page.getByTestId('activate-confirm')).toBeVisible()
  await page.getByTestId('activate-confirm-submit').click()

  // Assert
  await expect(page).toHaveURL(`/wars/${WAR_ID}/vote`)
})

test('Saving from the confirm step saves the edits without activating', async ({ page }) => {
  // Arrange
  const contestantOne = buildContestant({ id: 'c-1', name: 'Ada' })
  const contestantTwo = buildContestant({ id: 'c-2', name: 'Grace' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestantOne, contestantTwo] })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: { ...detail, title: 'A brand new title' } }] },
  ])
  await gotoEditPage(page)
  await page.getByTestId('edit-war-title-input').fill('A brand new title')
  await page.getByTestId('activate-submit').click()

  // Act
  await page.getByTestId('activate-dirty-save').click()

  // Assert — the save fired and the confirm step is gone; the voter is
  // still on Edit War, free to click Activate again once it's saved
  await waitForCallLog(page, (log) => log.some((entry) => entry.method === 'PATCH' && entry.url.includes(`/wars/${WAR_ID}`)))
  await expect(page.getByTestId('activate-dirty-confirm')).toHaveCount(0)
  await expect(page).toHaveURL(`/wars/${WAR_ID}/edit`)
  const activateCalls = (await getCallLog(page)).filter((entry) => entry.url.includes('/activate'))
  expect(activateCalls).toHaveLength(0)
})

test("Changing a contestant's name and bio persists both", async ({ page }) => {
  // Arrange
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', bio: 'Old bio' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  const patchedContestant = buildContestant({ id: 'c-1', name: 'Ada Lovelace', bio: '**New** bio' })
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
  await item.getByTestId('bio-textarea').fill('**New** bio')
  await item.getByTestId('edit-war-contestant-submit').click()
  await expect(item.getByTestId('edit-war-contestant-submit')).toBeEnabled()

  // Assert
  const calls = await getCallLog(page)
  const patchCall = calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/contestants/c-1'))
  expect(JSON.parse(patchCall!.body ?? '{}')).toEqual({ name: 'Ada Lovelace', bio: '**New** bio' })
})

test('The bio toolbar wraps the selected text in the right markdown syntax', async ({ page }) => {
  // Arrange
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', bio: '' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  const textarea = item.getByTestId('bio-textarea')

  // Act
  await textarea.fill('brilliant')
  await textarea.click()
  await page.keyboard.press('ControlOrMeta+a')
  await item.getByTestId('bio-format-bold').click()

  // Assert
  await expect(textarea).toHaveValue('**brilliant**')
})

test('The heading toolbar buttons insert markdown headers rendered in the preview', async ({ page }) => {
  // Arrange
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', bio: '' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  const textarea = item.getByTestId('bio-textarea')
  const preview = item.getByTestId('bio-preview')

  // Act
  await textarea.fill('Champion')
  await textarea.click()
  await page.keyboard.press('ControlOrMeta+a')
  await item.getByTestId('bio-format-heading1').click()

  // Assert
  await expect(textarea).toHaveValue('# Champion')
  await expect(preview.locator('.bio-content h1')).toHaveText('Champion')
})

test('The bio editor shows a live preview that updates as the bio changes', async ({ page }) => {
  // Arrange
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', bio: '' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  const preview = item.getByTestId('bio-preview')

  // Act
  await item.getByTestId('bio-textarea').fill('A **great** contestant')

  // Assert — no save required; the preview reflects the textarea live
  await expect(preview.locator('strong')).toHaveText('great')
})

test('The bio editor links to the markdown renderer and its syntax reference', async ({ page }) => {
  // Arrange
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', bio: '' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Assert
  const syntaxLink = item.getByTestId('bio-syntax-link')
  await expect(syntaxLink).toBeVisible()
  await expect(syntaxLink).toHaveAttribute('href', 'https://marked.js.org/demo/')
})

test('The bio preview renders bullet and numbered lists, and links with a visible indicator', async ({ page }) => {
  // Arrange
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', bio: '' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  const preview = item.getByTestId('bio-preview')

  // Act
  await item.getByTestId('bio-textarea').fill('- One\n- Two\n\n1. First\n2. Second\n\n[site](https://example.test)')

  // Assert — real list markup, visibly styled as a list (not reset to
  // flush, unmarked paragraphs by the app's own base CSS reset), and a
  // link with a real visible color and underline, not just inherited body
  // text color
  const content = preview.locator('.bio-content')
  await expect(content.locator('ul li')).toHaveCount(2)
  await expect(content.locator('ol li')).toHaveCount(2)
  const ulListStyle = await content.locator('ul').evaluate((el) => getComputedStyle(el).listStyleType)
  expect(ulListStyle).not.toBe('none')
  const link = content.locator('a')
  const linkColor = await link.evaluate((el) => getComputedStyle(el).color)
  const bodyColor = await content.evaluate((el) => getComputedStyle(el).color)
  expect(linkColor).not.toBe(bodyColor)
  const textDecoration = await link.evaluate((el) => getComputedStyle(el).textDecorationLine)
  expect(textDecoration).toContain('underline')
})

test('A contestant with one image still shows a control to add more', async ({ page }) => {
  // Arrange — buildContestant's default already includes one media item
  const contestant = buildContestant({ id: 'c-1', name: 'Ada' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await selectContestant(page, 'Ada')

  // Assert
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  await expect(item.getByTestId('edit-war-contestant-image')).toHaveCount(1)
  await expect(item.getByTestId('edit-war-image-input')).toBeVisible()
})

test('Adding a second image shows both, in order', async ({ page }) => {
  // Arrange
  const firstImage = buildMediaItem({ id: 'image-1', display_order: 0 })
  const secondImage = buildMediaItem({ id: 'image-2', display_order: 1 })
  const contestant = buildContestant({ id: 'c-1', name: 'Ada', media: [firstImage] })
  const detailBefore = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  const detailAfter = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [firstImage, secondImage] })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detailBefore }, { status: 200, body: detailAfter }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/contestants/c-1/images`,
      responses: [{ status: 201, body: { id: 'image-2', display_order: 1 } }],
    },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act
  await item.getByTestId('edit-war-image-input').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  })

  // Assert
  await expect(item.getByTestId('edit-war-contestant-image')).toHaveCount(2)
})

test('Removing an image drops it from the gallery', async ({ page }) => {
  // Arrange
  const firstImage = buildMediaItem({ id: 'image-1', display_order: 0 })
  const secondImage = buildMediaItem({ id: 'image-2', display_order: 1 })
  const detailBefore = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [firstImage, secondImage] })],
  })
  const detailAfter = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [firstImage] })],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detailBefore }, { status: 200, body: detailAfter }] },
    { method: 'DELETE', path: `${API}/wars/${WAR_ID}/contestants/c-1/media/image-2`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  await expect(item.getByTestId('edit-war-contestant-image')).toHaveCount(2)

  // Act
  await item.getByTestId('edit-war-contestant-image').nth(1).getByTestId('edit-war-image-remove').click()

  // Assert
  await expect(item.getByTestId('edit-war-contestant-image')).toHaveCount(1)
})

test('Reordering images persists the new order', async ({ page }) => {
  // Arrange
  const firstImage = buildMediaItem({ id: 'image-1', display_order: 0 })
  const secondImage = buildMediaItem({ id: 'image-2', display_order: 1 })
  const detailBefore = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media: [firstImage, secondImage] })],
  })
  const detailAfter = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [
      buildContestant({
        id: 'c-1',
        name: 'Ada',
        media: [
          buildMediaItem({ id: 'image-2', display_order: 0 }),
          buildMediaItem({ id: 'image-1', display_order: 1 }),
        ],
      }),
    ],
  })
  await useScenario(page, [
    { method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detailBefore }, { status: 200, body: detailAfter }] },
    // A "move up" is a genuine swap, not a relocation — both neighbors'
    // display_order change, so both routes are mocked.
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}/contestants/c-1/media/image-2`, responses: [{ status: 204 }] },
    { method: 'PATCH', path: `${API}/wars/${WAR_ID}/contestants/c-1/media/image-1`, responses: [{ status: 204 }] },
  ])
  await gotoEditPage(page)
  await selectContestant(page, 'Ada')
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })

  // Act — move the second image up, ahead of the first
  await item.getByTestId('edit-war-contestant-image').nth(1).getByTestId('edit-war-image-move-up').click()

  // Assert — the render reflects the refetched (mocked) order, and both
  // sides of the swap were actually sent
  await expect(item.getByTestId('edit-war-contestant-image').nth(0)).toHaveAttribute('data-media-id', 'image-2')
  await expect(item.getByTestId('edit-war-contestant-image').nth(1)).toHaveAttribute('data-media-id', 'image-1')
  const calls = await getCallLog(page)
  const image2Patch = calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/media/image-2'))
  const image1Patch = calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/media/image-1'))
  expect(JSON.parse(image2Patch!.body ?? '{}')).toEqual({ display_order: 0 })
  expect(JSON.parse(image1Patch!.body ?? '{}')).toEqual({ display_order: 1 })
})

test('At 10 images, the add-more control is hidden with an explanatory message', async ({ page }) => {
  // Arrange
  const media = Array.from({ length: 10 }, (_, index) => buildMediaItem({ id: `image-${index}`, display_order: index }))
  const detail = buildWarDetail({
    id: WAR_ID,
    status: 'draft',
    contestants: [buildContestant({ id: 'c-1', name: 'Ada', media })],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])
  await gotoEditPage(page)

  // Act
  await selectContestant(page, 'Ada')

  // Assert
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  await expect(item.getByTestId('edit-war-contestant-image')).toHaveCount(10)
  await expect(item.getByTestId('edit-war-image-input')).toHaveCount(0)
  await expect(item.getByTestId('edit-war-image-cap-reached')).toBeVisible()
})
