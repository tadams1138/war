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
- **Domain** — Wars, contestants, contestant schema, matchups, voting, rankings, and the
  internal close-expired-wars endpoint.
- **War listing** — the caller's-own-Wars filter, and default visibility scoping applied in
  the data-access layer so every caller inherits it.
- **Visual theme** — each War carries a creator-chosen theme (`arcade`/`fight_card`/
  `scrapbook`, default `arcade`), surfaced on `WarSummary` and the rankings response.
- **Published API contract**, generated from route definitions. A CI guard fails the build
  if the committed client types drift.
- **Health check.**
- **Activation requires only "at least 2 contestants."** `activateWar` (`warsService.ts`)
  has no per-contestant image-count check; a contestant may hold no media at all and the War
  can still activate — vote/rankings render whatever media each contestant has (spec 6.1).
- **Deleting a draft War.** `DELETE /wars/:id` (`warsService.deleteWar`), draft-only and
  creator-only via the existing `loadDraftWarOwnedBy` guard — same 404/403/notDraft outcomes
  `patchWar` already returns. Removes the War's `contestant_media` rows, then its `contestants`,
  then the `wars` row itself (a draft never has matchups/votes/memberships, so no other table
  needs cleanup). No object-storage cleanup, matching `deleteContestant`'s existing precedent of
  leaving orphaned media objects behind.
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
- **Nav.** The persistent header collapses Home/My Wars/Create War/Log out behind a single
  identity control (avatar + name, top right); logged out shows only Log in. The theme
  picker sits in the nav as a dropdown, always visible, and themes the nav bar itself plus
  the Login and CreateWar pages via a `ThemeContext` that lets WarDetail/VoteMode publish
  their War's own resolved theme up to the nav. Login is a themed, centered panel with
  brand-guideline-accurate provider logos (see the
  google-oauth/facebook-oauth/microsoft-oauth/twitter-x-oauth skills' "Sign-in button
  branding" sections).
- **Editing a draft War.** `PATCH /wars/:id`, `PATCH /wars/:id/contestants/:cId`, and
  `DELETE /wars/:id/contestants/:cId` (all draft-only, creator-only server-side) have a UI
  route, `/wars/:id/edit`, reachable from a draft's own My Wars card. Covers
  title/category/visibility/end date, and each contestant's name, bio, image gallery (add,
  remove, reorder, up to the ten-image cap), and outright removal. Editing an active War
  remains out of scope — the API 403s any PATCH once a War leaves draft, by design.
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
  which also handles theme editing and an **Activate** button. Activate is client-side
  disabled with an inline reason until the War meets the API's rule (≥2 contestants); a
  failure the client-side check didn't catch shows the API's validation messages verbatim.
- **Home Vote/Results entry points.** Home's War cards show no status word (every card there
  is active by construction). Each card carries two direct links, `WarCard`'s
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
- **Activate dirty-check/confirm.** Clicking Activate while the metadata form (title,
  category, visibility, theme, end date) has unsaved edits shows a confirm step
  (`activate-dirty-confirm`) instead of activating immediately, offering **Save changes**
  (submits the form via `EditWarMetadataFormHandle.submit()`, exposed through a
  `forwardRef`, then returns to the Metadata section so the creator sees the result),
  **Discard and activate**, or **Cancel**. The form reports its own dirty state up via
  `onDirtyChange` rather than lifting its field state out, so `EditWar` can gate its sibling
  Activate button without the form giving up ownership of its own fields. Known gap:
  switching the left nav away from Metadata unmounts the form and discards any unsaved
  edits.
- **Carousel paging vs. voting.** `ImageCarousel`'s paging-arrow buttons stop pointer-event
  propagation on `onPointerDown`/`onPointerUp`, not just `onClick` — a real click fires
  pointerdown → pointerup → click in that order, so stopping propagation only on click let a
  click on an arrow also register as a vote tap on the card underneath.
- **Matchup cards are keyed by contestant id.** `MatchupView` keys each `ContestantCard` by
  `matchup.left/right.id`, not position — `ImageCarousel`'s paging state (`currentIndex`)
  lives in the card, so an unkeyed card at a fixed left/right slot would carry a contestant's
  leftover paging index into the next contestant shown at that same slot.
- **Activate no longer requires media (client-side).** `missingForActivation`
  (`EditWar.tsx`) mirrors the API: only "at least 2 contestants" is required, no
  per-contestant image check.
- **Results list.** War detail is one page: `ResultsTable` (`components/ResultsTable.tsx`)
  renders a single rank-ordered `<ol data-testid="rankings-list">` of
  `<li data-testid="ranking-row">` cards — rank is an ordering, not a column value, so a
  list gives each entry native "item N of M" semantics. Row order and identity come from
  `GET /wars/:id/rankings` (never re-sorted, per spec); bio/attributes are joined in from
  `GET /wars/:id`'s `contestants` by id (absent when the two responses' ids don't line up
  yet). Each row carries image, name, bio, and attributes together with wins/appearances and
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
  first, below 900px; at ≥900px the poster sits beside the bio via CSS grid
  (`grid-template-areas: "media content" / "media stats"`), with wins/appearances/win-share
  staying under the bio either way. `.rankings-list` caps at 90rem/1440px and centers itself
  on a wide viewport, with margin above it so the rank badge's overlay never crowds the
  category text or action bar above the list.
- **Results-page Edit/Delete/Vote/Export entry points.** `WarDetail.tsx`'s `ResultsActions`
  shows **Edit** and **Delete** (`war-detail-edit-link`/`war-detail-delete-button`) when
  `war.is_owner && status === 'draft'`; **Vote** (`war-detail-vote-link`) when the War is
  active, the voter is authenticated (`getToken()`), and `GET /wars/:id/my-progress` reports
  `voted < total` — the request is skipped entirely for an anonymous visitor or a
  non-active War rather than firing one the API would 401 anyway; and **Export**
  (`war-detail-export-button`) whenever `war.is_owner`, regardless of status. Delete and
  Export are shared hooks/components (`useDeleteWarFlow`, `DeleteWarConfirmDialog`,
  `ExportButton`, `ErrorMessage`) so `EditWar.tsx` reuses the same Delete confirmation and
  Export button rather than duplicating them.
- **Edit-page Delete.** `EditWar.tsx` has a Delete button (`edit-war-delete-button`) next to
  Activate, same permanence-confirm pattern, navigating to `/my-wars` on success.
- **Action-bar/button consistency; confirmation dialogs are native `<dialog>` modals.** Every
  action row (results page, edit page, both War-card variants) shares two primitives:
  `.action-bar` (`layout.css`, a flex row with a standard gap) and a `.button` class
  (`themes.css`, added alongside every per-theme `button` tag selector) so any element meant
  to look like an action — including a `<Link>` — gets identical treatment to a real
  `<button>`. `DeleteButton.tsx` (mirrors `ExportButton.tsx`) is the one Delete-button
  implementation, reused everywhere. Destructive actions (`.button--danger`: both Delete
  buttons, the delete-confirm dialog's submit, "Discard and activate") get a per-theme
  danger color (`--t-danger`/`--t-danger-text`, picked from each theme's own palette)
  instead of the primary accent, so they read as visually distinct — the modifier rule is
  the last rule in `themes.css` since it ties in specificity with each per-theme `.button`
  rule and source order breaks the tie. `DeleteWarConfirmDialog`,
  `ActivateDirtyConfirmDialog`, and `ActivatePermanenceConfirmDialog` render through a
  shared `Modal.tsx` wrapping a native `<dialog>` — `showModal()`/`close()` synced to a
  `show` prop — giving them positioning, backdrop, focus trap, and Escape handling for free;
  `themes.css` has a `.modal` surface rule (same theme-surface treatment as `.bio-content`)
  and `layout.css` a `.modal::backdrop` rule.
- **Persistent footer.** `Footer.tsx`, rendered once by `App.tsx` alongside `NavBar` (same
  `useActiveTheme` pattern), shows a copyright line and links to the project's GitHub repo
  and to `docs/building-a-war-import.md` (instructions, written for an AI coding assistant,
  for building a War Import feature for a new client).
- **War export.** `src/export/exportWar.ts`'s `buildWarExportZip` builds a zip (via `fflate`)
  containing `war.json` (title, category, visibility, theme, `contestant_schema`, `ends_at`,
  and each contestant's name/bio/attributes — no votes, no `win_count`/`appearance_count`)
  plus each contestant's largest-width media variant under
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
  `POST /wars` (accepts `contestant_schema`), then each contestant via
  `POST /wars/:id/contestants` (accepts `attributes`), then each contestant's images,
  sequentially. On full success the creator lands on the new draft's Edit page; if the War
  was created but a contestant or image failed, the partial draft is left in place with its
  error shown, findable via My Wars like any other draft. No dedicated backend endpoint —
  same client-side-orchestration approach export uses.
- **`war-ui-default/tsconfig.json` has `strictNullChecks` enabled.** Required for a
  boolean-literal-discriminated union (e.g. import's `ok`/`error` result type) to narrow
  correctly — without it, `if (!result.ok) { result.error }` leaves `result` typed as the
  full union.

### Not built

- Video-mode matchups.
- The shared runtime artifact for custom UIs.
- **Editing an active War.** The API rejects any PATCH once a War leaves draft (by design,
  fairness during voting); no UI or API path exists to change anything about a live War short
  of closing it.

---

## Test coverage gaps

- Video mode and three War-expiry scenarios sit unbound in `war-api/specs/features/pending/`
  and describe behaviour that is not built.
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

**SSRF/DNS-rebinding protection.** Nothing in the current codebase fetches a user-supplied
URL, so none exists. If that need returns, recover the address classifier and the
connect-time DNS-rebinding guard from git history rather than rewriting them — both were
correct and non-obvious.

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

`war-spec.md` section 2 still lists "Admin moderation dashboard" as a non-goal, which
this would reverse.
