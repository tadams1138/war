# 11 — Remove the production database standby

## Summary
Run production's managed PostgreSQL cluster as a single node instead of a primary plus a
high-availability standby.

## Motivation
Cost. There are no users yet, and the standby costs about $30/month (DigitalOcean list price,
checked 2026-11-02) of a total bill of about $114/month. Backups and point-in-time recovery
stay, so data is still protected; only automatic failover is lost.

## Behavior
- Production's database runs one node, like staging.
- A node failure or DigitalOcean maintenance can interrupt production reads and writes until the
  node recovers. That is accepted.
- Daily backups and point-in-time recovery are unchanged.

## Acceptance criteria
- `node_count` for production's `module "data"` is 1.
- `terraform plan` for production shows only the standby removal (no cluster replacement).
- After apply, production's API passes its smoke test.

## Technical notes
- Change `node_count = 2` to `1` in `war-infra/terraform/envs/production/main.tf`
  (`module "data"`, around line 90) and update its comment.
- Update the `node_count` variable description in `war-infra/terraform/modules/data/main.tf`
  (line 37 says "2 (primary + standby) for production").
- Applied through the infra pipeline (`.github/workflows/infra.yml`), which gates production on
  manual approval.
- `war-spec.md` §12.2 already allows a single-node production database (changed 2026-11-02);
  no further spec change is needed.
- Update the README "Deployment and operations" section if it mentions the standby.
- Confirm `terraform plan` changes `node_count` in place. A planned replacement would destroy the
  cluster and its data.
- Reversal: set `node_count = 2` and apply. Checked 2026-11-02 against DigitalOcean docs:
  - Standbys need a plan with at least 2 GB of RAM.
  - From 30 November 2026, new Standard Edition clusters cannot add standby nodes (or use plans
    over 4 GiB). Clusters created before then keep the ability. Source:
    https://docs.digitalocean.com/release-notes/upcoming/dbaas-plan-changes/
  - `war-production-pg` was created 2026-08-29 (`doctl databases list`), so it can re-add a
    standby while it stays on a 2 GB+ plan. A replacement cluster created after 30 November 2026
    could not; high availability would then need Advanced Edition (from $130/month).

## Dependencies
- #15 later moves production onto staging's cluster and deletes `war-production-pg`. This item
  is the quick saving until then.
