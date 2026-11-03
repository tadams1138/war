# 15 — Share one database cluster between staging and production

## Summary
Move production's database onto staging's existing 1 GiB cluster, `war-staging-pg`, as a
separate logical database, then delete production's cluster `war-production-pg`.

## Motivation
Cost: production's cluster costs about $60/month with its standby, or $30 without it (#11).
Deleting it saves that much (DigitalOcean list prices, checked 2026-11-02). There are no users
yet.

Decided 2026-11-02:
- `war-staging-pg` is the shared cluster. DigitalOcean cannot shrink a cluster in place, so
  keeping `war-production-pg` would mean paying for 2 GiB, and a separate shrink of production
  would need a new cluster plus a data move anyway. That separate shrink was dropped from the
  backlog in favour of this item.
- A third-party free Postgres for staging (Neon) was rejected.

## Behavior
- Staging and production each keep their own database, user and connection pool, on one
  cluster.
- Staging can never read or write production's database.
- An outage, CPU spike or full disk on the cluster affects both environments. That is accepted.
- Moving production's data causes a few minutes of production downtime. That is accepted.

## Acceptance criteria
- `war-staging-pg` holds two databases, two users and two pools. Each environment's user can
  reach only its own database.
- The database firewall trusts both apps.
- Staging's migrations and tests cannot reach production's database (checked, not assumed).
- All of production's data is on the shared cluster, and production deploys and passes its
  smoke test there.
- `war-production-pg` is deleted, after a final backup is confirmed.
- `war-spec.md` §12.1 allows one physical database cluster with a separate logical database per
  environment.
- The README "Deployment and operations" section describes the shared cluster.

## Technical notes
- Both environments now create a database `war`, a user `war_api` and a firewall that trusts a
  single app (`war-infra/terraform/modules/data/main.tf`). Names must be parameterized, and
  privileges restricted per user.
- The cluster needs one Terraform owner: probably `war-infra/terraform/shared/`, with each env
  root creating only its database, user and pool. Apply order is shared, then staging, then
  production.
- `war-staging-pg` is in staging's Terraform state today
  (`war-infra/terraform/envs/staging/main.tf`). Move it to the new owner with `removed` and
  `import` blocks (or `terraform state mv` between states). A plan must never show it destroyed.
- Both platform YAMLs (`war-infra/platform/staging.yaml`, `production.yaml`) bind the database by
  `cluster_name`; production's must point at `war-staging-pg`.
- Pools on a 1 GiB cluster share roughly 22 backend connections (unverified). Production now uses
  a pool of 40 and staging 20, so both need smaller pools that fit together, with headroom for
  the migration job.
- Repo/documentation mismatch to resolve first: both platform YAMLs set
  `DATABASE_URL: ${db.DATABASE_URL}`, and comments say it is pooled, but DigitalOcean documents a
  separate pool-specific binding. Confirm which one the API uses, since that decides whether pool
  sizes or the raw connection limit matter.
- Moving the data: dump and restore, or DigitalOcean's online migration, then switch production's
  binding and deploy.
- Standby option: `war-staging-pg` was created 2026-08-29, before DigitalOcean's
  30 November 2026 Standard Edition change, so it can still add a standby if resized to 2 GB+.
  A new cluster created after that date could not (see #11 for sources). Do not replace it.
- Scaling back up: resize `war-staging-pg` up in place (allowed). Splitting production back onto
  its own cluster takes hours: a new cluster, a data copy and a binding switch.

## Dependencies
- #11 (remove the production standby) is a quick saving to take first. Deleting
  `war-production-pg` here removes the standby anyway.

## Open questions
- Is 1 GiB enough for both environments? If not, resize `war-staging-pg` to 2 GiB, which saves
  less.

## Progress
Done on 2026-11-03:
- Shared, staging and production Terraform applied: `war-staging-pg` and its firewall are owned
  by `shared/`; `war_production`, `war_production_api` and `war-production-pool` exist.
- Before the cutover both apps connected as `doadmin` to `defaultdb`. Staging's data was copied
  from `defaultdb` into `war` (owner `war_api`) and production's from `war-production-pg`'s
  `defaultdb` into `war_production` (owner `war_production_api`), with `pg_dump`/`pg_restore`.
  Row counts matched on every table. The source databases are untouched, for rollback.
- Isolation SQL applied. Verified with each app user's own credentials: `war_api` reaches only
  `war`, `war_production_api` only `war_production`; neither can connect to `defaultdb`.
- Both platform YAMLs bind their own database and user, the service through its pool and the
  migration job directly.

Remaining:
- Deploy both specs and pass the smoke tests.
- After an observation period, retire `war-production-pg` (and the `legacy-data` module) in a
  separate Terraform change; its backups go with it, so keep the dump taken at cutover.
- Optionally drop staging's old data from `defaultdb` on the shared cluster once the cutover is
  confirmed.
