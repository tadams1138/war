// Page locators and navigation shared by the acceptance specs.
import { expect, type Locator, type Page } from '@playwright/test'
import { loginAsTestVoter, navigateAuthenticated } from './mocking'
import type { Side } from './screens'

export function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

export function themeSelect(page: Page) {
  return nav(page).getByTestId('nav-theme-select')
}

export function warCard(page: Page, title: string) {
  return page.getByTestId('war-card').filter({ hasText: title })
}

export const contestantCard = (page: Page, name: string) => page.getByTestId('contestant-card').filter({ hasText: name })

export const matchupCard = (page: Page, side: Side) => page.getByTestId(`matchup-card-${side}`)
export const carousel = (page: Page, side: Side) => matchupCard(page, side).getByTestId('carousel-root')
export const dots = (page: Page, side: Side) => carousel(page, side).getByTestId('carousel-dot')
export const nextArrow = (page: Page, side: Side) => carousel(page, side).getByTestId('carousel-arrow-next')
export const previousArrow = (page: Page, side: Side) => carousel(page, side).getByTestId('carousel-arrow-previous')

// Anything a voter could read or press that is named like `name`.
export const controlNamed = (page: Page, name: RegExp) =>
  page.getByText(name).or(page.getByRole('button', { name })).or(page.getByRole('link', { name }))

// A result in the War detail's results list, by the contestant's exact name.
export const resultRow = (page: Page, name: string) =>
  page.getByTestId('ranking-row').filter({ has: page.locator('.results-name', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) })

export const sortMenu = (page: Page) => page.getByTestId('war-sort-select')

// The background colour of a real <button> in the page's theme, probed by
// adding one: "styled as a themed button" means matching it, never plain
// text's none.
export async function themedButtonBackground(page: Page): Promise<string> {
  const colour = await page.locator('main').evaluate((main) => {
    const probe = main.appendChild(document.createElement('button'))
    const background = getComputedStyle(probe).backgroundColor
    probe.remove()
    return background
  })
  expect(colour).not.toBe('rgba(0, 0, 0, 0)')
  return colour
}

export async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

export const backgroundOf = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor)

export function footer(page: Page) {
  return page.getByRole('contentinfo')
}

// Loads the app, signs in as the test voter, then client-side navigates to
// `path` (a full page.goto would wipe the in-memory session).
export async function gotoAuthenticated(page: Page, path: string): Promise<void> {
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, path)
}

export function gotoVotePage(page: Page, warId: string): Promise<void> {
  return gotoAuthenticated(page, `/wars/${warId}/vote`)
}

export function gotoEditPage(page: Page, warId: string): Promise<void> {
  return gotoAuthenticated(page, `/wars/${warId}/edit`)
}

// The navigation offers Log in (to the login page) and no identity or menu.
export async function expectSignedOut(page: Page, options?: { timeout: number }): Promise<void> {
  const login = nav(page).getByRole('link', { name: 'Log in' })
  await expect(login).toBeVisible(options)
  await expect(login).toHaveAttribute('href', '/login')
  await expect(nav(page).getByTestId('nav-identity')).toHaveCount(0)
  await expect(nav(page).getByRole('menu')).toHaveCount(0)
}

// The element has this text, or (for an empty text) there is none.
export async function expectTextOrNone(locator: Locator, text: string): Promise<void> {
  if (text) await expect(locator).toHaveText(text)
  else await expect(locator).toHaveCount(0)
}
