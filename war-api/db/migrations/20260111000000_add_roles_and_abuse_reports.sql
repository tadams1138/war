-- Up Migration

ALTER TABLE voters ADD COLUMN is_moderator BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE voters ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE reports (
  id          UUID PRIMARY KEY,
  war_id      UUID REFERENCES wars(id),
  reporter_id UUID REFERENCES voters(id),
  explanation TEXT NOT NULL,
  addressed   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON reports (war_id);
CREATE INDEX ON reports (war_id) WHERE addressed = false;

-- Down Migration

DROP TABLE IF EXISTS reports;
ALTER TABLE voters DROP COLUMN is_admin;
ALTER TABLE voters DROP COLUMN is_moderator;
