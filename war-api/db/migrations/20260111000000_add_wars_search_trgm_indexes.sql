-- Up Migration

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX wars_title_trgm_idx ON wars USING GIN (title gin_trgm_ops);
CREATE INDEX voters_display_name_trgm_idx ON voters USING GIN (display_name gin_trgm_ops);

-- Down Migration

DROP INDEX voters_display_name_trgm_idx;
DROP INDEX wars_title_trgm_idx;
DROP EXTENSION IF EXISTS pg_trgm;
