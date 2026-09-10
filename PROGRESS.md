# Progress

Where the project stands. `specs/war-spec.md` describes the system as designed; this file
records what exists, what does not, and what is known to be wrong.

Update it when something ships. Keep it short — this is a status board, not a log.

---

## Deployed

Staging and production both run as a single application per environment containing the
`war-api` service and the `war-ui-default` static site. See `specs/war-spec.md` section 12.

---

## war-api

### Built

- **Auth** — Google only. Other providers return not-found; the route shape already supports
  them. All callback failure responses implemented.
- **Domain** — Wars, contestants, contestant schema, matchups, voting, rankings, and the
  internal close-expired-wars endpoint.
- **War listing** — the caller's-own-Wars filter, and default visibility scoping applied in
  the data-access layer so every caller inherits it.
- **Published API contract**, generated from route definitions. A CI guard fails the build
  if the committed client types drift.
- **Health check.**

### Not built

- Apple, Facebook, Microsoft, Twitter/X sign-in; linking providers to one voter.
- `video` media mode. The media table's video columns exist and are unused.
- Per-voter rate limiting. The edge's volumetric limits are live; the API's own are not.
- Custom UI registry endpoints. The registry table and the War's slug column exist, unused.

---

## Removed

**The remote MCP feature was withdrawn**, along with the OAuth 2.1 authorization server that
existed only to serve it. The auth surface is back to what it was at `f7a796a`: provider
sign-in, token delivery, and refresh rotation with reuse detection.

Gone: the authorization server (authorize and token endpoints, PKCE, resource indicators,
client-metadata-document registration, both discovery documents, the SSRF and DNS-rebinding
guards), audience binding in every direction, the MCP endpoint with its ten tools and
service-layer allowlist, their tests, and five dependencies. The suite returned to
**449/449** — exactly the baseline recorded before the OAuth work began.

**Two migrations were deliberately left applied** in staging and production:
`authorization_codes`, now an unreferenced table, and `refresh_tokens.resource`, now a
nullable and unread column. Dropping them must be a **separate, later deploy**: the
pre-deploy migration hook runs while the previous revision is still serving, so dropping the
column alongside the code removal would break the live service between hook and cutover.

**Worth recovering from history rather than rewriting**, if the platform ever fetches a
user-supplied URL again: the SSRF address classifier and the connect-time DNS-rebinding
guard. Nothing uses them now, but both were correct and non-obvious.

---

## war-ui-default

### Built

Core voting loop, Rankings, the CreateWar wizard, MyWars, and a persistent navigation header
with an auth-aware Home empty state. Live in staging and production.

### Not built

- Video-mode matchups.
- The shared runtime artifact for custom UIs.

---

## Test coverage gaps

- Video mode, per-voter rate limiting and three War-expiry scenarios sit unbound in
  `war-api/specs/features/pending/` and describe behaviour that is not built.
- `war-ui-default/features/pending/` holds 13 unbound scenarios — video mode, plus wording
  variants of scenarios that already run under other names.
- `war-infra/specs/features/pending/` holds 27 routing and edge scenarios with no runner,
  since that project has no test harness.
- `war-ui-custom/specs/features/pending/` holds the template contract; that project does not
  exist yet.

The OAuth and MCP scenarios in `war-api/specs/features/pending/` are removed along with the
feature.

---

## Operational prerequisites

- Each provider's redirect URI must be registered by hand with that provider, per
  environment. Nothing in the pipeline does it.
- The API's address-keyed rate limits need the reverse-proxy hop count configured to key on
  the real client address. **The correct value is unknown** and must come from the provider;
  until then clients behind the same hop share a bucket.

---

## To revisit

**MCP, from a fresh perspective.** The requirement — letting a creator build and edit War
content from an assistant — was never wrong; the design was. It grew from a local process to
a remote server to a full standards-compliant authorization server inside `war-api`, and the
auth work came to dominate the feature.

Worth starting from, next time:

- **What clients actually need to reach it**, decided before any design work. Desktop-only
  and phone-inclusive are different problems, and that question is what invalidated two
  designs.
- **Existing identity providers** rather than building one — Keycloak, Authentik, Ory Hydra,
  Zitadel, Logto self-hosted; Auth0, WorkOS, Clerk, Stytch hosted. Note that the hosting
  provider offers nothing here: it has no identity or auth product at all.
- **The reconciliation problem that made outsourcing awkward mid-flight**: `war-api` is
  already the identity authority, keyed by provider and account id. Any external
  authorization server has to resolve to those same voters, and running two identity systems
  is how audience-confusion bugs appear.
- **Whether the scope justifies the auth surface at all** — a narrower feature reachable by a
  single trusted client is a materially smaller problem than a public authorization server.

---

## Designed but not specified

**Platform moderation.** Agreed in discussion, never written into the spec: an administrator
role grantable to several people, per-voter suspension from creating Wars, a global
creation kill switch, soft-deleting a War while hard-deleting its media, and an append-only
log of moderation actions.

Two things that shaped the design and are worth keeping: the foreign keys have no cascade
rules, so deleting a War needs an explicit ordered teardown; and one uploaded image becomes
several stored objects across two prefixes, so a naive prefix sweep leaves the full-resolution
originals behind.

`specs/war-spec.md` section 2 still lists "Admin moderation dashboard" as a non-goal, which
this would reverse.
