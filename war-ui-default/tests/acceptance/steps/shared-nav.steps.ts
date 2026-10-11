// Steps for the navigation header's identity menu and name, identical in every
// feature that uses them (the menu is called the identity menu throughout).
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test, type World } from './fixtures'
import { nav } from '../support/pages'
import type { PageRef } from '../support/pageNames'

const { When, Then } = createBdd(test)

const trigger = (page: Page) => nav(page).getByTestId('nav-identity')
const menu = (page: Page) => nav(page).getByRole('menu')

When('they open the identity menu', async ({ page }) => {
  // Act
  await trigger(page).click()
  await expect(menu(page)).toBeVisible()
})

When('they select {string} from the identity menu', async ({ page }, name: string) => {
  // Act
  await menu(page).getByRole('menuitem', { name, exact: true }).click()
})

Then('the identity menu links {string} to {page}', async ({ page, world }: { page: Page; world: World }, name: string, target: PageRef) => {
  // Assert
  const item = menu(page).getByRole('menuitem', { name, exact: true })
  await expect(item).toBeVisible()
  await expect(item).toHaveAttribute('href', target.path(world))
})

Then('the identity menu offers no {string} link', async ({ page }, name: string) => {
  // Assert
  await expect(menu(page)).toBeVisible()
  await expect(menu(page).getByRole('menuitem', { name, exact: true })).toHaveCount(0)
})

Then('the navigation shows the name {string}', async ({ page }, name: string) => {
  // Assert
  await expect(trigger(page)).toHaveText(name)
})
