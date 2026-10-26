import { describe, expect, it } from 'vitest';
import { presentMedia, presentPrefetchMedia } from '../../src/contestants/mediaPresenter.js';
import type { ContestantMedia } from '../../src/contestants/contestantMediaRepository.js';

function media(overrides: Partial<ContestantMedia>): ContestantMedia {
  return {
    id: 'media-1',
    contestantId: 'contestant-1',
    kind: 'image',
    displayOrder: 0,
    storageKey: 'contestants/contestant-1/media-1',
    originalExt: 'jpg',
    width: 2000,
    height: 1500,
    variantWidths: null,
    ...overrides,
  };
}

describe('presentMedia', () => {
  it('prefetches video poster without player identity or clip data', () => {
    // Arrange
    const video = media({ kind: 'video', storageKey: null, provider: 'youtube', videoId: 'abc12345678', startSeconds: 2, endSeconds: 10, durationSeconds: 8, posterUrl: 'https://poster.test/video.jpg' });
    // Act
    const result = presentPrefetchMedia([video], 'https://cdn.test');
    // Assert
    expect(result).toEqual([{ kind: 'video', id: 'media-1', display_order: 0, aspect_ratio: null, variants: [], poster_url: 'https://poster.test/video.jpg' }]);
  });
  it('includes only variant widths the source is wide enough for', () => {
    // Arrange
    const items = [media({ width: 600, height: 450 })];

    // Act
    const [view] = presentMedia(items, 'https://cdn.example.com');

    // Assert
    expect(view!.variants.map((v) => v.width)).toEqual([400]);
  });

  it('builds variant urls by convention', () => {
    // Arrange
    const items = [media({ storageKey: 'contestants/c1/m1', width: 2000, height: 1500 })];

    // Act
    const [view] = presentMedia(items, 'https://cdn.example.com');

    // Assert
    expect(view!.variants).toEqual([
      { width: 400, url: 'https://cdn.example.com/contestants/c1/m1-400.webp' },
      { width: 800, url: 'https://cdn.example.com/contestants/c1/m1-800.webp' },
      { width: 1600, url: 'https://cdn.example.com/contestants/c1/m1-1600.webp' },
    ]);
  });

  it('computes aspect ratio from stored source dimensions', () => {
    // Arrange
    const items = [media({ width: 800, height: 600 })];

    // Act
    const [view] = presentMedia(items, 'https://cdn.example.com');

    // Assert
    expect(view!.aspect_ratio).toBeCloseTo(1.333, 3);
  });

  it('prefers the recorded variant widths over recomputing from today\'s config', () => {
    // Arrange: recorded at upload time under widths that differ from the
    // current VARIANT_WIDTHS — simulating the spec's anticipated future
    // change to variant widths without touching this historical row.
    const items = [media({ width: 2000, height: 1500, variantWidths: [300, 600] })];

    // Act
    const [view] = presentMedia(items, 'https://cdn.example.com');

    // Assert
    expect(view!.variants.map((v) => v.width)).toEqual([300, 600]);
  });

  it('falls back to filtering current VARIANT_WIDTHS when no widths were recorded', () => {
    // Arrange: a row predating the variant_widths column, so no backfill is required.
    const items = [media({ width: 600, height: 450, variantWidths: null })];

    // Act
    const [view] = presentMedia(items, 'https://cdn.example.com');

    // Assert
    expect(view!.variants.map((v) => v.width)).toEqual([400]);
  });
});
