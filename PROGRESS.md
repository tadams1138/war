# Progress

Where the project stands. `war-spec.md` describes the system as designed; this file records
what exists, what does not, and what is known to be wrong. Update it when something ships.

## Deployed

Staging (staging.war.tmad.dev) and production (war.tmad.dev) each run as a single App
Platform application containing the `war-api` service and the `war-ui-default` static site,
behind Cloudflare. Staging deploys on merge to `master`; production follows behind a
required-reviewer approval. See `war-spec.md` section 12.

---

## war-api

### Built

- **Auth.** Google, Microsoft, Facebook and Twitter/X sign-in, PKCE on every provider. A
  short-lived JWT plus a rotating refresh-token family with reuse detection. All callback
  failure responses are implemented, including `banned`. `GET /auth/me` carries the
  Moderator/Admin flags.
- **Core domain.** Wars, contestants, matchups, voting, rankings. Matchups are generated
  incrementally as each contestant is added and removed with it.
- **War lifecycle.** Status is `draft`, `published` or `closed`. Publish/Unpublish is one
  reversible toggle (publishing needs at least two contestants). `closed` is terminal and
  reached only when the end date passes. Every War field is editable by its creator in any
  status. Clear Votes resets a War's votes and counters. Delete cascades votes, matchups,
  media, contestants, memberships and reports in one transaction (the schema has no
  cascading foreign keys, so the order is explicit) and removes the stored files afterwards,
  best effort.
- **Lazy expiry.** A War reads as closed once `ends_at` passes (`effectiveStatus`), and SQL
  filters agree via `hasEffectiveStatus`. `POST /internal/close-expired-wars`
  (`x-internal-token`, called by the scheduler in `war-infra`) converges the stored column
  with one atomic UPDATE. An expired draft reads as closed only to its creator and Staff.
- **Visibility.** `public` Wars are listed; `unlisted` Wars are kept out of every list and
  are otherwise reached and used like public ones, rankings included. Drafts are invisible
  to everyone but their creator, identically to a missing War. Removed Wars are hidden from
  everyone except Staff.
- **War listing.** `GET /wars` with a caller's-own filter, `sort` (newest, oldest,
  expiring soonest, alphabetical), free-text `q` over title and creator name (trigram
  indexes), and opaque keyset cursors (`limit` 1-100, microsecond-precise cursor, invalid
  cursor or sort mismatch rejected with 400). Shared paging code is `shared/keysetCursor.ts`.
- **Contestants.** Name, markdown bio (the only per-contestant free text), and an image
  gallery. The bio is carried on the next-matchup response, and `GET /wars/:id` carries
  `is_owner`.
- **Media.** Uploads are processed with `sharp` into width variants (WebP) and the original
  is kept privately; per-War share images are cropped to 1200x630 JPEG and replace in place.
  Storage is S3-compatible (`ObjectStorage`, with an in-memory fake for feature tests).
- **Visual theme** per War (`arcade`, `fight_card`, `scrapbook`).
- **Rate limits** (spec 8.4), in-process fixed windows (`shared/rateLimit.ts`): per voter,
  vote casting 60/min and 2,000/day, War creation 10/hour, image upload 100/hour; per
  client address, sign-in start 10/min and token refresh 30/min. Exceeding a limit replies
  429 with `Retry-After`. The address limits are off until `TRUST_PROXY_HOPS` is set (see
  *Known defects and limitations*). The edge adds a coarse auth throttle (see war-infra).
- **Roles and moderation** (spec 3, 6.7, 8.5). Moderator/Admin are account-level flags,
  granted only by an Admin, with a guard against an Admin removing their own role. Any
  voter can report any War; Staff list reports per War, read the unaddressed queue and
  toggle a report's addressed state. Remove a War hides it and deletes its media while
  keeping the audit trail. Suspend blocks War creation. Ban purges the voter's Wars and
  votes, revokes their tokens and blocks sign-in immediately. The War-creation kill switch
  is a single-row platform setting. Every Staff action writes an append-only moderation log
  in the same transaction as the action; the log is keyset-paged and its `target_war_id`
  deliberately has no foreign key.
- **Ban races closed with row locks.** Suspend/Ban lock the target voter `FOR UPDATE`; vote
  casting takes `FOR SHARE` on the voter; both lock the voter before contestant rows.
  `test/integration/voterRowLocking.test.ts` proves each interleaving with two real
  transactions.
- **Staff read endpoints** under `/admin/` (Wars including removed, Voters, a Voter's Wars
  and full vote history), keyset-paged, with effective status and report counts.
  `npm --prefix war-api run explain-admin` seeds a throwaway Postgres and runs
  `EXPLAIN ANALYZE` over the exact repository SQL; it drove the admin and moderation-log
  indexes.
- **Published API contract**, generated from route definitions (`dump-openapi`); a CI guard
  fails when the UI's committed client types drift.
- **Configuration safety.** `assertProductionConfig` refuses to boot with default secrets,
  a missing provider credential, a default or malformed `PUBLIC_BASE_URL`, or default
  `UI_ORIGINS`. Request bodies are schema-validated and violations return the 422
  validation shape.
- **Operations.** Health check, `seed-admin` script for the first Admin
  (`npm --prefix war-api run seed-admin -- <voterId>`), Docker image that compiles `src`
  only.

### Not built / planned

- `video` media mode. The media table's video columns exist and are unused.
- Custom UI registry endpoints. The registry table and the War slug column exist, unused.
- Apple sign-in (see *To revisit*) and linking several providers to one voter.

---

## war-ui-default

### Built

- **Core loop.** Home (published Wars, auth-aware empty state), vote page, War detail with
  results and rankings on one page, My Wars. Finishing every matchup redirects to the
  results page. The results page has a prominent Vote callout, also for anonymous visitors
  (who sign in and return).
- **Vote page.** Tap-to-vote cards that fill the viewport without scrolling at phone width,
  image carousels whose paging does not register as a vote, bios outside the tap target
  (scrollable on narrow screens), unbiased random pairing, and a visible wait (never an
  error) when rate-limited.
- **Results.** One rank-ordered list with image gallery, bio, wins, appearances and a win
  bar scaled to raw wins. Order always comes from the API.
- **Authoring.** Start a War makes an empty draft and goes to `/wars/:id/edit`: metadata,
  theme, visibility (public or unlisted), end date, contestants (name, bio, gallery of up
  to ten images with add/remove/reorder), Publish/Unpublish with confirmation, Clear
  Votes, Delete. Bio is a constrained markdown subset with a toolbar editor and
  sanitized rendering (`marked` + DOMPurify). Failures on remove and reorder show an
  error. Saves show a toast.
- **Share image.** Upload one, or generate a themed 1200x630 "VS" composite from two random
  contestants in the browser; nothing is uploaded until Save.
- **Export and import.** A War exports to a zip (`war.json` plus media, share image
  included) built client-side; import validates the whole file before sending anything,
  then recreates the War through the ordinary endpoints. No dedicated backend endpoint.
- **Lists.** Home and My Wars share one hook: sort, debounced search, Prev/Next over
  cursor-paged results with an in-memory page cache, ten Wars per page.
- **Themes and chrome.** Three visual themes with a per-device, per-War voter override
  (cookie, never synced), a persistent nav with an identity menu (keyboard navigable), a
  brand mark and favicon set, footer, native `<dialog>` confirmation modals, and a
  consistent action bar and danger styling.
- **Admin Dashboard** at `/admin`, gated by `RequireStaff`: kill switch, unaddressed-reports
  queue, Wars list (status filter, search, removed marker), Voters list, moderation log with
  links to the Wars and Voters involved. Staff War detail (`/admin/wars/:id`: standings,
  reports with mark-addressed, Remove War) and Staff Voter detail (`/admin/voters/:id`:
  Wars, vote history, Suspend, Ban, role grant/revoke for Admins only). Destructive actions
  confirm first. Signing in as a banned voter shows a ban message.
- **API client.** `api/client.ts` is built on one request/json/query core: 401 refresh and
  retry, error mapping, 429 classified as rate-limited with `retryAfterSeconds`. Types are
  generated from the API's OpenAPI document.
- **Mock mode.** `npm --prefix war-ui-default run dev:mock` runs the SPA against MSW
  handlers; the service worker is shipped only in mock mode, never in a production build.
  The acceptance suite runs against the mock build.
- **Quality gates.** Strict TypeScript over source, tests and configs, React hooks lint
  rules, cyclomatic complexity as an ESLint error, accessibility attributes (labelled
  dialogs, `role="status"` loading).

### Not built / planned

- Video-mode matchups.
- The shared runtime artifact for custom UIs.

---

## war-infra

### Built

- **Terraform** in three layers: `shared` (container registry, Cloudflare zone settings and
  the zone-wide firewall, rate-limit and cache rulesets), `envs/staging` and `envs/production`
  (compose the modules), and modules for compute (App Platform app, spec ignored), data
  (managed PostgreSQL, pooled connection, firewall), storage (Spaces buckets and CDNs), edge
  (DNS and Workers) and scheduler (cron Worker). Remote state in Spaces.
- **App Platform specs** in `platform/{staging,production}.yaml` are the source of truth for
  the app. They are rendered with `envsubst` and applied by the API pipeline: pinned image
  tag, secrets from GitHub, ingress (`/api/v1` to the API, the rest to the static UI),
  health check, and a `PRE_DEPLOY` migration job that makes a failed migration abort the
  deploy.
- **Edge Workers** in `edge/`: `media-router` (`/media/*` to the Spaces CDN, one-year cache
  on content-addressed keys), `ui-router` (`/ui/<slug>/*` custom UI bundles with SPA
  fallback), `og-tags-router` (per-War link-preview tags on `/wars/:id` only), and
  `scheduled-tasks` (cron Worker that calls the internal expiry endpoint and fails the
  invocation when a task fails).
- **Edge rules.** Block `/api/v1/internal/*` and `/media/originals/*`; one rate-limit rule
  on `/api/v1/auth/*` (10 requests per 10 seconds per address and colo, the Free-plan
  limit); no caching of API responses except rankings.
- **Pipelines** in `.github/workflows/`: `api.yml`, `ui-default.yml`, `infra.yml`,
  `openapi-contract.yml`, `concurrency-groups.yml`, `ui-custom.yml`,
  `push-bootstrap-image.yml`. Each deploy runs `war-infra/scripts/smoke-test.sh` afterwards.
- **`tools/concurrency-groups`**, a small tested checker that fails the build when two
  workflows share a concurrency group.
- **Alerts** on the App Platform app: CPU, memory, restart count, failed deployment,
  failed domain.

### Not built / planned

- Monitoring and alerting beyond the App Platform alerts above: no error tracking, no
  latency or error-rate alerts, no alert on failed scheduled runs, no retry on a failed
  scheduled run (spec 12.7 describes the target state).
- A custom UI registry and the runtime artifact (with the API and UI items above).
- Edge Workers have no test harness.

---

## Test coverage

| Project | Size | Notes |
|---|---|---|
| war-api | 57 test files, about 1,200 tests (23 Gherkin step files, 14 integration files, unit tests) | One Postgres per run via Vitest `globalSetup`; the full suite takes about 3 minutes |
| war-ui-default | about 200 unit tests (22 files), 272 acceptance tests | 14 tests (`create-war`, `import-war`, `theme-switching`) execute their Gherkin steps through playwright-bdd. The other 258 are bound by title to a Playwright test, enforced by `tests/bindings`. See *In progress* |
| war-infra | `tools/concurrency-groups` unit tests only | No runner for the infra scenarios |

Pending scenarios (no binding, nothing runs):

- `war-api/specs/features/pending/media-mode.feature`: 8 video-mode scenarios.
- `war-ui-default/features/pending/video-mode.feature`: 4 video-mode scenarios.
- `war-infra/specs/features/pending/routing.feature`: 32 routing, edge and pipeline scenarios
  with no runner, since the project has no scenario harness.

Every test labels its Arrange, Act and Assert phases.

---

## Known defects and limitations

- **Address rate limits are off until `TRUST_PROXY_HOPS` is verified.** The sign-in and
  token-refresh limits (per client address) only activate when `TRUST_PROXY_HOPS` is set.
  The platform specs do not set it. Set it per environment only after confirming the real
  hop count between the internet and the API (Cloudflare plus App Platform); a wrong value
  would either throttle everyone as one address or trust a spoofable header. Until then the
  edge's coarse auth rule is the only address-keyed protection.
- **Rare-term search tradeoff.** The `q` predicate (`title ILIKE` or creator id from an
  up-front name subquery) made a rare-term admin search about 30x faster (41 ms to 1.2 ms)
  and a common creator-name search slower (1.1 ms to 8.9 ms). Accepted. A `UNION` form did
  worse on common terms. The public `GET /wars` plan is not covered by `explain-admin`.
- **Unlisted rollout window.** The rename of `invite_only` to `unlisted` is a data
  migration run `PRE_DEPLOY`; until the new revision takes traffic the previous revision
  reads rows holding a value it does not know. An old `invite_only` value is now rejected
  with the usual validation error, and the public list allow-lists `public`, so unknown
  values are never listed.
- **Admin indexes are built without `CONCURRENTLY`**, so each build locks writes to its
  table. Fine at the current size; not for a large `votes` table later.
- **Edit War contestant forms.** Unsaved name and bio edits in a contestant's editor, and in
  the add-contestant form, are discarded when the creator selects another pane. The War
  metadata form keeps its unsaved edits.
- **Share-image theme port.** The generated share image reproduces each theme's `VS` badge
  as Canvas paths, kept in sync with the CSS by hand.
- **S3 integration test image.** `test/integration/s3ObjectStorage.test.ts` runs against an
  `adobe/s3mock` container because `minio/minio` refuses anonymous pulls.
- **Best-effort storage cleanup.** After a delete, Remove or Ban, a storage failure is
  logged and leaves orphaned objects; the request still succeeds.

---

## Operational prerequisites

- **Provider apps and redirect URIs.** Google, Microsoft, Facebook and Twitter/X apps must
  all be registered, with client secrets set in GitHub and each environment's redirect URI
  registered by hand with the provider, before a deploy reaches that environment:
  `assertProductionConfig` refuses to boot with any of the four unconfigured. Bring staging
  up first, confirm all four buttons work end to end, then production.
- **Provider verification** is a manual step in each provider's console. Google, Microsoft
  (Entra publisher/domain verification) and Twitter/X (developer app review) are verified.
  **Facebook is pending owner action:** App Review for the Login product is blocked until a
  verified business account exists.
- **`seed-admin` runs once per environment** to create the first Admin
  (`npm --prefix war-api run seed-admin -- <voterId>`, with `DATABASE_URL` pointing at that
  environment's database and dev dependencies installed). Nothing else grants the role,
  since the grant endpoint is Admin-only.
- **Migrations** in `war-api/db/migrations/` run as the `PRE_DEPLOY` job on every deploy.
  The admin-era ones: `20260111` roles and abuse reports, `20260111` trigram search indexes,
  `20260112` moderation log, `20260113` kill switch, `20260114` War `removed_at`, `20260115`
  voter suspension and ban, `20260116` and `20260117` admin and moderation-log indexes,
  `20260118` NOT NULL enforcement, `20260119` `invite_only` renamed to `unlisted`.
- **`TRUST_PROXY_HOPS`** per environment, as above.
- **GitHub environments** `staging` and `production` carry `DO_APP_ID` and
  `PUBLIC_BASE_URL`; `production` has the required reviewer. Repository secrets and variables
  are listed in the header of `.github/workflows/api.yml`.

---

## In progress

- **UI Gherkin migration: title-bound scenarios to executed steps (playwright-bdd).** Paused
  after 3 of 17 feature files. Both styles run side by side and the suite passes.
  `docs/ui-gherkin-migration.md` has the status, conventions, per-feature procedure and the
  ordered backlog of the remaining 14 features. Next: `share-image`.

---

## To do

- Hide Facebook login feature until facebook business verification can be completed.
- Disable Prev and Next buttons on war dashboard when there are no previous or next wars to
  display.

---

## To revisit

- **Apple sign-in.** Out of scope until a paid Apple Developer Program membership ($99/yr)
  exists for this project; the remaining question is that cost, not design. The client
  secret is an ES256-signed JWT (`iss` the team id, `sub` the client id, signed with a `.p8`
  key and re-signed per exchange, since Apple caps its lifetime at six months). There is no
  userinfo endpoint, so identity is `sub` from the id token alone. `openid` scope only
  (no `name`/`email`) keeps the callback an ordinary GET instead of `form_post`. It slots
  into the same provider abstraction as the other four.
- **SSRF and DNS-rebinding protection.** Nothing fetches a user-supplied URL today, so none
  exists. If that need returns, recover the address classifier and connect-time
  DNS-rebinding guard from git history rather than rewriting them.
