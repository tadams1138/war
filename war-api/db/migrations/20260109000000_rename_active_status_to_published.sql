-- Up Migration

UPDATE wars SET status = 'published' WHERE status = 'active';

-- Down Migration

UPDATE wars SET status = 'active' WHERE status = 'published';
