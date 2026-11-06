import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import worker from './scheduled-tasks.js'

const realFetch = globalThis.fetch
const env = { API_BASE_URL: 'https://origin.example', INTERNAL_TASK_TOKEN: 'tok' }
let calls

function stubApi(status = 200) {
  calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return Response.json({}, { status })
  }
}

afterEach(() => {
  globalThis.fetch = realFetch
})

test('posts to the internal close-expired-wars endpoint with the task token', async () => {
  // Arrange
  stubApi()

  // Act
  await worker.scheduled({}, env, {})

  // Assert
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://origin.example/api/v1/internal/close-expired-wars')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(new Headers(calls[0].init.headers).get('X-Internal-Token'), 'tok')
})

test('declares no content type when it sends no body', async () => {
  // Arrange
  stubApi()

  // Act
  await worker.scheduled({}, env, {})

  // Assert
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.body, undefined)
  assert.equal(new Headers(calls[0].init.headers).get('content-type'), null)
})

test('rejects with the HTTP status when the API answers 400', async () => {
  // Arrange
  stubApi(400)

  // Act
  const invocation = worker.scheduled({}, env, {})

  // Assert
  await assert.rejects(invocation, /HTTP 400/)
})
