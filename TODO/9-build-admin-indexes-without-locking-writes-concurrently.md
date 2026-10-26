# 9 — Build admin indexes without locking writes (CONCURRENTLY)

## Summary
Admin indexes are built without `CONCURRENTLY`, so each build locks writes to its table.

## Motivation
Fine at the current size; revisit before the `votes` table is large.

## Technical notes
- Migrations in `war-api/db/migrations/`:
  `20260116000000_admin_read_indexes.sql` (`votes_voter_created_idx`, `wars_creator_idx`,
  `wars_created_idx`, `voters_created_idx`) and `20260117000000_admin_query_indexes.sql`
  (`moderation_log_created_idx`, `wars_removed_created_idx`, `voters_banned_created_idx`,
  `voters_suspended_created_idx`, `voters_staff_created_idx`).
- Both are already applied, so a change matters for future index migrations or a rebuild on a
  large `votes` table. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction; check how
  the migration runner (`npm --prefix war-api run migrate`) wraps migrations and whether it
  supports a no-transaction migration.

## Open questions
- Whether this is ever actionable for the existing migrations, or only a rule for new ones.
