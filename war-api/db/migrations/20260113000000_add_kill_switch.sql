-- Up Migration

-- Single-row platform settings: the CHECK pins the one row to id = 1, so
-- every API instance reads and writes the same row. No row means defaults.
CREATE TABLE platform_settings (
  id                        SMALLINT PRIMARY KEY CHECK (id = 1),
  war_creation_kill_switch  BOOLEAN NOT NULL DEFAULT false,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE IF EXISTS platform_settings;
