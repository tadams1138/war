import { describe, expect, it } from 'vitest';
import { presentWarSummary } from '../../src/wars/warPresenter.js';
import type { War } from '../../src/wars/warsRepository.js';

function makeWar(overrides: Partial<War> = {}): War {
  return {
    id: 'a5b1e2c4-9999-4a11-8a11-000000000001',
    creatorId: 'creator-1',
    title: 'Test War',
    category: null,
    status: 'draft',
    visibility: 'public',
    mediaMode: 'image',
    theme: 'arcade',
    contestantSchema: [],
    endsAt: null,
    shareImageKey: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('presentWarSummary', () => {
  // presentWarSummary is a pure pass-through of the count it is given -- it
  // never queries `contestants` itself, so it cannot verify (and this test
  // does not claim) that the count is correct regardless of War status.
  // That guarantee actually lives in `countContestantsByWarIds`
  // (src/contestants/contestantsRepository.ts) having no status predicate,
  // and is exercised end-to-end by the DB-gated "The browse list reports
  // each War's contestant count" acceptance scenario, which deliberately
  // uses a never-activated draft War.
  it('places the given contestant count on the view as contestant_count, alongside every other mapped field', () => {
    // Arrange
    const war = makeWar({
      id: 'a5b1e2c4-9999-4a11-8a11-000000000002',
      title: 'Best Pageant',
      category: 'pageant',
      status: 'active',
      visibility: 'invite_only',
      endsAt: new Date('2026-02-01T00:00:00Z'),
    });

    // Act
    const view = presentWarSummary(war, new Date('2026-01-01T00:00:00Z'), 2, 'https://cdn.test');

    // Assert
    expect(view).toEqual({
      id: 'a5b1e2c4-9999-4a11-8a11-000000000002',
      title: 'Best Pageant',
      category: 'pageant',
      status: 'active',
      visibility: 'invite_only',
      media_mode: 'image',
      theme: 'arcade',
      contestant_schema: [],
      ends_at: '2026-02-01T00:00:00.000Z',
      contestant_count: 2,
      share_image_url: null,
    });
  });

  it('builds share_image_url from the stored key and publicBaseUrl when the War has one', () => {
    // Arrange
    const war = makeWar({ shareImageKey: 'share-images/a5b1e2c4-9999-4a11-8a11-000000000002.jpg' });

    // Act
    const view = presentWarSummary(war, new Date('2026-01-01T00:00:00Z'), 0, 'https://cdn.test');

    // Assert
    expect(view.share_image_url).toBe('https://cdn.test/share-images/a5b1e2c4-9999-4a11-8a11-000000000002.jpg');
  });
});
