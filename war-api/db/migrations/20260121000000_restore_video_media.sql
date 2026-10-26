-- Up Migration
ALTER TABLE contestant_media DROP CONSTRAINT contestant_media_image_only;
ALTER TABLE contestant_media ADD COLUMN video_id VARCHAR(64);
ALTER TABLE contestant_media ADD CONSTRAINT contestant_media_kind_check CHECK (
  (kind = 'image' AND storage_key IS NOT NULL AND video_id IS NULL)
  OR (kind = 'video' AND storage_key IS NULL AND provider IN ('youtube', 'vimeo') AND video_id IS NOT NULL)
);
CREATE UNIQUE INDEX contestant_one_video ON contestant_media (contestant_id) WHERE kind = 'video';

-- Down Migration
DROP INDEX contestant_one_video;
ALTER TABLE contestant_media DROP CONSTRAINT contestant_media_kind_check;
DELETE FROM contestant_media WHERE kind = 'video';
ALTER TABLE contestant_media DROP COLUMN video_id;
ALTER TABLE contestant_media ADD CONSTRAINT contestant_media_image_only CHECK (kind = 'image' AND storage_key IS NOT NULL);
