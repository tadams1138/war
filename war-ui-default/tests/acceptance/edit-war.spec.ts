// Binds features/edit-war.feature. Draft-only editing (the spec's approved
// scope decision) of a War's metadata and its contestants' name, bio, and
// images — using the war-api PATCH/media routes that already existed but had
// no UI route calling them (PROGRESS.md).
import { expect, test } from '@playwright/test'
import { buildContestant, buildMediaItem, buildWarDetail, buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario, waitForCallLog } from './support/mocking'

const WAR_ID = 'war-edit-1'

async function gotoEditPage(page: import('@playwright/test').Page) {
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, `/wars/${WAR_ID}/edit`)
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

test('A contestant with one image still shows a control to add more', async ({ page }) => {
  // Arrange — buildContestant's default already includes one media item
  const contestant = buildContestant({ id: 'c-1', name: 'Ada' })
  const detail = buildWarDetail({ id: WAR_ID, status: 'draft', contestants: [contestant] })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/${WAR_ID}`, responses: [{ status: 200, body: detail }] }])

  // Act
  await gotoEditPage(page)

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

  // Act
  await gotoEditPage(page)

  // Assert
  const item = page.getByTestId('edit-war-contestant').filter({ hasText: 'Ada' })
  await expect(item.getByTestId('edit-war-contestant-image')).toHaveCount(10)
  await expect(item.getByTestId('edit-war-image-input')).toHaveCount(0)
  await expect(item.getByTestId('edit-war-image-cap-reached')).toBeVisible()
})
