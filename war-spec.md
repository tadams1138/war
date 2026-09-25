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
- Binary matchups served one at a time, with choices persisted in full
- A win-count leaderboard readable by anonymous and authenticated users alike
- A tamper-evident vote audit trail

### Non-Goals

- Real-time leaderboard streaming — polled refresh only
- Push notifications
- War creator moderation tools (removing voters, resetting votes)
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
| **Administrator** | A Voter granted platform-wide moderation rights (§6.7); zero or more may exist at once |

"War Creator" is a relationship to a particular War, not an account type. A Voter becomes
one by creating a War. "Administrator" is likewise a right granted to an existing Voter
account, not a separate kind of identity — the same OAuth sign-in works either way.

A Voter may act through any client interchangeably — the default UI or a custom UI. Each is
a different route to the same identity, and the API is the sole authority over what that
identity may do.

---

## 4. Domain Model

### War

A named voting campaign, owned by its creator.

| Attribute | Notes |
|---|---|
| Title | Optional at the API level — a War is identified by its id, not its title, and creation and publishing both work without one. The default UI enforces a non-empty title as a soft requirement whenever it saves War metadata, but never blocks publishing on it. |
| Category | Optional; used for filtering |
| Status | `draft` → `published` → `closed` |
| Visibility | `public` or `invite_only` |
| Media mode | `image` or `video`; fixed for the War's lifetime |
| End date | Optional; closes the War when reached |
| Custom UI slug | Optional; selects a registered custom UI |
| Theme | `arcade`, `fight_card`, or `scrapbook` (below); set by the creator, overridable per voter |
| Share image | Optional; a single 1200×630 image shown on the War's card and used as its link-preview thumbnail when shared outside the platform. Distinct from contestant media — one fixed-size image per War, not a set of responsive variants. |

A War is created as a draft. All configuration is editable in any status, by its creator,
always (§6.1). Its matchups exist as soon as it has contestants to generate them from — they
are not tied to publishing. Publishing makes the War reachable by anyone but its creator and is
freely reversed by unpublishing (§6.1). Closing ends voting for good; rankings remain readable.

**Effective status.** An end date is enforced *lazily, on every read and write*. A War is
treated as closed the instant its end date passes, regardless of its stored status. A vote
cast one second later is rejected, and the War reports itself as closed. A scheduled task
converges the stored value so list queries can filter on an indexed column, but correctness
never depends on that task having run — a missed run degrades query efficiency and reporting
freshness only.

### Contestant

A participant in a War: a name, an optional bio, and media appropriate to the War's media
mode.

A bio supports a constrained set of formatting — emphasis, lists, links, and headings —
entered as plain text and rendered accordingly wherever a bio is shown; nothing else survives
rendering, so no other markup a bio contains can affect the page around it. It renders on the
vote page (10.3) as well as the War's detail page, but never inside the tap-to-vote media
itself — reading it is never one gesture away from accidentally casting a vote. It is the
only per-contestant free text the platform carries — different campaigns describe contestants
in whatever prose fits, rather than filling in per-campaign structured fields.

### Media Mode

A War declares at creation whether contestants are presented as **images** or as **embedded
video**. The mode is fixed and applies to every contestant.

| Mode | Contestant media | Presentation |
|---|---|---|
| `image` (default) | 1–10 ordered images; the first is primary | Two cards side by side, each browsable through that contestant's images |
| `video` | Exactly one embedded video | Two players; one plays, then the other |

**Mixed media within a War is not permitted.** A matchup pairing a video against a
photograph has no coherent presentation. Publishing fails if any contestant's media does not
match the War's mode.

Mode affects presentation only. Matchup generation, pair selection, side randomisation, vote
recording and ranking are identical in both modes.

### Visual Theme

A War declares, at creation, which of the default UI's visual treatments its own pages —
detail, vote, and rankings — render in. Purely presentational: it changes none of voting,
ranking, scoring, or what data a contestant or matchup carries.

| Theme | Mood |
|---|---|
| `arcade` (default) | Arcade character-select screen — CRT scanlines, pixel type, a faceted VS badge |
| `fight_card` | Boxing/MMA event poster — condensed display type, diagonal banners, a ticket-stub card |
| `scrapbook` | Polaroid-and-washi-tape collage — handwritten accents, a marker-scrawled "vs." |

A voter may override a War's theme for themselves without changing what its creator chose or
what any other voter sees — see §10.4.

### Matchup

An **unordered** head-to-head pairing of two contestants. A War with `n` contestants has
`n(n−1)/2` matchups. A contestant's matchups are generated the moment it's added, against every
other contestant present at that time, and removed if the contestant is (§6.1) — the full set
is always exactly what the current roster implies, not a one-time snapshot frozen at
publication.

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

Browse, create, read, update, publish, unpublish, close, and join.

**Browsing** is filterable by status and category. Absent an explicit request for the
caller's own Wars, the list **never** includes a draft War or an invite-only one, regardless
of any status filter supplied — asking for drafts returns an empty list rather than someone
else's. Being authenticated grants no extra visibility on its own. With no status filter at
all the default is published Wars only. Every caller inherits this scoping; no future entry
point can bypass it by forgetting to apply it.

**A voter may list their own Wars** across every status, drafts and invite-only included.
This requires authentication and is the only thing that widens visibility.

**Creation** requires nothing but an authenticated voter — title, category, visibility, media
mode, theme, and end date are all optional, with documented defaults. The
War is created as a draft owned by the authenticated voter and can be filled in afterward.

**Publishing is visibility, not a one-time step.** Only the creator may toggle it — **Publish**
and **Unpublish** are the two directions of one reversible switch, at any time — `draft` and
`published` are reversible states, not a one-way gate. Publishing requires at least two
contestants; unpublishing requires nothing and does not touch any matchup, vote, or contestant.
A contestant may be published with no media at all — voting and rankings render whatever media
(if any) a contestant has, same as every other optional field. `closed` remains the one true
terminal state, reached only by its end date passing (§4, "Effective status") — nothing in this
reversible toggle affects it, and nothing reverses it: a closed War can be neither published nor
unpublished.

**A War not currently published is invisible to everyone but its creator**, exactly like a War
that has never been published: its detail, rankings, and vote pages report it as not found
(§10.5) to anyone else, the same response an actually-missing War produces, never a distinct
"this exists but is private" signal that would confirm its existence to someone it isn't meant
for. The creator can always reach it, in any state.

**Joining** records the voter's membership. Voting requires it.

**A War is always editable by its creator, in any status.** Metadata, and a contestant's own
name/bio/media, never touch matchups or votes and are never restricted. Adding a contestant is
always safe — matchups generate for it against every existing contestant, and pair selection's
existing exposure-balancing (§6.3) already gives a late addition priority until it catches up,
no special-casing needed. Removing a contestant that has no votes on any of its matchups
likewise just removes them. Removing a contestant that **does** carry votes clears those
votes as part of removing it — scoped to that contestant's own matchups only, not the whole
War — and, like every destructive action on this page, asks for confirmation first, naming
what will be lost.

**Deletion** removes a War, its contestants, its media, and its votes entirely, in any status.
Only the creator may delete, and confirmation is always required first — this app's standard
guard on anything that cannot be undone (§10.4).

**Clear Votes**, reachable by the creator from the Edit page in any status, deletes every vote
cast in the War and resets every contestant's win and appearance counters to zero — the same
starting point as before anyone voted. Membership records are untouched: joining already
happens silently on every vote-page visit, so nothing about re-voting changes whether or not a
past membership row survives. This is a genuine, unrecoverable loss of vote history, applied
on explicit request — §2's tamper-evident audit trail goal does not extend to a creator's own
deliberate reset of their own War.

### 6.2 Contestants and media

Contestants may be added, updated and removed at any time, by its creator only, in any status
(§6.1) — adding and updating are always unconditional; removing a contestant with votes on its
matchups clears those votes as part of removing it (§6.1).

**Images.** Up to ten per contestant, ordered, the first being primary. Uploads are rejected
if the War is in video mode, if no file is present, if the limit is exceeded, or if the bytes
are not a readable image. New images append; ordering is editable at any time (§6.1).

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
published by effective status, and the voter must have joined.

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

### 6.7 Administration

An **Administrator** is a Voter granted platform-wide moderation rights. Zero or more may
exist; the role carries no other special identity, and an Administrator uses the same sign-in
as everyone else. Getting the *first* Administrator onto a fresh deployment is a manual,
out-of-band step (§12.9) — there is no self-service path and none is planned, since a
self-service path to platform-wide rights is exactly the thing moderation exists to guard
against. Granting or revoking the role on any *other* Voter, once at least one Administrator
exists, is an ordinary Administrator capability (below) — the manual step is only ever needed
once per environment, to bootstrap the first one.

**An Administrator may not revoke their own rights.** Only another Administrator can do that.
This is deliberate: self-revocation risks leaving a deployment with no Administrator at all,
recoverable only by repeating the manual bootstrap step — a failure mode worth making
structurally impossible rather than merely discouraged, the same reasoning §8.1 gives for why
a mirrored matchup pairing cannot exist at all.

**Visibility.** An Administrator may view every War regardless of status — draft, invite-only,
or closed — and every Voter, including a Voter's own complete vote history (§8.3's audit trail,
otherwise kept for future tooling, surfaced here to a human instead). This is the only way
visibility scoping (§6.1's default scoping, and "a War not currently published is invisible to
everyone but its creator") is ever bypassed.

**Remove a War** takes down a War an Administrator has moderated for cause. It is deliberately
not the same operation as a creator's own **Delete** (§6.1): Remove soft-deletes the War —
marked removed and hidden from everyone, including its own creator, but its row and its votes
persist — while hard-deleting its media outright, the same two-prefix originals-and-variants
cleanup Delete already needs (§6.1's implementation note). Keeping the War and its votes intact
under the hood preserves the audit trail (§8.3) for whatever the moderation was investigating;
only the media, which is typically the reason for the removal, is actually reclaimed.

**Suspend** and **Ban** are two severities of acting against a Voter, not one:

| Action | Effect | Reversible |
|---|---|---|
| **Suspend** | Blocks creating new Wars from this point on. Existing Wars, votes, and the ability to vote in others' Wars are untouched. | Yes — unsuspend |
| **Ban** | Blocks sign-in entirely, and deletes every War this Voter created (§6.1's Delete — contestants, media, and votes, entirely) and every vote this Voter cast elsewhere, with every affected contestant's counters recomputed accordingly. | The block lifts on unban; deleted data does not come back, same as any other Delete |

A Ban is the only way a Voter's own cast votes are ever removed after the fact — an intentional
exception to §8.1's immutability, scoped to exactly this one moderation action, because the
alternative (an abusive Voter's votes standing forever) is worse than the exception.

**A global War-creation kill switch** rejects every `POST /wars` request, from every Voter
including Administrators, while enabled. No exceptions and no special-casing — an emergency
stop is only trustworthy if it actually stops everything. Nothing else is affected: existing
Wars keep running, voting continues, and disabling the switch requires the same Administrator
capability as enabling it.

**An append-only moderation log** records every Administrator action — Remove a War, Suspend/
unsuspend, Ban/unban, granting or revoking Administrator rights, toggling the kill switch —
with which Administrator, the target, and when. Never edited or deleted, mirroring votes'
own immutability (§8.1), and for the same reason: several Administrators may exist, and each
must be individually accountable for what they did.

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

Voters abandon midway, and rankings are shown while a War is still published, so the data is
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

**A War's share image (§4, §10.4) follows none of the above.** It is a single fixed 1200×630
image, not a set of responsive variants, and is stored as JPEG rather than the modern format
contestant media uses — chosen so the same asset works as both the in-app card thumbnail and
a third-party link-preview image without a second encoding, since not every external platform
that renders a link preview supports the modern format. Metadata stripping and a privately
retained original still apply.

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
| Home | Browse published public Wars | No |
| War detail | Overview and results — one merged, rank-ordered list, not a gallery plus a separate leaderboard | No |
| Vote | Binary matchup voting | Yes |
| Create War | Creates an empty draft War and forwards to its Edit page | Yes |
| Edit War | Metadata, contestants and media, Publish/Unpublish, Clear Votes, and Delete, for any War the voter created, any status | Yes |
| My Wars | The voter's own Wars, every status | Yes |
| Admin Dashboard | Every War and Voter, moderation actions, the moderation log (§6.7); Administrators only | Yes |
| Sign in | Provider selection | No |
| Auth callback | Exchanges the refresh cookie for a token, then returns the voter where they were going | No |

Routing is client-side; the hosting layer serves the application shell with a success status
for any unmatched path so deep links work. An unauthenticated visit to a protected route
redirects to sign-in carrying the intended destination, and returns there afterwards. An
authenticated but non-Administrator visit to the Admin Dashboard redirects Home instead —
unlike a private War (§6.1), whether this route exists at all isn't sensitive, so there is no
need for a not-found-shaped response here.

**Every route renders beneath a persistent navigation header**, rendered once by a shell
wrapping the whole route tree rather than added page by page — a page that forgets it is then
not a possible failure mode. Every route likewise renders above a persistent footer carrying
attribution, a link to the project's source repository, and a link to its guide for building
an Import feature (§10.4) for a new client.

### 10.2 Navigation

**A brand mark sits at the header's leading edge, before everything else, every
visitor's own fixed identity for the platform — not a War's** (§4's Theme is per-War;
this is deliberately not). It is a link to Home and needs no authentication to use — Home
itself needs none (§10.1) — so it renders identically whether or not the visitor is signed in.

Everything else's content depends only on whether the visitor is authenticated; there is no
partial or transitional state.

- **Anonymous:** the brand mark, plus sign-in only. No links to authenticated destinations —
  offering an action that only ends in a redirect is friction the header exists to remove.
- **Authenticated:** the brand mark, plus a single identity control (the voter's avatar and
  name) that opens a menu holding My Wars, Start a War, and a sign-out control, always
  together — Home is not repeated in this menu, since the brand mark already covers it for
  every visitor. The control is closed by default, so the persistent header stays small
  regardless of how many destinations it holds. The open menu renders on an opaque or
  sufficiently translucent surface of its own, never the bare page behind it — a themed page
  can render a contestant's own media directly beneath the header, and menu text must stay
  legible against it regardless of what that background is.

**Start a War is a top-level action** within that menu, not something reached through My
Wars — the tradeoff being a second item rather than a leaner menu. My Wars remains a separate
destination for *reviewing* Wars.

Identity comes from the voter's profile, fetched once per session rather than per navigation.
A missing display name renders a fixed fallback, never a blank or the literal word "null". A
missing avatar renders no image and no placeholder. **If the profile fetch fails entirely, the
full menu still renders** — only the identity control's own label falls back. A failed profile
fetch never blocks navigation.

The current route is marked as such within the open menu; on a route the menu has no item
for, none is marked. The header is a labelled landmark so assistive technology can jump to
it, every menu item is keyboard reachable, the menu closes on selecting an item, clicking
outside it, or pressing Escape, and the sign-out control is a real button because it performs
an action rather than navigating.

### 10.3 Voting interface

Two contestant cards side by side.

- Cards show image and name **only** — a bio belongs beside the card, a fast binary choice has
  no room for it there. A contestant's bio, when it has one, renders in its own area outside
  the tap-to-vote media (below) — never inside it, so reading it is never one gesture away
  from a vote
- Images use the width set the API supplies, sized for two cards sharing the viewport, so a
  phone downloads a small variant rather than a large one
- Card media, the two names, and the progress bar are capped to fit one viewport on a typical
  screen without scrolling — a card is never so tall that voting requires scrolling first. The
  page opens scrolled to the top of this block, past the persistent header, so it's the first
  thing a voter sees; the header remains reachable by scrolling back up
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
- Once every matchup is voted, the voter is redirected straight to the War's results page
  (§10.4) — whether that happens because they just cast the final vote, or because they
  arrive at the vote page (fresh, or back from signing in) having already finished it

**Bios sit outside the tap-to-vote block**, and clicking anywhere in one never casts a vote.
On a wide viewport, both contestants' bios render side by side below that block, reachable by
scrolling down past it. On a narrow (stacked) viewport, where the two cards are already
stacked to keep both visible without scrolling, each contestant's bio instead renders beside
its own card, in the width the stacked layout leaves spare; a long bio scrolls within its own
area there rather than growing the card or forcing the page itself to scroll before both
contestants are visible. Either way, the footer remains reachable by scrolling past everything
above it.

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

**War detail is one page, not two — and one list, not two.** Results (rank, win count, appearance
count) are not a separate section below a contestant gallery; each result row carries that same
contestant's media and bio (§4) directly, in rank order, with unranked contestants at the bottom
marked by a dash. There is no separate "Results" heading and no separate gallery — the rank-ordered
list *is* the page. Results render exactly as returned, with no percentages computed or displayed.
Needs no authentication for a public War (§6.4).

Each row stacks its parts top to bottom on a narrow, portrait-oriented viewport — media, then
bio, then the wins/appearances/win-share group. At laptop width and above, or on
any viewport wider than it is tall (a phone rotated to landscape, short on vertical room
regardless of its width), media moves beside the bio instead of above it; the
wins/appearances/win-share group stays underneath the bio either way, never beside it. Media
stays large regardless of width, never shrinking to a sliver. A
contestant's rank is shown directly on its media (a marker on the image itself, "—" for
unranked) rather than in a column of its own. On a wide viewport the list is capped in width and
centered, leaving open space on either side rather than stretching every row edge to edge. A
contestant with more than one image is browsable in place — paging arrows sit on the image's own
left and right edges and a row of dots along its bottom show which image and how many, so every
image occupies the same space regardless of whether it has company, rather than the controls
claiming a row of their own underneath (the same page-through affordance the vote card's own
multi-image browsing already uses, 10.3). A contestant with no media (§6.1: media is optional)
shows no image at all in its row — never a placeholder standing in for the missing photo. Win
share is a bar sized to a contestant's raw wins relative to the leader's, never wins over
appearances — an appearance-normalized percentage is exactly what §7 rejects as a display value.
A bio, however long, always renders in full — there is no truncation and nothing to expand.

Results poll while the War is published. **A failed poll does not clear already-loaded results**
— it leaves the last good data on screen, shows no error, and keeps polling; the page recovers
on its own. This does not apply to the *initial* load, where there is no last-good data to
fall back on and the standard error state applies.

**The results page carries its own entry points, each conditional.** Its creator sees an
**Edit** entry point there too, in any status — editing is never status-gated (§6.1) — offered
a second time from the page a creator is more likely to already be on, alongside the same
**Delete** affordance the Edit page itself carries (below). A large, centered **Vote** call to
action, set apart from the ordinary Edit/Delete/Export row rather than one item among them,
appears for a published War whenever there's a reason to tap it: an anonymous visitor (tapping
it sends them to sign in and back, the same as Home's own Vote link, §10.4 "Home"), or an
authenticated voter who hasn't yet cast every vote — returning them to where they left off.
Neither the Edit nor Delete affordance appears for a War that isn't the viewer's own; Vote
additionally requires the War to be published, and disappears once an authenticated voter has
cast every vote. In its place, at the top of the page, that voter sees a one-line notice —
"You've voted on every matchup — thank you!" — confirming there's nothing left to do here.

**Export**, available to a War's creator on both its results page and its edit page regardless
of status, downloads a personal backup of the War's definition — title, category, visibility,
theme, and each contestant's name, bio, and images — as a single file the creator can keep. It
carries no votes, rankings, or win counts; it exists to let a creator recreate a War, not to
report on one.

**Import** reverses Export. Given a previously exported file, it creates a brand-new draft
War — metadata, contestants, and their images — owned by the importing voter, entirely
independent of whatever War the export came from; nothing about the original is referenced or
affected. The file is validated in full before anything is created: a malformed or incomplete
file is rejected with one clear message and creates nothing at all. Once the new draft exists,
any later failure (a contestant, an image) leaves it in place with its error shown, rather than
discarding what already succeeded — the creator lands on its Edit page and finishes repairing
it by hand, the same way a draft abandoned right after Start a War is already just findable,
never lost.

**War cards** summarise a War: title, category, status, contestant count, creator's name where
known, and time remaining where an end date is set, topped by its share image when it has one
— no placeholder when it doesn't; the card simply carries no image slot rather than a generic
stand-in. Time remaining renders "Ended" at or past the end date, whole days rounded up at a
day or more, and whole hours rounded up below that with a one-hour floor — so a War ending in
minutes reads "1 hour" rather than "0 hours" or a misleading "1 day".

**Sorting, searching, and paging a War list** (Home and My Wars, below, share this exactly).
Sort orders: newest first (default), oldest first, expiring soonest (a War with no end date
sorts after every War that has one), and alphabetical by title (a War with no title, or a
title that is blank once whitespace is trimmed, sorts after every War that has one). Search is
a single free-text box, matched case-insensitively against anywhere in a War's title or its
creator's name — a War with no title, or a blank one, is only ever found by its creator's
name, never by an empty or whitespace match. Ten cards per page; **Next**/**Prev** step one
page at a time — there is no jump to an arbitrary page number and no total shown, since
counting a searched, sorted list is not free at any real scale. Changing the sort order or the
search text starts back at the first page.

**Theme switching.** A War's detail (which carries its results) and vote pages render in its
creator-chosen theme (§4) until the voter viewing them picks a different one from the theme control in the
persistent navigation header — reachable from every page, not just the themed ones. That pick
is remembered only on the device it was made on, independently per War — it is not part of
the voter's account, so it does not follow them to a different browser, and it never changes
what any other voter sees. Home, My Wars, Start a War, and sign-in are not themed by any single
War; they render in `arcade` until the voter picks a theme for those pages as a group,
remembered the same way. The navigation header itself always renders in whichever theme the
current page is showing.

**Home** browses published public Wars, sorted, searched, and paged as above. Its empty state
is **auth-aware**: an anonymous visitor is told to check back, since waiting or signing in
really are their only options; an authenticated voter is invited to create one and given a
link, because they are the one visitor who can *make* a published War exist. Telling them only
to check back is not merely unhelpful, it omits the one action they have.

Every War card on Home is already known to be published — that is the page's whole premise —
so the card does not repeat "published" as a status word; **My Wars** still shows status, since it
lists every status a War can hold (below). Instead each card carries two direct entry
points: **Vote**, going straight to the Vote page, and **Results**, going to the War detail
page (10.1) for its overview and current standing — one merged page and one merged list, not a
leaderboard reached separately. Results is public and needs no authentication. Vote requires
an authenticated voter — an anonymous visitor who taps it is redirected to sign-in carrying
that destination and returned to it afterward, the same rule §10.1 states for any protected
route.

**Start a War** creates an empty draft immediately — no fields collected up front — and forwards
straight to that draft's Edit page. There is no separate creation wizard and no review step;
everything about a draft, including publishing it, happens on the one page. Partway
abandonment (navigating away before the draft has a title, contestants, or is published) leaves
an unreachable-but-findable draft behind at no cost — My Wars finds it again.

**My Wars** lists every War the voter created, sorted, searched, and paged as above (newest
first by default), each as a full war card including status — a creator needs status at a
glance to tell a draft, published, or closed War apart. Selecting one opens its detail page.
Every card, regardless of status, additionally carries an edit affordance, since editing is
never status-gated (§6.1). This page adds no
resume affordance beyond that. Its header and its empty state both carry two entry points, not
one: Start a War, and Import a War (above).

**Editing** is one page covering everything a War needs: title, category, visibility, theme,
end date, share image, each contestant's name, bio, and images (add, remove, reorder, up to
the per-contestant cap), **Publish/Unpublish**, **Clear Votes**, and **Delete**. There is no
fixed order to walk, and none of it is gated by status — a War the creator finished voting on
is exactly as editable as one they just created. It is reachable only from its own My Wars
card, not from the public War detail page, and only for its creator: opened any other way, a
non-owner sees whatever the War itself would show them (§6.1) — not found for a War that isn't
published, a plain "this isn't your War" for one that is, never a form they could try to
submit.

**The share image** is set one of two ways, both reachable from the same metadata form: upload
a file directly, or generate one from the draft's own contestants — two of them chosen at
random, each shown only if they have at least one image, composited side by side with a
styled "VS" between them in the War's chosen theme, the same visual language the vote page's
own matchup divider already uses. Generating is a live preview a creator can re-roll for a
different random pair as many times as they like before committing to one; like every other
field on this form, neither an upload nor a generated preview takes effect until **Save** is
pressed, and either replaces whatever share image the War already had. A file uploaded that
isn't already 1200×630 is center-cropped to it rather than rejected — the same forgiving
treatment contestant images already get. Generating requires at least two contestants with an
image each; the control explains why it's unavailable rather than disappearing silently when
that isn't met.

**Pasting a War's own link elsewhere** (a chat app, a social post) shows that War's title and,
when it has one, its share image — the reason the share image exists at all (§4). A War with
no title or no share image falls back to a generic label and no image respectively, rather
than a blank or broken preview. This applies to the War's detail page specifically; other
pages under the same War (editing, voting) are not meant to be shared and carry no such
preview of their own.

**Delete** removes the War entirely — contestants, media, and every vote (§6.1) — regardless of
status. **Clear Votes** deletes every vote cast in the War and resets every contestant's
counters to zero, also regardless of status. Both ask for confirmation first, naming what will
be lost, since neither can be undone; both, like removing a contestant that carries votes
(§6.1), are visually distinguished from ordinary actions so a creator never mistakes a
destructive choice for a routine one.

**Publish** and **Unpublish** are the two directions of one toggle governing whether anyone but
the creator can currently reach the War — not a one-time step, and reversible in either
direction (§6.1). Publish is disabled with an inline reason until the War meets the API's own
requirement (at least two contestants) — a client-side mirror of a rule the API enforces
regardless, so a creator sees why before attempting it rather than only after a rejected
request. Unpublish requires nothing. Either action asks for confirmation first, naming what
changes (who can now reach it, or who no longer can), and stays on the Edit page afterward
rather than navigating away — there is nothing left to protect by leaving, since a subsequent
edit is never blocked by the War's current status. A
failure the client-side check didn't catch (a race, a network error) shows the API's own
validation messages verbatim, never generic error copy — these are addressed to the creator,
and only the creator ever reaches them.

Both empty-state links to Start a War remain even though the header also carries one. An empty
state is a page's *entire* visible content at that moment, and the one visitor with something
to do there should find that action in the content rather than having to look away to the
header.

**Admin Dashboard** (§6.7) is reachable only by an Administrator — the identity menu shows no
link to it for anyone else, the same "no offer that only ends in a redirect" reasoning §10.2
already gives for hiding authenticated-only links from an anonymous visitor. It lists every War
regardless of status and every Voter, each searchable; selecting a Voter shows their complete
vote history. Every War and every Voter carries its moderation actions directly on its own row
— Remove for a War, Suspend/Ban for a Voter, plus granting or revoking another Voter's
Administrator rights — each behind the same confirm-first pattern every other destructive
action in this UI already uses (Delete, Clear Votes, Publish/Unpublish), naming what will
happen before it does. A single platform-wide control toggles the War-creation kill switch,
displayed prominently enough that an Administrator who turned it on is never left wondering
whether it's still on. The moderation log renders as a plain, reverse-chronological list —
who did what, to what, and when — with no filtering beyond what's already searchable above; it
exists for accountability, not investigation tooling. This page belongs to the default UI
only — a custom UI (§11) is never required to implement it, since Administrators can always
reach it through the default UI regardless of which custom UI a War itself uses.

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
gates are a required-approval step tied to the environment itself, not a step inside a
pipeline, so a gate cannot be bypassed by editing a pipeline.

**Migrations run as a pre-deploy hook inside the deployment**, not as a pipeline stage, so a
failed migration aborts the deployment and never ships. They are plain ordered SQL files
tracked in a table, must be backwards-compatible — the hook runs while the previous revision
is still serving — and roll back manually, with point-in-time recovery as the backstop.

Custom UIs share one pipeline template, invoked from each brand's own repository. Invoking it
resolves the template's version when the run is first triggered and keeps that version for the
run's life, so re-running an old failed run silently executes the *old* template; prefer a
fresh trigger after changing it.

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
- **Each deploy pipeline needs its own named serialization group, per environment.** A "do not
  cancel in progress" setting protects a *running* job, not a *pending* one, and only one
  pending run is kept per serialization group. A job waiting at a required-reviewer gate is
  pending, so a sibling pipeline entering the same serialization group evicts it — reading as
  "cancelled", with nothing distinguishing it from any other cancellation. This silently
  dropped three production deploys of a security fix before diagnosis. A build-time check now
  fails if two pipelines declare the same serialization group. Sharing one also buys nothing:
  both pipelines deploy components of the same application, and the platform already queues
  concurrent deployment requests.
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
- **The first Administrator (§6.7) is granted by a manual script, run by hand against the
  database, once per environment** — never by the pipeline, and never self-service. The
  target Voter must already have signed in at least once (the script promotes an existing
  Voter row; it cannot create one). Every Administrator granted afterward is granted through
  the Admin Dashboard instead, by an existing Administrator — this manual step exists solely
  to bootstrap the very first one per environment.

### 12.10 Out of scope

Multi-region deployment, canary deploys and traffic splitting, automated rollback on smoke
test failure, a dedicated secrets manager, autoscaling, read replicas, cost alerting, per-PR
preview environments, and scheduled tasks beyond expiry reconciliation.

---

## 13. Acceptance Tests

Behaviour is specified in the sections above. Its executable expression lives with the code
that implements it, never in this document — see `CLAUDE.md`'s Specs section for where each
project's executable Gherkin lives, and `PROGRESS.md` for what is built versus still pending.

Where a test and this document disagree, **this document is the contract** and the test is
wrong.
