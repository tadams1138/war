-- Up Migration

ALTER TABLE wars ADD COLUMN share_image_key TEXT NULL;

-- Down Migration

ALTER TABLE wars DROP COLUMN share_image_key;
