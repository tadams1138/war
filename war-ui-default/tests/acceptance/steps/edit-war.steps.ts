// Steps for features/edit-war.feature. Scoped with the feature's own tag so no
// other feature can ever bind to (or collide with) this text.
//
// The page is two panes: the sections list (Metadata, each contestant, "+ Add
// contestant") picks the one section the other pane shows. A War, its
// contestants and the calls about them are given by shared steps (shared.steps.ts,
// support/editWar.ts, support/calls.ts).
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import type { FieldRef } from '../support/fields'

const { When, Then } = createBdd(test, { tags: '@edit-war' })

const sections = (page: Page) => page.getByRole('navigation', { name: 'War sections' })
const section = (page: Page, name: string) => sections(page).getByRole('button', { name, exact: true })
const editors = (page: Page) => page.getByTestId('edit-war-contestant')
const gallery = (page: Page) => page.getByTestId('edit-war-contestant-image')
const addImageControl = (page: Page) => page.getByLabel('Add image')
const control = (page: Page, field: FieldRef) => page.getByTestId(field.testId)

// --- Act -------------------------------------------------------------------

When('they select {string} in the sections list', async ({ page }, name: string) => {
  // Act
  await section(page, name).click()
})

async function change(page: Page, field: FieldRef, value: string): Promise<void> {
  if (field.select) await control(page, field).selectOption({ label: value })
  else await control(page, field).fill(value)
}

When('they change the {field} to {string}', async ({ page }, field: FieldRef, value: string) => {
  // Act
  await change(page, field, value)
})

// For text that runs over several lines.
When('they change the {field} to:', async ({ page }, field: FieldRef, value: string) => {
  // Act
  await change(page, field, value)
})

When("they select {string} in the contestant's bio", async ({ page }, text: string) => {
  // Act
  const bio = page.getByTestId('bio-textarea')
  await bio.click()
  await bio.evaluate((element: HTMLTextAreaElement, selected) => {
    const start = element.value.indexOf(selected)
    element.setSelectionRange(start, start + selected.length)
  }, text)
})

When('they add an image', async ({ page }) => {
  // Act
  await addImageControl(page).setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })
})

When('they remove the first image', async ({ page }) => {
  // Act
  await gallery(page).first().getByTestId('edit-war-image-remove').click()
})

When('they move up the second image', async ({ page }) => {
  // Act
  await gallery(page).nth(1).getByTestId('edit-war-image-move-up').click()
})

// --- Assert: sections ------------------------------------------------------

Then(/^the metadata form is (shown|hidden)$/, async ({ page }, state: string) => {
  // Assert
  const title = page.getByTestId('edit-war-title-input')
  if (state === 'shown') await expect(title).toBeVisible()
  else await expect(title).toBeHidden()
})

Then('no contestant editor is shown', async ({ page }) => {
  // Assert
  await expect(editors(page)).toHaveCount(0)
})

Then('only the editor of {string} is shown', async ({ page }, name: string) => {
  // Assert
  await expect(editors(page)).toHaveCount(1)
  await expect(editors(page).getByRole('heading', { name, exact: true })).toBeVisible()
})

Then(/^the sections list (includes|does not include) "([^"]*)"$/, async ({ page }, verb: string, name: string) => {
  // Assert
  await expect(section(page, name)).toHaveCount(verb === 'includes' ? 1 : 0)
})

// --- Assert: fields --------------------------------------------------------

Then('the {field} shows {string}', async ({ page }, field: FieldRef, value: string) => {
  // Assert
  if (field.select) await expect(control(page, field).locator('option:checked')).toHaveText(value)
  else await expect(control(page, field)).toHaveValue(value)
})

Then('the {field} offers {string}', async ({ page }, field: FieldRef, option: string) => {
  // Assert
  await expect(control(page, field).getByRole('option', { name: option })).toHaveCount(1)
})

Then('the visibility hint says {string}', async ({ page }, hint: string) => {
  // Assert
  await expect(page.getByTestId('edit-war-visibility-hint')).toHaveText(hint)
})

Then('a toast says {string}', async ({ page }, message: string) => {
  // Assert
  const toast = page.getByTestId('toast')
  await expect(toast).toBeVisible()
  await expect(toast).toHaveText(message)
})

Then('the toast disappears on its own', async ({ page }) => {
  // Assert
  await expect(page.getByTestId('toast')).toBeHidden()
})

// --- Assert: bio -----------------------------------------------------------

Then('a link to the markdown syntax reference is shown', async ({ page }) => {
  // Assert
  const link = page.getByTestId('bio-syntax-link')
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', /^https:\/\//)
})

// --- Assert: images --------------------------------------------------------

Then(/^(a|no) control to add an image is shown$/, async ({ page }, article: string) => {
  // Assert
  await expect(addImageControl(page)).toHaveCount(article === 'a' ? 1 : 0)
})

const POSITIONS: Record<string, number> = { first: 1, second: 2 }

// The images are the contestant's given ones, by their place when given.
Then(/^the gallery shows (?:only )?the (first|second) image(?: then the (first|second))?$/, async ({ page }, first: string, second?: string) => {
  // Assert
  const expected = [first, second].filter((ordinal): ordinal is string => ordinal !== undefined).map((ordinal) => POSITIONS[ordinal]!)
  const shown = () => gallery(page).evaluateAll((items) => items.map((item) => Number(/(\d+)$/.exec((item as HTMLElement).dataset.mediaId!)![1])))
  await expect.poll(shown).toEqual(expected)
})

Then('the add-image control re-enables on its own once the delay passes', async ({ page }) => {
  // Assert
  await expect(addImageControl(page)).toBeDisabled()
  await expect(addImageControl(page)).toBeEnabled({ timeout: 2000 })
})
