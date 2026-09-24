import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Kysely } from 'kysely';
import type { Database } from '../../src/db/types.js';
import { findOrCreateVoter, type Voter } from '../../src/auth/votersRepository.js';
import { createWar, type War } from '../../src/wars/warsRepository.js';
import { publishWar, closeWar } from '../../src/wars/warsService.js';
import { createContestant, type Contestant } from '../../src/contestants/contestantsRepository.js';
import { uploadContestantImage } from '../../src/contestants/imageUploadService.js';
import { generateMatchupsForNewContestant } from '../../src/matchups/matchupsRepository.js';
import type { ObjectStorage } from '../../src/contestants/storage.js';
import { createMembership } from '../../src/wars/warsRepository.js';

export async function makeVoter(db: Kysely<Database>, seed: string): Promise<Voter> {
  const { voter } = await findOrCreateVoter(db, 'google', {
    providerUserId: `${seed}-${randomUUID()}`,
    displayName: seed,
    avatarUrl: null,
  });
  return voter;
}

export interface DraftWarOptions {
  title?: string;
  visibility?: string;
  theme?: string;
  endsAt?: Date | null;
}

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

export async function makeDraftWar(db: Kysely<Database>, creatorId: string, options: DraftWarOptions = {}): Promise<War> {
  return createWar(db, {
    creatorId,
    title: withDefault(options.title, 'Test War'),
    category: null,
    visibility: withDefault(options.visibility, 'public'),
    mediaMode: 'image',
    theme: withDefault(options.theme, 'arcade'),
    endsAt: withDefault(options.endsAt, null),
  });
}

export async function makeContestant(db: Kysely<Database>, warId: string, name: string): Promise<Contestant> {
  return createContestant(db, { warId, name, bio: null });
}

async function syntheticJpeg(width = 1200, height = 900): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } } }).jpeg().toBuffer();
}

export async function giveContestantAnImage(
  db: Kysely<Database>,
  storage: ObjectStorage,
  contestantId: string,
): Promise<void> {
  const buffer = await syntheticJpeg();
  const outcome = await uploadContestantImage(db, storage, {
    contestantId,
    buffer,
    mimeType: 'image/jpeg',
    originalExt: 'jpg',
  });
  if (!outcome.ok) {
    throw new Error(`failed to seed contestant image: ${outcome.reason}`);
  }
}

/**
 * Builds a War with `count` contestants, each with one image, still in
 * draft. Generates matchups incrementally as each contestant is added,
 * mirroring `addContestant` (spec §4 "Matchup") -- matchups exist as soon as
 * a War has contestants to pair, independent of publishing.
 */
export async function makeDraftWarWithContestants(
  db: Kysely<Database>,
  storage: ObjectStorage,
  creatorId: string,
  count: number,
  options: DraftWarOptions = {},
): Promise<{ war: War; contestants: Contestant[] }> {
  const war = await makeDraftWar(db, creatorId, options);
  const contestants: Contestant[] = [];
  for (let i = 0; i < count; i += 1) {
    const contestant = await makeContestant(db, war.id, `Contestant ${i + 1}`);
    await generateMatchupsForNewContestant(
      db,
      war.id,
      contestant.id,
      contestants.map((c) => c.id),
    );
    await giveContestantAnImage(db, storage, contestant.id);
    contestants.push(contestant);
  }
  return { war, contestants };
}

/** Publishes a War as its creator. Throws if publishing is rejected. */
export async function publishWarForTest(db: Kysely<Database>, war: War): Promise<War> {
  const outcome = await publishWar(db, war.id, war.creatorId!, new Date());
  if (outcome.kind !== 'ok') {
    throw new Error(`failed to publish War in test fixture: ${outcome.kind}`);
  }
  return outcome.value;
}

export async function joinWarAsVoter(db: Kysely<Database>, warId: string, voterId: string): Promise<void> {
  await createMembership(db, warId, voterId);
}

/** Closes an already-published War as its creator. Throws if closing is rejected. */
export async function closeWarForTest(db: Kysely<Database>, war: War): Promise<War> {
  const outcome = await closeWar(db, war.id, war.creatorId!, new Date());
  if (outcome.kind !== 'ok') {
    throw new Error(`failed to close War in test fixture: ${outcome.kind}`);
  }
  return outcome.value;
}
