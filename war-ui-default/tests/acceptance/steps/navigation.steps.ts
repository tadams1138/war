// Steps for features/navigation.feature. Scoped with the feature's own tag so
// no other feature can ever bind to (or collide with) this text.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { me } from '../support/adminFixtures'
import { API } from '../support/mocking'
import { expectSignedOut, footer, nav } from '../support/pages'
import { FALLBACK_DISPLAY_NAME } from '../../../src/components/voterIdentity'

const { Given, When, Then } = createBdd(test, { tags: '@navigation' })

const trigger = (page: Page) => nav(page).getByTestId('nav-identity')
const menu = (page: Page) => nav(page).getByRole('menu')

// --- Arrange ---------------------------------------------------------------

// Give these before "an authenticated voter", which fetches the identity.
Given("the voter's display name is {string}", async ({ world }, name: string) => {
  // Arrange
  world.queue(me({}, name))
})

Given('the voter has no display name on file', async ({ world }) => {
  // Arrange
  world.queue(me({}, null))
})

// Slow as well as failing: logging out must neither wait for the server nor
// show its failure.
Given('the server-side logout request takes 3 seconds and then fails', async ({ world }) => {
  // Arrange
  world.queue({ method: 'DELETE', path: `${API}/auth/session`, responses: [{ status: 503, delayMs: 3000 }] })
})

// --- Act -------------------------------------------------------------------

When('they click outside the menu', async ({ page }) => {
  // Act
  await page.mouse.click(10, 10)
})

const KEYS: Record<string, string> = { Escape: 'Escape', 'the down arrow': 'ArrowDown', 'the up arrow': 'ArrowUp' }

When(/^they press (Escape|the down arrow|the up arrow)$/, async ({ page }, key: string) => {
  // Act
  await page.keyboard.press(KEYS[key]!)
})

// --- Assert ----------------------------------------------------------------

const FOOTER_LINKS: Record<string, { name: RegExp; href: string }> = {
  "the project's GitHub repository": { name: /GitHub/i, href: 'https://github.com/tadams1138/war' },
  'the Import build guide': { name: /import/i, href: 'https://github.com/tadams1138/war/blob/master/docs/building-a-war-import.md' },
  'the Privacy Policy': { name: /privacy policy/i, href: '/privacy' },
  'the Terms of Service': { name: /terms of service/i, href: '/terms' },
  'the Data Deletion instructions': { name: /data deletion/i, href: '/data-deletion' },
}

Then('the footer shows a copyright notice', async ({ page }) => {
  // Assert
  await expect(footer(page)).toContainText('©')
})

Then(/^the footer links to (.+)$/, async ({ page }, destination: string) => {
  // Assert
  const { name, href } = FOOTER_LINKS[destination]!
  await expect(footer(page).getByRole('link', { name })).toHaveAttribute('href', href)
})

Then('the Home brand mark links to the home page', async ({ page }) => {
  // Assert
  await expect(nav(page).getByTestId('nav-home')).toBeVisible()
  await expect(nav(page).getByTestId('nav-home')).toHaveAttribute('href', '/')
})

Then('the Home brand mark sits to the left of the theme switcher', async ({ page }) => {
  // Assert
  const home = await nav(page).getByTestId('nav-home').boundingBox()
  const switcher = await nav(page).getByTestId('nav-theme-select').boundingBox()
  expect(home!.x).toBeLessThan(switcher!.x)
})

// The fallback is fixed (war-spec.md §10.2): never blank and never "null".
Then('the navigation shows a fallback identity label instead of a blank', async ({ page }) => {
  // Assert
  await expect(trigger(page)).toHaveText(FALLBACK_DISPLAY_NAME)
  await expect(trigger(page)).not.toContainText('null')
})

Then('the identity menu is closed', async ({ page }) => {
  // Assert
  await expect(menu(page)).toHaveCount(0)
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
})

Then('the identity menu shows a log out control', async ({ page }) => {
  // Assert
  await expect(menu(page).getByRole('menuitem', { name: 'Log out' })).toBeVisible()
})

// Not the bare page behind it (war-spec.md §10.2): whatever colour or opacity a
// theme picks, the surface is not fully transparent.
Then('the menu renders on an opaque or translucent surface of its own', async ({ page }) => {
  // Assert
  const alpha = await menu(page).evaluate((element) => {
    const channels = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)
    return channels && channels.length === 4 ? Number(channels[3]) : 1
  })
  expect(alpha).toBeGreaterThan(0)
})

Then(/^the "([^"]*)" item is (not )?marked as the current page$/, async ({ page }, name: string, not?: string) => {
  // Assert
  const item = menu(page).getByRole('menuitem', { name, exact: true })
  if (not) await expect(item).not.toHaveAttribute('aria-current', 'page')
  else await expect(item).toHaveAttribute('aria-current', 'page')
})

// The menu's first two items, in the order war-spec.md §10.2 lists them.
const MENU_ITEMS: Record<string, { index: number; name: string }> = {
  first: { index: 0, name: 'My Wars' },
  second: { index: 1, name: 'Start a War' },
}

Then(/^focus is on the (first|second) menu item$/, async ({ page }, ordinal: string) => {
  // Assert
  const { index, name } = MENU_ITEMS[ordinal]!
  await expect(menu(page).getByRole('menuitem').nth(index)).toBeFocused()
  await expect(menu(page).getByRole('menuitem').nth(index)).toHaveText(name)
})

Then('focus is on the identity control', async ({ page }) => {
  // Assert
  await expect(trigger(page)).toBeFocused()
})

// Local logout is immediate, not after the server's 3-second answer.
Then('they are signed out without waiting for the server', async ({ page }) => {
  // Assert
  await expectSignedOut(page, { timeout: 500 })
})
