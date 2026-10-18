// Steps for the Staff lists (support/lists.ts), identical in every feature
// that shows one. The list is named with the {list} parameter type.
import { expect, type Page } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import { test } from './fixtures'
import { cursorAfter } from '../support/adminFixtures'
import { callsTo, rowsOf, searchParam, type ListRef } from '../support/lists'

const { When, Then } = createBdd(test)

async function expectNames(page: Page, list: ListRef, names: string[]): Promise<void> {
  const rows = rowsOf(page, list)
  await expect(rows).toHaveCount(names.length)
  for (const [index, name] of names.entries()) await expect(rows.nth(index).getByRole('link').first()).toHaveText(name)
}

When('they select {string} in {list}', async ({ page }, name: string, list: ListRef) => {
  // Act
  await rowsOf(page, list).getByRole('link', { name, exact: true }).click()
})

When('they filter {list} by {string}', async ({ page }, list: ListRef, label: string) => {
  // Act
  await page.getByTestId(list.statusFilter!).selectOption({ label })
})

// Typed key by key, as a person types.
When('they search {list} for {string}', async ({ page }, list: ListRef, text: string) => {
  // Act
  await page.getByTestId(list.search!).pressSequentially(text)
})

Then('{list} shows only {string}', async ({ page }, list: ListRef, name: string) => {
  // Assert
  await expectNames(page, list, [name])
})

// One name per row (no header).
Then('{list} shows, in order:', async ({ page }, list: ListRef, table: DataTable) => {
  // Assert
  await expectNames(page, list, table.raw().flat())
})

// The filter chosen by its label asks for the status of that name; All asks for none.
Then('{list} was last requested for the {string} filter', async ({ page }, list: ListRef, label: string) => {
  // Assert
  const calls = await callsTo(page, list)
  expect(searchParam(calls[calls.length - 1]!, 'status')).toBe(label === 'All' ? null : label.toLowerCase())
})

// Typing settles before it asks: one request, for the whole term.
Then('{list} was searched exactly once, for {string}', async ({ page }, list: ListRef, term: string) => {
  // Assert
  const searches = (await callsTo(page, list)).filter((entry) => searchParam(entry, 'q') !== null)
  expect(searches.map((entry) => searchParam(entry, 'q'))).toEqual([term])
})

Then('the next page of {list} was requested from where the first page ended', async ({ page }, list: ListRef) => {
  // Assert
  const calls = await callsTo(page, list)
  expect(searchParam(calls[calls.length - 1]!, 'cursor')).toBe(cursorAfter(1))
})

Then('{list} was requested {int} time(s)', async ({ page }, list: ListRef, count: number) => {
  // Assert
  expect(await callsTo(page, list)).toHaveLength(count)
})
