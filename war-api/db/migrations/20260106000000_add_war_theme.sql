-- Up Migration

ALTER TABLE wars ADD COLUMN theme VARCHAR(16) NOT NULL DEFAULT 'arcade';

-- Down Migration

ALTER TABLE wars DROP COLUMN theme;
