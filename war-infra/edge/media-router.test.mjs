import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import worker from './media-router.js'

const originalCaches = globalThis.caches
afterEach(() => { globalThis.caches = originalCaches })

function fixture() {
  const reads = []
  const entries = new Map()
  const writes = []
  globalThis.caches = { default: {
    match: async request => entries.get(request.url)?.clone(),
    put: async (request, response) => {
      writes.push(response.status)
      entries.set(request.url, response.clone())
    },
  } }
  const object = {
    body: 'image',
    httpEtag: '"hash"',
    writeHttpMetadata: headers => headers.set('content-type', 'image/webp'),
  }
  const env = { MEDIA_BUCKET: { get: async (key, options) => {
    reads.push({ key, options })
    if (key === 'contestants/missing') return null
    if (options.onlyIf.get('if-none-match') === object.httpEtag) {
      const { body, ...metadata } = object
      return metadata
    }
    return object
  } } }
  const pending = []
  const ctx = { waitUntil: promise => pending.push(promise) }
  const request = (path, method = 'GET', headers = {}) =>
    new Request('https://war.example' + path, { method, headers })
  return { reads, writes, env, ctx, pending, request }
}

test('private media serves only variants with metadata, conditional reads and edge caching', async () => {
  // Arrange
  const f = fixture()
  // Act
  const response = await worker.fetch(f.request('/media/contestants/hash.webp'), f.env, f.ctx)
  await Promise.all(f.pending)
  const repeated = await worker.fetch(f.request('/media/contestants/hash.webp'), f.env, f.ctx)
  // Assert
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'image')
  assert.equal(await repeated.text(), 'image')
  assert.equal(response.headers.get('content-type'), 'image/webp')
  assert.equal(response.headers.get('etag'), '"hash"')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(f.reads.length, 1)
  assert.equal(f.reads[0].key, 'contestants/hash.webp')
  assert.deepEqual(f.writes, [200])
})

test('processed share images are served', async () => {
  // Arrange
  const f = fixture()
  // Act
  const response = await worker.fetch(f.request('/media/share-images/war-upload.jpg'), f.env, f.ctx)
  // Assert
  assert.equal(response.status, 200)
  assert.equal(f.reads[0].key, 'share-images/war-upload.jpg')
})

test('invalid paths and methods never touch the bucket', async () => {
  // Arrange
  const f = fixture()
  // Act
  const responses = await Promise.all([
    worker.fetch(f.request('/media/originals/secret'), f.env, f.ctx),
    worker.fetch(f.request('/media/originals/share-images/war-upload.png'), f.env, f.ctx),
    worker.fetch(f.request('/other/contestants/x'), f.env, f.ctx),
    worker.fetch(f.request('/media/other'), f.env, f.ctx),
    worker.fetch(f.request('/media/contestants/x', 'POST'), f.env, f.ctx),
  ])
  // Assert
  assert.deepEqual(responses.map(response => response.status), [404, 404, 404, 404, 405])
  assert.equal(f.reads.length, 0)
  assert.deepEqual(f.writes, [])
})

test('missing, HEAD and conditional responses are never cached', async () => {
  // Arrange
  const f = fixture()
  // Act
  const missing = await worker.fetch(f.request('/media/contestants/missing'), f.env, f.ctx)
  const head = await worker.fetch(f.request('/media/contestants/hash', 'HEAD'), f.env, f.ctx)
  const conditional = await worker.fetch(f.request('/media/contestants/hash', 'GET', { 'if-none-match': '"hash"' }), f.env, f.ctx)
  await Promise.all(f.pending)
  // Assert
  assert.equal(missing.status, 404)
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal(head.headers.get('content-type'), 'image/webp')
  assert.equal(head.headers.get('etag'), '"hash"')
  assert.equal(conditional.status, 304)
  assert.equal(await conditional.text(), '')
  assert.equal(conditional.headers.get('etag'), '"hash"')
  assert.deepEqual(f.writes, [])
})
