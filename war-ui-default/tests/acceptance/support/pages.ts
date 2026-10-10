// Page locators and navigation shared by the acceptance specs.
import type { Page } from '@playwright/test'
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
