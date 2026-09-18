import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { findContestantsByIds } from '../contestants/contestantsRepository.js';
import { listMediaByContestants } from '../contestants/contestantMediaRepository.js';
import { presentMedia, type MediaItemView } from '../contestants/mediaPresenter.js';
import { contestantViewSchema, type ContestantView } from '../contestants/contestantPresenter.js';
import type { ContestantMedia } from '../contestants/contestantMediaRepository.js';
import type { Contestant } from '../contestants/contestantsRepository.js';
import { countMatchupsForWar, countVotesByVoterInWar, findUnvotedMatchupsForVoter } from './matchupsRepository.js';
import { isLeftSide } from './stableHash.js';

export interface NextMatchupView {
  matchup: { id: string; left: ContestantView; right: ContestantView };
  progress: { voted: number; total: number };
  prefetch?: { matchup_id: string; media: MediaItemView[] };
}

/**
 * The response body JSON Schema for {@link NextMatchupView} (spec).
 * `prefetch` is deliberately absent from `required` -- it is present only
 * when a following unvoted pair exists.
 */
export const nextMatchupResponseSchema = {
  type: 'object',
  required: ['matchup', 'progress'],
  properties: {
    matchup: {
      type: 'object',
      required: ['id', 'left', 'right'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        // Written as its own copy of `left`'s schema rather than an
        // internal `$ref`, per the spec -- the two simply describe the
        // same shape.
        left: contestantViewSchema,
        right: contestantViewSchema,
      },
    },
    progress: {
      type: 'object',
      required: ['voted', 'total'],
      properties: {
        voted: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
    prefetch: {
      type: 'object',
      required: ['matchup_id', 'media'],
      properties: {
        matchup_id: { type: 'string', format: 'uuid' },
        media: { type: 'array', items: { $ref: 'MediaItem#' } },
      },
    },
  },
};

function contestantView(
  contestantId: string,
  contestantsById: Map<string, Contestant>,
  mediaByContestant: Map<string, ContestantMedia[]>,
  publicBaseUrl: string,
): ContestantView {
  const contestant = contestantsById.get(contestantId);
  if (!contestant) {
    throw new Error(`contestant ${contestantId} not found`);
  }
  return {
    id: contestant.id,
    name: contestant.name,
    media: presentMedia(mediaByContestant.get(contestantId) ?? [], publicBaseUrl),
  };
}

type MatchupCandidate = { id: string; contestantAId: string; contestantBId: string };

/** Which contestant renders on which side -- decided by the API, per the spec. */
function matchupSides(matchup: MatchupCandidate, voterId: string): { left: string; right: string } {
  const left = isLeftSide(matchup.id, voterId) ? matchup.contestantAId : matchup.contestantBId;
  const right = left === matchup.contestantAId ? matchup.contestantBId : matchup.contestantAId;
  return { left, right };
}

/**
 * The advisory prefetch block naming the following matchup's media, or
 * `undefined` when there is no following unvoted pair -- an `undefined`
 * `prefetch` serializes identically to an omitted one (spec: "deliberately
 * absent from `required`"), so the caller can assign this unconditionally.
 */
function buildPrefetch(
  upcoming: MatchupCandidate | undefined,
  mediaByContestant: Map<string, ContestantMedia[]>,
  publicBaseUrl: string,
): NextMatchupView['prefetch'] {
  if (!upcoming) return undefined;
  return {
    matchup_id: upcoming.id,
    media: [
      ...presentMedia(mediaByContestant.get(upcoming.contestantAId) ?? [], publicBaseUrl),
      ...presentMedia(mediaByContestant.get(upcoming.contestantBId) ?? [], publicBaseUrl),
    ],
  };
}

/**
 * Builds the `/matchups/next` response: the voter's next matchup (side
 * decided by the API), progress, and an advisory prefetch block
 * naming the following matchup's media. Fetches both contestants and all
 * four media sets (current pair plus prefetch pair) with two batched
 * queries rather than one per contestant (design review finding 9) — this
 * is the endpoint the spec's 500ms prefetch budget makes most
 * latency-sensitive.
 */
export async function nextMatchupForVoter(
  db: Kysely<Database>,
  warId: string,
  voterId: string,
  publicBaseUrl: string,
): Promise<NextMatchupView | null> {
  const [candidates, total, voted] = await Promise.all([
    findUnvotedMatchupsForVoter(db, warId, voterId, 2),
    countMatchupsForWar(db, warId),
    countVotesByVoterInWar(db, warId, voterId),
  ]);

  const matchup = candidates[0];
  if (!matchup) {
    return null;
  }

  const upcoming = candidates[1];
  const contestantIds = [matchup.contestantAId, matchup.contestantBId];
  if (upcoming) {
    contestantIds.push(upcoming.contestantAId, upcoming.contestantBId);
  }

  const [contestantsById, mediaByContestant] = await Promise.all([
    findContestantsByIds(db, contestantIds),
    listMediaByContestants(db, contestantIds),
  ]);

  const { left, right } = matchupSides(matchup, voterId);

  return {
    matchup: {
      id: matchup.id,
      left: contestantView(left, contestantsById, mediaByContestant, publicBaseUrl),
      right: contestantView(right, contestantsById, mediaByContestant, publicBaseUrl),
    },
    progress: { voted, total },
    prefetch: buildPrefetch(upcoming, mediaByContestant, publicBaseUrl),
  };
}
