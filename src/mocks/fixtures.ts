// Fixture builders shared by the client's Vitest unit tests and the MSW
// handlers the Playwright acceptance suite runs against. Every literal here
// is shaped by the types generated from war-api's live OpenAPI document
// (src/api/generated/schema.d.ts, §5.1) — the compiler rejects a fixture
// that drifts from what war-api actually declares it returns.

import type { components, paths } from '../api/generated/schema'

export type WarSummary = components['schemas']['WarSummary']
export type ContestantDetail = components['schemas']['ContestantDetail']
export type MediaItem = components['schemas']['MediaItem']
export type ResolvedAttribute = components['schemas']['ResolvedAttribute']
export type NextMatchupResponse =
  paths['/wars/{id}/matchups/next']['get']['responses'][200]['content']['application/json']
export type WarDetailResponse = paths['/wars/{id}']['get']['responses'][200]['content']['application/json']

// `id` is required, not defaulted from a shared counter — a fixture's
// identity used to depend on how many fixtures had been built before it
// (test file order, --repeat-each, worker sharding, whether the mock
// build's baseline handlers ran first), since this module is shared by
// both the Vitest suite and the browser mock bundle. Every call site
// already names its media explicitly; the compiler catches any that
// don't.
export function buildMediaItem(overrides: Partial<MediaItem> & { id: string }): MediaItem {
  const { id } = overrides
  return {
    kind: 'image',
    display_order: 0,
    aspect_ratio: 0.75,
    variants: [
      { width: 400, url: `https://cdn.example.test/${id}/400.jpg` },
      { width: 1600, url: `https://cdn.example.test/${id}/1600.jpg` },
    ],
    ...overrides,
  }
}

export function buildContestant(overrides: Partial<ContestantDetail> = {}): ContestantDetail {
  return {
    id: overrides.id ?? 'contestant-1',
    name: overrides.name ?? 'Contestant One',
    bio: null,
    attributes: [],
    media: [buildMediaItem({ id: `${overrides.id ?? 'contestant-1'}-media-0`, display_order: 0 })],
    win_count: 0,
    appearance_count: 0,
    ...overrides,
  }
}

export function buildWarSummary(overrides: Partial<WarSummary> = {}): WarSummary {
  return {
    id: overrides.id ?? 'war-1',
    title: 'Miss Universe 2026',
    category: 'Pageant',
    status: 'active',
    visibility: 'public',
    media_mode: 'image',
    contestant_schema: [],
    ends_at: null,
    contestant_count: 0,
    ...overrides,
  }
}

export function buildWarDetail(overrides: Partial<WarDetailResponse> = {}): WarDetailResponse {
  const contestants = overrides.contestants ?? [buildContestant()]
  return {
    // Defaults contestant_count to the given contestants array's length
    // when the caller didn't pass one explicitly — overrides still wins
    // if it did (a test verifying a mismatch, say).
    ...buildWarSummary({ contestant_count: contestants.length, ...overrides }),
    contestants,
  }
}

export function buildMatchupResponse(overrides: Partial<NextMatchupResponse> = {}): NextMatchupResponse {
  return {
    matchup: {
      id: 'matchup-1',
      left: { id: 'contestant-left', name: 'Left Contestant', media: [buildMediaItem({ id: 'left-media-0' })] },
      right: { id: 'contestant-right', name: 'Right Contestant', media: [buildMediaItem({ id: 'right-media-0' })] },
    },
    progress: { voted: 0, total: 10 },
    ...overrides,
  }
}
