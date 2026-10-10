// Steps for the API calls the app makes (support/calls.ts), identical in every
// feature that makes them. The call is named with the {call} parameter type.
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { RecipeResponse } from '../../../src/mocks/scenarios'
import { test, type World } from './fixtures'
import type { CallRef } from '../support/calls'
import { API, getCallLog, type MswCallLogEntry } from '../support/mocking'
import { detailRecipe } from '../support/staffRecords'

const { Given, Then } = createBdd(test)

const pathOf = (call: CallRef, world: World) => `${API}${call.path(world)}`

async function callsTo(page: Page, world: World, call: CallRef): Promise<MswCallLogEntry[]> {
  return (await getCallLog(page)).filter((entry) => entry.method === call.method && new URL(entry.url).pathname === pathOf(call, world))
}

// The API answers every request to the call the same way; a call that changes a
// record is then followed by the record as it reads afterwards.
function answer(world: World, call: CallRef, response: RecipeResponse): void {
  world.queue({ method: call.method, path: pathOf(call, world), responses: [response] })
}

Given('the API accepts a request to {call}', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, call.accepted ?? { status: 200, body: {} })
  if (!call.changes) return
  const record = detailRecipe(world, call.changes.record)
  const current = record.responses[record.responses.length - 1]!
  record.responses.push({ status: 200, body: { ...(current.body as object), ...call.changes.becomes } })
})

Given('the API refuses a request to {call}', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, { status: 403, body: { error: 'forbidden' } })
})

Given('the API fails a request to {call} with a server error', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, { status: 500, body: { error: 'boom' } })
})

Given('the target of a request to {call} does not exist', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, { status: 404, body: { error: 'not found' } })
})

// Exactly once, with the body the call carries.
Then('the API has been asked to {call}', async ({ page, world }, call: CallRef) => {
  // Assert
  await expect.poll(async () => (await callsTo(page, world, call)).length).toBe(1)
  if (call.body) expect(JSON.parse((await callsTo(page, world, call))[0]!.body ?? '{}')).toEqual(call.body)
})

Then('the API has not been asked to {call}', async ({ page, world }, call: CallRef) => {
  // Assert
  expect(await callsTo(page, world, call)).toHaveLength(0)
})

Then('{call} was/were requested {int} time(s)', async ({ page, world }, call: CallRef, count: number) => {
  // Assert
  await expect.poll(async () => (await callsTo(page, world, call)).length).toBe(count)
})
