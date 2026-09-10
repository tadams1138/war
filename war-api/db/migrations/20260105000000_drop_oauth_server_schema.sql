-- Up Migration

-- Retires the OAuth 2.1 authorization server's schema. Both objects existed
-- only for the remote MCP feature, which was withdrawn along with every line
-- of code that read them.
--
-- SEQUENCING -- this migration must not reach an environment whose *running*
-- revision still reads `refresh_tokens.resource`. The pre-deploy hook runs
-- while the previous revision is still serving traffic, so dropping the
-- column in the same deploy that removes the code reading it would break the
-- live service between the hook completing and the new revision taking over.
-- The code removal therefore ships first, on its own; this ships in a later
-- deploy, once that revision is live in the environment being migrated.
--
-- `authorization_codes` has no such constraint -- nothing outside the removed
-- code ever referenced it -- but both are dropped together so the retirement
-- is one reviewable change rather than two.

DROP TABLE IF EXISTS authorization_codes;

ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS resource;

-- Down Migration

-- Restores the structure, not the data. Any authorization codes were
-- single-use and expired within a minute of issuance, and any resource
-- bindings belonged to token families that are long since rotated or
-- revoked, so there is nothing meaningful to recover.

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS resource TEXT;

CREATE TABLE IF NOT EXISTS authorization_codes (
  id               UUID PRIMARY KEY,
  voter_id         UUID REFERENCES voters(id),
  client_id        TEXT NOT NULL,
  code_hash        TEXT NOT NULL,
  code_challenge   TEXT NOT NULL,
  redirect_uri     TEXT NOT NULL,
  resource         TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (code_hash)
);

CREATE INDEX ON authorization_codes (expires_at);
