// Every public media key is written once and never overwritten (contestant
// variants carry an image id and width, share images an upload id), so a year
// in the edge cache cannot serve stale bytes. Originals remain private: the
// binding exposes only these public prefixes.
const PUBLIC_PREFIXES = ['contestants/', 'share-images/']

function allowedKey(request) {
  const path = new URL(request.url).pathname
  if (!path.startsWith('/media/')) return null
  const key = path.slice('/media/'.length)
  return PUBLIC_PREFIXES.some(prefix => key.startsWith(prefix)) ? key : null
}

function objectResponse(object, method) {
  if (!object) return new Response('Not found', { status: 404 })
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  return new Response(method === 'HEAD' ? null : object.body, { headers })
}

async function readObject(request, env, key) {
  const object = await env.MEDIA_BUCKET.get(key, { onlyIf: request.headers })
  return objectResponse(object, request.method)
}

async function serveGet(request, env, ctx, key) {
  const cache = caches.default
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await readObject(request, env, key)
  if (response.status === 200) ctx.waitUntil(cache.put(request, response.clone()))
  return response
}

export default {
  async fetch(request, env, ctx) {
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }
    const key = allowedKey(request)
    if (!key) return new Response('Not found', { status: 404 })
    if (request.method === 'GET') return serveGet(request, env, ctx, key)
    return readObject(request, env, key)
  },
}
