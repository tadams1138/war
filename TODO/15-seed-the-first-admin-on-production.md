# 15 — Seed the first Admin on production

## Summary
Owner action: grant the first Admin role on the production environment.

## Motivation
It is unconfirmed whether this was done; the owner's notes say it had not run as of
2026-10-09. Nothing else grants the role, since granting is Admin-only (spec 6.7). The
procedure was validated on staging on 2026-10-09.

## Acceptance criteria
- A check confirms an Admin exists on production (for example `GET /api/v1/auth/me` while
  signed in as the owner on production shows the admin role, or a `voters` row has
  `is_admin = true`).

## Technical notes
- Procedure: README "First-time setup of an environment", step 3 (`npm --prefix war-api run
  seed-admin -- <voter-id>`, with the cluster's CA certificate and `DATABASE_URL` from `doctl`;
  the voter id comes from `GET /api/v1/auth/me` while signed in on production).
- The owner must have signed in once on production first.
