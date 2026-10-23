-- Up Migration
-- Nothing reads or writes these yet: video mode and the custom UI registry are planned, not built.
-- Dropping provider_video_id also drops the init CHECK that referenced it, so media is image-only until video mode returns.
ALTER TABLE wars DROP COLUMN ui_slug;
ALTER TABLE contestant_media DROP COLUMN provider_video_id;
ALTER TABLE contestant_media ADD CONSTRAINT contestant_media_image_only CHECK (kind = 'image' AND storage_key IS NOT NULL);
DROP TABLE ui_registrations;

-- Down Migration
CREATE TABLE ui_registrations (
  slug             VARCHAR(64) PRIMARY KEY,
  label            VARCHAR(256),
  static_base_path TEXT NOT NULL,
  registered_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE contestant_media DROP CONSTRAINT contestant_media_image_only;
ALTER TABLE contestant_media ADD COLUMN provider_video_id VARCHAR(64);
ALTER TABLE contestant_media ADD CONSTRAINT contestant_media_kind_check CHECK (
  (kind = 'image' AND storage_key IS NOT NULL)
  OR
  (kind = 'video' AND provider IS NOT NULL AND provider_video_id IS NOT NULL)
);
ALTER TABLE wars ADD COLUMN ui_slug VARCHAR(64);
