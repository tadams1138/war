# War — Platform Specification

**Status:** Draft

This is the complete functional specification for the War platform. It describes *what the
system does*, not how any particular implementation achieves it. Concrete technology
choices, project layout, and build commands live in `CLAUDE.md`; what has actually been
built lives in `PROGRESS.md`.

Request and response payload shapes are deliberately absent. They are settled during the
TDD/BDD cycle against the rules stated here.

---

## 1. Overview

War is a web-first, mobile-compatible social voting platform. Authenticated users take part
in **Wars** — themed campaigns where a set of contestants is ranked through head-to-head
binary matchups. The result is a crowd-sourced leaderboard driven by pairwise comparison.

Pairwise comparison forces deliberate choices and produces statistically stronger rankings
than single-click polls.

The system is **API-first**. One backend holds all business logic and is the sole authority
over what any identity may do. Every client — the default web UI, per-brand custom UIs, and
future mobile apps — is thin: it renders what the API returns and submits user actions back
to it.

---

## 2. Goals & Non-Goals

### Goals

- One API layer serving web and future mobile clients identically
- Multiple OAuth providers, each producing a unique, non-mergeable voter identity
- Campaigns configurable with image-rich or short-video contestants
- Per-campaign contestant fields, so a pageant and a primary are served by the same code
- Binary matchups served one at a time, with choices persisted in full
- A win-count leaderboard readable by anonymous and authenticated users alike
- A tamper-evident vote audit trail

### Non-Goals

- Real-time leaderboard streaming — polled refresh only
- Push notifications
- War creator moderation tools (removing voters, resetting votes)
- Admin moderation dashboard
- Vote tamper-detection analytics — the data is collected; the tooling is future work
- Paid or promoted Wars
- Weighted votes; all voters are equal
- Changing a vote once cast
- Comments or reactions
- Linking multiple OAuth providers to one account
- Hosting or transcoding video — video contestants embed third-party players only
- Mixing images and video within one campaign
- ELO or Borda scoring; raw win counts only

---

## 3. Users & Roles

| Role | Capabilities |
|---|---|
| **Anonymous Visitor** | Browse and view rankings of public Wars; cannot vote |
| **Voter** | Authenticated; may join Wars, cast votes, view rankings |
| **War Creator** | A Voter who created a specific War; manages it through its lifecycle |

"War Creator" is a relationship to a particular War, not an account type. A Voter becomes
one by creating a War.

A Voter may act through any client interchangeably — the default UI or a custom UI. Each is
a different route to the same identity, and the API is the sole authority over what that
identity may do.

---

## 4. Domain Model

### War

A named voting campaign, owned by its creator.

| Attribute | Notes |
|---|---|
| Title | Required |
| Category | Optional; used for filtering |
| Status | `draft` → `active` → `closed` |
| Visibility | `public` or `invite_only` |
| Media mode | `image` or `video`; fixed for the War's lifetime |
| Contestant schema | Ordered field definitions (below) |
| End date | Optional; closes the War when reached |
| Custom UI slug | Optional; selects a registered custom UI |

A War is created as a draft. All configuration is editable in draft only. Activation
generates its matchups and makes it votable. Closing ends voting; rankings remain readable.

**Effective status.** An end date is enforced *lazily, on every read and write*. A War is
treated as closed the instant its end date passes, regardless of its stored status. A vote
cast one second later is rejected, and the War reports itself as closed. A scheduled task
converges the stored value so list queries can filter on an indexed column, but correctness
never depends on that task having run — a missed run degrades query efficiency and reporting
freshness only.

### Contestant

A participant in a War: a name, an optional bio, media appropriate to the War's media mode,
and values for the fields the War's schema declares.

### Contestant Schema

Different campaigns describe contestants with entirely different facts. A pageant needs
country, age and height; a presidential primary needs party, state and office. These are not
two layouts of the same data — they are different fields.

A War therefore declares an **ordered list of typed fields** at creation, and each contestant
supplies values for them. The same rendering code serves every campaign; there are no
per-campaign templates, layout variants, or branching.

| Rule | Value |
|---|---|
| Maximum fields per War | 12 |
| Field key | Lowercase identifier, starting with a letter, ≤ 32 characters |
| Field label | ≤ 64 characters |
| Field type | string · number · text · url · date |
| Editable | Draft only |

Every field is optional; a contestant may omit any of them. Order comes from the schema,
never from the contestant. Values are rejected at write time if a key is not in the schema
or a value's type does not match its declaration; length limits apply per type.

**All values render as text and are never interpreted as markup.** `url` is the sole
exception: it renders as a link, and any value whose scheme is not `http` or `https` is
rejected at write time, so a script-scheme URL never reaches storage.

This changes what data a contestant carries, not how it looks. Radically different
presentation is what custom UIs are for.

### Media Mode

A War declares at creation whether contestants are presented as **images** or as **embedded
video**. The mode is fixed and applies to every contestant.

| Mode | Contestant media | Presentation |
|---|---|---|
| `image` (default) | 1–10 ordered images; the first is primary | Two cards side by side, each browsable through that contestant's images |
| `video` | Exactly one embedded video | Two players; one plays, then the other |

**Mixed media within a War is not permitted.** A matchup pairing a video against a
photograph has no coherent presentation. Activation fails if any contestant's media does not
match the War's mode.

Mode affects presentation only. Matchup generation, pair selection, side randomisation, vote
recording and ranking are identical in both modes.

### Matchup

An **unordered** head-to-head pairing of two contestants. A War with `n` contestants has
`n(n−1)/2` matchups, generated atomically on activation and immutable thereafter.

A pairing has no direction: **A vs B and B vs A are the same matchup.** This is enforced
structurally by storing the two contestants in a canonical order, so a mirrored duplicate
cannot exist and a voter cannot accumulate one vote for each side of the same pair.

Which contestant is *displayed* on which side is a separate, per-voter presentation concern
and carries no meaning.

### Vote

A voter's pick in a matchup — **immutable and final**. One vote per voter per matchup,
structurally enforced. There is no supersede mechanism and no way to change a decided vote.

Each contestant carries two counters, maintained in the same transaction as the vote:

| Counter | Meaning |
|---|---|
| Win count | Votes where this contestant won |
| Appearance count | Votes cast on any matchup containing this contestant |

Because votes are immutable, both counters increase monotonically and never need
recomputation. They drive both pair selection and rankings.

### Other entities

- **Voter** — an identity, unique per (provider, provider account id), carrying a display
  name and avatar where the provider supplies them.
- **War membership** — records that a voter has joined a War.
- **Refresh token** — a session credential, grouped into families (below).
- **Custom UI registration** — maps a slug to the location of its bundle.

---

## 5. Identity & Authentication

### 5.1 Sign-in

OAuth is the only way to sign in, across four providers: Google, Microsoft, Facebook, and
Twitter/X. Apple is designed for and reachable without structural change.

- Each (provider, provider account id) pair maps to exactly one voter
- Providers may not be linked to one another; the same person signing in through two
  providers is two voters
- First sign-in creates the voter; later sign-ins return the existing one

**No credential ever appears in a URL** — not in the path, query, or fragment. The callback
sets the refresh token as an `HttpOnly` cookie and redirects carrying nothing; the client
then exchanges that cookie for its first access token. A fragment is not sent to servers but
still lands in browser history and is readable by any script on the page, so one extra
request removes the exposure entirely.

The callback must exchange the provider's authorization code using the callback URL exactly
as the provider sent it, never a reconstruction carrying only the code. Providers send
additional parameters — at minimum an issuer identifier — that the exchange validates, so a
reconstructed URL fails.

**Every sign-in is bound to the browser that started it.** Alongside the anti-forgery state
value, each login attempt generates its own single-use secret — a *code verifier* — held
server-side in the same `HttpOnly` cookie manner, never exposed to page scripts. Only a
cryptographic derivative of it, the *code challenge*, accompanies the authorization request;
the verifier itself is presented at the code exchange, which proves the exchange comes from
the same client that began the flow. An intercepted authorization code is therefore useless
on its own. A verifier missing at the callback is treated exactly as a state mismatch, since
both cookies are set and cleared together and neither half is safe to exchange without the
other.

**Callback failures are distinguishable, and never surface an upstream library's internal
error text.** Checked in order, each short-circuiting the rest:

| Condition | Response |
|---|---|
| The provider reports an error (including a declined authorization) | Forbidden, carrying the provider's own reason verbatim |
| No authorization code present | Bad request |
| Anti-forgery state is missing or does not match | Bad request |
| The code exchange with the provider fails | Bad gateway |
| Otherwise | Redirect to the UI, no credential in the URL |

The provider-error check runs before the state check and does not require state to match:
nothing sensitive happens on that branch, and reporting the provider's actual reason is more
useful than reporting a coincidental mismatch. Failures *after* a successful exchange — the
voter upsert, token issuance — are this platform's own faults and are not laundered into
provider-flavoured errors.

Failure responses are returned directly rather than redirecting to a UI error page.

### 5.2 Session tokens

A successful sign-in issues a short-lived **access token** (one hour) and a long-lived
**refresh token** (thirty days). Protected endpoints require the access token as a bearer
credential. Refresh tokens are stored hashed and never in plaintext, so they can be revoked.

The refresh cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and scoped to the auth path.
`Lax` is what makes refresh safe from cross-site forgery — browsers omit such cookies on
cross-site POST — and the API additionally rejects a refresh whose origin is not a
registered UI origin. `Strict` would break the cross-site top-level navigation the provider
performs on the way back.

**Rotation with reuse detection.** Every refresh invalidates the presented token and issues
a successor. Tokens are grouped into a *family* per sign-in session.

- Each token is single-use
- Presenting an **already-used** token means it leaked and two parties now hold it: the
  entire family is revoked immediately and the voter must sign in again
- Presenting a revoked or expired token fails
- Signing out revokes the whole family

Without reuse detection a stolen thirty-day token grants a year-round silent session with no
signal that anything is wrong. That is what makes rotation worth its complexity.

---

## 6. Platform Capabilities

The API is versioned, returns JSON only, renders no HTML, and holds no server-side session
state. It accepts requests from registered UI origins. List endpoints are cursor-paginated.
The API publishes its own machine-readable contract, generated from its route definitions
rather than hand-maintained, so it cannot drift from the implementation; clients generate
their types from it.

### 6.1 Wars

Browse, create, read, update, activate, close, and join.

**Browsing** is filterable by status and category. Absent an explicit request for the
caller's own Wars, the list **never** includes a draft War or an invite-only one, regardless
of any status filter supplied — asking for drafts returns an empty list rather than someone
else's. Being authenticated grants no extra visibility on its own. With no status filter at
all the default is active Wars only. This scoping belongs in the data-access layer, not in a
route handler, so that every caller inherits it and no future entry point can bypass it by
forgetting to apply it.

**A voter may list their own Wars** across every status, drafts and invite-only included.
This requires authentication and is the only thing that widens visibility.

**Creation** requires a title. Category, visibility, media mode, contestant schema and end
date are optional, with documented defaults. The War is created as a draft owned by the
authenticated voter.

**Activation** requires at least two contestants, and every contestant to have media matching
the War's mode — a War cannot go live with a contestant no voter can see. It generates every
matchup atomically. Only the creator may activate, and only from draft.

**Joining** records the voter's membership. Voting requires it.

### 6.2 Contestants and media

Contestants may be added, updated and removed while the War is in draft, by its creator only.
Attribute values are validated against the War's schema (§4). Responses carry attributes
already resolved against that schema — label, type and value together, in schema order — so
clients need not fetch the schema separately and cannot render fields out of order.

**Images.** Up to ten per contestant, ordered, the first being primary. Uploads are rejected
if the War is in video mode, if no file is present, if the limit is exceeded, or if the bytes
are not a readable image. New images append; ordering is editable in draft.

**Video.** Exactly one per contestant, rejected if the War is in image mode or the contestant
already has one. See §9.2 for validation.

### 6.3 Matchups and voting

Every voter is served **every pair** in the War, in a randomised order, and is never served a
pair they have already decided. When all pairs are decided, the endpoint reports completion.

A voter is under no obligation to finish. Unvoted pairs are simply absent from the data;
abandoning midway is expected, not penalised, and produces no record of any kind.

**Pair selection.** The next pair is the voter's undecided pair whose two contestants have
the **lowest combined appearance count**, ties broken by a per-voter deterministic shuffle
derived from the matchup and voter identities.

This keeps every contestant's appearance count near-equal across the War, which is what makes
raw win counts a correct ranking (§7). Without it, an over-shown contestant accumulates wins
purely from exposure. The shuffle must be *stable* — identical every time for a given voter —
so the sequence survives reconnects and device changes; a random function evaluated per
request would reshuffle on every call.

**Side randomisation.** Which contestant appears on the left is decided by the API, derived
from the same stable hash so a refresh does not swap the cards, and **the side shown is
recorded on the vote**. Position bias is real and measurable in pairwise voting; recording the
side is the only way the audit trail can ever detect it. Clients must render the order the API
returns and must never reorder it.

**Prefetch.** The response also names the media of the pair that *would* be served next, so
clients can warm it while the voter decides. It is advisory: because selection depends on
counters other voters are changing concurrently, the prefetched pair may not be the one
actually served. A miss costs a wasted request, never a wrong pair. In video mode it carries
poster images only — prefetching a second player for a matchup that may never be shown is
not worth it.

**Casting a vote.** The winner must be one of the pair's two contestants. The War must be
active by effective status, and the voter must have joined.

**A vote is final.** A second attempt naming the *same* winner succeeds and changes nothing —
this makes the endpoint idempotent without an idempotency key, so a client retrying after a
dropped connection succeeds rather than erroring. A second attempt naming a *different*
winner is rejected and changes nothing.

The vote insert and both counter increments occur in one transaction.

**Progress** is reported as the voter's decided count against the War's total pair count —
the full pair count, not a per-voter sample.

### 6.4 Rankings

A public leaderboard per War, readable without authentication for public Wars and restricted
to members for invite-only ones.

Each row carries the contestant, its rank, its win count and its appearance count.
Appearances are shown for transparency: they let a viewer confirm contestants have been shown
comparably often, which is the assumption the ranking rests on.

Responses are cacheable for about thirty seconds, matching the UI's poll interval, so many
concurrent viewers collapse to roughly one origin query per interval per edge location.
Invite-only rankings are marked private so they are never held in a shared cache.

### 6.5 Custom UI registry

A read-only registry mapping a slug to the location of its bundle. Registration is an
administrative operation: a registry record plus a file upload. It provisions nothing — no
bucket, no origin, no routing rule, no redeploy.

### 6.6 Internal and scheduled operations

Endpoints reserved for the scheduler, never called by clients. They accept no user
credential, require a shared secret, are blocked at the edge for every other caller, and are
excluded from the published contract.

The only such task closes Wars whose end date has passed. It is idempotent — safe to run
repeatedly, concurrently, and after arbitrary delay — and changes no observable behaviour,
because effective status (§4) already treats those Wars as closed.

---

## 7. Scoring

Contestants are ranked by **raw win count**, descending.

- Ties break by appearance count *ascending* — the same wins from fewer showings ranks higher
- Then alphabetically by name
- Contestants with no appearances are listed last, unranked
- Read from the maintained counters, never by scanning the vote history

### Why raw wins, and what it depends on

Every contestant appears in exactly `n − 1` pairs. If every voter decided every pair, every
contestant would have an identical appearance count, and ranking by win count, by win
percentage, or by any confidence-adjusted variant would produce the **identical order** —
percentages would be wins over a constant.

Voters abandon midway, and rankings are shown while a War is still active, so the data is
always partial. Partial data is not itself a problem: because pair order is randomised, every
contestant has equal *expected* exposure, and raw win count is unbiased.

The risk is variance, not bias. In a sparse early War one contestant may be shown thirty times
and another three by luck alone, and the over-shown one accumulates more wins for no merit.

**This is corrected at selection time, not display time.** Exposure-balanced pair selection
(§6.3) keeps appearance counts near-equal, restoring the equal-denominator condition that
makes raw wins exact. The alternative — random selection corrected by percentages or a
confidence bound at display time — was rejected: percentages let a 3-for-3 contestant outrank
a 320-of-400 one, and a confidence-adjusted sort displays a number that is not the sort key,
which reads as a bug.

Ranking therefore stays a plain, explainable count of head-to-heads won, and the correction
lives where it cannot be seen.

**Invariant worth monitoring.** Appearance counts should stay tightly clustered across a
War's contestants. A widening spread means selection is not balancing and the ranking's core
assumption is weakening.

---

## 8. Vote Integrity, Abuse Prevention & Audit

### 8.1 Votes are immutable

Vote history is append-only. No record is ever updated or deleted, and there is no supersede
mechanism. Three mechanisms together guarantee a voter cannot contribute conflicting votes on
one pairing:

| Mechanism | Prevents |
|---|---|
| Canonical contestant ordering within a matchup | A vs B and B vs A existing as separate matchups |
| One vote per voter per matchup, structurally enforced | Two votes by one voter on the same pair |
| Decided pairs excluded from selection | A voter being offered a decided pair again |

The first is the important one: it makes the failure mode structurally impossible rather than
merely guarded against. Since a mirrored pairing cannot exist, a voter cannot pick A in
"A vs B", later pick B in "B vs A", and leave both contestants with a win.

### 8.2 Non-votes are not recorded

A pair the voter never decided leaves **no trace** — no skip, no abstention, no timestamp. A
voter who loses connectivity, closes the tab, or simply stops is indistinguishable from one
who never reached that pair, and neither affects any counter.

There is consequently **no skip action anywhere in the platform**. The only way to leave a
pair undecided is to not vote on it.

### 8.3 Audit trail

Every vote retains the voter, the matchup, the winner, the side each contestant was shown on,
and the time. Because votes are immutable, this is a complete and tamper-evident record.

The recorded side exists specifically to make **position bias** measurable: if winners
correlate with the side they were displayed on, the ranking is picking up an interface
artefact rather than preference. That signal is unrecoverable if a client shuffles sides,
which is why the decision belongs to the API.

Retained for future audit tooling — coordinated voting, timing anomalies, position bias. The
tooling itself is out of scope.

### 8.4 Rate limiting

A pairwise voting platform is precisely the kind of thing people will script. The audit trail
lets abuse be *detected* after the fact; rate limiting makes it expensive up front.

Limits are enforced in **two layers**. The edge sheds volumetric abuse before it reaches the
origin; the API enforces per-identity limits the edge cannot see, because the edge does not
decode credentials.

| Scope | Limit | Keyed by |
|---|---|---|
| Vote casting | 60 / minute | Voter |
| Vote casting, sustained | 2,000 / day | Voter |
| Sign-in start | 10 / minute | Client address |
| Token refresh | 30 / minute | Client address |
| War creation | 10 / hour | Voter |
| Image upload | 100 / hour | Voter |

**Authenticated limits key on identity, not address.** Address-keyed limits punish shared
networks — a school or office voting in the same War would throttle each other — while barely
inconveniencing an attacker with a proxy pool.

The vote limit sits well above human pace: at roughly three seconds per decision a fast voter
reaches about twenty a minute, so the limit only bites on automation.

Throttled responses always carry a retry delay, which clients surface as a wait, never as a
failure. Where limit counters are held in process, effective limits scale with instance count
— acceptable while instance counts are fixed, and the reason the ceilings are conservative. A
shared counter store becomes necessary before autoscaling.

**Address-keyed limits require correct client-address resolution.** Behind a reverse proxy
the address the application sees is the proxy's unless the proxy hop count is configured. If
it is not, every client behind the same hop shares one bucket — better than no limit, but not
per-client accuracy. See §12.2.

---

## 9. Media Handling

### 9.1 Images

Uploaded images are **never served as uploaded**. On upload the platform validates type and
size (up to 10MB; JPEG, PNG, WebP), re-encodes to a modern format at three widths preserving
aspect ratio and never upscaling, **strips all metadata** — phone photos routinely carry GPS
coordinates and device identifiers — and retains the original privately so widths can be
changed later without re-uploading. Originals are never publicly reachable.

Wherever a contestant appears in a response it carries an **ordered media array**, its
contents depending on the War's media mode. Clients render what they are given and never
construct media URLs themselves. Each image carries its aspect ratio so clients can reserve
space before it loads, and the set of available widths so a client can let the browser choose.
A width is omitted when the source was narrower than it.

Processing is synchronous within the upload request; bulk uploads happen in draft, where
latency is tolerable.

**Why this matters.** Serving a multi-megabyte original to a phone showing two cards side by
side is simultaneously the worst experience and the largest line on the bandwidth bill — image
delivery is the dominant traffic driver for the whole platform. A small variant is typically
two orders of magnitude smaller than an unprocessed upload.

### 9.2 Embedded video

In video mode a contestant is one short video hosted **elsewhere**. The platform stores a
reference and never stores, transcodes, or serves video bytes.

Providers are a **short allow-list** — currently YouTube and Vimeo. Both expose a player with
a reliable playback-ended event, which sequential playback depends on. An arbitrary URL in a
frame gives no such event, and embedding arbitrary third-party origins is an exposure with no
upside. YouTube is embedded through its no-cookie domain, which suppresses tracking for
viewers who never press play.

**Validation happens at add time, not play time**, so a creator learns their video cannot be
embedded while still in draft rather than after voters hit a dead player mid-War. The URL is
parsed against the allow-list, the video is resolved through the provider's metadata endpoint
— a failure meaning private, deleted, or embedding-disabled — and the platform stores a
**provider and an identifier, never the submitted URL or an embed URL**. The client builds the
player URL from its own allow-list, so a compromised or mistaken stored value cannot cause an
arbitrary third-party frame to load.

An optional clip window lets a creator point at a segment of a longer video; both providers
enforce it natively.

| Limit | Value |
|---|---|
| Maximum effective duration | 60 seconds |
| Recommended | ≤ 20 seconds |

**Video changes the economics of the platform.** An image matchup takes about three seconds
to decide; a video matchup takes twice the video length, because both must play. At twenty
seconds each that is about forty seconds per matchup — a 23-contestant War is roughly thirteen
minutes in image mode and nearly three hours in video mode.

Partial completion is already expected, so this breaks nothing, but a video War gathers votes
an order of magnitude more slowly per voter. Two consequences: exposure-balanced selection
matters far more, because far fewer pairs get decided; and video Wars should be created with
few contestants. The platform does not enforce a lower cap, but creation interfaces should
steer toward one.

**Availability is not guaranteed.** A third-party video can be deleted or made private after
validation. When a player reports it unavailable the client shows an unavailable state and
**still allows the vote** — blocking it would let one broken link stall every matchup that
contestant appears in.

---

## 10. Default Web UI

A **fully static** single-page application, built at compile time and served from a CDN. No
server-side rendering, no server. All data comes from the API at runtime; the UI contains no
business logic and performs no ranking arithmetic.

Access tokens are held **in memory only** — never in browser storage. The refresh token lives
in the `HttpOnly` cookie the API sets and is never readable by script.

Request and response types are **generated from the API's published contract**, not
hand-written, and regenerated by a documented command. Continuous integration fails if
regenerating produces a diff, so an API change this UI has not absorbed is caught before merge
rather than in staging. The same generated document drives the mocks acceptance tests run
against, so those tests exercise real shapes rather than believed ones.

### 10.1 Routes

| Route | Purpose | Authenticated |
|---|---|---|
| Home | Browse active public Wars | No |
| War detail | Overview and contestant gallery | No |
| Vote | Binary matchup voting | Yes |
| Rankings | Leaderboard | No |
| Create War | Creation wizard | Yes |
| My Wars | The voter's own Wars, every status | Yes |
| Sign in | Provider selection | No |
| Auth callback | Exchanges the refresh cookie for a token, then returns the voter where they were going | No |

Routing is client-side; the hosting layer serves the application shell with a success status
for any unmatched path so deep links work. An unauthenticated visit to a protected route
redirects to sign-in carrying the intended destination, and returns there afterwards.

**Every route renders beneath a persistent navigation header**, rendered once by a shell
wrapping the whole route tree rather than added page by page — a page that forgets it is then
not a possible failure mode.

### 10.2 Navigation

Content depends only on whether the visitor is authenticated; there is no partial or
transitional state.

- **Anonymous:** Home and sign-in. No links to authenticated destinations — offering an action
  that only ends in a redirect is friction the header exists to remove.
- **Authenticated:** Home, My Wars, Create War, the voter's identity, and a sign-out control,
  always together.

**Create War is a top-level action**, not something reached through My Wars — the tradeoff
being a second top-level item rather than a leaner header. My Wars remains a separate
destination for *reviewing* Wars.

Identity comes from the voter's profile, fetched once per session rather than per navigation.
A missing display name renders a fixed fallback, never a blank or the literal word "null". A
missing avatar renders no image and no placeholder. **If the profile fetch fails entirely, the
full navigation still renders** — only the identity slot falls back. A failed profile fetch
never blocks navigation.

The current route is marked as such; on a route the header has no link for, none is marked.
The header is a labelled landmark so assistive technology can jump to it, every link is
keyboard reachable, and the sign-out control is a real button because it performs an action
rather than navigating.

### 10.3 Voting interface

Two contestant cards side by side.

- Cards show image and name **only** — attributes belong on the detail page. Voting is a fast
  binary choice and extra text slows it down
- Images use the width set the API supplies, sized for two cards sharing the viewport, so a
  phone downloads a small variant rather than a large one
- Space is reserved from the supplied aspect ratio so cards do not shift as images load —
  layout shift under the tap target causes mis-votes
- The next pair's media is prefetched while the voter decides
- **The API decides left and right.** The order is rendered verbatim and never shuffled,
  sorted or reordered; doing so destroys the position-bias signal
- Tapping a card casts the vote; both cards disable while it is in flight, then the next pair
  loads automatically
- **Votes are final.** A voter is never served a decided pair, so there is no path back to
  one. A conflict — reachable only from a stale tab or double submit — advances rather than
  showing an error, because the vote it conflicts with is the voter's own
- There is no skip or abstain control

**Multiple images** are browsable within a card. Horizontal swipe browses; tap votes. **These
must not be confusable**: a gesture becomes a swipe past a small threshold, and a swipe never
casts a vote however it ends. A mis-fired vote is unrecoverable, so ambiguity resolves toward
swipe, never toward vote. Arrow controls accompany the indicators for pointer and keyboard
users, and the card remains a single tab stop. Non-primary images load lazily — a
90-contestant War with ten images each is thousands of objects, and eagerly loading both
cards' full sets would multiply per-matchup transfer roughly tenfold for images most voters
never look at.

**In video mode** the two cards hold players and play one after the other: both start paused
showing posters, the voter presses play once for the pair, the first plays, the second starts
automatically, and both cards become selectable when it ends. Because side assignment is
already randomised per voter and recorded, which video plays first is randomised too and
recoverable from the same record — order-of-play bias is measurable with machinery that
already exists.

Voting stays disabled until both have played once, with a replay control always available.
Enabling it earlier would let voters decide before seeing the second contestant at all.

**Autoplay is not guaranteed** — browsers block programmatic playback absent a user gesture,
and mobile browsers are stricter about how far one gesture carries. The chain must degrade
rather than stall: if starting the second video is refused, show a play control and wait.
Never leave a voter looking at a paused player with no way forward. Players are created only
for the current matchup and destroyed when it is replaced.

### 10.4 Other pages and components

**Progress** shows decided against total pairs. For large Wars that number is high by design
and finishing is not expected; copy should frame progress as contribution rather than an
unfinished task, and must never imply a partial contribution is wasted.

**Rankings** render rank, image, name, wins and appearances exactly as returned, with no
percentages computed or displayed. The board polls while the War is active. **A failed poll
does not clear an already-loaded board** — it leaves the last good data on screen, shows no
error, and keeps polling; the board recovers on its own. This does not apply to the *initial*
load, where there is no last-good board to fall back on and the standard error state applies.
Unranked contestants appear at the bottom with a dash.

**War cards** summarise a War: title, category, status, contestant count, and time remaining
where an end date is set. Time remaining renders "Ended" at or past the end date, whole days
rounded up at a day or more, and whole hours rounded up below that with a one-hour floor — so
a War ending in minutes reads "1 hour" rather than "0 hours" or a misleading "1 day".

**Home** browses active public Wars. Its empty state is **auth-aware**: an anonymous visitor
is told to check back, since waiting or signing in really are their only options; an
authenticated voter is invited to create one and given a link, because they are the one
visitor who can *make* an active War exist. Telling them only to check back is not merely
unhelpful, it omits the one action they have.

**The creation wizard** calls the API at each step rather than staging everything for one
final submit — the wizard has no draft of its own, because the War it is building *is* the
draft. Partway abandonment leaves an unreachable draft behind at no cost. Steps: metadata,
then contestants with their images, then review, then activate. Review lists what the wizard
already holds, showing whether each contestant has an image rather than the image itself.
Activation failures show the API's own validation messages, which name exactly what to fix,
rather than generic error copy — these are addressed to the creator mid-wizard, and only the
creator ever reaches them.

**My Wars** lists every War the voter created, most recent first, each as a full war card
including status — a creator needs status at a glance to tell a draft from an active or closed
War. Selecting one opens its detail page. This page adds no edit, resume, or delete
affordance; reaching a draft again does not change what can be done with it. Its empty state
links to the wizard.

Both empty-state links to the wizard remain even though the header also carries one. An empty
state is a page's *entire* visible content at that moment, and the one visitor with something
to do there should find that action in the content rather than having to look away to the
header.

### 10.5 Errors

Handling is uniform across pages. The API client throws typed errors; pages render states.

| Condition | Presentation |
|---|---|
| Unauthenticated | Prompt to sign in, then redirect |
| War closed | "Voting is closed" |
| Not joined | Prompt to join |
| Not found | The War does not exist or was removed |
| Already voted | No message — advance silently |
| Rate limited | A wait, using the supplied delay. **Never presented as an error** |
| Validation, server error, network failure | Their own distinct messages |

**Refresh is single-flight.** Concurrent unauthenticated responses must trigger exactly one
refresh; other in-flight requests await it and retry. Firing several in parallel would rotate
the token repeatedly, and the losers would present an already-used token — which the API
treats as theft, revoking the family and signing the voter out. **A failed refresh is
terminal:** clear the token and redirect to sign-in. Never retry a refresh.

**Sign-out always succeeds from the voter's point of view.** It clears the in-memory token and
returns to anonymous navigation unconditionally. The server call is still attempted
best-effort, so a reachable API does revoke the family, but its outcome never gates, delays,
reverses, or surfaces the local effect, and is never retried. A voter who clicks sign out has
stated their intent; the client can honour it unilaterally. The plausible causes of that call
failing — a lost connection, an already-expired token — are exactly the cases where insisting
on confirmation would leave someone stuck looking signed in, which matters most on a shared
machine. This is the one action where the client's own state change is the entire contract and
the server call is a courtesy.

---

## 11. Custom UIs

A custom UI is a brand-specific frontend for a single War, selected by that War's slug. It
replaces **presentation only**: it consumes the same API, enforces no rules of its own, and
cannot change how voting, ranking, or scoring behave. A branded UI and the default UI produce
identical votes and identical rankings.

### 11.1 When a custom UI is not the answer

Most campaign-to-campaign variation does not need one.

| The difference is… | Solved by |
|---|---|
| Different contestant facts | The War's contestant schema |
| Video instead of photographs | The War's media mode |
| Different title, category, end date, visibility | Ordinary War configuration |
| **Radically different branding, layout and styling** | **A custom UI** |

A primary and a pageant describe contestants with entirely different fields and are both
served well by the default UI — that is a *data* difference, not a presentational one. A
custom UI is warranted only when a campaign needs markup and styling the default UI cannot
express. It is the heaviest option and the last to reach for.

### 11.2 Template contract

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
- **War detail** iterates the contestant's attributes rather than naming fields. A template
  hard-coding one campaign's field works for that campaign and silently renders nothing for
  the next

### 11.3 Shared runtime

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

### 11.4 Constraints

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

---

## 12. Infrastructure & Operations

Infrastructure is defined as code, and every environment change is applied by automated
pipeline — no manual console changes in staging or production. This section states
infrastructure by **role**; the products currently filling each role are named in `CLAUDE.md`.

| Role | Responsibility |
|---|---|
| **Edge** | DNS, TLS termination, CDN caching, web application firewall, rate limiting, DDoS mitigation |
| **Edge function** | Small request-time compute, used only where routing requires it |
| **Application platform** | Runs the API and hosts the default UI; owns path-based ingress |
| **Database** | Managed PostgreSQL with a connection pooler and automated backups |
| **Object storage** | S3-compatible buckets for media, custom UI bundles, and infrastructure state |
| **Container registry** | Stores API images |
| **Scheduler** | Invokes endpoints on a cron schedule |
| **Observability** | Error tracking, log aggregation, metric alerting |

### 12.1 Environments

Two: **staging**, deployed on merge, and **production**, promoted manually after staging
smoke tests pass. Every environment has isolated resources — its own deployment, database,
buckets, hostname and schedules.

### 12.2 Hosting shape

**A single deployment per environment** containing the API service and the default UI's static
output. Required platform capabilities:

- Path-based ingress across components, with per-rule control over whether the matched prefix
  is preserved or stripped
- A catch-all document for static components, returning the application shell with a success
  status for unmatched paths
- Zero-downtime rolling deploys with health checks
- Pre-deploy hooks that abort the deployment on failure
- Encrypted environment variables injected at runtime

The database is reachable only from the application platform, never the public internet, with
automated daily backups and point-in-time recovery. Production runs a standby; staging runs
single-node.

**One open item.** The API's address-keyed rate limits (§8.4) are only accurate if the
number of reverse-proxy hops in front of the application is configured. That count is not
recorded for either environment; until it is, clients behind the same hop share a bucket.

### 12.3 Routing

| Path | Routed by | Target |
|---|---|---|
| Internal endpoints | Edge | **Blocked** except from the scheduler |
| API | Platform ingress | API service, prefix preserved |
| Default UI's own prefix | Platform ingress | Static site, prefix stripped |
| Custom UI slugs | Edge function | Shared custom-UI bucket, keyed by slug |
| Media | Edge | Media bucket, prefix stripped, long-lived cache |
| Everything else | Platform ingress | Static site |

**Every static UI must serve its shell with a success status for any unmatched path** so deep
links work. The platform provides this natively for the default UI. Object storage typically
cannot — it returns a not-found status even when serving an error document — which is why an
edge function handles it for custom UIs, refetching the slug's shell and returning it
successfully. That function is the mechanism making the shared-bucket model viable.

**All custom UIs share one bucket behind one origin**, keyed by slug prefix. There is no
per-slug bucket, origin, or routing rule: registering a slug is a database record plus a file
upload, requiring no infrastructure run and no redeploy. The alternative — one origin per slug
— makes every registration an infrastructure change and consumes a per-deployment component
budget, and custom UIs are unbounded by design.

### 12.4 Caching

| Asset class | Policy |
|---|---|
| Hashed assets | Immutable, one year |
| Custom UI shells | Never stored |
| Default UI shell | Short, self-healing on the next navigation |
| Shared runtime | Ten minutes, revalidated in the background |
| Contestant images | Immutable, one year |
| API responses | Per-endpoint; no store by default |

Content-hashed filenames mean asset URLs change on every deploy and never need invalidation;
only the shell is purged. The edge bypasses cache for API paths unless an endpoint sets its
own policy.

### 12.5 Pipelines

Each project has its own pipeline, path-filtered so one project's change does not run
another's, with deploy stages gated on not being a pull request.

- **API:** lint → test → build image → push → deploy staging → smoke test → **manual gate** →
  deploy production → smoke test
- **Default UI:** lint → typecheck → unit test → acceptance test → build → deploy staging →
  purge → smoke test → **manual gate** → deploy production → purge → smoke test
- **Custom UI:** resolve and validate slug → lint → build → template check → size check →
  deploy staging → purge → smoke test → **manual gate** → promote the same artefact
- **Infrastructure:** validate → plan → apply staging → plan → **manual gate** → apply
  production

**Production promotes the exact artefact staging validated; it is never rebuilt.** Approval
gates are environment protection rules, not steps inside a workflow, so a gate cannot be
bypassed by editing a pipeline.

**Migrations run as a pre-deploy hook inside the deployment**, not as a pipeline stage, so a
failed migration aborts the deployment and never ships. They are plain ordered SQL files
tracked in a table, must be backwards-compatible — the hook runs while the previous revision
is still serving — and roll back manually, with point-in-time recovery as the backstop.

Custom UIs use a shared reusable pipeline, since each brand lives in its own repository. Such
a call resolves its reference when the run is first triggered and keeps it for the run's
life, so re-running an old failed run silently executes the *old* pipeline; prefer a fresh
trigger after changing it.

### 12.6 Secrets

Held as encrypted environment variables on the application platform, never in a repository,
and substituted into the deployment spec at deploy time from the CI secret store. Rotation is
therefore updating the stored secret and triggering any deploy.

Every value with a localhost-shaped default **must have a startup guard that refuses to boot
when it is left at that default.** Three separate production incidents traced to the same
shape — a deployment silently falling back to a local URL and redirecting real users there
after sign-in, with nothing in the pipeline or the running process erroring. The guard is the
lesson, not the individual variables.

Known limitation: platform-encrypted variables give encryption at rest but no versioning,
per-component access policy, or audit trail. A dedicated secrets manager is deferred.

### 12.7 Monitoring

| Signal | Threshold |
|---|---|
| API error rate | Above 1% over 5 minutes |
| API p99 latency | Above 2 seconds over 5 minutes |
| Unhandled exceptions | Any new issue in production |
| API CPU / memory | Above 80% over 5 minutes |
| API restart loop | More than 3 in 10 minutes |
| Deploy failure | Any |
| Domain or TLS failure | Any |
| Database pool, disk, CPU | Above 80% |
| Edge client-error spike | Above 5% over 5 minutes |
| Scheduled task failure | Two consecutive failed runs |

Request-level signals are the two most likely to lack a native platform equivalent; any
provider evaluation must confirm how they are satisfied.

**Edge protection** provides managed firewall rules in production, rate limiting on
authentication paths, always-on DDoS mitigation, and blocking of internal endpoints.

**Content security policy** is served on all UI documents with a **closed allow-list** of
frame sources — the only third-party origins the platform ever frames. Adding a video provider
means changing that policy, which is a reviewed infrastructure change. That is the intent: it
makes an arbitrary third-party embed impossible to introduce from application code or a stored
value alone, reinforcing the API storing a provider and identifier rather than a URL.

### 12.8 Scheduled tasks

**A scheduled task must never be the only thing standing between the platform and correct
behaviour.** If the scheduler never runs, the platform still behaves correctly and only its
stored state lags. War expiry is the worked example: the API evaluates end dates lazily on
every read and write, so a War is closed the instant it expires; the nightly task only
converges stored state.

Every task must be safe to run repeatedly, concurrently, and after arbitrary delay. A failed
run retries once; two consecutive failures raise an alert. Because correctness never depends
on it, a failed run is a housekeeping incident, not an outage.

### 12.9 Operational constraints

Rules not visible in the infrastructure code, each of which has been broken at least once.
Changing any of them needs a better reason than tidiness.

- **The application's identifier is a manual step after any from-scratch environment apply.**
  Infrastructure creates the application and outputs its id, but nothing publishes it; the
  deploy pipelines read it from a per-environment variable that must be set by hand. The
  failure when missing does not obviously point at a missing variable.
- **Each deploy pipeline needs its own concurrency group, per environment.** A "do not cancel
  in progress" setting protects a *running* job, not a *pending* one, and only one pending run
  is kept per group. A job waiting at a required-reviewer gate is pending, so a sibling
  pipeline entering the same group evicts it — reading as "cancelled", with nothing
  distinguishing it from any other cancellation. This silently dropped three production
  deploys of a security fix before diagnosis. A build-time check now fails if two pipelines
  declare the same group. Sharing a group also buys nothing: both pipelines deploy components
  of the same application, and the platform already queues concurrent deployment requests.
- **Infrastructure cannot bootstrap the application with the real image**, which requires
  secrets to boot and exits without them, failing the apply. A trivial placeholder image is
  pushed once and replaced the moment the real spec deploys.
- **The application is created by infrastructure and specified by its deployment spec.**
  Infrastructure creates it with a placeholder and ignores subsequent spec changes; otherwise
  every apply would roll the running API back. After bootstrap, change the spec, not the
  infrastructure module.
- **Each provider redirect URI must be registered by hand** with the provider, per
  environment. Nothing in the pipeline does this, and the failure surfaces only when a real
  user attempts sign-in.

### 12.10 Out of scope

Multi-region deployment, canary deploys and traffic splitting, automated rollback on smoke
test failure, a dedicated secrets manager, autoscaling, read replicas, cost alerting, per-PR
preview environments, and scheduled tasks beyond expiry reconciliation.

---

## 13. Acceptance Tests

Behaviour is specified in the sections above. Its executable expression lives with the code
that implements it, never in this document:

| Project | Location |
|---|---|
| API | `war-api/specs/features/` |
| Default UI | `war-ui-default/features/` |
| Infrastructure | `war-infra/specs/features/` |
| Custom UI | `war-ui-custom/specs/features/` |

Each has a `pending/` subdirectory holding scenarios with no binding yet — behaviour not
built, or behaviour built but not yet covered at the acceptance layer. See `PROGRESS.md`.

Where a test and this document disagree, **this document is the contract** and the test is
wrong.
