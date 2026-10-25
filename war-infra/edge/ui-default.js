// Default UI Worker -- serves the static SPA (Workers static assets) and adds
// per-War link-preview (Open Graph / Twitter Card) tags -- see war-spec.md
//
// The SPA is fully static: every route serves the identical index.html and
// fills its <title>/content in client-side JavaScript, which a link-preview
// crawler (Facebook, Twitter/X, Slack, Teams, iMessage) never executes.
// Without this Worker, pasting any War's URL anywhere produces the same
// generic (or blank) preview regardless of which War it is.
//
// Runs only on /wars/* (the route that reaches it); every other path is
// served by the assets runtime without invoking this script. Only the War's
// own share page, /wars/:id (exactly one segment, not "new" or "import"),
// gets real per-War tags -- everything else under /wars/ passes straight
// through to the assets binding untouched. A single-segment id that isn't
// actually a War falls back to generic tags rather than erroring.
//
// The ASSETS binding replaces the old same-origin shell fetch: the shell
// (index.html) now comes from env.ASSETS.fetch(request) instead of an
// origin fetch through the zone. The API call is still a same-origin
// relative fetch.

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
    // land here -- the page underneath still renders (or shows its own
    // not-found state) exactly as it would without this Worker; only the
    // crawler-facing tags fall back to something generic instead of
    // per-War.
    return buildTags({ title: 'War', description: 'Vote now!', image: null, url: pageUrl.toString() })
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const segments = url.pathname.split('/').filter(Boolean)
    const isDetailPage = segments.length === 2 && segments[0] === 'wars' && !RESERVED_SEGMENTS.has(segments[1])

    if (!isDetailPage) {
      return env.ASSETS.fetch(request)
    }

    const shellResponse = await env.ASSETS.fetch(request)
    if (!shellResponse.headers.get('content-type')?.includes('text/html')) {
      return shellResponse
    }

    const tags = await tagsForWar(segments[1], url)
    const rewritten = new HTMLRewriter().on('head', new HeadInjector(tags)).transform(shellResponse)

    // index.html must never be edge-cached or a deploy would not be picked
    // up -- true here too, since this response *is* that same shell, tags
    // included.
    const headers = new Headers(rewritten.headers)
    headers.set('cache-control', 'no-store')
    return new Response(rewritten.body, { status: rewritten.status, headers })
  },
}
