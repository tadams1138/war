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
    endsAt: null,
    shareImageKey: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('presentWarSummary', () => {
  // presentWarSummary only passes the given count through; that the count is
  // right for a War of any status is covered by the "The browse list reports
  // each War's contestant count" acceptance scenario.
  it('places the given contestant count on the view as contestant_count, alongside every other mapped field', () => {
    // Arrange
    const war = makeWar({
      id: 'a5b1e2c4-9999-4a11-8a11-000000000002',
      title: 'Best Pageant',
      category: 'pageant',
      status: 'published',
      visibility: 'unlisted',
      endsAt: new Date('2026-02-01T00:00:00Z'),
    });

    // Act
    const view = presentWarSummary(war, new Date('2026-01-01T00:00:00Z'), 2, 'https://cdn.test', 'Creator Name');

    // Assert
    expect(view).toEqual({
      id: 'a5b1e2c4-9999-4a11-8a11-000000000002',
      title: 'Best Pageant',
      category: 'pageant',
      status: 'published',
      visibility: 'unlisted',
      media_mode: 'image',
      theme: 'arcade',
      ends_at: '2026-02-01T00:00:00.000Z',
      contestant_count: 2,
      share_image_url: null,
      creator_name: 'Creator Name',
    });
  });

  it('builds share_image_url from the stored key and publicBaseUrl when the War has one', () => {
    // Arrange
    const war = makeWar({ shareImageKey: 'share-images/a5b1e2c4-9999-4a11-8a11-000000000002.jpg' });

    // Act
    const view = presentWarSummary(war, new Date('2026-01-01T00:00:00Z'), 0, 'https://cdn.test', null);

    // Assert
    expect(view.share_image_url).toBe('https://cdn.test/share-images/a5b1e2c4-9999-4a11-8a11-000000000002.jpg');
  });
});
