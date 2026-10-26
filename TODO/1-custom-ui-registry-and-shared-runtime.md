# 1 — Custom UI registry and shared runtime

## Summary
Build the registry of custom UIs and the shared runtime artifact they depend on (war-spec.md
§6.5 "Custom UI registry" and §11 "Custom UIs", both marked Planned).

## Current state
- No registry endpoints or schema. The registry table and the War slug column were dropped
  until this is built (`war-api/db/migrations/20260120000000_drop_unused_video_and_ui_registry_schema.sql`).
- No shared runtime artifact for custom UIs.
- Pieces that already exist:
  - `.github/workflows/ui-custom.yml`, the reusable pipeline each `war-ui-{slug}` repo calls. It
    syncs files to a key prefix in one shared bucket and provisions nothing per slug.
  - `war-infra/edge/ui-router.js`, bound to `/ui/*` (Terraform: `war-infra/terraform/modules/edge/main.tf`,
    `cloudflare_workers_script.ui_router` and `cloudflare_workers_route.ui_router`). It serves
    each custom UI from the shared bucket by slug prefix and rewrites storage 404s to that
    slug's `index.html` with 200. The slug pattern is validated in the Worker.
  - Pending routing scenarios in `war-infra/specs/features/pending/routing.feature` (e.g.
    "Custom UI slug is routed to the shared bucket", given "a registered slug").

## Technical notes
- Needs: a registry table plus a War slug column (new migration), registry API endpoints, a
  shared runtime artifact that custom UIs load, and a decision on how registration relates to
  `ui-router.js` (the Worker currently needs no per-slug configuration).
- Follow the spec sections for the intended design; keep implementation detail out of
  war-spec.md.

## Dependencies
- #4 (the registry-related routing scenarios have no runner).
- The default UI Worker (`war-infra/edge/ui-default.js`, route `/*`) shares the edge routing; `/ui/*` stays with `ui_router`.
