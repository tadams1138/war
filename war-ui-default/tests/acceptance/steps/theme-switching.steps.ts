// Steps for features/theme-switching.feature. Scoped with the feature's own tag
// so no other feature can ever bind to (or collide with) this text.
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { nav, themeSelect } from '../support/pages'

const { When, Then } = createBdd(test, { tags: '@theme-switching' })

When('they choose the {string} theme', async ({ page }, label: string) => {
  // Act
  await themeSelect(page).selectOption({ label })
})

Then('the nav theme menu is visible', async ({ page }) => {
  // Assert
  await expect(themeSelect(page)).toBeVisible()
})

Then('the nav bar renders in the {string} theme', async ({ page }, theme: string) => {
  // Assert
  await expect(nav(page)).toHaveAttribute('data-theme', theme)
})
