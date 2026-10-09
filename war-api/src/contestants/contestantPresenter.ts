import type { ContestantMedia } from './contestantMediaRepository.js';
import type { Contestant } from './contestantsRepository.js';
import { presentMedia, type MediaItemView } from './mediaPresenter.js';

export interface ContestantDetailView {
  id: string;
  name: string;
  bio: string | null;
  media: MediaItemView[];
  win_count: number;
  appearance_count: number;
}

/** The `{ id, name, media }` shape a contestant reduces to where bio and counts aren't wanted (`/rankings`). */
export interface ContestantView {
  id: string;
  name: string;
  media: MediaItemView[];
}

/** The response body JSON Schema for {@link ContestantView}. */
export const contestantViewSchema = {
  type: 'object',
  required: ['id', 'name', 'media'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    media: { type: 'array', items: { $ref: 'MediaItem#' } },
  },
};

/** `ContestantView` plus `bio`: what `/matchups/next` shows for each side (§10.3). Separate from `ContestantView` because `/rankings` has no use for bio. */
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

/** The response body JSON Schema for {@link ContestantDetailView}, registered under `$id: "ContestantDetail"` (`src/openapi/schemas.ts`). */
export const contestantDetailSchema = {
  $id: 'ContestantDetail',
  type: 'object',
  required: ['id', 'name', 'bio', 'media', 'win_count', 'appearance_count'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    bio: { type: ['string', 'null'] },
    media: { type: 'array', items: { $ref: 'MediaItem#' } },
    win_count: { type: 'integer' },
    appearance_count: { type: 'integer' },
  },
};

/** Takes media the caller already fetched, so `presentWarDetail` can batch one query for all of a War's contestants. */
export function presentContestant(contestant: Contestant, media: ContestantMedia[], publicBaseUrl: string): ContestantDetailView {
  return {
    id: contestant.id,
    name: contestant.name,
    bio: contestant.bio,
    media: presentMedia(media, publicBaseUrl),
    win_count: contestant.winCount,
    appearance_count: contestant.appearanceCount,
  };
}
