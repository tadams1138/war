-- Up Migration

ALTER TABLE wars ADD COLUMN removed_at TIMESTAMPTZ NULL;

-- Down Migration

ALTER TABLE wars DROP COLUMN removed_at;
