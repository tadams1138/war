-- Up Migration

-- Single-use authorization codes for the OAuth 2.1 authorization server
-- (spec §4.3.4, §6). `oauth_clients` is deliberately not created here:
-- Client ID Metadata Documents (this slice's registration mechanism, §4.3.3)
-- need no stored client row at all, and Dynamic Client Registration -- the
-- only feature that table exists for -- is slice 3.
CREATE TABLE authorization_codes (
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

-- Down Migration

DROP TABLE IF EXISTS authorization_codes;
