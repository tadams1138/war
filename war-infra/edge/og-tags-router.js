// Open Graph / Twitter Card tag injector — see war-spec.md
//
// Bound to /wars/* on the zone. This is a fully static SPA (spec) — every
// route serves the identical index.html and fills its <title>/content in
// client-side JavaScript, which a link-preview crawler (Facebook, Twitter/X,
// Slack, Teams, iMessage) never executes. Without this Worker, pasting any
// War's URL anywhere produces the same generic (or blank) preview regardless
// of which War it is.
//
// Only the War's own share page, /wars/:id (exactly one segment, no further
// path), gets real per-War tags — every other route under /wars/ (new,
// import, :id/edit, :id/vote, ...) passes straight through untouched, same
// as ui-router.js's own /ui/default/* passthrough. A single-segment id that
// isn't actually a War (a bad link, or one of the two reserved words below)
// falls back to generic tags rather than erroring — the underlying page
// still renders exactly as it would have without this Worker either way.
//
// No origin binding needed, unlike media-router.js/ui-router.js: this
// Worker never changes hostname, so a bare fetch(request) (unmatched paths)
// or a same-origin relative fetch (the API call) both resolve through the
// zone's own DNS record straight to App Platform, which already serves both
// the API and the static UI from one origin (spec).

const RESERVED_SEGMENTS = new Set(['new', 'import'])

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildTags({ title, description, image, url }) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeUrl = escapeHtml(url)
  const tags = [
    `<meta property="og:title" content="${safeTitle}">`,
    `<meta property="og:description" content="${safeDescription}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${safeUrl}">`,
    `<meta name="twitter:title" content="${safeTitle}">`,
    `<meta name="twitter:description" content="${safeDescription}">`,
  ]
  // Omitted, not defaulted, when the War has no share image (spec, "War
  // cards"): there is no server-rendered fallback image anywhere in this
  // SPA to point a crawler at instead, and a fabricated placeholder would
  // misrepresent the War.
  if (image) {
    const safeImage = escapeHtml(image)
    tags.push(`<meta property="og:image" content="${safeImage}">`, `<meta name="twitter:card" content="summary_large_image">`, `<meta name="twitter:image" content="${safeImage}">`)
  } else {
    tags.push(`<meta name="twitter:card" content="summary">`)
  }
  return tags.join('\n')
}

class HeadInjector {
  constructor(tags) {
    this.tags = tags
  }
  element(element) {
    element.append(this.tags, { html: true })
  }
}

async function tagsForWar(warId, pageUrl) {
  try {
    const response = await fetch(new URL(`/api/v1/wars/${warId}`, pageUrl))
    if (!response.ok) throw new Error('not found')
    const war = await response.json()
    return buildTags({
      title: war.title || 'War',
      description: 'Vote now!',
      image: war.share_image_url,
      url: pageUrl.toString(),
    })
  } catch {
    // A bad id, a deleted War, or the API being briefly unreachable all
    // land here — the page underneath still renders (or shows its own
    // not-found state) exactly as it would without this Worker; only the
    // crawler-facing tags fall back to something generic instead of
    // per-War.
    return buildTags({ title: 'War', description: 'Vote now!', image: null, url: pageUrl.toString() })
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const isDetailPage = segments.length === 2 && segments[0] === 'wars' && !RESERVED_SEGMENTS.has(segments[1])

    if (!isDetailPage) {
      return fetch(request)
    }

    const originResponse = await fetch(request)
    if (!originResponse.headers.get('content-type')?.includes('text/html')) {
      return originResponse
    }

    const tags = await tagsForWar(segments[1], url)
    const rewritten = new HTMLRewriter().on('head', new HeadInjector(tags)).transform(originResponse)

    // index.html must never be edge-cached or a deploy would not be picked
    // up (ui-router.js's shell() sets the same header for the same reason)
    // -- true here too, since this response *is* that same shell, tags
    // included.
    const headers = new Headers(rewritten.headers)
    headers.set('cache-control', 'no-store')
    return new Response(rewritten.body, { status: rewritten.status, headers })
  },
}
