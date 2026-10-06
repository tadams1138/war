-- Up Migration

-- Staff read endpoints (spec §6.7 "Visibility") page newest-first by (created_at, id) and
-- join on the creator, so each list needs a matching index.
CREATE INDEX votes_voter_created_idx ON votes (voter_id, created_at DESC, id DESC);
CREATE INDEX wars_creator_idx ON wars (creator_id);
CREATE INDEX wars_created_idx ON wars (created_at DESC, id DESC);
CREATE INDEX voters_created_idx ON voters (created_at DESC, id DESC);

-- Down Migration

DROP INDEX voters_created_idx;
DROP INDEX wars_created_idx;
DROP INDEX wars_creator_idx;
DROP INDEX votes_voter_created_idx;
