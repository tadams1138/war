// Default UI Worker -- serves the static SPA (Workers static assets) and adds
// per-War link-preview (Open Graph / Twitter Card) tags -- see war-spec.md
//
// The SPA is fully static: every route serves the identical index.html and
// fills its <title>/content in client-side JavaScript, which a link-preview
// crawler (Facebook, Twitter/X, Slack, Teams, iMessage) never executes.
// Without this Worker, pasting any War's URL anywhere produces the same
// generic (or blank) preview regardless of which War it is.
//
// Runs first on /wars/* (run_worker_first). Elsewhere the assets runtime
// answers without invoking this script when a file matches, or when a
// browser navigation gets the SPA shell; a non-navigation request that
// matches no file (a crawler, curl, a missing /robots.txt) still reaches it,
// and gets the shell from env.ASSETS like any other non-share path.
//
// Only the War's own share page, /wars/:id (exactly one segment, not "new"
// or "import"), gets real per-War tags -- every other path passes straight
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

// The War id for a share page (/wars/:id), or null for any other path.
function shareWarId(pathname) {
  const segments = pathname.split('/').filter(Boolean)
  const isSharePage = segments.length === 2 && segments[0] === 'wars' && !RESERVED_SEGMENTS.has(segments[1])
  return isSharePage ? segments[1] : null
}

function isHtml(response) {
  return (response.headers.get('content-type') ?? '').includes('text/html')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const warId = shareWarId(url.pathname)
    const shellResponse = await env.ASSETS.fetch(request)
    if (warId === null || !isHtml(shellResponse)) {
      return shellResponse
    }

    const tags = await tagsForWar(warId, url)
    const rewritten = new HTMLRewriter().on('head', new HeadInjector(tags)).transform(shellResponse)

    // index.html must never be edge-cached or a deploy would not be picked
    // up -- true here too, since this response *is* that same shell, tags
    // included. The shell's ETag goes too: this body is per-War, not the
    // shared index.html it names.
    const headers = new Headers(rewritten.headers)
    headers.set('cache-control', 'no-store')
    headers.delete('etag')
    return new Response(rewritten.body, { status: rewritten.status, headers })
  },
}
