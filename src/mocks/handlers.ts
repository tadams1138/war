// Baseline MSW handlers — the "happy path" default for every endpoint this
// slice calls. Individual acceptance scenarios override just the endpoints
// they care about via scenarios.ts's data-driven recipes; anything they
// don't override falls through to these.
import { HttpResponse, http } from 'msw'
import { buildContestant, buildMatchupResponse, buildWarDetail, buildWarSummary } from './fixtures'

const wars = [
  buildWarSummary({ id: 'war-1', title: 'Miss Universe 2026', category: 'Pageant' }),
  buildWarSummary({ id: 'war-2', title: '2026 Senate Race', category: 'Politics' }),
]

// A tiny 1x1 transparent PNG — every contestant/media image URL in the
// fixtures (src/mocks/fixtures.ts) is a fake https://cdn.example.test/...
// address; serving real bytes for it (instead of letting the browser
// attempt real DNS resolution and fail) keeps the acceptance suite fast
// and deterministic while still exercising a genuine network request per
// image, which the lazy-loading scenarios in contestant-images.feature
// depend on being observable.
const ONE_PIXEL_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
  (char) => char.charCodeAt(0),
)

export const handlers = [
  http.get('https://cdn.example.test/*', () => new HttpResponse(ONE_PIXEL_PNG, { headers: { 'Content-Type': 'image/png' } })),

  http.get('/api/v1/wars', () => HttpResponse.json({ wars })),

  http.get('/api/v1/wars/:id', ({ params }) =>
    HttpResponse.json(
      buildWarDetail({
        id: String(params.id),
        contestants: [buildContestant({ id: 'contestant-1' }), buildContestant({ id: 'contestant-2' })],
      }),
    ),
  ),

  http.post('/api/v1/wars/:id/join', () => new HttpResponse(null, { status: 204 })),

  http.get('/api/v1/wars/:id/matchups/next', () => HttpResponse.json(buildMatchupResponse())),

  http.post('/api/v1/wars/:id/matchups/:matchupId/vote', () => HttpResponse.json({ vote_id: 'vote-1' }, { status: 201 })),

  http.post('/api/v1/auth/refresh', () => HttpResponse.json({ token: 'mock-refreshed-token' })),

  http.delete('/api/v1/auth/session', () => new HttpResponse(null, { status: 204 })),

  http.get('/api/v1/auth/me', () =>
    HttpResponse.json({ voter: { id: 'voter-1', display_name: 'Test Voter', avatar_url: null } }),
  ),
]
