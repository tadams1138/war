// Page locators and navigation shared by the acceptance specs.
import type { Page } from '@playwright/test'
import { loginAsTestVoter, navigateAuthenticated } from './mocking'

export function nav(page: Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

export function themeSelect(page: Page) {
  return nav(page).getByTestId('nav-theme-select')
}

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
