import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import worker from './ui-default.js'

const SHELL = '<html><head><title>x</title></head><body></body></html>'
const realFetch = globalThis.fetch
const realRewriter = globalThis.HTMLRewriter
let apiCalls

function shellResponse() {
  return new Response(SHELL, { headers: { 'content-type': 'text/html' } })
}

function envWith(response = shellResponse()) {
  return { response, ASSETS: { fetch: async () => response } }
}

function stubApi(handler) {
  apiCalls = 0
  globalThis.fetch = async (...args) => {
    apiCalls++
    return handler(...args)
  }
}

beforeEach(() => {
  globalThis.HTMLRewriter = class {
    on(_selector, handler) {
      this.handler = handler
      return this
    }
    transform(res) {
      const handler = this.handler
      const body = res.text().then((text) => {
        let appended = ''
        handler.element({ append: (html) => { appended += html } })
        return text.replace('</head>', `${appended}</head>`)
      })
      return new Response(new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(await body))
          controller.close()
        },
      }), { status: res.status, headers: res.headers })
    }
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
  globalThis.HTMLRewriter = realRewriter
})

const req = (path) => new Request(`https://war.example${path}`)

test('share page gets the War\'s tags', async () => {
  // Arrange
  stubApi(async () => Response.json({ title: 'Cats vs Dogs', share_image_url: 'https://x/s.png' }))

  // Act
  const res = await worker.fetch(req('/wars/abc'), envWith())
  const body = await res.text()

  // Assert
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.ok(body.includes('<meta property="og:title" content="Cats vs Dogs">'))
  assert.ok(body.includes('<meta property="og:image" content="https://x/s.png">'))
  assert.ok(body.includes('<meta name="twitter:card" content="summary_large_image">'))
})

test('no share image means no image tags', async () => {
  // Arrange
  stubApi(async () => Response.json({ title: 'T' }))

  // Act
  const body = await (await worker.fetch(req('/wars/abc'), envWith())).text()

  // Assert
  assert.ok(body.includes('<meta name="twitter:card" content="summary">'))
  assert.ok(!body.includes('og:image'))
})

test('unknown War falls back to generic tags', async () => {
  // Arrange
  stubApi(async () => new Response('nope', { status: 404 }))

  // Act
  const res = await worker.fetch(req('/wars/abc'), envWith())
  const body = await res.text()

  // Assert
  assert.equal(res.status, 200)
  assert.ok(body.includes('<meta property="og:title" content="War">'))
})

test('API failure falls back to generic tags', async () => {
  // Arrange
  stubApi(async () => { throw new Error('down') })

  // Act
  const res = await worker.fetch(req('/wars/abc'), envWith())
  const body = await res.text()

  // Assert
  assert.equal(res.status, 200)
  assert.ok(body.includes('<meta property="og:title" content="War">'))
})

test('title is escaped', async () => {
  // Arrange
  stubApi(async () => Response.json({ title: 'a"<b>&' }))

  // Act
  const body = await (await worker.fetch(req('/wars/abc'), envWith())).text()

  // Assert
  assert.ok(body.includes('content="a&quot;&lt;b&gt;&amp;"'))
})

test('deeper and reserved paths pass through', async () => {
  for (const path of ['/wars/abc/vote', '/wars/new', '/wars/import']) {
    // Arrange
    stubApi(async () => Response.json({ title: 'T' }))
    const env = envWith()

    // Act
    const res = await worker.fetch(req(path), env)

    // Assert
    assert.strictEqual(res, env.response, path)
    assert.equal(apiCalls, 0, path)
  }
})

test('non-HTML shell passes through', async () => {
  // Arrange
  stubApi(async () => Response.json({ title: 'T' }))
  const env = envWith(new Response('{}', { headers: { 'content-type': 'application/json' } }))

  // Act
  const res = await worker.fetch(req('/wars/abc'), env)

  // Assert
  assert.strictEqual(res, env.response)
})
