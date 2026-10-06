-- Up Migration

-- Found by scripts/explainAdminQueries.ts (EXPLAIN ANALYZE over 20k Voters, 50k Wars, 500k votes).

-- GET /moderation-log pages newest-first by (created_at, id). With no matching index Postgres
-- hash-joined every log row to voters and wars, then sorted them, for every page.
CREATE INDEX moderation_log_created_idx ON moderation_log (created_at DESC, id DESC);

-- GET /admin/wars?status=removed: wars_created_idx walks the table filtering out the (rare)
-- non-removed rows. A partial index holds only removed Wars, already in page order.
CREATE INDEX wars_removed_created_idx ON wars (created_at DESC, id DESC) WHERE removed_at IS NOT NULL;

-- GET /admin/voters?status=banned|suspended|staff: each is a small minority of Voters, so
-- without these Postgres seq-scans voters and sorts, or walks voters_created_idx filtering.
CREATE INDEX voters_banned_created_idx ON voters (created_at DESC, id DESC) WHERE banned_at IS NOT NULL;
CREATE INDEX voters_suspended_created_idx ON voters (created_at DESC, id DESC) WHERE suspended_at IS NOT NULL;
CREATE INDEX voters_staff_created_idx ON voters (created_at DESC, id DESC) WHERE is_moderator = true OR is_admin = true;

-- Down Migration

DROP INDEX voters_staff_created_idx;
DROP INDEX voters_suspended_created_idx;
DROP INDEX voters_banned_created_idx;
DROP INDEX wars_removed_created_idx;
DROP INDEX moderation_log_created_idx;
