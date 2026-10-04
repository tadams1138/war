-- Up Migration

ALTER TABLE voters ADD COLUMN suspended_at TIMESTAMPTZ NULL;
ALTER TABLE voters ADD COLUMN banned_at TIMESTAMPTZ NULL;

-- Down Migration

ALTER TABLE voters DROP COLUMN banned_at;
ALTER TABLE voters DROP COLUMN suspended_at;
