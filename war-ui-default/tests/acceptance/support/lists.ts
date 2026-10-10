// The lists Gherkin steps name with the {list} parameter type
// (steps/parameters.ts): the Staff lists on the Admin Dashboard and the
// Staff views' paged sections. A row's name is the text of its first link.
// Add a list here, not a new step.
import type { Locator, Page } from '@playwright/test'
import { getCallLog, type MswCallLogEntry } from './mocking'

export interface ListRef {
  // Test id of one row.
  rows: string
  // The API requests that read the list (any page of it).
  endpoint: RegExp
  // Test ids of the status filter and the search box, for lists that have them.
  statusFilter?: string
  search?: string
}

export const LISTS: Record<string, ListRef> = {
  'the Wars list': { rows: 'admin-war-row', endpoint: /\/admin\/wars(\?|$)/, statusFilter: 'admin-war-status-filter', search: 'admin-war-search' },
  'the Voters list': { rows: 'admin-voter-row', endpoint: /\/admin\/voters(\?|$)/, statusFilter: 'admin-voter-status-filter', search: 'admin-voter-search' },
  'the vote history': { rows: 'admin-vote-row', endpoint: /\/admin\/voters\/[^/]+\/votes/ },
  "the Voter's Wars": { rows: 'admin-voter-war-row', endpoint: /\/admin\/voters\/[^/?]+$/ },
  'the unaddressed reports queue': { rows: 'unaddressed-queue-entry', endpoint: /\/reports\/unaddressed/ },
  'the moderation log': { rows: 'moderation-log-entry', endpoint: /\/moderation-log/ },
}

export const rowsOf = (page: Page, list: ListRef): Locator => page.getByTestId(list.rows)

export async function callsTo(page: Page, list: ListRef): Promise<MswCallLogEntry[]> {
  return (await getCallLog(page)).filter((entry) => list.endpoint.test(entry.url))
}

export const searchParam = (entry: MswCallLogEntry, name: string) => new URL(entry.url).searchParams.get(name)
