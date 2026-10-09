-- Up Migration
-- `invite_only` never had an invite mechanism; the value is renamed to say what it does.
-- wars.visibility is a plain VARCHAR(16) with no CHECK constraint or enum, so only rows change.
UPDATE wars SET visibility = 'unlisted' WHERE visibility = 'invite_only';

-- Down Migration
UPDATE wars SET visibility = 'invite_only' WHERE visibility = 'unlisted';
