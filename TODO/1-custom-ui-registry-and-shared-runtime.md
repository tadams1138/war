# 1 — Custom UI registry and shared runtime

## Summary
Build the registry of custom UIs and the shared runtime artifact they depend on (formerly SPEC.md
the "Custom UI registry" and "Custom UIs" sections, removed from the spec until built).

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

## Behavior
The following is the design carried over verbatim from the spec. When the item ships, return
it (trimmed to what was built) to SPEC.md as new sections.

### Custom UI registry (former SPEC.md section)

A read-only registry mapping a slug to the location of its bundle. Registration is an
administrative operation: a registry record plus a file upload. It provisions nothing — no
bucket, no origin, no routing rule, no redeploy.

A War carries an optional custom UI slug selecting a registered custom UI (a War attribute in
§4.1 and a "Custom UI registration" entity in §4.7, both removed from the spec until built).
Registering a slug is a database record plus a file upload, requiring no infrastructure run
and no redeploy. A Voter may act through the default UI or a custom UI interchangeably, since
each is a route to the same identity and the API is the sole authority.

### Custom UIs (former SPEC.md section)

A custom UI is a brand-specific frontend for a single War, selected by that War's slug. It
replaces **presentation only**: it consumes the same API, enforces no rules of its own, and
cannot change how voting, ranking, or scoring behave. A branded UI and the default UI produce
identical votes and identical rankings.

#### 1. When a custom UI is not the answer

Most campaign-to-campaign variation does not need one.

| The difference is… | Solved by |
|---|---|
| Video instead of photographs | The War's media mode |
| Different title, category, end date, visibility | Ordinary War configuration |
| **Radically different branding, layout and styling** | **A custom UI** |

A primary and a pageant describe contestants in entirely different prose and are both
served well by the default UI — that is a *data* difference, not a presentational one. A
custom UI is warranted only when a campaign needs markup and styling the default UI cannot
express. It is the heaviest option and the last to reach for.

#### 2. Template contract

Three views are required — war detail, vote mode, and rankings — and their presence is
enforced in the pipeline, so a bundle missing one cannot deploy. A custom UI may add any
further views it likes.

Templates are **logicless by design**: they can express section presence but cannot perform
arithmetic or arbitrary conditionals, so a custom UI structurally cannot reimplement ranking
or recompute progress. Every value a template needs — display strings, percentages, booleans
— is precomputed by the runtime.

Regardless of styling, each must satisfy the behaviour its data implies:

- **Vote mode** renders the two contestants **in the order given** and must not reorder, sort
  or randomise them; side placement is decided and recorded by the API to make position bias
  measurable, and shuffling destroys that signal irrecoverably
- **Vote mode** presents exactly two choices and no skip or abstain control
- **Vote mode**, in video mode, renders both players in the given order and does not enable
  voting before both have played; the runtime supplies that state, the template renders it
- **Rankings** render rows in the order supplied and display rank as given — never sorting by
  wins, computing percentages, or deriving an ordering. **Percentages are not supplied in any
  context**, because ranking is by raw wins and a derived percentage misrepresents contestants
  with few appearances
- **War detail** does not present a vote entry point when the runtime says the viewer cannot
  vote

#### 3. Shared runtime

The client logic every UI needs — authentication, single-flight refresh, error mapping, vote
submission, media handling, sequential video playback, and precomputing template values — is
**emitted by the default UI as a second build artefact and loaded by custom UIs directly over
HTTP** from a stable path. Both outputs compile from the same source; there is one
implementation, never two.

**A custom UI does not implement any of this.** Re-implementing it is unsupported: such a UI
is on its own for correctness and receives no platform fixes.

**Why not a package.** A package needs a publish step, a version bump per brand, and a
redeploy of every custom UI to pick up a fix. Serving it from a stable URL means a fix ships
with the next default-UI deploy and **every custom UI has it immediately**, with no brand
having to act. The highest-risk logic here is the refresh flow, where a mistake signs voters
out — centrally patchable is worth more than independently pinnable.

Three things this requires: a **stable, unhashed path** — the one deliberate exception to
content hashing — cached hard but revalidated within minutes of a deploy; a **major version in
the path**, so breaking changes ship alongside rather than replacing, and only a major bump
requires a brand to act; and a **published surface**, since anything not on it is internal.

**The tradeoff, stated plainly:** custom UIs cannot pin a patch version, so a bad runtime
deploy breaks all of them at once. This is mitigated by the runtime shipping through the
default UI's own pipeline — staging, smoke tests, then a manual production gate.

#### 4. Constraints

| Constraint | Value |
|---|---|
| Built bundle size | Under 2MB |
| Required templates | All three present |
| Slug format | Lowercase alphanumeric and hyphens, not leading or trailing, ≤ 64 characters |
| Server-side code | None |

The size budget covers the whole bundle — a custom UI is a brand skin, and contestant imagery
is served from the media CDN rather than bundled.

**The slug pattern is a security control, not cosmetic.** All custom UIs share one storage
bucket, so the slug is a key prefix; an unvalidated slug containing a traversal sequence could
write into another brand's prefix. It is validated before any upload.

Out of scope for a custom UI: more than one War per bundle, any server-side code, overriding
scoring or matchup order or side placement, adding API endpoints, authentication flows other
than the standard ones, and per-slug infrastructure of any kind.

### Caching of the shared runtime (was a SPEC.md §11.4 row)
Shared runtime: ten minutes, revalidated in the background.

### Already built (kept in SPEC.md §11)
The shared-bucket routing, the reusable custom UI pipeline (slug validation, template check,
size check, staging then production gate) and the slug/size/template constraints enforced by
that pipeline are built and stay in the spec.

## Technical notes
- Needs: a registry table plus a War slug column (new migration), registry API endpoints, a
  shared runtime artifact that custom UIs load, and a decision on how registration relates to
  `ui-router.js` (the Worker currently needs no per-slug configuration).
- Follow the spec sections for the intended design; keep implementation detail out of
  SPEC.md.

## Dependencies
- #4 (the registry-related routing scenarios have no runner).
- The default UI Worker (`war-infra/edge/ui-default.js`, route `/*`) shares the edge routing; `/ui/*` stays with `ui_router`.
