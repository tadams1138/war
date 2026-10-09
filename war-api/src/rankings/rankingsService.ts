import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listContestantsByWar } from '../contestants/contestantsRepository.js';
import { listMediaByContestants } from '../contestants/contestantMediaRepository.js';
import { presentMedia } from '../contestants/mediaPresenter.js';
import { contestantViewSchema, type ContestantView } from '../contestants/contestantPresenter.js';
import { effectiveStatus } from '../wars/effectiveStatus.js';
import { findVisibleWar } from '../wars/warAccess.js';
import { isMember } from '../wars/warsRepository.js';
import { THEMES } from '../wars/theme.js';
import { rankContestants } from './scoring.js';

export interface RankingEntry {
  rank: number | null;
  contestant: ContestantView;
  wins: number;
  appearances: number;
}

export interface RankingsView {
  war_id: string;
  status: string;
  theme: string;
  updated_at: string;
  rankings: RankingEntry[];
}

/** The response body JSON Schema for {@link RankingsView}. `rank` is null for an unranked (zero-appearance) contestant (§7). */
export const rankingsResponseSchema = {
  type: 'object',
  required: ['war_id', 'status', 'theme', 'updated_at', 'rankings'],
  properties: {
    war_id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['draft', 'published', 'closed'] },
    theme: { type: 'string', enum: [...THEMES] },
    updated_at: { type: 'string', format: 'date-time' },
    rankings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rank', 'contestant', 'wins', 'appearances'],
        properties: {
          rank: { type: ['integer', 'null'] },
          contestant: contestantViewSchema,
          wins: { type: 'integer' },
          appearances: { type: 'integer' },
        },
      },
    },
  },
};

export type RankingsOutcome =
  | { kind: 'ok'; view: RankingsView; visibility: string }
  | { kind: 'notFound' }
  | { kind: 'unauthorized' };

/** An invite-only War's rankings are for its creator and members only. */
async function isUnauthorizedForRankings(
  db: Kysely<Database>,
  war: { id: string; creatorId: string | null; visibility: string },
  viewerId: string | null,
): Promise<boolean> {
  if (war.visibility !== 'invite_only') return false;
  if (viewerId === null) return true;
  return war.creatorId !== viewerId && !(await isMember(db, war.id, viewerId));
}

/** Assembles a War's rankings response (§6.4). `viewerId` is `null` for an anonymous request. */
export async function getRankings(
  db: Kysely<Database>,
  warId: string,
  viewerId: string | null,
  now: Date,
  publicBaseUrl: string,
): Promise<RankingsOutcome> {
  // A draft is invisible to anyone but its creator (§6.1): reported as not found, like a missing War.
  const war = await findVisibleWar(db, warId, viewerId);
  if (!war) {
    return { kind: 'notFound' };
  }

  if (await isUnauthorizedForRankings(db, war, viewerId)) {
    return { kind: 'unauthorized' };
  }

  const contestants = await listContestantsByWar(db, war.id);
  const ranked = rankContestants(
    contestants.map((c) => ({ id: c.id, name: c.name, winCount: c.winCount, appearanceCount: c.appearanceCount })),
  );

  const mediaByContestant = await listMediaByContestants(
    db,
    ranked.map((entry) => entry.contestant.id),
  );

  const rankings: RankingEntry[] = ranked.map((entry) => ({
    rank: entry.rank,
    contestant: {
      id: entry.contestant.id,
      name: entry.contestant.name,
      media: presentMedia(mediaByContestant.get(entry.contestant.id) ?? [], publicBaseUrl),
    },
    wins: entry.contestant.winCount,
    appearances: entry.contestant.appearanceCount,
  }));

  return {
    kind: 'ok',
    visibility: war.visibility,
    view: {
      war_id: war.id,
      status: effectiveStatus(war, now),
      theme: war.theme,
      updated_at: now.toISOString(),
      rankings,
    },
  };
}
