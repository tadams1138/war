-- Up Migration

ALTER TABLE wars ALTER COLUMN title DROP NOT NULL;

-- Down Migration

ALTER TABLE wars ALTER COLUMN title SET NOT NULL;
