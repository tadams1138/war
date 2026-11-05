# 12 — Consider renaming infrastructure after the cost consolidation

## Summary
Decide whether to rename infrastructure whose names no longer match its role after the
cost-reduction work (production moved onto the staging database cluster, the production
cluster retired), and rename what is worth the risk.

## Motivation
The consolidation kept existing names to avoid downtime and state surgery. Some now
mislead: the one cluster serving both environments is still called `war-staging-pg`, and
the two apps bind it under different component names. Misleading names cost time during
incidents and invite mistakes, such as treating a "staging" resource as disposable.

## Behavior
No user-facing change. Operators see names that describe what each resource is for.

## Acceptance criteria
- Each candidate below is either renamed or explicitly kept, with the reason recorded.
- Any rename causes no data loss, and no production downtime beyond what the owner accepts.
- README, SPEC.md (if it names resources), Terraform, platform YAMLs, workflows and the
  `war-infra/scripts/*.test.mjs` regression tests all use the new names.

## Technical notes
Candidates:
- **Cluster `war-staging-pg`.** Hosts both `war` (staging) and `war_production`. A name
  such as `war-pg` would match its role. Referenced in `war-infra/terraform/shared/main.tf`
  (`digitalocean_database_cluster.pg`, import blocks), the `data "digitalocean_database_cluster"`
  lookups in `envs/{staging,production}/main.tf`, `cluster_name:` in
  `war-infra/platform/{staging,production}.yaml`, `shared-db.test.mjs` and the README.
- **App Platform database components.** Staging binds the cluster as `db`, production as
  `shared`. Production's name was forced: App Platform keeps a component attached to its
  original cluster, so moving production needed a new component name.
- **Terraform module and resource names** that mention the old layout (for example
  `module "shared_data"` in production, `data.digitalocean_database_cluster.existing` in shared).
- **Pool names** (`war-staging-pool`, `war-production-pool`) are accurate; probably keep.

Lessons from the consolidation (README "Shared database cluster"):
- Renaming an App Platform database component means creating a new one. A single spec
  change cannot both create and delete database components, so it takes two deploys.
- `doctl apps propose` does not catch these component errors; only a real deploy does.
- Terraform-side renames of resource addresses can use `moved` blocks with no infrastructure change.

## Open questions
- Can a DigitalOcean managed database cluster be renamed in place? If not (the Terraform
  provider may force replacement), renaming it means a new cluster and a data migration
  like the consolidation itself, which is probably not worth it for a name alone.
- Is a cheaper fix enough, such as documenting the mismatch prominently and renaming only
  the Terraform addresses and components?

## Dependencies
None.
