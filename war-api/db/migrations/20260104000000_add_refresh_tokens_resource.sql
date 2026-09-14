-- Up Migration

-- Binds a refresh-token family to the RFC 8707 resource its access tokens
-- carry as `aud` (spec, design review Finding 1(b) of 513ee16):
-- NULL for an ordinary browser session (unchanged), set once at
-- issuance by the OAuth 2.1 authorization server from the
-- authorization code's own `resource`, and never changed afterwards --
-- rotation carries it forward unchanged on every successive token in a
-- family.
ALTER TABLE refresh_tokens ADD COLUMN resource TEXT;

-- Down Migration

ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS resource;
