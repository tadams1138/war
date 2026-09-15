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

- **Auth** — Google, Microsoft, Facebook, and Twitter/X. Apple returns not-found (see *To
  revisit*). All callback failure responses implemented. Sessions are a JWT plus a rotating
  refresh-token family with reuse detection, now PKCE-protected on every provider.
- **Domain** — Wars, contestants, contestant schema, matchups, voting, rankings, and the
  internal close-expired-wars endpoint.
- **War listing** — the caller's-own-Wars filter, and default visibility scoping applied in
  the data-access layer so every caller inherits it.
- **Visual theme** — each War carries a creator-chosen theme (`arcade`/`fight_card`/
  `scrapbook`, default `arcade`), surfaced on `WarSummary` and the rankings response.
- **Published API contract**, generated from route definitions. A CI guard fails the build
  if the committed client types drift.
- **Health check.**

### Not built

- Apple sign-in (see *To revisit*); linking providers to one voter.
- `video` media mode. The media table's video columns exist and are unused.
- Per-voter rate limiting. The edge's volumetric limits are live; the API's own are not.
- Custom UI registry endpoints. The registry table and the War's slug column exist, unused.

---

## Removed

**The OAuth 2.1 authorization server was withdrawn**, along with the integration it existed
only to serve. The auth surface is provider sign-in, token delivery, and refresh rotation
with reuse detection — nothing more.

Gone: the authorize and token endpoints, PKCE, resource indicators, client-metadata-document
registration, both discovery documents, the SSRF and DNS-rebinding guards, audience binding
in every direction, the service-layer tool allowlist, their tests, and five dependencies.

The schema followed: the `authorization_codes` table and the `refresh_tokens.resource`
column were dropped in a migration that has shipped to staging and production. The
add/drop migration pair was then removed from `db/migrations/` as net-zero churn, since
every environment is past it and a fresh database never needs those objects.

**Worth recovering from history rather than rewriting**, if the platform ever fetches a
user-supplied URL again: the SSRF address classifier and the connect-time DNS-rebinding
guard. Nothing uses them now, but both were correct and non-obvious.

---

## war-ui-default

### Built

Core voting loop, Rankings, MyWars, and a persistent navigation header with an auth-aware Home
empty state. Live in staging and production.

- **Visual themes** — the three themes render on WarDetail, VoteMode, Rankings, and Home/My
  Wars, with a per-device, per-War voter override (cookie-based, never synced to the server or
  other devices) and a theme picker on Edit War.
- **Nav redesign** — the persistent header collapsed Home/My Wars/Create War/Log out behind a
  single identity control (avatar + name, top right); logged out shows only Log in. The theme
  picker moved into the nav as a dropdown, always visible, and now themes the nav bar itself
  and the Login and CreateWar pages (previously unthemed) via a `ThemeContext` that lets
  WarDetail/VoteMode/Rankings publish their War's own resolved theme up to the nav. Login was
  redesigned to a themed, centered panel with brand-guideline-accurate provider logos (see the
  google-oauth/facebook-oauth/microsoft-oauth/twitter-x-oauth skills' "Sign-in button
  branding" sections). Since fixed: the nav bar wasn't actually right-aligned despite the
  design calling for it, and the theme `<select>` inherited a theme's (light) text color onto
  the browser's own (white) control background, unreadable in every theme.
- **Editing a draft War.** `PATCH /wars/:id`, `PATCH /wars/:id/contestants/:cId`, and
  `DELETE /wars/:id/contestants/:cId` (all already draft-only, creator-only server-side) now
  have a UI route, `/wars/:id/edit`, reachable from a draft's own My Wars card. Covers
  title/category/visibility/end date, and each contestant's name, bio, image gallery (add,
  remove, reorder, up to the ten-image cap), and outright removal — the media reorder/delete
  and contestant-delete routes all gained UI callers. The PATCH/DELETE routes also gained
  OpenAPI request/response schemas (previously undocumented, `requestBody: never` in the
  generated client) so the new client functions are properly typed. Editing an active War
  remains out of scope — the API still 403s any PATCH once a War leaves draft, by design.
  Fixed along the way: `EditWarContestant` had no `key` prop, so React reused the same
  component instance across selections and its `useState`-seeded fields never picked up the
  newly selected contestant's data — switching the nav selection left stale name/bio values on
  screen.
- **Contestant bio formatting.** A constrained markdown subset — bold, italic, bullet/numbered
  lists, links, and headings (`#`/`##`/`###`) — entered via a small toolbar (`BioEditor`) and
  rendered sanitized (`marked` + `DOMPurify`, allow-listing exactly those elements) via
  `BioContent`. Storage is unchanged (`bio` stays a plain `TEXT` column holding markdown source
  — no schema change). Now rendered on War Detail, closing the "write-only" gap this used to
  be. The editor links to marked's own interactive demo (the actual renderer in use, and more
  approachable than its docs for someone unfamiliar with markdown) alongside a note that only
  that subset survives the sanitizer's allow-list. The two-column editor/preview layout
  was also boxed in by the generic `form { max-width: 32rem }` rule meant for short text-input
  forms; `form:has(.bio-editor)` now drops that cap at the ≥900px breakpoint so it uses the
  space the row layout already gave it.
- **Wizard multi-image fix.** CreateWar's Contestants step used to hide its file input forever
  after a contestant's first successful image upload (`hasImage: boolean`); it now tracks a
  count and keeps offering the input up to the ten-image cap, matching what the API always
  allowed.
- **Bio paragraph spacing.** `renderBio` already emitted a separate `<p>` per blank line in the
  markdown source, but `.bio-content p` had no margin, so consecutive paragraphs rendered flush
  with no visible gap. Added `margin: 0 0 0.6em` — no parser change.
- **Save success toast.** `EditWar`'s metadata and contestant Save buttons gave no feedback
  beyond clearing their `saving` flag. `useEditWar.saveMetadata`/`saveContestant` now set a
  `toast` message in state on success; a new `Toast` component (`src/components/Toast.tsx`)
  shows it and hides itself after 2s, no caller-side dismiss needed.
- **War detail contestant gallery grid.** `WarDetail` rendered full-size, uncropped images in a
  single column regardless of viewport width. The contestant list now gets a
  `repeat(auto-fill, minmax(240px, 1fr))` CSS grid (`.contestant-gallery` in `layout.css`) —
  roughly 3 columns at laptop width, adapting to any contestant count rather than a hardcoded
  column count — plus a themed card surface (`.contestant-gallery-item`, matching
  `.bio-content`'s border/background) and a 1:1 `object-fit: cover` image cap.
- **Single-page War creation.** The multi-step Create War wizard (Metadata → Contestants →
  Review/Activate) is gone. `POST /wars` no longer requires a title (a War is identified by its
  id; `wars.title` is now a nullable column) — clicking Create War creates an empty draft and
  forwards straight to `/wars/:id/edit`, which now also carries theme editing (previously
  creation-only, since there was no PATCH path for it — `PATCH /wars/:id` accepts `theme` now
  too) and an **Activate** button. Activate is client-side disabled with an inline reason until
  the War meets the API's own rule (≥2 contestants, each with media); a failure the client-side
  check didn't catch shows the API's validation messages verbatim, same as the old wizard's
  Review step did.

### Not built

- Video-mode matchups.
- The shared runtime artifact for custom UIs.
- **Editing an active War.** The API rejects any PATCH once a War leaves draft (by design,
  fairness during voting); no UI or API path exists to change anything about a live War short
  of closing it.
- **Deleting a War.** No delete capability exists anywhere for a War itself, draft or active —
  not in the UI, not in the API (`DELETE /wars/:id` isn't a route).
- **War backup export/import.** Export a draft War (metadata + contestants + bios + images, no
  votes) to a local file for backup/testing; import that file to recreate a War. Likely a zip
  (JSON manifest + image files) rather than raw JSON, since images must round-trip too.
- **Activate can discard unsaved metadata.** Edit War's metadata form (title, category,
  visibility, theme, end date) holds changes locally until its own Save button is clicked — the
  Activate button is separate and fires immediately. A creator who edits metadata and clicks
  Activate without clicking Save first activates the War with none of those edits applied, and
  there is no way to recover: PATCH is rejected once a War leaves draft, and no delete
  capability exists for a War in any status. The previous multi-step wizard's step ordering made
  this sequencing error impossible; this page's freer ordering (deliberately, per spec — no
  fixed order to walk a draft) reintroduces it. Not spec-mandated to fix (the spec is silent on
  save/activate ordering), but worth fixing with a dirty-check/confirm step in a follow-up.

---

## Test coverage gaps

- Video mode, per-voter rate limiting, and three War-expiry scenarios sit unbound in
  `war-api/specs/features/pending/` and describe behaviour that is not built.
- `war-ui-default/features/pending/` holds 13 unbound scenarios — video mode, plus wording
  variants of scenarios that already run under other names.
- `war-infra/specs/features/pending/` holds 27 routing and edge scenarios with no runner,
  since that project has no test harness.
- `war-ui-custom/specs/features/pending/` holds the 11-scenario template contract; that
  project does not exist yet.

---

## Operational prerequisites

- Each provider's redirect URI must be registered by hand with that provider, per
  environment. Nothing in the pipeline does it.
- Google, Microsoft, Facebook, and Twitter/X apps must all be registered, with secrets set in
  GitHub and both environments' redirect URIs registered, **before this deploys to that
  environment** — `assertProductionConfig` now refuses to boot with any of the four
  unconfigured. Bring staging up first, confirm all four buttons work end-to-end, then
  production.
- The API's address-keyed rate limits need the reverse-proxy hop count configured to key on
  the real client address. **The correct value is unknown** and must come from the provider;
  until then clients behind the same hop share a bucket.

---

## To revisit

**Apple sign-in.** Deferred — needs a paid Apple Developer Program membership ($99/yr),
which we don't have yet. Design is otherwise settled, so this is a cost decision, not an open
question: the client secret is an ES256-signed JWT (`iss` the team id, `sub` the client id,
signed with a `.p8` private key, re-signed per exchange since Apple caps its lifetime at six
months); there is no userinfo endpoint, so identity is `sub`-only from the id token; and
`openid` scope alone (skipping `name`/`email`) keeps the callback an ordinary GET rather than
Apple's `form_post` POST. Implement once the account exists — it slots into the same provider
abstraction Microsoft, Facebook, and Twitter/X use.

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
