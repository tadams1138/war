# Progress

Where the project stands. `war-spec.md` describes the system as designed; this file
records what exists, what does not, and what is known to be wrong.

Update it when something ships. Keep it short — this is a status board, not a log.

---

## Deployed

Staging and production both run as a single application per environment containing the
`war-api` service and the `war-ui-default` static site. See `war-spec.md` section 12.

---

## war-api

### Built

- **Auth** — Google, Microsoft, Facebook, and Twitter/X. Apple returns not-found (see *To
  revisit*). All callback failure responses implemented. Sessions are a JWT plus a rotating
  refresh-token family with reuse detection, PKCE-protected on every provider.
- **Domain** — Wars, contestants, matchups, voting, rankings, and the internal
  close-expired-wars endpoint.
- **War listing** — the caller's-own-Wars filter, and default visibility scoping applied in
  the data-access layer so every caller inherits it.
- **Visual theme** — each War carries a creator-chosen theme (`arcade`/`fight_card`/
  `scrapbook`, default `arcade`), surfaced on `WarSummary` and the rankings response.
- **Published API contract**, generated from route definitions. A CI guard fails the build
  if the committed client types drift.
- **Health check.**
- **War lifecycle: Publish/Unpublish, always-editable, Clear Votes, cascading Delete**
  (spec §6.1, §4). The one-way `active` status and its `activate` route are gone; `status` is
  now `draft` → `published` → `closed`, with `publishWar`/`unpublishWar` (`warsService.ts`,
  `POST /wars/:id/publish` and `/unpublish`) the two directions of one reversible toggle —
  `closed` remains the sole terminal state, reachable only by end-date expiry, and rejects
  both directions. Publishing still requires only "at least 2 contestants," no per-contestant
  image check. Every War-owning mutation (metadata PATCH; contestant add/patch/remove;
  contestant image add/reorder/remove; share image) now uses ownership-only guards
  (`loadOwnedWar`, `warAccess.ts`) instead of
  draft-only ones — a creator can edit a War in any status. Matchups generate incrementally
  per contestant as it's added (`generateMatchupsForNewContestant`,
  `matchups/matchupsRepository.ts`) rather than as one batch at publish time, and are removed
  along with a contestant's votes when it's removed. **Clear Votes**
  (`POST /wars/:id/clear-votes`, `warsService.clearVotes`) deletes every vote in a War and
  resets every contestant's counters to zero via `recomputeContestantCounters`
  (`contestantsRepository.ts`) — a hard delete, any status, creator-only. **Delete**
  (`DELETE /wars/:id`) now works in any status and cascades votes → matchups →
  `contestant_media` → contestants → memberships → the `wars` row, all in one transaction
  (`deleteWarRow`, `warsRepository.ts`) — no FK cascade exists at the schema level, so this
  ordering is load-bearing. `GET /wars/:id` and `GET /wars/:id/rankings` gained a visibility
  check (`isWarVisibleTo`, `warAccess.ts`) that was previously missing entirely: a War that
  is currently a draft is invisible to anyone but its creator, identically to a missing War;
  `closed` stays visible to everyone (rankings remain readable, spec §4).
- **`is_owner` on War detail.** `GET /wars/:id` gained a new `optionalAuth` preHandler
  (`auth/plugin.ts`) — populates `request.voterId` from a bearer token when one is present and
  valid, but never 401s otherwise. `WarDetailResponse` (not `WarSummary`) carries
  `is_owner: boolean`, true iff the caller's voter id matches the War's `creatorId`.
- **Per-voter rate limiting** (spec §8.4): vote casting (60/minute and 2,000/day, both
  enforced), War creation (10/hour), and image upload (100/hour), each keyed by voter id via
  an in-process fixed-window limiter (`shared/rateLimit.ts`) — one instance per scope, built
  once per app instance. `bearerAuthRoute` takes an optional list of extra preHandlers so a
  route can compose auth with a rate-limit check. Exceeding a limit replies `429` with a
  `Retry-After` header and a `{ error, retry_after_seconds }` body; every attempt counts
  against every configured window regardless of the request's ultimate outcome. The edge's
  address-keyed limits (sign-in, token refresh — spec §8.4's other two rows) are enforced by
  Cloudflare (`war-infra/terraform/shared/main.tf`), not here.
- **Share image** (spec §4/§9.1). `POST /wars/:id/share-image` (multipart, single file),
  creator-only, editable in any status like every other War-field mutation.
  `shareImageProcessing.ts`
  center-crops to exactly 1200×630 via sharp regardless of the input's own size, encodes JPEG
  (not the WebP contestant media uses — chosen so the same asset works as a third-party
  link-preview image without a second encoding), and strips metadata the same way contestant
  uploads already do. The original is retained privately (`originals/share-images/:warId`);
  the processed JPEG always overwrites the same deterministic key
  (`share-images/:warId.jpg`), so re-uploading replaces rather than accumulates. `WarSummary`
  carries `share_image_url` (nullable) — `presentWarSummary` gained a `publicBaseUrl`
  parameter to build it, threaded through every route that calls it.
- **A contestant's bio on the vote page** (spec §4, §10.3). `GET /wars/:id/matchups/next`'s
  `matchup.left`/`right` now carry `bio` alongside `id`/`name`/`media`. A new
  `MatchupContestantView`/`matchupContestantViewSchema` (`contestants/contestantPresenter.ts`)
  is used instead of the shared `ContestantView` `/rankings` also uses — that one stays
  `{id, name, media}`, since rankings has no use for bio and the two call sites' needs diverged.
- **Contestant custom-attribute schema removed** (backlog item 3). War-level
  `contestant_schema` and per-contestant `attributes` are gone: dropped by migration
  (`20260110000000_drop_contestant_schema_and_attributes.sql`), out of the DB types,
  repositories, services, presenters, and routes on both War and Contestant, along with the
  dedicated `schemaValidation.ts` module and the draft-only status gate that only applied to
  this one field. A request body still containing either field is silently ignored, not
  rejected. Bio (markdown) is now the only per-contestant free text — see the matching
  war-ui-default entry below for the client-side half of this removal.

### Not built

- Apple sign-in (see *To revisit*); linking providers to one voter.
- `video` media mode. The media table's video columns exist and are unused.
- Custom UI registry endpoints. The registry table and the War's slug column exist, unused.

---

## war-ui-default

### Built

Core voting loop, War detail (results and rankings on one page), My Wars, and a persistent
navigation header with an auth-aware Home empty state. Live in staging and production.

- **Visual themes** — the three themes render on WarDetail, VoteMode, and Home/My Wars, with
  a per-device, per-War voter override (cookie-based, never synced to the server or other
  devices) and a theme picker on Edit War.
- **Nav.** The persistent header collapses My Wars/Create War/Log out behind a single
  identity control (avatar + name, top right); logged out shows only Log in. The theme
  picker sits in the nav as a dropdown, always visible, and themes the nav bar itself plus
  the Login and CreateWar pages via a `ThemeContext` that lets WarDetail/VoteMode publish
  their War's own resolved theme up to the nav. Login is a themed, centered panel with
  brand-guideline-accurate provider logos (see the
  google-oauth/facebook-oauth/microsoft-oauth/twitter-x-oauth skills' "Sign-in button
  branding" sections).
- **Brand mark.** `Logo.tsx` — a faceted hexagon badge (the Arcade Showdown palette) with a
  13-block mosaic standing in for "W" — sits at the nav bar's leading edge as a Home link
  (`aria-label="Home"`), shown to every visitor regardless of auth state; Home is no longer a
  separate item in the identity menu. Fixed colors, not theme tokens — a War's own theme never
  recolors it, the same way the footer already sits outside per-War theming. The wordmark
  beside it hides below 480px so the mark still fits one row alongside the theme switcher and
  identity/login without wrapping (guarded by the vote page's own "no scroll to vote" test).
  `public/favicon.svg` (vector tab icon) and `apple-touch-icon.png`/`icon-192.png`/
  `icon-512.png` (rasterized via `sharp`, opaque `#0d0b1a` background — iOS/Android composite
  transparency badly) plus `manifest.webmanifest` cover the browser tab and Android/iOS
  home-screen cases; `index.html` links all three.
- **Editing a War, in any status.** `PATCH /wars/:id`, `PATCH /wars/:id/contestants/:cId`,
  and `DELETE /wars/:id/contestants/:cId` (creator-only server-side, never status-gated) have
  a UI route, `/wars/:id/edit`, reachable from any of a creator's own My Wars cards. Covers
  title/category/visibility/end date, and each contestant's name, bio, image gallery
  (add, remove, reorder, up to the ten-image cap), and
  removal. Removing a contestant that carries votes asks for confirmation first, naming how
  many votes will be lost, then clears just that contestant's own votes as part of removing
  it (`RemoveContestantConfirmDialog`, `EditWar.tsx`).
- **Contestant bio formatting.** A constrained markdown subset — bold, italic, bullet/numbered
  lists, links, and headings (`#`/`##`/`###`) — entered via a small toolbar (`BioEditor`) and
  rendered sanitized (`marked` + `DOMPurify`, allow-listing exactly those elements) via
  `BioContent`. `bio` stays a plain `TEXT` column holding markdown source. Rendered on War
  Detail. The editor links to marked's own interactive demo (the actual renderer in use, and
  more approachable than its docs for someone unfamiliar with markdown) alongside a note that
  only that subset survives the sanitizer's allow-list. The two-column editor/preview layout
  uses the full row width at the ≥900px breakpoint (`form:has(.bio-editor)` drops the generic
  `form { max-width: 32rem }` cap for this one form).
- **Save success toast.** `EditWar`'s metadata and contestant Save actions show a toast on
  success (`useEditWar.saveMetadata`/`saveContestant` set a `toast` message in state;
  `Toast`, `src/components/Toast.tsx`, displays it and hides itself after 2s, no caller-side
  dismiss needed).
- **Single-page War creation.** Create War creates an empty draft (`POST /wars`, no title
  required — `wars.title` is a nullable column) and forwards straight to `/wars/:id/edit`,
  which also handles theme editing and the **Publish/Unpublish** toggle. Publish is
  client-side disabled with an inline reason until the War meets the API's rule (≥2
  contestants); a failure the client-side check didn't catch shows the API's validation
  messages verbatim.
- **Home Vote/Results entry points.** Home's War cards show no status word (every card there
  is published by construction). Each card carries two direct links, `WarCard`'s
  `variant="home"` (default remains `my-wars`): **Vote** to `/wars/:id/vote` and **Results**
  to `/wars/:id`. Vote's route is wrapped in `RequireAuth`, so an anonymous tap lands on
  sign-in and returns to Vote afterward, the same way `/wars/new` and `/my-wars` do.
- **Contestant media sizing — Vote.** At phone width, card media (default fixture aspect
  ratio) leaves both cards, names, and progress bar within one viewport with no scroll
  needed — guarded by a regression test (`vote-mode-responsive.spec.ts`) asserting
  `scrollHeight <= innerHeight` at phone width.
- **Profile menu legibility.** The open identity menu (`.identity-menu [role='menu']`) uses
  each theme's own surface color (`--t-surface`, the same one `.war-card`/`.contestant-card`
  use), part of that shared per-theme selector group so it can't drift from the other
  surfaces a theme defines.
- **Publish/Unpublish and Clear Votes confirmations.** Publish and Unpublish are one toggle
  button (`publish-toggle-submit`, label follows the War's current status) behind a single
  confirmation dialog (`publish-toggle-confirm`) naming which direction it's about to take —
  "reachable by anyone" vs. "reachable only by you." A closed War shows neither control, just
  an explanatory note (`publish-closed-note`). Since editing is no longer status-gated, the
  old "unsaved metadata edits block activation" dirty-check flow no longer applies and was
  removed entirely — publishing never discards anything. **Clear Votes**
  (`clear-votes-submit`/`clear-votes-confirm`) is a separate, always-available destructive
  action with its own confirmation, naming that every vote and counter resets. Known gap:
  switching the left nav away from Metadata unmounts the metadata form and discards any
  unsaved edits.
- **Carousel paging vs. voting.** `ImageCarousel`'s paging-arrow buttons stop pointer-event
  propagation on `onPointerDown`/`onPointerUp`, not just `onClick` — a real click fires
  pointerdown → pointerup → click in that order, so stopping propagation only on click let a
  click on an arrow also register as a vote tap on the card underneath.
- **Matchup cards are keyed by contestant id.** `MatchupView` keys each `ContestantCard` by
  `matchup.left/right.id`, not position — `ImageCarousel`'s paging state (`currentIndex`)
  lives in the card, so an unkeyed card at a fixed left/right slot would carry a contestant's
  leftover paging index into the next contestant shown at that same slot.
- **Publish no longer requires media (client-side).** `missingForPublish`
  (`EditWar.tsx`) mirrors the API: only "at least 2 contestants" is required, no
  per-contestant image check.
- **Results list.** War detail is one page: `ResultsTable` (`components/ResultsTable.tsx`)
  renders a single rank-ordered `<ol data-testid="rankings-list">` of
  `<li data-testid="ranking-row">` cards — rank is an ordering, not a column value, so a
  list gives each entry native "item N of M" semantics. Row order and identity come from
  `GET /wars/:id/rankings` (never re-sorted, per spec); bio is joined in from
  `GET /wars/:id`'s `contestants` by id (absent when the two responses' ids don't line up
  yet). Each row carries image, name, and bio together with wins/appearances and
  a win-share bar (`.win-bar-track`/`.win-bar-fill`, themed like `.progress-fill`) sized to
  raw wins over the row's highest win count — never wins over appearances, the
  appearance-normalized percentage §7 rejects as a display value. Each row's media is an
  `ImageCarousel`, not a static thumbnail, so multi-image contestants page through their
  photos in place; paging arrows and dot indicators are absolutely positioned over the image
  itself (arrows on its left/right edges, dots along its bottom) so every image occupies the
  same box whether or not it has paging controls. A contestant with no media renders no
  image and no placeholder. The image is decorative (`alt=""`); the carousel's
  `role="group"` `aria-label` carries the contestant's name instead. Rank renders as a badge
  overlaid on the media's own corner (`.ranking-rank`, themed per theme) rather than a
  separate column. Bios render in full at every width, never truncated. Each card's
  `.ranking-media`/`.ranking-content`/`.ranking-stats` groups stack in one column, media
  first, on a narrow portrait viewport; the poster moves beside the bio via CSS grid
  (`grid-template-areas: "media content" / "media stats"`) at `min-width: 900px` **or**
  `orientation: landscape` — a phone rotated sideways can be well under 900px wide but has
  little vertical room to spare, so width alone isn't the right trigger there. Either
  condition alone is sufficient; wins/appearances/win-share stays under the bio regardless of
  which one applies. `.rankings-list` caps at 90rem/1440px and centers itself
  on a wide viewport, with margin above it so the rank badge's overlay never crowds the
  category text or action bar above the list.
- **Results-page Edit/Delete/Vote/Export entry points.** `WarDetail.tsx`'s `ResultsActions`
  shows **Edit** and **Delete** (`war-detail-edit-link`/`war-detail-delete-button`) whenever
  `war.is_owner`, regardless of status — editing is never status-gated; **Vote**
  (`war-detail-vote-link`) when the War is published, the voter is authenticated
  (`getToken()`), and `GET /wars/:id/my-progress` reports `voted < total` — the request is
  skipped entirely for an anonymous visitor or a non-published War rather than firing one the
  API would 401 anyway; and **Export** (`war-detail-export-button`) whenever `war.is_owner`,
  regardless of status. Delete and Export are shared hooks/components (`useDeleteWarFlow`,
  `DeleteWarConfirmDialog`, `ExportButton`, `ErrorMessage`) so `EditWar.tsx` reuses the same
  Delete confirmation and Export button rather than duplicating them.
- **Edit-page Delete.** `EditWar.tsx` has a Delete button (`edit-war-delete-button`) in its
  top action row, same confirm-first pattern, navigating to `/my-wars` on success; works in
  any status and cascades contestants, media, matchups, and votes.
- **Action-bar/button consistency; confirmation dialogs are native `<dialog>` modals.** Every
  action row (results page, edit page, both War-card variants) shares two primitives:
  `.action-bar` (`layout.css`, a flex row with a standard gap) and a `.button` class
  (`themes.css`, added alongside every per-theme `button` tag selector) so any element meant
  to look like an action — including a `<Link>` — gets identical treatment to a real
  `<button>`. `DeleteButton.tsx` (mirrors `ExportButton.tsx`) is the one Delete-button
  implementation, reused everywhere. Destructive actions (`.button--danger`: both Delete
  buttons, the delete-confirm dialog's submit, Clear Votes' confirm submit, a
  contestant-removal-with-votes confirm submit) get a per-theme danger color
  (`--t-danger`/`--t-danger-text`, picked from each theme's own palette) instead of the
  primary accent, so they read as visually distinct — the modifier rule is the last rule in
  `themes.css` since it ties in specificity with each per-theme `.button` rule and source
  order breaks the tie. `DeleteWarConfirmDialog`, `PublishToggleConfirmDialog`,
  `ClearVotesConfirmDialog`, and `RemoveContestantConfirmDialog` render through a shared
  `Modal.tsx` wrapping a native `<dialog>` — `showModal()`/`close()` synced to a `show` prop —
  giving them positioning, backdrop, focus trap, and Escape handling for free; `themes.css`
  has a `.modal` surface rule (same theme-surface treatment as `.bio-content`) and
  `layout.css` a `.modal::backdrop` rule.
- **Persistent footer.** `Footer.tsx`, rendered once by `App.tsx` alongside `NavBar` (same
  `useActiveTheme` pattern), shows a copyright line and links to the project's GitHub repo
  and to `docs/building-a-war-import.md` (instructions for an AI assistant to assemble a
  ready-to-upload War import `.zip` from a user's raw material — contestants, facts, photos —
  for this app's existing Import feature; not a guide to building that feature). Note:
  `Footer.tsx`'s own link label still reads "guide for AI implementers," left unchanged, and
  now describes the doc's purpose inaccurately.
- **War export.** `src/export/exportWar.ts`'s `buildWarExportZip` builds a zip (via `fflate`)
  containing `war.json` (title, category, visibility, theme, `ends_at`, and each contestant's
  name/bio — no votes, no `win_count`/`appearance_count`) plus each contestant's largest-width
  media variant under
  `media/<contestantId>/<mediaId>.<ext>`, referenced by that path in the JSON. Built entirely
  client-side from the War detail already on the page (no backend endpoint); triggers a
  browser download named `war-<id>.zip` via a temporary `<a download>` (`downloadFile.ts`).
  Exists to let a creator recreate a War later.
- **War import**, reversing export. `/wars/import` page (`ImportWar.tsx`), reachable from
  the identity menu and My Wars' empty state alongside Create War. `validateWarImport.ts`
  unzips the file and validates its whole shape up front — required metadata fields present,
  every contestant's referenced media path actually in the zip — before anything is sent to
  the server; a malformed file is rejected with one message and creates nothing.
  `importWar.ts` recreates the War through the same endpoints EditWar's own UI uses:
  `POST /wars`, then each contestant via `POST /wars/:id/contestants`, then each contestant's
  images, sequentially. On full success the creator lands on the new draft's Edit page; if the War
  was created but a contestant or image failed, the partial draft is left in place with its
  error shown, findable via My Wars like any other draft. No dedicated backend endpoint —
  same client-side-orchestration approach export uses.
- **`war-ui-default/tsconfig.json` has `strictNullChecks` enabled.** Required for a
  boolean-literal-discriminated union (e.g. import's `ok`/`error` result type) to narrow
  correctly — without it, `if (!result.ok) { result.error }` leaves `result` typed as the
  full union.
- **Rate-limited actions show a wait, never an error (spec §10.5).** `api/client.ts`
  classifies any `429` as `reason: 'rate-limited'` with `retryAfterSeconds`, endpoint-agnostic
  — every caller gets it for free. Vote casting (`useVoteSession.ts`) keeps both cards busy
  and shows the wait on `role="status"`, re-enabling automatically once the delay passes.
  Create War (`CreateWar.tsx`) shows the wait the same way and retries on its own, no manual
  "Try again" needed for a mere cooldown. Image upload (`useEditWar.ts`,
  `EditWarContestant.tsx`) shows the wait per contestant and disables that contestant's
  add-image control until the delay passes.
- **Share image** (spec §4/§10.4), set from Edit War's metadata form two ways: upload a file
  directly, or `generateShareImage.ts` composites two random qualifying contestants (each
  needs ≥1 image) into a 1200×630 canvas with a "VS" badge styled per the War's theme,
  replicating each theme's `.vs-divider` shape/colors/font as Canvas 2D paths (no shared
  source with the CSS — a manual port, kept in sync by hand). Generating is a re-rollable live
  preview; the control is disabled with an inline explanation when fewer than two contestants
  qualify. Neither path uploads anything until **Save** is pressed — `EditWarMetadataForm`
  holds the pending file/Blob in local state and `submit()` uploads it (if present) before the
  ordinary metadata PATCH. `WarCard` shows `share_image_url` at the top of the card when a War
  has one, no placeholder when it doesn't.
- **Vote page: bios beside the tap-to-vote block, which fills the viewport** (spec §10.3).
  `MatchupView.tsx` reads the same 640px breakpoint `layout.css` uses
  (`useNarrowViewport`/`hooks/useNarrowViewport.ts`, a `matchMedia` hook) in JS rather than
  leaving it to a media query alone, because where a bio's *parent* is genuinely differs by
  breakpoint, not just its styling: on a wide viewport it's `.matchup-bios`, a sibling
  *after* `.vote-viewport` (`height: 100vh` flex column holding just the progress bar and
  both cards) — reachable by scrolling down past it, never eating into that column's budget;
  on a narrow one it's paired inside `.vote-viewport` itself, beside its own card in a
  `.matchup-row` (both contestants' rows together fill the column, so both stay visible with
  no scroll to vote) and scrolls internally if long (`overflow-y: auto`). Either way, clicking
  a bio is outside `ContestantCard`'s own gesture-handling element, so it never registers as a
  vote. `ContestantCard`'s media itself now fills its box via `object-fit: contain`
  (`ImageCarousel`'s new `fillHeight` prop) instead of sizing from the image's own aspect
  ratio — `contain` rather than `cover` so a poster never crops top/bottom against a box whose
  aspect ratio doesn't match its own; the aspect-ratio-reserved sizing stays the default for
  every other caller (the results-page gallery). `VoteMode.tsx` scrolls to `.vote-viewport`
  once per page visit, past the persistent header, the first time a matchup is ready.
- **Finishing every matchup redirects straight to the results page** (spec §10.3/§10.4),
  replacing the old dedicated "You've voted on every matchup" screen. `useVoteSession`'s
  `completed` phase already covered both ways of getting there (casting the final vote, or
  landing on the vote page already finished — e.g. back from a login redirect); `VoteMode.tsx`
  now just navigates to `/wars/:id` on that phase instead of rendering its own screen.
  `WarDetail.tsx`'s `useVoteEligibility` became `useVoteProgress`, returning the fetched
  `{voted, total}` (or `'anonymous'`/`null`) so both `VoteCallout` and the new
  `CompletionNotice` — the same "You've voted on every matchup — thank you!" copy, now shown
  at the top of the results page instead of its own screen — derive from one fetch.
- **A big, centered Vote callout on the results page, including for anonymous visitors**
  (spec §10.4). `WarDetail.tsx`'s `VoteCallout` sits above the ordinary Export/Edit/Delete
  action row, not inside it — replaces the old small action-row Vote link entirely rather than
  adding a second one. Shown to an anonymous visitor on a published War too now (previously
  hidden entirely): tapping it hits the vote route's existing `RequireAuth`, which sends them
  to sign in and back, the same pattern Home's own Vote link already used. Still hidden for an
  authenticated voter who's already cast every vote, and for anyone on a War that isn't
  published.
- **Contestant custom-attribute schema removed** (backlog item 3, client-side half; see the
  matching war-api entry above). `ContestantAttributes.tsx` and its use in `ResultsTable` are
  gone — a results row now shows only bio, no attributes list. `contestant_schema`/
  `attributes` are also gone from `client.ts`'s payload types, `exportWar.ts`'s export shape,
  and `validateWarImport.ts`/`importWar.ts`/`useWarImport.ts`'s import path. The generated
  `src/api/generated/schema.d.ts` was regenerated against war-api's updated contract.
- **Home's redundant heading and login link removed** (backlog item 6). `Home.tsx` no
  longer renders an `<h1>War</h1>` or a "Login to Vote" link — the persistent nav header's
  logo/title and Login control already cover both for every visitor, logged in or not.
- **Narrow-viewport bio scrolling fixed** (backlog item 1). `.matchup-view` (the narrow-mode
  wrapper around the two `.matchup-row`s and the vs-divider, `layout.css`) had no CSS rule at
  all, so `.matchup-row`'s `flex: 1 1 0%` had no flex container to divide space within — each
  row sized to its tallest child's natural content, and a long bio just grew instead of
  scrolling within `.matchup-bio`'s existing `overflow-y: auto`, pushing the other
  contestant's row past the viewport. Added the missing flex-column rule (the counterpart
  `.matchup-cards` already had in wide mode).
- **Export/import carries the share image** (backlog item 7). `exportWar.ts` embeds it in the
  zip as `share-image.<ext>` (same never-base64 pattern contestant media uses) with a
  `share_image` path field in `war.json`; import uploads it via a new
  `ImportApi.uploadShareImage`, right after creating the War. An older export with no
  `share_image` field still imports fine — `validateWarImport.ts` defaults it to `null`.
  `docs/building-a-war-import.md` updated to match.

### Not built

- Video-mode matchups.
- The shared runtime artifact for custom UIs.

---

## war-infra

### Built

- **Link-preview tags** (spec §10.4, "Pasting a War's own link elsewhere"). `edge/og-tags-router.js`,
  bound to `/wars/*`, rewrites `<head>` with a War's own `og:title`/`og:description`/`og:image`/
  `twitter:*` tags — a crawler (Facebook, Twitter/X, Slack, Teams, iMessage) never executes the
  SPA's own client-side `<title>`/meta, so without this every War's link produced the same
  generic preview. Only the exact detail path `/wars/:id` gets real tags (checked by segment
  count, `new`/`import` excluded); every other route under `/wars/` (edit, vote, ...) passes
  through untouched — they serve the identical `index.html` as the detail page (client
  routing), so this is the one place that would otherwise wrongly tag them too. No image tag
  when the War has none (no fallback banner exists to point a crawler at instead); a missing
  title falls back to a generic one, never a blank. `index.html` is never edge-cached, same
  reasoning `ui-router.js`'s own shell already has. The description is a fixed "Vote now!"
  (backlog item 4, was category-prefixed, e.g. "Movies — vote now on War") — no automated test
  covers this, since war-infra's edge workers have no test harness (see *Test coverage gaps*).

---

## Test coverage gaps

- Video mode and three War-expiry scenarios sit unbound in `war-api/specs/features/pending/`
  and describe behaviour that is not built.
- `war-ui-default/features/pending/` holds 13 unbound scenarios — video mode, plus wording
  variants of scenarios that already run under other names.
- `war-infra/specs/features/pending/` holds 27 routing and edge scenarios with no runner,
  since that project has no test harness.

---

## Operational prerequisites

- **Google OAuth app verification: complete.**
- Each provider's redirect URI must be registered by hand with that provider, per
  environment. Nothing in the pipeline does it.
- Google, Microsoft, Facebook, and Twitter/X apps must all be registered, with secrets set in
  GitHub and both environments' redirect URIs registered, **before this deploys to that
  environment** — `assertProductionConfig` now refuses to boot with any of the four
  unconfigured. Bring staging up first, confirm all four buttons work end-to-end, then
  production.

---

## To revisit

**Apple sign-in.** Out of scope for now — it requires a paid Apple Developer Program
membership ($99/yr) not yet purchased for this project. Design is otherwise settled, so this
is a cost decision, not an open question: the client secret is an ES256-signed JWT (`iss` the team id, `sub` the client id,
signed with a `.p8` private key, re-signed per exchange since Apple caps its lifetime at six
months); there is no userinfo endpoint, so identity is `sub`-only from the id token; and
`openid` scope alone (skipping `name`/`email`) keeps the callback an ordinary GET rather than
Apple's `form_post` POST. Implement once the account exists — it slots into the same provider
abstraction Microsoft, Facebook, and Twitter/X use.

**SSRF/DNS-rebinding protection.** Nothing in the current codebase fetches a user-supplied
URL, so none exists. If that need returns, recover the address classifier and the
connect-time DNS-rebinding guard from git history rather than rewriting them — both were
correct and non-obvious.

---

## Designed but not specified

**Broad admin dashboard.** Agreed in discussion, never written into the spec: per-voter
suspension from creating Wars, a global creation kill switch, soft-deleting a War while
hard-deleting its media, viewing every War/voter regardless of ownership, banning a voter
(deleting their Wars and votes), and an append-only log of moderation actions. Narrower than
this: Admin and Moderator roles, role grants, and abuse reporting are now specified —
`war-spec.md` §3, §6.7, §8.5. Not yet built (see backlog item 5).

Two things that shaped the design and are worth keeping: the foreign keys have no cascade
rules, so deleting a War needs an explicit ordered teardown; and one uploaded image becomes
several stored objects across two prefixes, so a naive prefix sweep leaves the full-resolution
originals behind.

## Backlog

Requested 2026-09-24, to work through one at a time.

1. ~~Narrow-viewport vote page: make each bio independently scrollable.~~ **Done** — see
   the war-ui-default "Narrow-viewport bio scrolling fixed" entry above.
2. **My Wars / Home cards: pagination, sorting, and a filter bar.** 10 cards per page;
   sortable by newest, oldest, expiring soonest, and alphabetical; a type-ahead filter bar
   matching anywhere in the title or creator's name; each card gains the creator's name and
   end date (when set).
3. ~~Remove the contestant custom-attribute schema entirely.~~ **Done** — see the
   "Contestant custom-attribute schema removed" entries under war-api and war-ui-default
   above, and `war-spec.md`'s §4 (no longer documents it).
4. ~~Drop the category from the results page's meta description.~~ **Done** — see the
   war-infra "Link-preview tags" entry above.
5. **Spec the remaining broad admin dashboard.** Admin/Moderator roles, role grants (seed
   script bootstraps the first Admin), and abuse reporting are now specified —
   `war-spec.md` §3, §6.7, §8.5 — and out of this item's scope. Still to spec: per-voter
   suspension from creating Wars, a global creation kill switch, soft-deleting a War while
   hard-deleting its media, viewing every War regardless of status, deleting any War
   regardless of ownership, viewing every voter and their full vote history, and
   banning/blocking a voter (deleting their Wars and votes).
6. ~~Home page: remove the "Login to vote" link and the redundant "War" heading above it.~~
   **Done** — see "Home's redundant heading and login link removed" above.
7. ~~Export/import should carry the share image.~~ **Done** — see "Export/import carries the
   share image" above.
