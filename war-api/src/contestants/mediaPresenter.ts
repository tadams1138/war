import { VARIANT_WIDTHS } from './imageProcessing.js';
import type { ContestantMedia } from './contestantMediaRepository.js';

export interface MediaVariantView {
  width: number;
  url: string;
}

export interface MediaItemView {
  kind: string;
  id: string;
  display_order: number;
  aspect_ratio: number | null;
  variants: MediaVariantView[];
  provider?: string;
  video_id?: string;
  start_seconds?: number;
  end_seconds?: number | null;
  duration_seconds?: number;
  poster_url?: string | null;
}

/**
 * The response body JSON Schema for {@link MediaItemView}.
 * Registered under `$id: "MediaItem"` (`registerSharedSchemas`,
 * `src/openapi/schemas.ts`) so other routes' schemas can `$ref` it instead
 * of repeating it. Kept beside the interface it mirrors, on pain of the
 * silent field-drop `fast-json-stringify` produces for any property listed
 * here but not on {@link MediaItemView} (or vice versa).
 */
export const mediaItemSchema = {
  $id: 'MediaItem',
  type: 'object',
  required: ['kind', 'id', 'display_order', 'aspect_ratio', 'variants'],
  properties: {
    kind: { type: 'string', enum: ['image', 'video'] },
    id: { type: 'string', format: 'uuid' },
    display_order: { type: 'integer' },
    aspect_ratio: { type: ['number', 'null'] },
    provider: { type: 'string', enum: ['youtube', 'vimeo'] },
    video_id: { type: 'string' },
    start_seconds: { type: 'integer' },
    end_seconds: { type: ['integer', 'null'] },
    duration_seconds: { type: 'integer' },
    poster_url: { type: ['string', 'null'] },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        required: ['width', 'url'],
        properties: {
          width: { type: 'integer' },
          url: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Builds the response shape for a contestant's media array (§9.1). Variant widths come from those actually
 * written at upload time (`variantWidths`), so changing `VARIANT_WIDTHS` later cannot break URLs already
 * advertised. Rows predating that column fall back to filtering the source width against today's config.
 */
export function presentMedia(media: ContestantMedia[], publicBaseUrl: string): MediaItemView[] {
  return media.map((item) => item.kind === 'video' ? presentVideo(item) : presentImage(item, publicBaseUrl));
}

function presentVideo(item: ContestantMedia): MediaItemView {
  return {
    kind: 'video', id: item.id, display_order: item.displayOrder, aspect_ratio: null, variants: [],
    provider: item.provider!, video_id: item.videoId!, start_seconds: item.startSeconds ?? 0,
    end_seconds: item.endSeconds ?? null, duration_seconds: item.durationSeconds!, poster_url: item.posterUrl ?? null,
  };
}

function imageVariants(item: ContestantMedia, publicBaseUrl: string, sourceWidth: number): MediaVariantView[] {
  const widths = item.variantWidths ?? VARIANT_WIDTHS.filter((width) => width <= sourceWidth);
  return widths.map((width) => ({ width, url: `${publicBaseUrl}/${item.storageKey}-${width}.webp` }));
}

function presentImage(item: ContestantMedia, publicBaseUrl: string): MediaItemView {
  const sourceWidth = item.width ?? 0;
  const sourceHeight = item.height ?? 0;
  return {
    kind: item.kind, id: item.id, display_order: item.displayOrder,
    aspect_ratio: sourceHeight > 0 ? sourceWidth / sourceHeight : null,
    variants: imageVariants(item, publicBaseUrl, sourceWidth),
  };
}

/** An upcoming video needs its poster in the prefetch hint, never a player identity. */
export function presentPrefetchMedia(media: ContestantMedia[], publicBaseUrl: string): MediaItemView[] {
  return presentMedia(media, publicBaseUrl).map((item) => item.kind === 'video'
    ? { kind: 'video', id: item.id, display_order: item.display_order, aspect_ratio: null, variants: [], poster_url: item.poster_url ?? null }
    : item);
}
