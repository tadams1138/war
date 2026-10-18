// The rendered bios Gherkin steps name with the {bio} parameter type
// (steps/parameters.ts): the Edit page's live preview, or a contestant's bio
// in the War detail's results list.
import type { Locator, Page } from '@playwright/test'
import { resultRow } from './pages'

export const BIO_PATTERN = /the bio preview|the bio of "[^"]*"/

export type BioRef = (page: Page) => Locator

export function bioFrom(text: string): BioRef {
  const owner = /^the bio of "(.*)"$/.exec(text)
  if (owner) return (page) => resultRow(page, owner[1]!).getByTestId('contestant-bio')
  return (page) => page.getByTestId('bio-preview')
}
