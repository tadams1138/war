import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  castVote,
  getMe,
  getNextMatchup,
  getWar,
  getWars,
  joinWar,
  logout,
  providerLoginUrl,
  refreshSession,
} from '../client'
import { __resetAuthStateForTests, getToken, registerUnauthorizedHandler, setToken } from '../authState'
import { buildMatchupResponse, buildWarDetail, buildWarSummary } from '../../mocks/fixtures'

const BASE = 'http://localhost/api/v1'

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  __resetAuthStateForTests()
})
afterAll(() => server.close())

describe('getWars', () => {
  it('returns the wars array parsed from the response body', async () => {
    // Arrange
    const wars = [buildWarSummary({ id: 'war-1' }), buildWarSummary({ id: 'war-2' })]
    server.use(http.get(`${BASE}/wars`, () => HttpResponse.json({ wars })))

    // Act
    const result = await getWars()

    // Assert
    expect(result.wars).toHaveLength(2)
    expect(result.wars[0].id).toBe('war-1')
  })

  it('attaches the in-memory JWT as a Bearer token when one is set', async () => {
    // Arrange
    setToken('token-abc')
    let receivedAuth: string | null = null
    server.use(
      http.get(`${BASE}/wars`, ({ request }) => {
        receivedAuth = request.headers.get('Authorization')
        return HttpResponse.json({ wars: [] })
      }),
    )

    // Act
    await getWars()

    // Assert
    expect(receivedAuth).toBe('Bearer token-abc')
  })

  it('sends no Authorization header when no token is set', async () => {
    // Arrange
    let receivedAuth: string | null | undefined = undefined
    server.use(
      http.get(`${BASE}/wars`, ({ request }) => {
        receivedAuth = request.headers.get('Authorization')
        return HttpResponse.json({ wars: [] })
      }),
    )

    // Act
    await getWars()

    // Assert
    expect(receivedAuth).toBeNull()
  })
})

describe('getWar', () => {
  it('returns the war detail body on 200', async () => {
    // Arrange
    const detail = buildWarDetail({ id: 'war-1', title: 'Miss Universe 2026' })
    server.use(http.get(`${BASE}/wars/war-1`, () => HttpResponse.json(detail)))

    // Act
    const result = await getWar('war-1')

    // Assert
    expect(result.title).toBe('Miss Universe 2026')
  })

  it('throws a not-found ApiError on 404', async () => {
    // Arrange
    server.use(http.get(`${BASE}/wars/missing`, () => HttpResponse.json({ error: 'not found' }, { status: 404 })))

    // Act / Assert
    await expect(getWar('missing')).rejects.toMatchObject({
      reason: 'not-found',
      message: "This War doesn't exist or has been removed",
    })
  })
})

describe('getNextMatchup', () => {
  it('returns the matchup body on 200', async () => {
    // Arrange
    const matchup = buildMatchupResponse()
    server.use(http.get(`${BASE}/wars/war-1/matchups/next`, () => HttpResponse.json(matchup)))

    // Act
    const result = await getNextMatchup('war-1')

    // Assert
    expect(result?.matchup.id).toBe('matchup-1')
  })

  it('returns null on 204 — every pair has been voted', async () => {
    // Arrange
    server.use(http.get(`${BASE}/wars/war-1/matchups/next`, () => new HttpResponse(null, { status: 204 })))

    // Act
    const result = await getNextMatchup('war-1')

    // Assert
    expect(result).toBeNull()
  })
})

describe('joinWar', () => {
  it('resolves on 204', async () => {
    // Arrange
    server.use(http.post(`${BASE}/wars/war-1/join`, () => new HttpResponse(null, { status: 204 })))

    // Act / Assert
    await expect(joinWar('war-1')).resolves.toBeUndefined()
  })

  // join's 403 has no `reason` field in war-api's schema (there is only
  // one possible cause — the War isn't active — unlike vote's 403, which
  // can also mean "not joined"), so it always classifies as war-closed
  // (classifyDefault403), regardless of the body's content. This pins the
  // client-level contract only, not user-visible behavior: joinWar's only
  // production caller (src/vote/useVoteSession.ts) swallows a join
  // failure unconditionally, so no page ever renders this reason or
  // message.
  it('classifies its 403 as war-closed — the default for an endpoint with no discriminator', async () => {
    // Arrange
    server.use(
      http.post(`${BASE}/wars/war-1/join`, () => HttpResponse.json({ error: 'War is not active' }, { status: 403 })),
    )

    // Act / Assert
    await expect(joinWar('war-1')).rejects.toMatchObject({
      reason: 'war-closed',
      message: 'This War is locked — voting is closed',
    })
  })
})

describe('castVote', () => {
  it('sends winner_id in the request body and resolves on 201', async () => {
    // Arrange
    let receivedBody: unknown
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, async ({ request }) => {
        receivedBody = await request.json()
        return HttpResponse.json({ vote_id: 'vote-1' }, { status: 201 })
      }),
    )

    // Act
    await castVote('war-1', 'm1', 'contestant-a')

    // Assert
    expect(receivedBody).toEqual({ winner_id: 'contestant-a' })
  })

  it('resolves on 200 — a retried vote for the same winner is idempotent', async () => {
    // Arrange
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () => HttpResponse.json({ status: 'already recorded' })),
    )

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).resolves.toBeUndefined()
  })

  it('throws a conflict ApiError with no message on 409', async () => {
    // Arrange
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () =>
        HttpResponse.json({ error: 'conflict' }, { status: 409 }),
      ),
    )

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({ reason: 'conflict', message: '' })
  })

  it('classifies a war_not_active 403 as war-closed, via the typed reason field', async () => {
    // Arrange
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () =>
        HttpResponse.json({ error: 'War is not active', reason: 'war_not_active' }, { status: 403 }),
      ),
    )

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({
      reason: 'war-closed',
      message: 'This War is locked — voting is closed',
    })
  })

  it('classifies a not_joined 403 as not-joined, via the typed reason field', async () => {
    // Arrange
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () =>
        HttpResponse.json({ error: 'Voter has not joined this War', reason: 'not_joined' }, { status: 403 }),
      ),
    )

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({
      reason: 'not-joined',
      message: 'Join this War to vote',
    })
  })

  it('trusts the reason field over the error text — proves it is a real discriminator, not a text heuristic', async () => {
    // Arrange — error text says "closed", but the typed reason says the
    // voter hasn't joined. If castVote were still parsing the message
    // text, this would misclassify as war-closed.
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () =>
        HttpResponse.json({ error: 'War is closed to new votes', reason: 'not_joined' }, { status: 403 }),
      ),
    )

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({
      reason: 'not-joined',
      message: 'Join this War to vote',
    })
  })

  it('falls back to war-closed when the 403 body carries no reason', async () => {
    // Arrange — e.g. an intermediary's error page, or any body the
    // client can't attribute to a known cause.
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () => HttpResponse.json({ error: 'forbidden' }, { status: 403 })),
    )

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({
      reason: 'war-closed',
      message: 'This War is locked — voting is closed',
    })
  })

  it('classifies 429 as rate-limited and carries the Retry-After delay', async () => {
    // Arrange
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () =>
        HttpResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '5' } }),
      ),
    )

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({
      reason: 'rate-limited',
      retryAfterSeconds: 5,
      message: 'Slow down a moment — try again in 5s',
    })
  })

  it('classifies 422 as validation', async () => {
    // Arrange
    server.use(
      http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () =>
        HttpResponse.json({ error: 'invalid winner' }, { status: 422 }),
      ),
    )

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({
      reason: 'validation',
      message: 'Something went wrong — please try again',
    })
  })

  it('classifies a 5xx as server-error', async () => {
    // Arrange
    server.use(http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () => new HttpResponse(null, { status: 503 })))

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({
      reason: 'server-error',
      message: 'Server error — please try again shortly',
    })
  })

  it('classifies a network failure as network', async () => {
    // Arrange
    server.use(http.post(`${BASE}/wars/war-1/matchups/m1/vote`, () => HttpResponse.error()))

    // Act / Assert
    await expect(castVote('war-1', 'm1', 'contestant-a')).rejects.toMatchObject({
      reason: 'network',
      message: 'Unable to reach the server — check your connection',
    })
  })
})

describe('401 handling', () => {
  beforeEach(() => {
    setToken('expired-token')
  })

  it('refreshes once and retries the original request, which then succeeds', async () => {
    // Arrange
    let warsCallCount = 0
    let refreshCallCount = 0
    server.use(
      http.get(`${BASE}/wars`, () => {
        warsCallCount += 1
        if (warsCallCount === 1) return HttpResponse.json({ error: 'expired' }, { status: 401 })
        return HttpResponse.json({ wars: [] })
      }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCallCount += 1
        return HttpResponse.json({ token: 'fresh-token' })
      }),
    )

    // Act
    const result = await getWars()

    // Assert
    expect(result.wars).toEqual([])
    expect(warsCallCount).toBe(2)
    expect(refreshCallCount).toBe(1)
    expect(getToken()).toBe('fresh-token')
  })

  it('is single-flight — two concurrent 401s trigger exactly one refresh call', async () => {
    // Arrange
    let refreshCallCount = 0
    server.use(
      http.get(`${BASE}/wars`, () => HttpResponse.json({ error: 'expired' }, { status: 401 }), { once: false }),
      http.get(`${BASE}/wars/war-1`, () => HttpResponse.json({ error: 'expired' }, { status: 401 }), { once: false }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCallCount += 1
        return HttpResponse.json({ token: 'fresh-token' })
      }),
    )
    // Both requests keep failing with 401 even after retry in this test —
    // what matters here is only how many times refresh itself was called.

    // Act
    await Promise.allSettled([getWars(), getWar('war-1')])

    // Assert
    expect(refreshCallCount).toBe(1)
  })

  it('clears the token and rejects with unauthorized when the refresh itself fails', async () => {
    // Arrange
    const onUnauthorized = vi.fn()
    registerUnauthorizedHandler(onUnauthorized)
    server.use(
      http.get(`${BASE}/wars`, () => HttpResponse.json({ error: 'expired' }, { status: 401 })),
      http.post(`${BASE}/auth/refresh`, () => HttpResponse.json({ error: 'invalid refresh token' }, { status: 401 })),
    )

    // Act / Assert
    await expect(getWars()).rejects.toMatchObject({ reason: 'unauthorized', message: 'Please log in to continue' })
    expect(getToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not attempt another refresh once a refresh has already failed for this session', async () => {
    // Arrange
    let refreshCallCount = 0
    server.use(
      http.get(`${BASE}/wars`, () => HttpResponse.json({ error: 'expired' }, { status: 401 })),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshCallCount += 1
        return HttpResponse.json({ error: 'invalid refresh token' }, { status: 401 })
      }),
    )

    // Act
    await getWars().catch(() => undefined)
    await getWars().catch(() => undefined)

    // Assert
    expect(refreshCallCount).toBe(1)
  })
})

describe('getMe', () => {
  it('returns the current voter', async () => {
    // Arrange
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json({ voter: { id: 'voter-1', display_name: 'Ada', avatar_url: null } }),
      ),
    )

    // Act
    const result = await getMe()

    // Assert
    expect(result.voter.display_name).toBe('Ada')
  })
})

describe('refreshSession', () => {
  it('sends the request with credentials so the refresh cookie is included, and stores the returned token', async () => {
    // Arrange
    let sawCredentials = false
    server.use(
      http.post(`${BASE}/auth/refresh`, ({ request }) => {
        sawCredentials = request.credentials === 'include'
        return HttpResponse.json({ token: 'new-token' })
      }),
    )

    // Act
    const token = await refreshSession()

    // Assert
    expect(token).toBe('new-token')
    expect(getToken()).toBe('new-token')
    expect(sawCredentials).toBe(true)
  })
})

describe('logout', () => {
  it('calls DELETE /auth/session and clears the in-memory token', async () => {
    // Arrange
    setToken('token-abc')
    server.use(http.delete(`${BASE}/auth/session`, () => new HttpResponse(null, { status: 204 })))

    // Act
    await logout()

    // Assert
    expect(getToken()).toBeNull()
  })
})

describe('providerLoginUrl', () => {
  it('builds the API login URL for the given provider', () => {
    // Arrange / Act
    const url = providerLoginUrl('google')

    // Assert
    expect(url).toBe(`${BASE}/auth/google/login`)
  })
})
