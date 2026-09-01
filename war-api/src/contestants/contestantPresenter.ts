import type { War } from '../wars/warsRepository.js';
import type { ContestantMedia } from './contestantMediaRepository.js';
import type { Contestant } from './contestantsRepository.js';
import { presentMedia, type MediaItemView } from './mediaPresenter.js';
import { resolveAttributes, type ResolvedAttribute } from './schemaValidation.js';

export interface ContestantDetailView {
  id: string;
  name: string;
  bio: string | null;
  attributes: ResolvedAttribute[];
  media: MediaItemView[];
  win_count: number;
  appearance_count: number;
}

/**
 * The `{ id, name, media }` shape a contestant reduces to wherever full
 * detail (bio, attributes, win/appearance counts) isn't wanted --
 * `/matchups/next`'s `matchup.left`/`right` and `/rankings`' `contestant`
 * both need exactly this and nothing more. Owned here, not by either of
 * those domains, since this domain (contestants) is the one the shape
 * describes; matchups/rankings importing it, not the other way, keeps the
 * dependency pointed the right direction.
 */
export interface ContestantView {
  id: string;
  name: string;
  media: MediaItemView[];
}

/**
 * The response body JSON Schema for {@link ContestantView}. Kept beside the
 * interface it mirrors -- see `mediaItemSchema` (`mediaPresenter.ts`) for
 * why.
 */
export const contestantViewSchema = {
  type: 'object',
  required: ['id', 'name', 'media'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    media: { type: 'array', items: { $ref: 'MediaItem#' } },
  },
};

/**
 * The response body JSON Schema for {@link ContestantDetailView} (spec
 * §11.2.1). Registered under `$id: "ContestantDetail"`
 * (`registerSharedSchemas`, `src/openapi/schemas.ts`) and `$ref`s the
 * `ResolvedAttribute`/`MediaItem` schemas by name rather than importing
 * their JS objects, so this module needs no new dependency on
 * `mediaPresenter.ts`/`schemaValidation.ts` beyond the ones it already has
 * for the types themselves. Kept beside the interface it mirrors -- see
 * `mediaItemSchema` (`mediaPresenter.ts`) for why.
 */
export const contestantDetailSchema = {
  $id: 'ContestantDetail',
  type: 'object',
  required: ['id', 'name', 'bio', 'attributes', 'media', 'win_count', 'appearance_count'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    bio: { type: ['string', 'null'] },
    attributes: { type: 'array', items: { $ref: 'ResolvedAttribute#' } },
    media: { type: 'array', items: { $ref: 'MediaItem#' } },
    win_count: { type: 'integer' },
    appearance_count: { type: 'integer' },
  },
};

/**
 * Builds a contestant's detail view from media the caller already fetched,
 * rather than fetching it itself — the N+1 alternative (one query per
 * contestant) is what War detail used to pay on every request (design
 * review finding 9). `presentWarDetail` batches the fetch for all of a
 * War's contestants; single-contestant callers pass a one-element result.
 */
export function presentContestant(
  contestant: Contestant,
  war: War,
  media: ContestantMedia[],
  publicBaseUrl: string,
): ContestantDetailView {
  return {
    id: contestant.id,
    name: contestant.name,
    bio: contestant.bio,
    attributes: resolveAttributes(war.contestantSchema, contestant.attributes),
    media: presentMedia(media, publicBaseUrl),
    win_count: contestant.winCount,
    appearance_count: contestant.appearanceCount,
  };
}
