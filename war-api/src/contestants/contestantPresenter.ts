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
 * detail (bio, attributes, win/appearance counts) isn't wanted -- `/rankings`'
 * `contestant` needs exactly this and nothing more. Owned here, not by that
 * domain, since this domain (contestants) is the one the shape describes;
 * rankings importing it, not the other way, keeps the dependency pointed the
 * right direction.
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
 * `ContestantView` plus `bio` -- what `/matchups/next`'s `matchup.left`/
 * `right` need (spec §10.3: the vote page shows each contestant's bio
 * below the fold, never as part of the tap-to-vote media itself). A
 * distinct type from `ContestantView` rather than adding `bio` there,
 * since `/rankings` shares that shape and has no use for bio.
 */
export interface MatchupContestantView {
  id: string;
  name: string;
  bio: string | null;
  media: MediaItemView[];
}

/** The response body JSON Schema for {@link MatchupContestantView}. */
export const matchupContestantViewSchema = {
  type: 'object',
  required: ['id', 'name', 'bio', 'media'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    bio: { type: ['string', 'null'] },
    media: { type: 'array', items: { $ref: 'MediaItem#' } },
  },
};

/**
 * The response body JSON Schema for {@link ContestantDetailView} (spec).
 * Registered under `$id: "ContestantDetail"`
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
 * rather than fetching it itself — the N+1 alternative is one query per
 * contestant on every request. `presentWarDetail` batches the fetch for all
 * of a War's contestants; single-contestant callers pass a one-element
 * result.
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
