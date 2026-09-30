-- Up Migration

CREATE TABLE moderation_log (
  id              UUID PRIMARY KEY,
  action          TEXT NOT NULL,
  staff_voter_id  UUID REFERENCES voters(id),
  target_war_id   UUID REFERENCES wars(id),
  target_voter_id UUID REFERENCES voters(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON moderation_log (target_war_id);
CREATE INDEX ON moderation_log (target_voter_id);

-- Down Migration

DROP TABLE IF EXISTS moderation_log;
