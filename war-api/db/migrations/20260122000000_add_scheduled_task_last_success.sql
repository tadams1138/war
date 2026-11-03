-- Up Migration

-- When close-expired-wars last completed successfully (§12.8 watchdog). Nullable and
-- additive, so the previous release keeps working against it; NULL means never recorded.
ALTER TABLE platform_settings ADD COLUMN close_expired_wars_last_success_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE platform_settings DROP COLUMN IF EXISTS close_expired_wars_last_success_at;
