// Steps for the API calls the app makes (support/calls.ts), identical in every
// feature that makes them. The call is named with the {call} parameter type.
import { expect, type Page } from '@playwright/test'
import { createBdd, type DataTable } from 'playwright-bdd'
import type { WarDetailResponse } from '../../../src/api/client'
import type { RecipeResponse } from '../../../src/mocks/scenarios'
import { test, type World } from './fixtures'
import type { CallRef, RequestDef } from '../support/calls'
import { bodyFrom } from '../support/fields'
import { API, getCallLog, type MswCallLogEntry } from '../support/mocking'
import { detailRecipe } from '../support/staffRecords'

const { Given, Then } = createBdd(test)

// The call's own request, then any it makes besides.
const requestsOf = (call: CallRef): RequestDef[] => [call, ...(call.alongside ?? [])]

const pathOf = (request: RequestDef, call: CallRef, world: World) => `${API}${request.path(world, call.subject)}`

async function callsTo(page: Page, world: World, call: CallRef, request: RequestDef = call): Promise<MswCallLogEntry[]> {
  return (await getCallLog(page)).filter((entry) => entry.method === request.method && new URL(entry.url).pathname === pathOf(request, call, world))
}

// The API answers every request to the call the same way.
function answer(world: World, call: CallRef, response: RecipeResponse): void {
  for (const request of requestsOf(call)) world.queue({ method: request.method, path: pathOf(request, call, world), responses: [response] })
}

function accepted(call: CallRef, world: World): RecipeResponse {
  const response = call.accepted ?? { status: 200, body: {} }
  return typeof response === 'function' ? response(world, call.subject) : response
}

// A call that changes a record is then followed by the record as it reads afterwards.
function followWithChange(world: World, call: CallRef): void {
  if (!call.changes) return
  const { becomes } = call.changes
  const record = detailRecipe(world, call.changes.record)
  const current = record.responses[record.responses.length - 1]!.body as WarDetailResponse
  record.responses.push({ status: 200, body: { ...current, ...(typeof becomes === 'function' ? becomes(current, call.subject) : becomes) } })
}

Given('the API accepts a request to {call}', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, accepted(call, world))
  followWithChange(world, call)
})

Given('the API refuses a request to {call}', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, { status: 403, body: { error: 'forbidden' } })
})

Given('the API rejects a request to {call}', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, { status: 422, body: { error: 'validation error' } })
})

Given('the API rejects a request to {call}, saying {string}', async ({ world }, call: CallRef, message: string) => {
  // Arrange
  answer(world, call, { status: 422, body: { error: 'validation error', details: [message] } })
})

Given('the API fails a request to {call} with a server error', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, { status: 500, body: { error: 'boom' } })
})

Given('the API rate limits a request to {call} for {int} second(s)', async ({ world }, call: CallRef, seconds: number) => {
  // Arrange
  world.retryAfterSeconds = seconds
  answer(world, call, { status: 429, body: { error: 'rate limited' }, headers: { 'Retry-After': String(seconds) } })
})

Given('the target of a request to {call} does not exist', async ({ world }, call: CallRef) => {
  // Arrange
  answer(world, call, { status: 404, body: { error: 'not found' } })
})

async function expectAskedOnce(page: Page, world: World, call: CallRef, request: RequestDef, body?: Record<string, unknown>): Promise<void> {
  await expect.poll(async () => (await callsTo(page, world, call, request)).length).toBe(1)
  const carried = (await callsTo(page, world, call, request))[0]!.body
  if (request.body) expect(JSON.parse(carried!)).toEqual(request.body)
  if (body) expect(JSON.parse(carried!)).toMatchObject(body)
}

// Exactly once, with the body the call carries.
Then('the API has been asked to {call}', async ({ page, world }, call: CallRef) => {
  // Assert
  for (const request of requestsOf(call)) await expectAskedOnce(page, world, call, request)
})

// One row per field: its name and the value it was given.
Then('the API has been asked to {call} with:', async ({ page, world }, call: CallRef, table: DataTable) => {
  // Assert
  await expectAskedOnce(page, world, call, call, bodyFrom(table.raw()))
})

Then('the API has not been asked to {call}', async ({ page, world }, call: CallRef) => {
  // Assert
  expect(await callsTo(page, world, call)).toHaveLength(0)
})

Then('{call} was/were requested {int} time(s)', async ({ page, world }, call: CallRef, count: number) => {
  // Assert
  await expect.poll(async () => (await callsTo(page, world, call)).length).toBe(count)
})
