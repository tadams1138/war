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
- **Activation no longer requires media.** `activateWar` (`warsService.ts`) dropped its
  per-contestant image-count check; only "at least 2 contestants" remains. A contestant with
  no media at all can activate and vote/rankings render whatever media it has (spec 6.1
  updated to match). `war-lifecycle.feature`'s "Cannot activate when a contestant has no
  image" scenario is now "A contestant with no image can still activate", asserting a 200
  instead of a 422.

- **Deleting a draft War.** `DELETE /wars/:id` (`warsService.deleteWar`), draft-only and
  creator-only via the existing `loadDraftWarOwnedBy` guard — same 404/403/notDraft outcomes
  `patchWar` already returns. Removes the War's `contestant_media` rows, then its `contestants`,
  then the `wars` row itself (a draft never has matchups/votes/memberships, so no other table
  needs cleanup). No object-storage cleanup, matching `deleteContestant`'s existing precedent of
  leaving orphaned media objects behind.
- **`is_owner` on War detail.** `GET /wars/:id` gained a new `optionalAuth` preHandler
  (`auth/plugin.ts`) — populates `request.voterId` from a bearer token when one is present and
  valid, but never 401s otherwise. `WarDetailResponse` (not `WarSummary`) now carries
  `is_owner: boolean`, true iff the caller's voter id matches the War's `creatorId`.

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
  **Superseded** by the results-list merge below — the gallery, its grid, and
  `.contestant-gallery-item` no longer exist.
- **Single-page War creation.** The multi-step Create War wizard (Metadata → Contestants →
  Review/Activate) is gone. `POST /wars` no longer requires a title (a War is identified by its
  id; `wars.title` is now a nullable column) — clicking Create War creates an empty draft and
  forwards straight to `/wars/:id/edit`, which now also carries theme editing (previously
  creation-only, since there was no PATCH path for it — `PATCH /wars/:id` accepts `theme` now
  too) and an **Activate** button. Activate is client-side disabled with an inline reason until
  the War meets the API's own rule (≥2 contestants — the media requirement this once mirrored
  too was dropped, see *Built* below); a failure the client-side check didn't catch shows the
  API's validation messages verbatim, same as the old wizard's Review step did.
- **Home Vote/Results entry points.** Home's War cards no longer repeat "active" as a status
  word (every card there is active by construction). Each card now carries two direct links,
  `WarCard`'s new `variant="home"` (default remains `my-wars`, unchanged): **Vote** to
  `/wars/:id/vote` and **Results** to `/wars/:id`. Vote needed no new redirect logic — the
  route was already wrapped in `RequireAuth`, so an anonymous tap lands on sign-in and returns
  to Vote afterward the same way `/wars/new` and `/my-wars` already do.
- **War detail + results merge.** `/wars/:id/rankings` and its `Rankings.tsx` page are gone.
  `WarDetail.tsx` now renders the contestant gallery and a `ResultsSection` (the same
  `useRankings`/`RankingsTable` polling and stale-on-failed-poll behavior, previously
  `Rankings.tsx`'s) side by side on one route, each with its own independent loading/error
  state so a results-fetch failure never blanks an already-loaded gallery or vice versa.
  Invite-only 401 handling is unchanged — the existing global 401 pipeline (clear token,
  redirect to `/login`) fires the same way regardless of which of the page's two fetches
  triggers it. `VoteMode`'s post-completion link now points at `/wars/:id` (`view-results-link`,
  was `rankings-link`/`/wars/:id/rankings`).
  **Superseded** by the results-list merge below — the gallery and the results table were
  merged into one list, not just one route; the independent load/error states this bullet
  describes still apply (now scoped to the single results list rather than to two sections).
- **Contestant media sizing — Vote.** Verified already compliant: at phone width, card media
  (default fixture aspect ratio) leaves both cards, names, and progress bar within one
  viewport with no scroll needed. No code change; added a regression test
  (`vote-mode-responsive.spec.ts`) asserting `scrollHeight <= innerHeight` at phone width so a
  future change can't silently reintroduce scrolling.
- **Contestant media sizing — War detail.** `.contestant-gallery`'s `auto-fill`/`minmax(240px,
  1fr)` grid already keeps per-item width bounded even with a short roster on a wide
  viewport — `auto-fill` (unlike `auto-fit`) preserves empty tracks rather than handing their
  share to the populated ones, so this needed no CSS change either; verified with a new test
  at 1600px width with 2 contestants. What did need building: in-place multi-image
  browsing — `WarDetail`'s gallery item now renders `ImageCarousel` (previously the static,
  primary-image-only `ContestantThumbnail`) so a contestant with several images pages through
  them with the same swipe/arrow/dot affordance the vote card uses, never leaving the page.
  `ImageCarousel` gained an optional `ariaLabel` prop (default unchanged) so this read-only
  reuse doesn't announce "tap to vote" outside a voting context.
  **Superseded** by the results-list merge below — the grid is gone (replaced by a fixed-width
  `.results-media`, not viewport-dependent sizing), and `ContestantThumbnail` was deleted;
  `ImageCarousel` (with its `ariaLabel` prop, unchanged) is now the only image renderer for a
  result row, gallery item or leaderboard row alike.
- **Profile menu legibility.** `.identity-menu [role='menu']` had no background rule anywhere,
  so it rendered on whatever page content sat behind it. Each theme's own surface color
  (`--t-surface`, already used by `.war-card`/`.contestant-card`) now applies to the open menu
  too, added to that same per-theme selector group rather than as a new rule, so it can never
  drift from the other surfaces a theme defines.
- **Activate dirty-check/confirm.** Clicking Activate while the metadata form (title, category,
  visibility, theme, end date) has unsaved edits now shows a confirm step (`activate-dirty-
  confirm`) instead of activating immediately, offering **Save changes** (submits the form via
  a new imperative `EditWarMetadataFormHandle.submit()` exposed through a `forwardRef`, then
  returns to the Metadata section so the creator sees the result — Activate itself is not
  auto-retried), **Discard and activate** (proceeds as before), or **Cancel**. The form reports
  its own dirty state up via a new `onDirtyChange` prop rather than lifting its field state out
  of the form, so `EditWar` can gate its sibling Activate button without the form giving up
  ownership of its own fields. Known gap not addressed here: switching the left nav away from
  Metadata unmounts the form and always discarded in-progress edits before this change too —
  that's a separate, pre-existing data-loss path this task didn't touch.
  `EditWar`'s cyclomatic complexity is now ~15 (was ~14, hand-counted — no `complexity` lint
  rule is configured), from the added confirm-panel branch; still the same pre-existing
  high-complexity function flagged in earlier work, not newly over threshold.
- **Fixed: clicking an image carousel's arrow control cast a vote underneath the navigation.**
  `ImageCarousel`'s tap-to-vote/swipe-to-browse gestures live on `onPointerDown`/`onPointerMove`/
  `onPointerUp` handlers on the carousel's own root element; the arrow buttons only called
  `event.stopPropagation()` in their `onClick` handler, which fires *after* pointerdown/pointerup
  already bubbled to the root and fired `onTap()` (a real mouse click always fires
  pointerdown → pointerup → click, in that order). The only acceptance test for the arrow
  controls drove them via keyboard (`ArrowRight`/`ArrowLeft`), never an actual mouse click, so
  this shipped unnoticed. Fixed by stopping propagation on the buttons' own
  `onPointerDown`/`onPointerUp` too. New regression test drives a real `.click()`.
- **Activate no longer requires media.** `missingForActivation` (`EditWar.tsx`) dropped its
  "every contestant needs an image" check, matching the API (see war-api's *Built* above); only
  "at least 2 contestants" is still mirrored client-side.
- **Results list merge — no more separate gallery or "Results" section.** `WarDetail` used to
  render a contestant gallery (bio, attributes, media) and an independent `RankingsTable`
  (`<h2>Results</h2>`, rank/image/name/wins/appearances) as two sections on the same page. They
  are now one list: `ResultsTable` (`components/ResultsTable.tsx`, replacing `RankingsTable.tsx`)
  renders a single rank-ordered row per contestant carrying image, name, bio, and attributes
  together with wins/appearances — row order and identity come from `GET /wars/:id/rankings`
  (never re-sorted, per spec), with bio/attributes joined in from `GET /wars/:id`'s
  `contestants` by id (absent when the two responses' ids don't line up, e.g. an
  as-yet-unranked contestant on the same page a rankings entry hasn't been generated for). Each
  row's media is a fixed-width (`4.5rem`, `.results-media` in `layout.css`) `ImageCarousel` —
  not a static thumbnail — so multi-image contestants page through their photos in place;
  `ContestantThumbnail.tsx` (retired) used to draw only the primary image. A contestant with no
  media renders no image and no placeholder in its row (`ImageCarousel` already rendered
  nothing for an empty `media` array; nothing new needed there). The image itself is decorative
  (`alt=""`, per `ImageCarousel`'s existing convention) — the carousel's `role="group"`
  `aria-label` carries the contestant's name instead. `.contestant-gallery`/
  `.contestant-gallery-item` (CSS) and their themed surface-box rule are removed.
- **Activate permanence confirmation.** Clicking Activate (`EditWar.tsx`) now always shows a
  confirm dialog (`activate-confirm`, distinct from the pre-existing unsaved-edits
  `activate-dirty-confirm`) warning that activation is permanent and the War can no longer be
  edited once live, requiring an explicit **Activate War**/**Cancel** choice before the real
  `activate()` call fires. Discarding unsaved edits from the dirty-confirm dialog routes through
  this same permanence confirm rather than activating immediately — every path to activation
  now passes through one gate. Extracted `ActivateDirtyConfirmDialog`/
  `ActivatePermanenceConfirmDialog` subcomponents to keep `ActivateSection`'s cyclomatic
  complexity at 4 (would have been 6 with both dialogs inlined).
- **Results row width ratios and edge carousel controls.** `ResultsTable`'s columns were
  content-sized, which let bio (or, on a short bio, media) claim most of the row on a wide
  viewport. A `<colgroup>` now fixes each column's share instead: bio ~50%, image ~25%,
  rank/wins/appearances/win-share ~25% combined (`table-layout: fixed` plus per-column
  `.col-*` widths in `layout.css`). `ImageCarousel`'s paging arrows and dot indicators had no
  CSS at all before this — unstyled, they rendered as a plain row of controls *below* the
  image, which is what let a multi-image contestant's row grow taller than a single-image
  one's. They're now absolutely positioned over the image itself (arrows on its left/right
  edges, dots along its bottom, inside a new inner wrapper `<div>` scoped to just the image so
  a vote card's contestant-name `children` below it isn't drawn into that positioning
  context) — every image occupies the same box whether or not it has paging controls. Added a
  **win-share bar** (`.win-bar-track`/`.win-bar-fill`, themed per theme like `.progress-fill`):
  width is raw wins over the row's highest win count, *not* wins over appearances — the
  appearance-normalized percentage §7 explicitly rejects as a display value — and, like the
  rest of the leaderboard, is never rendered as text.
- **Results list reworked for mobile and wide viewports; `<table>` replaced with `<ol>`/`<li>`.**
  The `<colgroup>`-based fixed-percentage table above rendered its full desktop proportions at
  any viewport width — on a phone the rank/wins/appearances/win-share columns collapsed to a few
  px and the image stayed thumbnail-sized. `ResultsTable.tsx`'s `<table>` is now an `<ol
  data-testid="rankings-list">` of `<li data-testid="ranking-row">` cards — rank is an ordering,
  not a column value, so a list gives each entry native "item N of M" semantics a table's rank
  cell never did. The old `col-rank`/`col-image`/`col-contestant`/`col-wins`/`col-appearances`/
  `col-win-share` classes and their per-theme `.rankings-table th`/`td.col-rank` rules are gone.
  Each card's `.ranking-media`/`.ranking-content`/`.ranking-stats` groups stack in one column,
  media first, below 900px (an initial pass kept a side-by-side ~25/50/25 flex split above
  640px; a follow-up round of feedback replaced that with always-stacked; a later round put the
  poster back beside the bio at >=900px via CSS grid — `grid-template-areas: "media content" /
  "media stats"` — with wins/appearances/win-share staying under the bio either way, since that
  was the one part of "stack it" actually asked for) — `.rankings-list` caps at 90rem/1440px and
  centers itself (`margin: 0 auto`) on a wide viewport instead of stretching full-bleed, with
  margin above it so the rank badge's overlay never crowds the category text or action bar above
  the list.
  Rank renders as a badge overlaid on the media's own corner (`.ranking-rank`, themed per theme)
  rather than a separate narrow column. Bios render in full at every width — a same-day attempt
  at truncating long ones behind a "More"/"Less" toggle (`BioSnippet.tsx`) was reverted; that
  file and its CSS/theme rules are gone. The 8 acceptance assertions that used to disambiguate a
  row's rank/wins cell via `getByRole('cell').nth(n)` now use dedicated testids
  (`ranking-rank`/`ranking-wins`/`ranking-appearances`) instead, since a `<li>` carries no cell
  role to key off of.
- **Results-page Edit/Delete/Vote/Export entry points.** `WarDetail.tsx`'s new
  `ResultsActions` shows **Edit** and **Delete** (`war-detail-edit-link`/
  `war-detail-delete-button`) when `war.is_owner && status === 'draft'`; **Vote**
  (`war-detail-vote-link`) when the War is active, the voter is authenticated
  (`getToken()`), and `GET /wars/:id/my-progress` reports `voted < total` — the request is
  skipped entirely for an anonymous visitor or a non-active War rather than firing one the API
  would 401 anyway; and **Export** (`war-detail-export-button`) whenever `war.is_owner`,
  regardless of status. Delete and Export both extracted into shared hooks/components
  (`useDeleteWarFlow`, `DeleteWarConfirmDialog`, `ExportButton`, `ErrorMessage`) so `EditWar.tsx`
  reuses the same Delete confirmation and Export button rather than duplicating them.
- **Edit-page Delete.** `EditWar.tsx` gained a Delete button (`edit-war-delete-button`) next to
  Activate, same permanence-confirm pattern, navigating to `/my-wars` on success.
- **Action-bar/button consistency pass; confirmation dialogs are now native `<dialog>`
  modals.** Every action row (results page, edit page, both War-card variants) used to be its
  own unstyled div — `.war-detail-actions`/`.edit-war-export`/`.edit-war-delete`/
  `.edit-war-activate`/`.war-card-actions` had no CSS at all — so Edit (a `<Link>`, matched by
  none of `themes.css`'s tag-only `button` selectors) rendered as plain text next to Delete/Export
  (real `<button>`s, fully themed), and each row stacked vertically with no gap. Replaced with two
  shared primitives: `.action-bar` (`layout.css`, a flex row with a standard gap — one definition
  instead of five near-duplicates) and a `.button` class (`themes.css`, added alongside every
  per-theme `button` tag selector) so any element meant to look like an action — including a
  `<Link>` — gets identical treatment to a real `<button>`. New `DeleteButton.tsx` (mirrors
  `ExportButton.tsx`) replaces two hand-rolled Delete buttons that had already drifted out of
  sync once. Destructive actions (`.button--danger`: both Delete buttons, the delete-confirm
  dialog's submit, "Discard and activate") get a per-theme danger color (`--t-danger`/
  `--t-danger-text`, picked from each theme's own palette — fight_card reuses its already-unused
  `accent1`) instead of the primary accent, so they read as visually distinct; the modifier rule
  has to be the last rule in `themes.css` since it ties in specificity with each per-theme
  `.button` rule and source order breaks the tie. `DeleteWarConfirmDialog`,
  `ActivateDirtyConfirmDialog`, and `ActivatePermanenceConfirmDialog` (previously bare
  `<div role="alertdialog">`s with no positioning, backdrop, focus trap, or Escape handling) now
  render through a new shared `Modal.tsx` wrapping a native `<dialog>` — `showModal()`/`close()`
  synced to a `show` prop in a `useEffect` — which gets all of that for free; `themes.css` gained
  a `.modal` surface rule (same theme-surface treatment as `.bio-content`) and `layout.css` a
  `.modal::backdrop` rule. No `data-testid` changed on any of this — it's a pure markup/CSS
  reorganization, not a behavior change.
- **War export.** `src/export/exportWar.ts`'s `buildWarExportZip` builds a zip (via `fflate`,
  new dependency) containing `war.json` (title, category, visibility, theme,
  `contestant_schema`, `ends_at`, and each contestant's name/bio/attributes — no votes, no
  `win_count`/`appearance_count`) plus each contestant's largest-width media variant under
  `media/<contestantId>/<mediaId>.<ext>`, referenced by that path in the JSON. Built entirely
  client-side from the War detail already on the page (no new backend endpoint); triggers a
  browser download named `war-<id>.zip` via a temporary `<a download>` (`downloadFile.ts`).
  Exists to let a creator recreate a War later.
- **War import**, reversing export. New `/wars/import` page (`ImportWar.tsx`), reachable from
  the identity menu and My Wars' empty state alongside Create War. `validateWarImport.ts`
  unzips the file and validates its whole shape up front — required metadata fields present,
  every contestant's referenced media path actually in the zip — before anything is sent to the
  server; a malformed file is rejected with one message and creates nothing.
  `importWar.ts` then recreates the War through the same endpoints EditWar's own UI already
  calls: `POST /wars` (now also accepting `contestant_schema` — previously PATCH-only —
  and `POST /wars/:id/contestants` now also accepting `attributes` at creation, both already
  supported server-side, just not previously exposed in the hand-typed client payloads), then
  each contestant, then each contestant's images, sequentially. On full success the creator
  lands on the new draft's Edit page; if the War was created but a contestant or image failed,
  the partial draft is left in place with its error shown, findable via My Wars like any other
  draft, rather than auto-navigating into a half-built page. No new backend endpoint — the same
  client-side-orchestration approach export used.
- **`war-ui-default/tsconfig.json` gained `strictNullChecks`.** Discovered while writing
  import's `ok`/`error` discriminated-union result type: without it, TypeScript silently fails
  to narrow a boolean-literal-discriminated union at all (`if (!result.ok) { result.error }`
  left `result` typed as the full union) — verified with a minimal repro against this exact
  tsconfig. Enabling it surfaced zero new errors across the existing codebase.

### Not built

- Video-mode matchups.
- The shared runtime artifact for custom UIs.
- **Editing an active War.** The API rejects any PATCH once a War leaves draft (by design,
  fairness during voting); no UI or API path exists to change anything about a live War short
  of closing it.

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
