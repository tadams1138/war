-- Up Migration

ALTER TABLE wars DROP COLUMN contestant_schema;
ALTER TABLE contestants DROP COLUMN attributes;

-- Down Migration

ALTER TABLE wars ADD COLUMN contestant_schema JSONB NOT NULL DEFAULT '[]';
ALTER TABLE contestants ADD COLUMN attributes JSONB NOT NULL DEFAULT '{}';
