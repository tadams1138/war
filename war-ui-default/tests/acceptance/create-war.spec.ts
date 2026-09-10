// Binds features/create-war.feature.
import { expect, test, type Page } from '@playwright/test'
import { buildContestant, buildWarSummary } from '../../src/mocks/fixtures'
import { API, getCallLog, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

const WAR_ID = 'war-create-1'

// A tiny, valid 1x1 PNG — its content is irrelevant to these tests (every
// upload endpoint is mocked, never actually processed), only that a real
// file reaches the <input type="file">'s change event.
const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function addContestantWithImage(page: Page, name: string): Promise<void> {
  await page.getByTestId('contestant-name-input').fill(name)
  await page.getByTestId('add-contestant-submit').click()
  const item = page.getByTestId('wizard-contestant').filter({ hasText: name })
  await item.getByTestId('contestant-image-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG_BUFFER })
  await expect(item.getByTestId('contestant-has-image')).toBeVisible()
}

test('A voter completes the wizard and activates the War', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: WAR_ID, title: 'Miss Universe 2026', status: 'draft' })
  const activatedWar = buildWarSummary({ id: WAR_ID, title: 'Miss Universe 2026', status: 'active' })
  const contestantOne = buildContestant({ id: 'contestant-1', name: 'Contestant One' })
  const contestantTwo = buildContestant({ id: 'contestant-2', name: 'Contestant Two' })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/contestants`,
      responses: [{ status: 201, body: contestantOne }, { status: 201, body: contestantTwo }],
    },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants/contestant-1/images`, responses: [{ status: 201, body: { id: 'image-1', display_order: 0 } }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants/contestant-2/images`, responses: [{ status: 201, body: { id: 'image-2', display_order: 0 } }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/activate`, responses: [{ status: 200, body: activatedWar }] },
    // The post-activation redirect lands on VoteMode, which joins and
    // requests the first matchup on mount — stub both so that page
    // renders cleanly rather than surfacing an unrelated error.
    { method: 'POST', path: `${API}/wars/${WAR_ID}/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/${WAR_ID}/matchups/next`, responses: [{ status: 204 }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')

  // Act
  await page.getByTestId('metadata-title-input').fill('Miss Universe 2026')
  await page.getByTestId('metadata-submit').click()
  await addContestantWithImage(page, 'Contestant One')
  await addContestantWithImage(page, 'Contestant Two')
  await page.getByTestId('proceed-to-review').click()
  await expect(page.getByTestId('review-contestant')).toHaveCount(2)

  // Review shows the War's own metadata, carried through from POST /wars's
  // response rather than re-fetched (spec)
  await expect(page.getByTestId('review-title')).toHaveText('Miss Universe 2026')
  await expect(page.getByTestId('review-category')).toHaveText('Pageant')
  await expect(page.getByTestId('review-visibility')).toHaveText('public')

  await page.getByTestId('activate-submit').click()

  // Assert — the War is created, its contestants added, and it is
  // activated via the API (the call-log assertions below check each
  // happened, not the mock: scenarios.ts's recipes repeat their last
  // response indefinitely once exhausted, so nothing here relies on a
  // recipe refusing a repeat), then the voter is redirected to the vote page
  await expect(page).toHaveURL(`/wars/${WAR_ID}/vote`)
  const calls = await getCallLog(page)
  expect(calls.some((c) => c.method === 'POST' && c.url === `http://localhost:4173${API}/wars`)).toBe(true)
  expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/contestants')).length).toBe(2)
  expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/activate'))).toBe(true)
})

test('A title is required to proceed past Metadata', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    {
      method: 'POST',
      path: `${API}/wars`,
      responses: [{ status: 422, body: { error: 'validation error', details: ['title must be a non-empty string of at most 256 characters'] } }],
    },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')

  // Act — submit with no title filled in
  await page.getByTestId('metadata-submit').click()

  // Assert — an error is shown, and the wizard never advanced past
  // Metadata (so no War id was ever obtained to add a contestant to)
  await expect(page.getByTestId('metadata-error')).toBeVisible()
  await expect(page.getByTestId('metadata-title-input')).toBeVisible()
  const calls = await getCallLog(page)
  expect(calls.filter((c) => c.method === 'POST' && c.url.endsWith(`${API}/wars`)).length).toBe(1)
})

test('A contestant requires a name', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: WAR_ID, status: 'draft' })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/contestants`,
      responses: [{ status: 422, body: { error: 'validation error', details: ['name must be a non-empty string of at most 256 characters'] } }],
    },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')
  await page.getByTestId('metadata-title-input').fill('Some War')
  await page.getByTestId('metadata-submit').click()
  await expect(page.getByTestId('contestant-name-input')).toBeVisible()

  // Act — submit the contestant form with no name filled in
  await page.getByTestId('add-contestant-submit').click()

  // Assert
  await expect(page.getByTestId('contestant-error')).toBeVisible()
  await expect(page.getByTestId('wizard-contestant')).toHaveCount(0)
})

test('Activation is blocked with fewer than 2 contestants', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: WAR_ID, status: 'draft' })
  const contestantOne = buildContestant({ id: 'contestant-1', name: 'Contestant One' })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants`, responses: [{ status: 201, body: contestantOne }] },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants/contestant-1/images`, responses: [{ status: 201, body: { id: 'image-1', display_order: 0 } }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/activate`,
      responses: [{ status: 422, body: { error: 'validation error', details: ['a War needs at least 2 contestants to activate'] } }],
    },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')
  await page.getByTestId('metadata-title-input').fill('Some War')
  await page.getByTestId('metadata-submit').click()
  await addContestantWithImage(page, 'Contestant One')
  await page.getByTestId('proceed-to-review').click()

  // Act
  await page.getByTestId('activate-submit').click()

  // Assert — the API's own validation message is shown verbatim (the spec's
  // deliberate exception to the generic 422 copy), and the wizard stayed
  // put rather than redirecting to the vote page
  await expect(page.getByTestId('activate-error')).toContainText('a War needs at least 2 contestants to activate')
  await expect(page).toHaveURL(/\/wars\/new$/)
})

test('Activation is blocked when a contestant has no image', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: WAR_ID, status: 'draft' })
  const contestantOne = buildContestant({ id: 'contestant-1', name: 'Contestant One' })
  const contestantTwo = buildContestant({ id: 'contestant-2', name: 'Contestant Two' })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/contestants`,
      responses: [{ status: 201, body: contestantOne }, { status: 201, body: contestantTwo }],
    },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants/contestant-1/images`, responses: [{ status: 201, body: { id: 'image-1', display_order: 0 } }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/activate`,
      responses: [{ status: 422, body: { error: 'validation error', details: ['every contestant must have at least one image to activate'] } }],
    },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')
  await page.getByTestId('metadata-title-input').fill('Some War')
  await page.getByTestId('metadata-submit').click()
  // Contestant One gets an image; Contestant Two does not (spec: nothing
  // in this step blocks moving on to Review without one).
  await addContestantWithImage(page, 'Contestant One')
  await page.getByTestId('contestant-name-input').fill('Contestant Two')
  await page.getByTestId('add-contestant-submit').click()
  await expect(page.getByTestId('wizard-contestant')).toHaveCount(2)
  await page.getByTestId('proceed-to-review').click()

  // Act
  await page.getByTestId('activate-submit').click()

  // Assert
  await expect(page.getByTestId('activate-error')).toContainText('every contestant must have at least one image to activate')
  await expect(page).toHaveURL(/\/wars\/new$/)
})

test('Review shows an image-attached indicator, not the image itself', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: WAR_ID, status: 'draft' })
  const contestantWithImage = buildContestant({ id: 'contestant-1', name: 'Contestant One' })
  const contestantWithoutImage = buildContestant({ id: 'contestant-2', name: 'Contestant Two' })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    {
      method: 'POST',
      path: `${API}/wars/${WAR_ID}/contestants`,
      responses: [{ status: 201, body: contestantWithImage }, { status: 201, body: contestantWithoutImage }],
    },
    { method: 'POST', path: `${API}/wars/${WAR_ID}/contestants/contestant-1/images`, responses: [{ status: 201, body: { id: 'image-1', display_order: 0 } }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/new')
  await page.getByTestId('metadata-title-input').fill('Some War')
  await page.getByTestId('metadata-submit').click()

  // Act — one contestant with an image, one without
  await addContestantWithImage(page, 'Contestant One')
  await page.getByTestId('contestant-name-input').fill('Contestant Two')
  await page.getByTestId('add-contestant-submit').click()
  await expect(page.getByTestId('wizard-contestant')).toHaveCount(2)
  await page.getByTestId('proceed-to-review').click()

  // Assert — an indicator, not the image itself
  const withImage = page.getByTestId('review-contestant').filter({ hasText: 'Contestant One' })
  const withoutImage = page.getByTestId('review-contestant').filter({ hasText: 'Contestant Two' })
  await expect(withImage.getByTestId('review-contestant-has-image')).toBeVisible()
  await expect(withoutImage.getByTestId('review-contestant-no-image')).toBeVisible()
  await expect(page.locator('main img')).toHaveCount(0)
})

test('Creating a War requires authentication', async ({ page }) => {
  // Act
  await page.goto('/wars/new')

  // Assert
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fwars%2Fnew$/)
})
