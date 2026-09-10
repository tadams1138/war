# War — Backend API Specification
**Repo:** `war-api`  
**Version:** 1.0  
**Status:** Draft  
**Date:** 2026-04-28

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Principles](#2-architecture-principles)
3. [Repository Structure](#3-repository-structure)
4. [Authentication](#4-authentication)
5. [Core Domain Concepts](#5-core-domain-concepts)
6. [Data Model](#6-data-model)
7. [API Specification](#7-api-specification)
8. [Scoring Algorithm](#8-scoring-algorithm)
9. [Vote Integrity, Abuse Prevention & Audit Trail](#9-vote-integrity-abuse-prevention--audit-trail)
10. [Custom UI Registration](#10-custom-ui-registration)
11. [Tech Stack](#11-tech-stack)
12. [CI/CD](#12-cicd)
13. [Out of Scope (v1)](#13-out-of-scope-v1)
14. [Gherkin Acceptance Tests](#14-gherkin-acceptance-tests)
15. [Implementation Status](#15-implementation-status)

---

## 1. Overview

The War API is the single authoritative backend for the War platform. It exposes a versioned REST API consumed by all frontend clients — the default UI, custom War UIs, and future mobile apps. No rendering or business logic lives outside this service.

---

## 2. Architecture Principles

- **API-first.** All business logic (scoring, matchup generation, vote validation) lives here. Clients are thin.
- **Stateless.** Every request is authenticated via Bearer JWT. No server-side session state.
- **Immutable votes.** The `votes` table is INSERT-only. Rows are never updated or deleted, and a voter's decision on a pair is final (see §9).
- **No HTML rendering.** The API returns JSON only. It serves no HTML pages.
- **CORS.** The API allows requests from registered UI origins (default UI domain + custom UI domains, configured per environment).

```
All Clients (web, mobile, custom UIs)
         │
         │  HTTPS / REST JSON
         ▼
  /api/v1/...  (this service)
         │
    ┌────┴────┐
    ▼         ▼
PostgreSQL  Object Store
            (images)
```

---

## 3. Repository Structure

```
war-api/
├── src/
│   ├── auth/           # OAuth handlers, JWT issuance
│   ├── oauth/          # OAuth 2.1 AS/RS role for third-party & MCP clients (see §4.3)
│   ├── mcp/
│   │   ├── allowedActions.ts   # the service-layer allowlist — the only import path
│   │   │                       # tools/ may use to reach another module (see §7.9)
│   │   └── tools/              # one MCP tool handler per file (see §7.9)
│   ├── wars/           # War CRUD, lifecycle transitions
│   ├── contestants/    # Contestant & image management
│   ├── matchups/       # Matchup generation, next-matchup logic
│   ├── votes/          # Vote casting, audit trail
│   ├── rankings/       # Win-count leaderboard
│   └── ui-registry/    # Custom UI slug registration (see §10)
├── db/
│   └── migrations/     # SQL migration files
├── test/
│   └── *.spec.ts       # Unit + integration tests
├── .env.example
├── Dockerfile
└── README.md
```

---

## 4. Authentication

### OAuth Providers (v1)
- Google
- Apple
- Facebook
- Microsoft Live
- Twitter / X

Extensible to GitHub, Discord, etc. without schema changes.

### Identity Rules
- Each (provider, provider_user_id) pair maps to exactly one `voters` record
- Voters may not link multiple OAuth providers to one account
- First login auto-creates a Voter; subsequent logins return the existing record

### Session Tokens
- Successful OAuth callback issues a signed **JWT** (1h expiry) and a **refresh token** (30d)
- All protected endpoints require `Authorization: Bearer <jwt>`
- Refresh tokens are stored server-side (hashed, never in plaintext) for revocation — see §4.1

### 4.1 Token Delivery

**No token is ever placed in a URL.** The OAuth callback sets the refresh token as an `HttpOnly` cookie and redirects with no credential in the path, query, or fragment. The SPA then exchanges the cookie for its first JWT:

```
1. Browser    → GET /api/v1/auth/{provider}/login
                API sets a signed `oauth_state` cookie, redirects to the provider

2. Provider   → GET /api/v1/auth/{provider}/callback?code=...&state=...
                API validates state, exchanges the code, upserts the Voter,
                sets the refresh-token cookie, and redirects to /auth/callback
                — carrying no token of any kind

3. SPA        → POST /api/v1/auth/refresh   (cookie sent automatically)
                Response body contains the JWT; SPA holds it in memory only
```

A URL fragment is not sent to servers, but it still lands in browser history, and any script on the page can read `location.hash`. Since the httpOnly cookie already exists at that moment, one extra request removes the exposure entirely.

**Step 2's "exchanges the code" must use the callback exactly as the provider sent it.** The API's callback handler builds the URL it hands to the OAuth library from the incoming request's own path and query string (`new URL(request.url, apiBaseUrl)`) — never by reconstructing one from `redirect_uri` with only `code` slotted in. Google's real callback carries additional parameters beyond `code` and `state`, at minimum `iss` — the authorization server's issuer identifier per [RFC 9207](https://www.rfc-editor.org/rfc/rfc9207). When the authorization server advertises support for it (Google does), the OAuth library validates `iss` against its discovered configuration as part of exchanging the code, and rejects the exchange outright if `iss` is missing. A reconstructed URL carrying only `code` therefore always fails against Google. The application's own `state` check (the `oauth_state` cookie compared to the query parameter, above) remains a separate, first check on this same request and is unaffected — it already runs, and continues to run, before the code is ever exchanged, which is why the token-exchange step's own state re-check is deliberately skipped rather than duplicated.

**Callback failure responses.** Step 2 can fail four distinguishable ways, and each gets an honest response of its own — never Fastify's default error handler, which is what let an upstream library's own internal error code become this route's public failure contract, three times running (PRs #10, #11, #12 each shipped a fix for a live `500 OAUTH_INVALID_RESPONSE`; the missing error boundary that let the third one reach users verbatim was flagged as a deferred finding on PR #11's design review, and this section resolves it). All four share the `{ "error": string }` shape the route's two existing checks already use; the third adds a `reason` field alongside it.

Checked in this order — each condition short-circuits every one below it:

| # | Condition | Status | Body |
|---|---|---|---|
| 1 | The callback query string carries a non-empty `error` parameter | `403` | `{ "error": "authorization declined", "reason": "<the error parameter, verbatim>" }` |
| 2 | *(else)* `code` is absent | `400` | `{ "error": "missing code" }` — unchanged |
| 3 | *(else)* the `oauth_state` cookie is absent, or doesn't match `state` | `400` | `{ "error": "state mismatch" }` — unchanged |
| 4 | *(else)* the code exchange with the provider fails | `502` | `{ "error": "authentication with Google failed" }` |
| — | *(else)* success | `302` | redirect to `${uiOrigins[0]}/auth/callback`, unchanged |

**#1 — the OAuth `error` parameter.** This is the provider reporting that authorization never happened and no code was ever issued — the ordinary "user clicked Cancel" case, `error=access_denied`, and the rest of the codes [RFC 6749 §4.1.2.1](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2.1) defines for this same parameter: the provider's own failures (`server_error`, `temporarily_unavailable`) and malformed-request signals (`invalid_request`, `unauthorized_client`, `unsupported_response_type`, `invalid_scope`). `403` reads more truthfully here than `400`: the two existing `400`s are genuinely malformed requests *to this API*; this is instead the provider declining to grant what was asked of it, which is what `403 Forbidden` means. All of the codes above map to the same status — this API does not attempt to sort "the user's choice" from "the provider's own failure," since even RFC 6749's own definition of `access_denied` ("the resource owner *or authorization server* denied the request") does not cleanly separate them either. `reason` is what distinguishes them: the raw code, passed through verbatim rather than translated or validated against a whitelist, since unlike the `reason` values §11.2.1 defines for the vote endpoint's `403` (a closed set this API owns), the set of codes a provider can send is not this API's vocabulary to close off, and a future provider is free to add to it. `error_description`, which providers may also send on this same parameter, is not surfaced — its wording belongs to the provider and this API makes no stability promise about it. This check runs *before* the state-cookie check (#3), and does not require the state cookie to match: nothing sensitive happens on this branch (no code is exchanged, no cookie is ever set), so there is nothing here for state validation to protect, and reporting the provider's actual reason is more useful than reporting a coincidental cookie mismatch instead. An empty `error` parameter (`?error=`) is treated as absent, the same way an empty `code` already is, and falls through to check #2.

**#4 — an exchange failure.** Covers a network failure reaching the provider, and any validation failure the OAuth library raises against the provider's response — a malformed token response, an invalid or missing `iss`, a missing subject claim, and anything else arising from what `googleProvider.ts` already documents as "the one piece of the OAuth flow that is a genuine external dependency: a network round-trip to Google." None of these are safe to show verbatim: they carry the OAuth library's own internal error code (`OAUTH_INVALID_RESPONSE` and its siblings) as their `message`, which is exactly the string that reached three separate users' browsers as an opaque `500`, and exactly what this section exists to stop. `502` rather than `500`: this API is acting as a gateway to the provider here, and everything in this bucket is the provider's response — or the absence of one — being unusable, not a defect in this API's own logic. Failures *downstream* of a successful exchange (the voter upsert, refresh-token issuance) are **not** part of this boundary and are not caught by it: a bug or an outage there is this API's own fault, not the provider's, and continues to surface as an unmapped `500`, exactly as today. Laundering that into an OAuth-flavored error message would be its own kind of dishonesty, and would hide a real defect behind a manufactured "the provider failed" story.

**Scope of this round.** All four responses above are JSON bodies returned directly by the API, exactly like the two `400`s that already exist — not a redirect to a UI-side error page (e.g. `/login?error=...`). The success path *does* redirect to the SPA (`${uiOrigins[0]}/auth/callback`), and every one of these failure responses is reached mid-redirect-chain in a real browser, so a raw JSON body is a poor landing page regardless of what the JSON itself says. A redirect-based failure UX would be the more complete answer to that, but it is a larger, cross-repo change — it requires `war-ui-default` to have somewhere meaningful to send the user, which does not exist yet — and is deliberately out of scope here. This round fixes the *contract*: no client, human or automated, again sees a raw library error code or a status that doesn't match what actually happened. Presenting that contract more gracefully inside a browser is escalated as a new, separate finding for a future round spanning both repos, the same way this round's finding was itself escalated from PR #11's design review rather than folded into that PR.

**Refresh cookie attributes:** `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`

`SameSite=Lax` is what makes `POST /auth/refresh` safe from CSRF — browsers omit `Lax` cookies on cross-site POST, so a hostile page cannot mint a JWT. The API additionally rejects the request if `Origin` is not a registered UI origin. `Lax` rather than `Strict` because step 2 is a cross-site top-level navigation from the provider, which `Strict` would block.

### 4.2 Refresh Token Rotation

Every call to `/auth/refresh` **invalidates the presented token and issues a new one**. Tokens are grouped into a *family* per login session.

- Each token is single-use; using it marks it `used_at` and issues a successor in the same family
- Presenting an **already-used** token means the token leaked and both parties now hold it. The entire family is revoked immediately and the response is `401` — the legitimate voter is logged out and must re-authenticate
- Presenting a revoked or expired token returns `401`
- `DELETE /auth/session` revokes the whole family

Reuse detection is the reason rotation is worth its complexity: without it, a stolen 30-day refresh token grants a year-round silent session with no signal that anything is wrong.

### 4.3 OAuth 2.1 Authorization Server for Third-Party and Machine Clients

**Revision note.** Two earlier designs occupied this section, each built around a
locally-run MCP process reached over stdio: reusing the browser flow via a
Playwright-driven cookie extraction, then a loopback/native-app flow (RFC 8252). Both are
discarded — not merged, not kept as an alternative — now that MCP access is required from
Claude's desktop and phone apps, neither of which can launch a local subprocess to talk
stdio. The MCP interface is instead served remotely, by this API itself (§7.9), so neither
earlier design's premise (a local process on the same machine as the human) applies. What
replaces them is a standards-based OAuth 2.1
authorization server (AS) and resource server (RS) role, per the
[MCP Authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization).

**This is not starting from zero.** This API already establishes identity through Google
and already issues JWTs and rotates refresh tokens with reuse detection and family
revocation (§4.1, §4.2). What is missing is the standard *protocol envelope* around that
existing token lifecycle — discovery documents, a generic (not SPA-specific) authorization
endpoint, resource-scoped tokens, and client registration — so that any spec-compliant OAuth
2.1 client, not just `war-ui-default`, can obtain one correctly.

**What is reused, unchanged:**
- Google as the sole identity provider, and the entire exchange in §4.1 (`openid-client`,
  the voter upsert, the four callback failure responses).
- JWT issuance (`jose`) and the `refresh_tokens` table's rotation, single-use enforcement,
  and reuse-detection family revocation (§4.2) — a token minted for an MCP client is an
  ordinary member of this same mechanism, not a second kind of credential.
- `war-ui-default`'s own login (§4.1, §7.1: `/auth/{provider}/login`, `/auth/{provider}/callback`,
  `/auth/refresh`, `/auth/session`) is **untouched**. This section adds a parallel surface
  for third-party OAuth clients; it does not alter the SPA's flow.

**What is new:**
- A **generic authorization endpoint** (`GET /oauth/authorize`) that any registered OAuth
  client — not only `war-ui-default` — can redirect a user to, carrying its own
  `client_id`, `redirect_uri`, PKCE challenge, and a `resource` parameter (RFC 8707)
  naming what the resulting token is for. Internally, it authenticates the human via the
  **existing** Google flow (§4.1) — this is reuse, not a rebuild of login.
- A **generic token endpoint** (`POST /oauth/token`) that mints a JWT whose `aud` claim is
  the validated `resource`, plus a refresh token in the existing `refresh_tokens` family
  mechanism.
- **Client registration**: Client ID Metadata Documents (CIMD — a client's `client_id` is
  itself an `https://` URL this API fetches and validates) as the primary mechanism, needing
  no registration call or stored row at all, and Dynamic Client Registration
  ([RFC 7591](https://www.rfc-editor.org/rfc/rfc7591), `POST /oauth/register`) retained for
  compatibility with a client that does not speak CIMD.
- **Discovery**: Authorization Server Metadata ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414),
  `GET /.well-known/oauth-authorization-server`) and Protected Resource Metadata
  ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728), `GET /.well-known/oauth-protected-resource/api/v1/mcp`
  — §4.3.5 explains the suffix), so an MCP client finds every endpoint above without being
  told any of them out of band.
- **Resource-audience enforcement** (RFC 8707 and RFC 9207 issuer validation): a token is
  only ever valid for the `resource` it was issued for, and every authorization response
  names this AS's own issuer identifier so a client can detect a mix-up between authorization
  servers.

#### 4.3.1 Implementation shape: the MCP SDK's auth router, not a hand-rolled one

`@modelcontextprotocol/sdk` ships a server-side auth module (`server/auth/*`) that already
implements the wire protocol for all of the above — metadata generation, DCR, PKCE
orchestration, and bearer-token verification middleware — driven by one interface this API
implements, `OAuthServerProvider`:

| `OAuthServerProvider` method | Backed by |
|---|---|
| `authorize(client, params, res)` | §4.1's existing Google redirect/callback, wrapped to redirect back to `client`'s own `redirect_uri` with a code instead of setting a cookie |
| `exchangeAuthorizationCode(...)` | Mints a JWT (`aud` = the request's validated `resource`) + a new `refresh_tokens` row |
| `exchangeRefreshToken(...)` | §4.2's existing rotation, generalized to accept a `resource` and re-mint the `aud` accordingly |
| `verifyAccessToken(token)` | JWT signature, expiry, and `aud` verification |
| `clientsStore.getClient(clientId)` | The `oauth_clients` table (DCR) or a live CIMD fetch (§4.3.3), depending on whether `clientId` is a bare identifier or an `https://` URL |
| `clientsStore.registerClient(...)` | Inserts an `oauth_clients` row (DCR) |

This router (`mcpAuthRouter` from the SDK) is built on Express, while this API is Fastify
(§11). `@fastify/express` mounts it as Express middleware inside the same Fastify
application and the same deployment — no second process, no second origin. The resource
server's own bearer-token check (verifying a request to the MCP endpoint itself, §7.9) does
**not** need this bridge: it is a single async call to `verifyAccessToken`, wired as an
ordinary Fastify `preHandler`, exactly like `bearerAuthRoute` already wires JWT checks
today (§4.1) — the Express bridge is needed only for the AS's own routing surface
(`/oauth/authorize`, `/oauth/token`, `/oauth/register`, the two `/.well-known/*` documents).

**Choosing this over hand-rolling the wire protocol is itself a minimum-sufficient-work
choice**, not laziness: RFC 8414/9728/7591's exact document shapes, header names, and error
formats are exactly the kind of detail that's easy to get subtly wrong and hard to notice
wrong, since the failure mode is "some MCP clients can't discover this server," not a loud
error. Reusing the SDK's implementation for that wire protocol, and reserving this API's own
code for the parts that are genuinely this platform's business — *who* a token represents
and *what* it's good for — is the same reasoning §11's choice of `openid-client` over
hand-rolling Google's OAuth already rests on.

#### 4.3.2 `GET /oauth/authorize`

Standard OAuth 2.1 authorization request parameters, per RFC 6749/8252/7636/8707:
`response_type=code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method=S256`,
`resource`, `state` (opaque, client-supplied, echoed back unmodified), `scope` (optional).

| Check | Failure |
|---|---|
| `client_id` does not resolve to a registered or CIMD-fetchable client (§4.3.3) | `400`, per RFC 6749 §4.1.2.1 — no redirect, since this API cannot trust an unverified `redirect_uri` yet |
| `redirect_uri` is absent, or is not one of the resolved client's registered URIs | `400`, no redirect, for the same reason |
| *(from here, errors redirect to `redirect_uri` with `error=...&state=...`, per RFC 6749)* | |
| `code_challenge_method` is not `S256` | `error=invalid_request` |
| `resource` is absent, or does not match this deployment's own canonical resource identifier (`${PUBLIC_BASE_URL}/api/v1/mcp` — no other value is issued for in this slice) | `error=invalid_target` (RFC 8707) |

On success: authenticate the human via the **existing, unmodified** Google flow (§4.1) —
this endpoint's implementation of `OAuthServerProvider.authorize` internally performs the
same redirect-to-Google-and-back §4.1 already does, not a new login UI. Once that completes,
redirect to the *client's* `redirect_uri` (never `${uiOrigins[0]}/auth/callback` — that
target is specific to `war-ui-default`'s own login, §4.1, and is untouched) with `code` and
`state`. The authorization response also carries `iss=<this AS's issuer URL>` (RFC 9207),
so a client juggling multiple authorization servers can detect a mix-up before ever using
the code.

#### 4.3.3 Client registration

**Client ID Metadata Documents — the primary mechanism (§15's build order, slice 1).** A
client presents an `https://` URL as its `client_id` directly, with no registration call.
This API fetches that URL, expects a JSON document naming (at minimum) `redirect_uris`, and
treats it as the client's registration — no `oauth_clients` row is written. Fetching an
arbitrary client-supplied URL is a real SSRF surface, so this fetch: uses `https://` only;
resolves and rejects any target resolving to a private, loopback, or link-local address;
applies a short timeout and a small response-size cap; and is never followed through a
redirect to a second host without re-validating that host against the same rules. A
successful fetch MAY be cached briefly (the document is not expected to change
request-to-request), keyed by the URL.

**Dynamic Client Registration (RFC 7591, `POST /oauth/register`) — the compatibility path
(slice 3).** The MCP authorization specification states CIMD as a SHOULD and DCR as a MAY
it explicitly calls "deprecated and retained for backwards compatibility with authorization
servers that do not support Client ID Metadata Documents" — since this AS supports CIMD
from slice 1, DCR exists here only for a client that, for its own reasons, does not. Body:
`{ redirect_uris: [...], client_name, ... }` (the SDK's handler owns the exact schema). On
success, inserts an `oauth_clients` row and returns a `client_id` (no `client_secret` —
every client here is a **public client**: PKCE is the code-interception defense, per OAuth
2.1's own guidance for clients that cannot keep a secret confidential, which describes
exactly an app installed on a user's own phone or desktop).

#### 4.3.4 `POST /oauth/token`

`grant_type=authorization_code` (with `code`, `code_verifier`, `redirect_uri`, `resource`)
or `grant_type=refresh_token` (with `refresh_token`, `resource`). Both re-validate `resource`
against the same allow-list §4.3.2 checks — a caller cannot silently widen a token's
audience on refresh.

| Check | Failure |
|---|---|
| The `code` (or `refresh_token`) is unknown, expired, or already used | `400 { "error": "invalid_grant" }` |
| PKCE verification fails (`authorization_code` grant) | `400 { "error": "invalid_grant" }` — same code as the row above; this endpoint does not distinguish "no such code" from "wrong verifier" |
| `resource` does not match the value the code/token was originally bound to | `400 { "error": "invalid_target" }` |

On success: `200` with `{ "access_token": "<jwt>", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "<token>" }`
— RFC 6749's standard token response shape, distinct from §7.1's bespoke
`{ token, refresh_token, voter }` body the SPA's own callback uses; third-party OAuth
clients expect the standard shape, and this API does not ask them to parse a bespoke one.

The authorization code itself is stored hashed (`authorization_codes` table, §6), single-use
(deleted on every redemption attempt, successful or not — same reasoning §4.2 already applies
to refresh-token reuse), and expires after 60 seconds.

#### 4.3.5 Discovery documents

**Two identifiers, not one — do not conflate them.** This AS's `issuer` is the bare
deployment origin, `${PUBLIC_BASE_URL}` (e.g. `https://war.tmad.dev`), with no path
component: this AS could in principle protect more than one resource later, so its own
identity is the origin, not any one resource's path. The **resource identifier** the MCP
interface protects is `${PUBLIC_BASE_URL}/api/v1/mcp` (§7.9) — a path *under* that origin.
The two well-known documents below sit at different locations precisely because one
identifier has a path component and the other does not.

- `GET /.well-known/oauth-authorization-server` (RFC 8414): this AS's own metadata —
  `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`,
  `code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true`.
  Served at the **bare** well-known path, because `issuer` has no path component to insert
  it around.
- `GET /.well-known/oauth-protected-resource/api/v1/mcp` (RFC 9728) — **not** the bare
  `/.well-known/oauth-protected-resource`: names this resource (`${PUBLIC_BASE_URL}/api/v1/mcp`)
  and points to the issuer above as its authorization server, per the MCP spec's requirement
  that the *resource* (this API) advertises which AS protects it. **The path is suffixed
  because the resource identifier has a path component**, per
  [RFC 9728 §3.1](https://www.rfc-editor.org/rfc/rfc9728#section-3.1): "If the resource
  identifier value contains a path or query component, any terminating slash (/) following
  the host component MUST be removed before inserting /.well-known/ and the well-known URI
  path suffix between the host component and the path and/or query components." A compliant
  MCP client constructs exactly this suffixed URL from the resource identifier — the bare
  path is not a fallback or an alternative location; a request there is expected to 404.
  **Do not "simplify" this back to the bare path**: it was wrong once already (this
  document originally specified the bare path for this document, an error caught in design
  review of slice 1's implementation and corrected here — the RFC's rule, not this
  document's earlier wording, is authoritative).

Both are generated by the SDK's router from the same configuration this API already needs
for §4.3.1–§4.3.4; neither is hand-maintained prose.

**On RFC 8414's own analogous rule for `issuer`:** RFC 8414 defines a well-known-URI
construction for an issuer that itself has a path component, structurally similar to RFC
9728 §3.1 above. This AS's `issuer` has no path component (it is `${PUBLIC_BASE_URL}`, the
bare origin), so that rule does not appear to require anything beyond the bare
`/.well-known/oauth-authorization-server` path already specified. **This is stated with
less confidence than the RFC 9728 correction above** — this document has not fetched RFC
8414's own text to confirm the exact trigger condition and construction rule, and asserting
it from training knowledge is the same mistake that produced this section's original RFC
9728 error. If `issuer` ever gains a path component in a future revision, RFC 8414 itself
must be checked directly before assuming the bare path still applies.

#### 4.3.6 The resource server side: protecting `/api/v1/mcp`

A request to the MCP endpoint (§7.9) without a valid, correctly-audienced bearer token gets:
- **`401`** with a `WWW-Authenticate: Bearer resource_metadata="<PRM URL>"` header, when the
  token is missing, malformed, expired, or its `aud` does not name this resource — the header
  is what lets a compliant MCP client discover the AS and retry the OAuth dance on its own,
  per the MCP authorization spec.
- **`403`** with `WWW-Authenticate: Bearer error="insufficient_scope", scope="..."`, when the
  token is otherwise valid but lacks a scope this slice's tools require (§7.9 — this slice
  defines no scopes narrower than "authenticated voter," so this case does not arise yet, but
  the header shape is specified now so a future scoped tool does not need a new error
  convention invented for it).

**This API never accepts a token whose `aud` is not its own resource identifier, and never
forwards a bearer token it received to any other service** — the two MUSTs the MCP
authorization spec states plainly, and the reason a separate "does `war-mcp` forward its
token to `war-api`" question does not arise here: there is no second service to forward
anything to (§7.9).

---

## 5. Core Domain Concepts

### War
A named voting campaign.

| Field | Notes |
|---|---|
| Title | e.g. "Miss Universe 2026" |
| Category / Tag | Optional; for filtering |
| Status | `draft` → `active` → `closed` |
| Visibility | `public` or `invite_only` |
| End Date | Optional; auto-closes War when reached |
| UI Slug | Optional; references a registered custom UI (see §10) |

**Status transitions:**
```
draft ──► active ──► closed
                └──► closed (manual or end date)
```

#### Effective Status

`ends_at` is enforced **lazily on every read and write**. A War is treated as closed the instant `ends_at` passes, regardless of what the `status` column currently holds:

```
effective_status(war) = 'closed'  if war.ends_at IS NOT NULL AND war.ends_at <= now()
                      = war.status  otherwise
```

All endpoints evaluate `effective_status`, never the raw column. A vote cast one second after `ends_at` returns `403`, and `GET /wars/:id` reports `"status": "closed"`, even though the stored value is still `active`.

A nightly scheduled task (`war-infra-spec.md` §12) converges the stored `status` so that list queries can filter on an indexed column rather than a computed expression. That task is **housekeeping only** — correctness never depends on it having run. If it fails for a week, voting behaviour stays correct and only query efficiency and reporting freshness degrade.

### Contestant
A participant in a War. Has a name, optional bio, media appropriate to the War's `media_mode`, and attributes defined by the War's `contestant_schema`.

### Contestant Schema

Different campaigns describe their contestants with entirely different facts. A pageant needs country, age, and height; a presidential primary needs party, state, and office held. These are not two layouts of the same data — they are different fields, and a fixed `name` + `bio` model has nowhere to put either set.

A War therefore declares an **ordered list of typed fields** at creation, and each contestant supplies values for them:

```json
"contestant_schema": [
  { "key": "country", "label": "Country", "type": "string" },
  { "key": "age",     "label": "Age",     "type": "number" },
  { "key": "height",  "label": "Height",  "type": "string" }
]
```

```json
"attributes": { "country": "Brazil", "age": 24, "height": "175cm" }
```

A presidential primary declares `party`, `state`, and `office` instead. **The same code renders both** — no per-campaign templates, no layout variants, no branching.

| Rule | Value |
|---|---|
| Maximum fields per War | 12 |
| `key` format | `^[a-z][a-z0-9_]{0,31}$` |
| `label` length | ≤ 64 characters |
| `type` | `string` \| `number` \| `text` \| `url` \| `date` |
| Editable | Draft only, like all other War configuration |

**All values render as text.** They are never interpreted as markup. `url` is the sole exception: it renders as a link, and the API rejects any value whose scheme is not `http` or `https` at write time — so a `javascript:` URL never reaches storage, let alone a client.

Fields are optional: a contestant may omit any key. Order comes from the schema, not from the contestant.

This is deliberately *not* a presentation mechanism. It changes what data a contestant carries, not how it looks. Radically different presentation is what custom UIs are for (`war-ui-custom-spec.md` §1).

### Media Mode

A War declares at creation whether its contestants are presented as **images** or as **embedded video**. The mode is fixed for the War's lifetime and applies to every contestant in it.

| Mode | Contestant media | Presentation |
|---|---|---|
| `image` (default) | 1–10 images, ordered; `display_order = 0` is primary | Two cards side by side, each swipeable through that contestant's images |
| `video` | exactly one embedded video | Two players; the left video plays, then the right (§11.3) |

**Mixed media within a War is not permitted.** A matchup pairing a video against a photograph has no coherent presentation — there is no way to play one and show the other that treats both contestants equally. Activation fails with `422` if any contestant's media does not match the War's mode.

Mode affects presentation only. Matchup generation, pair selection, side randomisation, vote recording, and ranking are identical in both modes.

### Matchup
An **unordered** head-to-head pairing of two contestants. For `n` contestants: `n(n-1)/2` matchups. Generated on War activation. Immutable after generation.

A pairing has no direction: **A vs B and B vs A are the same matchup**. This is enforced structurally by storing contestants in canonical order (`contestant_a_id < contestant_b_id`, §6), so a mirrored duplicate row cannot exist and a voter cannot accumulate one vote for each side of the same pair.

Which contestant is *displayed* on which side is a separate, per-voter presentation concern (§7.4) and carries no meaning.

### Vote
A voter's pick in a Matchup. **Immutable and final** — one vote per voter per matchup, enforced by a unique constraint. There is no supersede mechanism and no way to change a decided vote (§9).

Every contestant carries two denormalised counters, maintained in the same transaction as the vote insert:

| Counter | Meaning |
|---|---|
| `win_count` | Votes where this contestant was the winner |
| `appearance_count` | Votes cast on any matchup containing this contestant |

Because votes are immutable, both counters increase monotonically and never require recomputation. They drive both pair selection (§7.4) and rankings (§8).

---

## 6. Data Model

```sql
voters (
  id               UUID PRIMARY KEY,
  provider         VARCHAR(32) NOT NULL,       -- 'google' | 'apple' | 'facebook' | 'microsoft' | 'twitter'
  provider_user_id VARCHAR(256) NOT NULL,
  display_name     VARCHAR(256),
  avatar_url       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (provider, provider_user_id)
)

wars (
  id               UUID PRIMARY KEY,
  creator_id       UUID REFERENCES voters(id),
  title            VARCHAR(256) NOT NULL,
  category         VARCHAR(64),
  status           VARCHAR(16) NOT NULL DEFAULT 'draft',
  visibility       VARCHAR(16) NOT NULL DEFAULT 'public',
  media_mode       VARCHAR(8) NOT NULL DEFAULT 'image',     -- 'image' | 'video' (§5)
  contestant_schema JSONB NOT NULL DEFAULT '[]',            -- ordered field definitions (§5)
  ends_at          TIMESTAMPTZ,
  ui_slug          VARCHAR(64),                            -- optional custom UI
  created_at       TIMESTAMPTZ DEFAULT now()
)

contestants (
  id               UUID PRIMARY KEY,
  war_id           UUID REFERENCES wars(id),
  name             VARCHAR(256) NOT NULL,
  bio              TEXT,
  attributes       JSONB NOT NULL DEFAULT '{}',   -- keyed by the War's contestant_schema (§5)
  win_count        INT NOT NULL DEFAULT 0,        -- votes won (§5)
  appearance_count INT NOT NULL DEFAULT 0,        -- votes cast on pairs containing this contestant
  created_at       TIMESTAMPTZ DEFAULT now()
)

-- Refresh token families, rotated on every use (§4.2)
refresh_tokens (
  id               UUID PRIMARY KEY,
  voter_id         UUID REFERENCES voters(id),
  family_id        UUID NOT NULL,                -- one family per login session
  token_hash       TEXT NOT NULL,                -- SHA-256; plaintext is never stored
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,                  -- set on rotation; reuse ⇒ revoke family
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (token_hash)
)

-- A contestant's media: images or one embedded video, per the War's media_mode (§5)
contestant_media (
  id                UUID PRIMARY KEY,
  contestant_id     UUID REFERENCES contestants(id),
  kind              VARCHAR(8) NOT NULL,         -- 'image' | 'video'
  display_order     INT NOT NULL DEFAULT 0,      -- 0 is primary

  -- kind = 'image' (§11.1)
  storage_key       TEXT,                        -- base key; variant URLs derived
  original_ext      VARCHAR(8),
  width             INT,                         -- source dimensions, for aspect ratio
  height            INT,

  -- kind = 'video' (§11.3) — we store an identity, never a raw URL
  provider          VARCHAR(16),                 -- 'youtube' | 'vimeo'
  provider_video_id VARCHAR(64),
  start_seconds     INT,                         -- optional clip window
  end_seconds       INT,
  duration_seconds  INT NOT NULL DEFAULT 0,      -- effective play length, validated on add
  poster_url        TEXT,                        -- from the provider's oEmbed response
  title             TEXT,

  created_at        TIMESTAMPTZ DEFAULT now(),

  CHECK (
    (kind = 'image' AND storage_key IS NOT NULL)
    OR
    (kind = 'video' AND provider IS NOT NULL AND provider_video_id IS NOT NULL)
  )
)

matchups (
  id               UUID PRIMARY KEY,
  war_id           UUID REFERENCES wars(id),
  contestant_a_id  UUID REFERENCES contestants(id),
  contestant_b_id  UUID REFERENCES contestants(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (war_id, contestant_a_id, contestant_b_id),
  CHECK (contestant_a_id < contestant_b_id)       -- canonical order: A vs B == B vs A
)

war_memberships (
  war_id           UUID REFERENCES wars(id),
  voter_id         UUID REFERENCES voters(id),
  joined_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (war_id, voter_id)
)

votes (
  id               UUID PRIMARY KEY,
  matchup_id       UUID REFERENCES matchups(id),
  voter_id         UUID REFERENCES voters(id),
  winner_id        UUID REFERENCES contestants(id),
  presented_left_id UUID REFERENCES contestants(id) NOT NULL,  -- side shown (§7.4)
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (matchup_id, voter_id)                   -- one final vote per voter per pair (§9)
)

-- Registered OAuth clients for the AS role (§4.3.3) — Dynamic Client Registration only;
-- a Client ID Metadata Document client has no row here at all (§4.3.3)
oauth_clients (
  client_id        UUID PRIMARY KEY,
  redirect_uris    JSONB NOT NULL,                -- array of registered redirect URIs
  client_name      TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
)

-- Single-use authorization codes for the OAuth 2.1 AS (§4.3.4), never a bearer credential
authorization_codes (
  id               UUID PRIMARY KEY,
  voter_id         UUID REFERENCES voters(id),
  client_id        TEXT NOT NULL,                 -- an oauth_clients.client_id, or a CIMD URL
  code_hash        TEXT NOT NULL,                 -- SHA-256; plaintext exists only in the redirect
  code_challenge   TEXT NOT NULL,                 -- PKCE S256 challenge, verified at redemption
  redirect_uri     TEXT NOT NULL,                 -- must match exactly at redemption
  resource         TEXT NOT NULL,                 -- RFC 8707 audience this code was issued for
  expires_at       TIMESTAMPTZ NOT NULL,           -- 60 seconds from issuance
  used_at          TIMESTAMPTZ,                    -- set on any redemption attempt, success or not
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (code_hash)
)

-- Indexes
CREATE INDEX ON votes (voter_id, matchup_id);     -- unvoted-pair lookup (§7.4)
CREATE INDEX ON refresh_tokens (family_id);       -- family revocation on reuse (§4.2)
CREATE INDEX ON contestant_media (contestant_id, display_order);
CREATE INDEX ON matchups (war_id);
CREATE INDEX ON contestants (war_id);
CREATE INDEX ON wars (status, visibility);        -- browse/filter (§7.2)
CREATE INDEX ON wars (ends_at) WHERE ends_at IS NOT NULL;  -- expiry sweep (§7.7)
CREATE INDEX ON authorization_codes (expires_at); -- expiry cleanup (§4.3)

-- Custom UI registry (see §10)
ui_registrations (
  slug             VARCHAR(64) PRIMARY KEY,
  label            VARCHAR(256),
  static_base_path TEXT NOT NULL,               -- CDN path prefix for this UI's assets
  registered_at    TIMESTAMPTZ DEFAULT now()
)
```

---

## 7. API Specification

**Base path:** `/api/v1`  
**All responses:** `Content-Type: application/json`  
**Auth:** `Authorization: Bearer <jwt>` where marked 🔒  
**Pagination:** cursor-based on all list endpoints  
**Contract:** published as OpenAPI 3.1 at `GET /api/v1/openapi.json`, generated from route schemas (§11.2)

### Media Representation

Wherever a contestant appears in a response it carries a `media` array, ordered by `display_order`. Its contents depend on the War's `media_mode` (§5). Clients render what they are given and never construct media URLs themselves.

**`kind: "image"`** — clients build a `srcset` from `variants`:

```json
{
  "kind": "image",
  "id": "uuid",
  "display_order": 0,
  "aspect_ratio": 0.75,
  "variants": [
    { "width": 400,  "url": "https://war.tmad.dev/media/contestants/{cid}/{mid}-400.webp"  },
    { "width": 800,  "url": "https://war.tmad.dev/media/contestants/{cid}/{mid}-800.webp"  },
    { "width": 1600, "url": "https://war.tmad.dev/media/contestants/{cid}/{mid}-1600.webp" }
  ]
}
```

A variant is omitted when the source was narrower than that width — images are never upscaled (§11.1).

**`kind: "video"`** — clients embed via the provider's player API (§11.3):

```json
{
  "kind": "video",
  "id": "uuid",
  "display_order": 0,
  "provider": "youtube",
  "video_id": "dQw4w9WgXcQ",
  "start_seconds": 0,
  "end_seconds": 30,
  "duration_seconds": 30,
  "title": "...",
  "poster_url": "https://i.ytimg.com/vi/.../hqdefault.jpg",
  "aspect_ratio": 1.778
}
```

The API returns a provider and an id, **never an embed URL**. The client constructs the player URL from its own allow-list, so a compromised or mistaken database value cannot cause an arbitrary third-party frame to load.

In responses below this array is abbreviated as `media: [ … ]`.

---

### 7.1 Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/{provider}/login` | — | Redirect to OAuth provider |
| `GET` | `/auth/{provider}/callback` | — | OAuth callback; returns JWT + refresh token |
| `POST` | `/auth/refresh` | — | Exchange refresh token for new JWT |
| `DELETE` | `/auth/session` | 🔒 | Logout / invalidate refresh token |
| `GET` | `/auth/me` | 🔒 | Current voter profile |
| `GET` | `/oauth/authorize` | — | Generic OAuth 2.1 authorization endpoint for third-party/MCP clients (§4.3.2) |
| `POST` | `/oauth/token` | — | Generic OAuth 2.1 token endpoint (§4.3.4) |
| `POST` | `/oauth/register` | — | Dynamic Client Registration, RFC 7591 (§4.3.3) |
| `GET` | `/.well-known/oauth-authorization-server` | — | Authorization Server Metadata, RFC 8414 (§4.3.5) |
| `GET` | `/.well-known/oauth-protected-resource/api/v1/mcp` | — | Protected Resource Metadata, RFC 9728 (§4.3.5 — path suffixed per RFC 9728 §3.1; not served at the bare `/.well-known/oauth-protected-resource`) |

**`GET /auth/{provider}/callback` response `200`:**
```json
{
  "token": "<jwt>",
  "refresh_token": "<token>",
  "voter": { "id": "uuid", "display_name": "Jane", "avatar_url": "https://..." }
}
```

**`POST /oauth/token` response `200`:** the standard RFC 6749 token shape — see §4.3.4.
Deliberately not the bespoke body above; third-party OAuth clients expect the standard
shape, and this endpoint is not `war-ui-default`'s own.

---

### 7.2 Wars

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/wars` | — (`creator=me` requires 🔒) | List wars (paginated, filterable) |
| `POST` | `/wars` | 🔒 | Create war (status: draft) |
| `GET` | `/wars/:id` | — | War detail + contestants |
| `PATCH` | `/wars/:id` | 🔒 | Update war (draft only) |
| `POST` | `/wars/:id/activate` | 🔒 | draft → active; generates matchups |
| `POST` | `/wars/:id/close` | 🔒 | active → closed |
| `POST` | `/wars/:id/join` | 🔒 | Voter joins war |

**`GET /wars` query params:** `status`, `category`, `creator`, `cursor`, `limit` (default 20, max 100)

**`creator` query param.** The only accepted value is the literal string `me`; any other
value fails Fastify's own querystring validation and returns its standard envelope — the
same shape §11.2.1 already documents for the vote endpoint's malformed body, never this
API's own `{ error }` shape. `creator=me` requires `Authorization: Bearer <jwt>`; a
missing or invalid token returns `401`. Every other combination of query parameters on
this route remains unauthenticated, exactly as today. When `creator=me` is present and
the token is valid, the returned list is scoped to Wars whose `creator_id` is the
authenticated voter's id, across **every** status — draft, active, and closed alike,
including invite_only ones that voter created — and combines with `status` and
`category` exactly as those two already combine with each other (`creator=me&status=draft`
returns only the requester's own draft Wars). See §11.2.1, "Addendum (2026-09-01)" for the
exact schemas.

**Default scoping (no `creator=me`).** Absent `creator=me`, this endpoint never returns a
War whose `visibility` is `invite_only`, nor a War whose `status` is `draft` — a draft War
is, by definition, not ready for anyone but its creator to see, and an invite-only War is
never visible outside `creator=me` no matter who is asking. Both restrictions apply
**regardless of any `status` filter supplied**, so `status=draft` without `creator=me`
returns an empty list rather than another voter's drafts, and `status=active` or
`status=closed` narrows the public, non-draft set exactly as it did before this
restriction existed. Being authenticated grants no extra visibility on its own: a signed-in
caller who is not the War's creator sees exactly what an anonymous caller sees on this
path; only `creator=me` widens it, and only for that voter's own Wars. When `status` is
omitted entirely (as well as `creator`), the default is `status = active` — matching the
"browse active public Wars" behaviour `war-ui-default-spec.md` §12 already documents for
Home — so the unfiltered call every unauthenticated browse surface makes returns public,
active Wars only. This closes a gap that predates this addendum: `listWars` previously
applied no visibility or status default at all, so an unfiltered `GET /wars` returned every
voter's `draft` and `invite_only` Wars to anyone who asked.

**`POST /wars` body:** `{ "title": "...", "category": "...", "visibility": "public", "media_mode": "image", "contestant_schema": [ … ], "ends_at": "..." }`

**`POST /wars` rules:**
- `title` is required, 1–256 characters → else `422`
- `category` is optional and free-form
- `visibility` defaults to `public`; any other value must be `invite_only` → else `422`
- `media_mode` defaults to `image`; `video` is rejected with `422` in this slice — the column and the video-specific endpoints exist (§6, §7.3) but video mode itself is not implemented (§15)
- `contestant_schema`, if supplied, is validated per §5's field rules → else `422`
- `ends_at`, if supplied, must parse as a date-time → else `422`
- The War is created in `draft` status, owned by the authenticated voter

**`POST /wars/:id/activate` rules:**
- Requires ≥ 2 contestants → else `422`
- Requires every contestant to have **at least one image** → else `422` (image mode; a War cannot go live with a contestant no voter can see)
- Generates all `n(n-1)/2` matchups atomically
- Requester must be War creator → else `403`
- War must be `draft` → else `403`

---

### 7.3 Contestants

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/wars/:id/contestants` | 🔒 | Add contestant (draft only) |
| `PATCH` | `/wars/:id/contestants/:cId` | 🔒 | Update name/bio (draft only) |
| `DELETE` | `/wars/:id/contestants/:cId` | 🔒 | Remove contestant (draft only) |
| `POST` | `/wars/:id/contestants/:cId/images` | 🔒 | Upload images (draft only, multipart; `image` mode) |
| `POST` | `/wars/:id/contestants/:cId/video` | 🔒 | Attach embedded video (draft only; `video` mode) |
| `PATCH` | `/wars/:id/contestants/:cId/media/:mId` | 🔒 | Reorder / set primary (draft only) |
| `DELETE` | `/wars/:id/contestants/:cId/media/:mId` | 🔒 | Remove media item (draft only) |

**`POST /wars/:id/contestants` body:** `{ "name": "...", "bio": "...", "attributes": { … } }`

**`POST /wars/:id/contestants` rules:**
- `name` is required, 1–256 characters → else `422`
- `bio` is optional
- War must be `draft` and requester must be its creator → else `403`
- The created contestant starts with no media; it blocks activation until at least one image is added (see "`POST /wars/:id/activate` rules" above)

**Contestant attributes.** `POST` and `PATCH` accept an `attributes` object validated against the War's `contestant_schema` (§5):

- A key not present in the schema → `422`
- A value whose type does not match its declared `type` → `422`
- `string` ≤ 256 chars, `text` ≤ 2000, `url` ≤ 512 and scheme `http`/`https` only
- Omitted keys are permitted; every field is optional

Responses return attributes **resolved against the schema**, so clients need not fetch it separately and cannot render fields out of order:

```json
"attributes": [
  { "key": "country", "label": "Country", "type": "string", "value": "Brazil" },
  { "key": "age",     "label": "Age",     "type": "number", "value": 24 }
]
```

**`POST /images` rules:**
- Rejected with `409` if the War's `media_mode` is `video`
- A file must be present in the multipart body → else `422`, plain `{ error }` with no
  `details` (§11.2.1 — deliberately asymmetric with the two rules below)
- Maximum **10 images per contestant** → else `422` with `details` naming the limit
  (§11.2.1)
- The uploaded buffer must be a readable image → else `422` with `details` naming the
  failure (§11.2.1)
- New images append at the next `display_order`; `PATCH` reorders

**`POST /video` body:** `{ "url": "...", "start_seconds": 0, "end_seconds": 30 }`

**Rules:**
- Rejected with `409` if the War's `media_mode` is `image`, or if the contestant already has a video
- `url` must belong to a supported provider → else `422` (§11.3)
- Effective duration (`end_seconds − start_seconds`, or the full video) must be ≤ **60 seconds** → else `422`
- The API resolves the URL through the provider's oEmbed endpoint at add time and stores the provider, video id, poster, and title. A video that is private, deleted, or not embeddable is rejected with `422` **at add time**, not discovered mid-War

---

### 7.4 Matchups & Voting

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/wars/:id/matchups/next` | 🔒 | Next unvoted matchup for this voter |
| `POST` | `/wars/:id/matchups/:mId/vote` | 🔒 | Cast vote (final; see §9) |
| `GET` | `/wars/:id/my-progress` | 🔒 | Voter's vote count vs total |

Every voter is served **every pair** in the War, in randomised order, and is never served a pair they have already voted on. When all pairs are voted, `/matchups/next` returns `204`.

A voter is under no obligation to finish. Unvoted pairs are simply absent from the data — abandoning midway is expected, not penalised, and produces no record of any kind (§9.2).

#### Pair Selection

`/matchups/next` returns the voter's unvoted pair whose two contestants have the **lowest combined `appearance_count`**, with ties broken by a per-voter deterministic shuffle:

```sql
SELECT m.*
FROM matchups m
JOIN contestants ca ON ca.id = m.contestant_a_id
JOIN contestants cb ON cb.id = m.contestant_b_id
WHERE m.war_id = :war_id
  AND NOT EXISTS (
    SELECT 1 FROM votes v
    WHERE v.matchup_id = m.id AND v.voter_id = :voter_id
  )
ORDER BY (ca.appearance_count + cb.appearance_count) ASC,
         md5(m.id::text || :voter_id::text)
LIMIT 1
```

This keeps every contestant's `appearance_count` near-equal across the War, which is what makes raw win counts a correct ranking (§8). Without it, an over-shown contestant accumulates wins purely from exposure.

The `md5(matchup_id || voter_id)` term is a **stable** shuffle: the order is random across voters and across pairs, but identical every time for a given voter, so the sequence survives reconnects and device changes. It never uses `random()`, which would reshuffle on every request.

#### Side Randomisation

Which contestant appears on the left is decided by the API, not the client, and is derived from the same stable hash so a page refresh does not swap the cards:

```
left = contestant_a  if  hash(matchup_id || voter_id || 'side') is even
     = contestant_b  otherwise
```

The presented side is recorded on the vote (`presented_left_id`). Position bias is real and measurable in pairwise voting; recording the side costs one column and is the only way the audit trail in §9.3 can ever detect it. Clients must render the order the API returns and must not shuffle it themselves.

**`GET /matchups/next` response `200`:**
```json
{
  "matchup": {
    "id": "uuid",
    "left":  { "id": "uuid", "name": "...", "media": [ … ] },
    "right": { "id": "uuid", "name": "...", "media": [ … ] }
  },
  "progress": { "voted": 3, "total": 253 }
}
```

`total` is the full pair count for the War (`n(n-1)/2`), not a per-voter sample.

**`204`** when the voter has voted on every pair.

#### Prefetching the next matchup

The response also carries a `prefetch` block naming the media of the matchup that **would be served next**:

```json
"prefetch": {
  "matchup_id": "uuid",
  "media": [ … ]
}
```

Clients warm those URLs while the voter is deciding the current pair. Without it every vote is followed by a visible blank while the next images download — at roughly 3 seconds per decision, a 500ms load is a sixth of the interaction, and it lands precisely when the voter is waiting to act.

`prefetch` is advisory. Because pair selection depends on `appearance_count`, which other voters are changing concurrently, the prefetched matchup may not be the one actually served. A miss costs a wasted request, never a wrong pair — the served matchup is always whatever `/matchups/next` returns at the time. It is omitted when the voter has one pair or fewer remaining.

In `video` mode `prefetch` carries the poster image only. Prefetching third-party video would mean loading a second player for a matchup that may never be shown.

**`POST /vote` body:** `{ "winner_id": "<uuid>" }`  
**Rules:**
- `winner_id` must be a contestant in this matchup → else `422`
- War must be `active` by effective status (§5) → else `403`
- Voter must have joined → else `403`
- **A vote is final.** If this voter already voted on this matchup:
  - same `winner_id` → `200` (treated as a retry; no new row, no counter change)
  - different `winner_id` → `409` (rejected; no state change)

The same-winner case makes the endpoint idempotent without an idempotency key, so a client retrying after a dropped connection succeeds rather than erroring. A genuine change of mind is refused.

The vote insert and both counter increments (`win_count` on the winner, `appearance_count` on both contestants) occur in **one transaction**.

---

### 7.5 Rankings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/wars/:id/rankings` | — (public wars) | Ranked leaderboard |

**Response `200`:**
```json
{
  "war_id": "uuid",
  "status": "active",
  "updated_at": "2026-04-28T12:00:00Z",
  "rankings": [
    {
      "rank": 1,
      "contestant": { "id": "uuid", "name": "...", "media": [ … ] },
      "wins": 320,
      "appearances": 400
    }
  ]
}
```

`appearances` is shown for transparency — it lets a viewer confirm contestants have been shown comparably often, which is the assumption the ranking rests on (§8).

**Caching.** This endpoint sets `Cache-Control: public, max-age=30`, matching the UI's 30-second poll interval (`war-ui-default-spec.md` §6). Thousands of concurrent viewers collapse to roughly one origin query per 30 seconds per edge location. Rankings for `invite_only` Wars set `Cache-Control: private, max-age=30` so they are never stored at a shared cache.

---

### 7.6 Custom UI Registry

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/ui-registry` | — | List registered UI slugs |
| `GET` | `/ui-registry/:slug` | — | Resolve slug to static base path |

See §10 for full detail.

---

### 7.7 Internal Endpoints

Endpoints under `/api/v1/internal/*` are invoked by the scheduler (`war-infra-spec.md` §12), never by clients. They accept no user JWT and are blocked at the edge for all other callers.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/internal/close-expired-wars` | 🔑 | Set `status = 'closed'` for Wars past `ends_at` |

**🔑 Auth:** `X-Internal-Token` header matching the `INTERNAL_TASK_TOKEN` secret. Any other value, or its absence, returns `401`.

**`POST /internal/close-expired-wars`:**

```sql
UPDATE wars SET status = 'closed'
WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= now()
```

**Response `200`:** `{ "closed": 4 }`

**Rules:**
- Idempotent — safe to run repeatedly, concurrently, and after arbitrary delay. A re-run with nothing newly expired affects zero rows and still returns `200`.
- Changes no observable behaviour, because §5 already treats these Wars as closed. It only materialises the stored value.
- Excluded from any public API documentation or generated client.

---

### 7.8 Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Liveness check — process is up and answering HTTP |

**Response `200`:** `{ "status": "ok" }`

No auth, no dependency on the database or object storage. Polled by App Platform's `health_check` (`war-infra-spec.md` §15.2) to decide whether a deployment is serving traffic yet; not meant to reflect downstream health.

---

### 7.9 MCP Interface

An [MCP](https://modelcontextprotocol.io) endpoint lets a War Creator build and edit War
content — Wars, contestants, images — from an MCP client (Claude's desktop app, its mobile
app, or any other spec-compliant client) instead of `war-ui-default`'s creation wizard.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST`/`GET`/`DELETE` | `/api/v1/mcp` | 🔒 (§4.3.6) | MCP Streamable HTTP endpoint |

**One service, one authority, no backdoor.** This is not a separately deployed client of
this API — it is a second protocol binding served by this same process, alongside REST. The
architectural constraint an earlier design stated for a separate `war-mcp` client —
"authorization stays in one place, and rate limiting and moderation apply automatically" —
is not weakened by folding it in here; it is strengthened structurally. Every MCP tool
handler below calls the **identical service-layer function** the corresponding REST route
handler calls — not a second HTTP request to itself, and not a reimplementation. There is
exactly one copy of every business rule in this document; the MCP surface and the REST
surface are two ways of reaching it, not two things that could drift apart. A future rate
limit (§9.4) or moderation action applied at this service's request-handling layer covers
both surfaces by construction.

**This same in-process design has a sharp edge, and it gets its own subsection below rather
than a passing mention: calling service functions directly means every service function in
this codebase is reachable from an MCP tool handler by default, not only the ones a tool
happens to invoke on purpose.** An HTTP boundary would have made that reach visible — a
route file lists every endpoint that exists. A bare function import does not. §7.9's
"Service-layer allowlist" subsection is this document's answer.

Why this API, rather than a separately deployed service, hosts it: see `war-spec.md` §4's
footnote and the reasoning recorded in this section and §4.3's revision note. In short —
a separately deployed MCP server would need [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693)
token exchange to convert a token audience-bound to itself into one this API would accept,
per the MCP authorization spec's requirement that a resource server never accept or forward
a token issued for a different audience. Serving the endpoint from this API instead means
there is only ever one resource and one audience, so that entire exchange — a second grant
type, a second hop, a second failure mode — is unnecessary rather than merely simplified.
The traded-away benefit is process isolation: a defect in MCP request handling shares this
API's process with the voting path. §7.9's tools call read/write functions already exercised
by REST traffic today, and Fastify's plugin encapsulation gives each route its own error
boundary, which is judged sufficient for this slice's traffic profile (a content-authoring
tool used by a War's own creators, not the public voting surface) rather than a full second
deployment. Revisit if that traffic profile changes.

#### Tool surface

Each tool maps to exactly one endpoint from §7.2–§7.5 that is actually implemented (§15).
No tool exists for an endpoint this document marks unbuilt.

| Tool | Backed by (an allowed function — see "Service-layer allowlist" below) |
|---|---|
| `create_war` | `createWarForVoter` (§7.2) |
| `update_war` | `patchWar` (§7.2) |
| `activate_war` | `activateWar` (§7.2) |
| `close_war` | `closeWar` (§7.2) |
| `list_my_wars` | `listWarsForVoter` (§7.2's `creator=me` semantics, new — see below) |
| `get_war` | `getWar` (§7.2) — no visibility restriction, matching that function's existing behavior exactly |
| `add_contestant` | `addContestant` (§7.3) |
| `update_contestant` | `patchContestant` (§7.3) |
| `upload_image` | `addContestantImage` (§7.3) |
| `get_rankings` | `rankingsFor` (§7.5) |

Deliberately excluded, as a trim rather than an oversight: contestant/media removal and
reordering, `join_war` (a voter action, not content authoring), voting and matchup
progression (§7.4 — voter-facing, not this tool set's concern), and anything touching
`video` media mode (not built — §15).

**`get_rankings` reads a War's leaderboard** (`war_id` only) — the one read added alongside
the content-authoring set, because a creator checking on a War they built is a natural part
of "help me build and edit War content," not a voting action. It applies `rankingsFor`'s own
invite-only visibility check unchanged: an anonymous or non-member caller against an
invite-only War is rejected exactly as `GET /wars/:id/rankings` (§7.5) already rejects one.

**`list_my_wars`'s function is new.** Today, `GET /wars?creator=me` is served straight from
`warsRepository.listWars` (§7.2) — there is no `warsService` function for it, because the
route handler itself decides whether to pass a `creatorId`. An MCP tool has no such route
handler to decide for it, and the allowlist below is a list of *service* functions with no
repository-level exception carved into it. `listWarsForVoter(db, voterId, filter)` is added
to `wars/warsService.ts`: a thin wrapper that calls `listWars` with `creatorId` fixed to the
given `voterId`, forwarding `status`/`category`/`cursor`/`limit` unchanged. This is the
`list_my_wars` tool's only caller; `GET /wars` itself is untouched and keeps calling
`listWars` directly, exactly as today.

**`create_war`, `update_war`, `add_contestant`, `update_contestant`** apply no default of
their own for any field the REST endpoint already defaults (`visibility`, `media_mode`) —
an omitted argument is simply not passed to the underlying service function, so that
function's own default resolves it exactly as it does for a REST caller. `media_mode` is
not exposed as a tool argument at all in this slice, for the reasoning the earlier,
discarded standalone `war-mcp` design already established: `video` is rejected outright
(§15) and `image` is already the default, so the argument could only ever validly carry
the value omission already produces.

**`list_my_wars`** takes optional `status`/`category` and otherwise applies §7.2's
`creator=me` default in full: every status the authenticated voter's own Wars hold,
including drafts and invite-only ones — never a narrower scope invented at this layer.

**`upload_image`** takes `war_id`, `contestant_id`, `image_base64` (the file's bytes,
base64-encoded), and `mime_type`. This differs from a REST multipart upload only in
encoding: **the MCP client, not this API, reads the file from wherever it lives** (the
user's phone or desktop) — this API has no filesystem to read from regardless, being remote.
The existing 10MB size ceiling and image-content validation (§11.1, §7.3) apply identically
after decoding; no new limit is introduced, and none is relaxed.

#### Service-layer allowlist

**Allowed — exactly ten functions, one per tool above:** `createWarForVoter`, `patchWar`,
`activateWar`, `closeWar`, `listWarsForVoter`, `getWar`, `addContestant`, `patchContestant`,
`addContestantImage`, `rankingsFor`. Each already owns its own authorization and validation
guard (creator-only, draft-only, invite-only visibility, schema validation) exactly as it
does for its REST route; an MCP tool inherits that guard by calling the same function, never
by re-implementing or bypassing it.

`addContestantImage` internally calls `uploadContestantImage` (`imageUploadService.ts`) to
do the actual re-encode-and-store work (§11.1) — that call is `addContestantImage`'s own
implementation detail, already reached only from behind its ownership/draft guard, and is
not separately exported from the allowlist module: an MCP handler has no reason to call it
directly, and the allowlist's job is to name what a handler may *import*, not everything a
permitted call transitively reaches.

**Denied, by name, and why:**

| Function | Why it is denied |
|---|---|
| `castVoteForVoter` | Votes are final and unchangeable by design (`war-spec.md` §2); an MCP tool handler must not be a path to casting one. This is the one that matters most on this list — automated, LLM-driven voting is precisely what §9.4's rate limits exist to stop, and a rate limit on the MCP endpoint's request rate does nothing if a single request can still reach the vote itself. |
| `nextMatchupForVoter`, `joinWar` | The rest of the voting path — no content-authoring tool has a legitimate reason to progress a voter through matchups or join a War on their behalf. |
| `removeContestant`, `removeContestantMedia`, `reorderContestantMedia` | Already excluded from the tool surface above; denied here too so a *future* tool cannot acquire one of them by a handler simply importing it, without this list ever being revisited. |
| `beginLogin`, `exchangeGoogleCode`, `completeCallback`, `refresh`, `logout`, `currentVoter`, `authenticatedVoterId` | The entire auth module. Identity is established once, before a tool handler ever runs (§4.3.6's bearer-token check resolves `voterId`); no tool touches token issuance, exchange, or session machinery. |

**Enforcement is a module boundary, not a convention.** A single module,
`src/mcp/allowedActions.ts`, re-exports exactly the ten allowed functions above and nothing
else. Every file under `src/mcp/tools/` imports its service-layer call **only** from this
module — never directly from `wars/warsService.ts`, `contestants/contestantsService.ts`,
`contestants/mediaService.ts`, `votes/votesService.ts`, `matchups/matchupsService.ts`, or
`auth/authService.ts`. Two checks make this a structurally visible property rather than a
convention a later change silently breaks:

- **A lint rule**, scoped to `src/mcp/tools/**/*.ts`, fails the build if any file there
  imports from one of those six modules directly. Reaching `castVoteForVoter` from a tool
  handler then requires either widening `allowedActions.ts` — a small, purpose-built file
  whose diff says exactly what it grants — or bypassing this rule outright, both of which a
  design review sees, unlike an unremarkable new import line in a large route file.
- **A unit test** (§11.2's testing convention) imports `allowedActions.ts` and asserts its
  exports are exactly the ten named above, sorted, no more and no fewer — pinned by the
  Gherkin scenario "The MCP allowlist exports exactly the approved service functions" (§14).
  This is what stops the allowlist module itself from being widened unnoticed; the lint
  rule alone only stops a handler from reaching *around* it.

#### Testing

Because tool handlers call service functions directly, in process, there is no second HTTP
hop to mock. Tests connect a real `McpServer` to a test `Client` via
`@modelcontextprotocol/sdk`'s `InMemoryTransport.createLinkedPair()` (proving the MCP
protocol boundary genuinely works, independent of transport), call each tool, and assert
against a real test database (Testcontainers, §11 — the same convention this API's own
integration tests already use) that the call produced the exact state a REST call would
have: e.g., `create_war` via MCP followed by `getWar` (or the REST route, via Supertest)
confirming the War really exists. This is a stronger check than asserting a mocked HTTP call
was received, and it is available specifically because there is no longer a second service
to mock — the same simplification §4.3's revision note credits for removing RFC 8693.

---

## 8. Scoring Algorithm

Contestants are ranked by **raw win count**, descending.

```
score(c) = c.win_count
```

- Ties broken by `appearance_count` **ascending** (same wins from fewer showings ranks higher), then alphabetically by name
- Contestants with `appearance_count = 0` are listed last as unranked, with `rank: null`
- Read directly from the counters in §5 — no aggregate scan over `votes`

### 8.1 Why raw wins, and what it depends on

Every contestant appears in exactly `n − 1` pairs. If every voter voted on every pair, every contestant would have an identical `appearance_count`, and ranking by win count, by win percentage, or by any confidence-adjusted variant would produce the **identical order**. Percentages would be wins divided by a constant.

Voters abandon midway, though, and rankings are displayed while a War is still active — so at any moment the data is partial. Partial data is not in itself a problem: because pair order is randomised, every contestant has equal *expected* exposure, so raw win count is unbiased.

The risk is variance, not bias. In a sparse early War, one contestant may be shown 30 times and another 3 times by luck alone, and the over-shown contestant accumulates more wins for no merit.

**This is corrected at selection time, not display time.** The exposure-balanced ordering in §7.4 keeps `appearance_count` near-equal across contestants, which restores the equal-denominator condition that makes raw wins exact. The alternative — leaving selection random and correcting in the leaderboard with win percentages or a confidence bound — was rejected: percentages let a 3-for-3 contestant outrank a 320-of-400 one, and a confidence-adjusted sort displays a number that isn't the sort key, which reads as a bug.

Ranking therefore stays a plain, explainable count of head-to-heads won, and the correction lives where it cannot be seen.

**Invariant.** `appearance_count` should stay tightly clustered across a War's contestants. A widening spread means pair selection is not balancing and the ranking's core assumption is weakening — worth surfacing in monitoring before it distorts results.

---

## 9. Vote Integrity, Abuse Prevention & Audit Trail

### 9.1 Votes are immutable

The `votes` table is **INSERT-only**. No row is ever updated or deleted, and there is no supersede mechanism.

A voter gets exactly one vote per pair, enforced by `UNIQUE (matchup_id, voter_id)`. Three mechanisms together guarantee a voter cannot contribute conflicting votes on the same pairing:

| Mechanism | Prevents |
|---|---|
| `CHECK (contestant_a_id < contestant_b_id)` | A vs B and B vs A existing as separate matchups |
| `UNIQUE (matchup_id, voter_id)` | Two votes by one voter on the same matchup |
| `/matchups/next` excludes voted pairs | A voter being offered a decided pair again |

The first is the important one. It makes the failure mode structurally impossible rather than merely guarded against: since a mirrored pairing cannot exist as a row, a voter cannot pick A in "A vs B" and later pick B in "B vs A" and leave both contestants with one win.

A second vote attempt with the **same** `winner_id` returns `200` and changes nothing — this is how a retry after a dropped connection is absorbed. A second attempt with a **different** `winner_id` returns `409` and changes nothing.

### 9.2 Non-votes are not recorded

A pair the voter never decided leaves **no trace** — no skip record, no abstention, no timestamp. A voter who loses connectivity, closes the tab, or simply stops is indistinguishable from one who never reached that pair, and neither affects any contestant's counters.

There is consequently no "skip" action in the API. The only way to leave a pair undecided is to not vote on it.

### 9.3 Audit trail

Each vote row retains `voter_id`, `matchup_id`, `winner_id`, `presented_left_id`, and `created_at`. Because votes are immutable, this is a complete and tamper-evident record of every decision made.

`presented_left_id` exists specifically to make **position bias** measurable: if winners correlate with the side they were displayed on, the ranking is picking up a UI artefact rather than preference. That signal is unrecoverable if the client shuffles sides, which is why §7.4 places the decision in the API.

Retained for future audit tooling (coordinated voting patterns, timing anomalies, position bias). Tooling itself remains out of scope for v1.

### 9.4 Rate Limiting

A pairwise voting platform is precisely the kind of thing people will script. The audit trail in §9.3 lets abuse be *detected* after the fact; rate limiting is what makes it expensive up front.

Limits are enforced in **two layers**. The edge (`war-infra-spec.md` §13.1) sheds volumetric abuse before it reaches the origin; the API enforces per-identity limits the edge cannot see, because the edge does not decode JWTs.

| Scope | Limit | Key | Response |
|---|---|---|---|
| Vote casting | 60 / minute | `voter_id` | `429` + `Retry-After` |
| Vote casting, sustained | 2,000 / day | `voter_id` | `429` |
| OAuth login start | 10 / minute | client IP | `429` |
| Token refresh | 30 / minute | client IP | `429` |
| War creation | 10 / hour | `voter_id` | `429` |
| Image upload | 100 / hour | `voter_id` | `429` |

**Keyed by `voter_id`, not IP, for authenticated endpoints.** IP-keyed limits punish shared networks — a school or office voting in the same War would throttle each other — while barely inconveniencing an attacker with a proxy pool. Identity is the meaningful unit here, and every voting endpoint already requires a JWT.

The 60/minute vote limit sits well above human pace. At the ~3 seconds per decision the UX implies, a fast voter reaches roughly 20/minute; the limit only bites on automation.

Counters are held in-process. With fixed instance counts and no autoscaling (`war-infra-spec.md` §17), effective limits scale with instance count — acceptable at v1 scale, and the reason the ceiling is set conservatively. A shared store (Redis or equivalent) becomes necessary before autoscaling is enabled.

`429` responses always carry `Retry-After`. Clients surface this as a wait, never as a failure (`war-ui-default-spec.md` §8).

---

## 10. Custom UI Registration

Each custom War UI is a separately built static bundle — see [`war-ui-custom-spec.md`](war-ui-custom-spec.md) for the template contract those bundles must satisfy. **All custom UIs are hosted in one shared object storage bucket behind a single CDN origin**, keyed by slug prefix — there is no bucket, origin, or routing rule per slug (see `war-infra-spec.md` §5.5).

```
war-ui-custom-{env}/
├── miss-universe-2026/index.html
└── best-pizza-nyc/index.html
```

Because layout is uniform, `static_base_path` is derived, not configured — it is always `/ui/{slug}/`. The column is retained so the mapping stays explicit and a future layout change does not require a migration of routing behaviour.

Registering a slug is therefore a **database row plus a file upload**. It provisions nothing: no bucket, no origin, no routing rule, no redeploy. The API's registry is the only place a slug is declared.

When a War has `ui_slug` set, the routing layer serves that slug's bundle for the War's URLs (see `war-infra-spec.md` §6).

The API exposes the registry read-only:

```
GET /api/v1/ui-registry           → [{ slug, label, static_base_path }]
GET /api/v1/ui-registry/:slug     → { slug, label, static_base_path }
```

Registration of new slugs is an administrative operation (no public endpoint in v1).

---

## 11. Tech Stack

| Component | Choice |
|---|---|
| Component | Choice | Why this one |
|---|---|---|
| Runtime | Node.js 24.x (TypeScript) | See §15 — the spec originally named 22, but the build machine's `winget` LTS channel resolved 24.x, which is what's actually deployed |
| Framework | **Fastify** | JSON Schema validation on every route, and §7's OpenAPI document generates from those same schemas — one definition, not three |
| Database | PostgreSQL | |
| Query builder | **Kysely** | §12 mandates hand-written SQL migrations with a `schema_migrations` table. Prisma Migrate wants to own the schema and would fight that; Kysely types queries without owning migrations |
| Migrations | `node-pg-migrate` | Plain SQL files, ordered, with the tracking table §12 requires |
| OAuth | `openid-client` + provider SDKs | Passport's session-oriented middleware model fits poorly with the stateless JWT flow in §4 |
| JWT | `jose` | |
| Image processing | **`sharp`** | Variant generation and EXIF stripping on upload (§11.1) |
| Object storage | `@aws-sdk/client-s3` against an S3-compatible endpoint | Provider per `war-infra-spec.md` §14 |
| Rate limiting | `@fastify/rate-limit` | Per-voter limits complementing the edge rules (§9.4) |
| MCP server | `@modelcontextprotocol/sdk` ^1.30.0 | `McpServer`/`registerTool` for §7.9's tools, `StreamableHTTPServerTransport` (operates on raw Node `IncomingMessage`/`ServerResponse`, reachable from a Fastify handler via `request.raw`/`reply.raw` — no framework bridge needed for the transport itself) |
| OAuth AS/RS wire protocol | `@modelcontextprotocol/sdk`'s `server/auth` module (`mcpAuthRouter`, `OAuthServerProvider`) | Implements RFC 8414/9728/7591's exact document shapes and DCR/PKCE mechanics (§4.3.1) so this API only supplies the `OAuthServerProvider` methods that are genuinely this platform's business |
| Fastify/Express bridge | `@fastify/express` ^4.0.7 | Mounts the SDK's Express-based `mcpAuthRouter` inside this Fastify app for the AS's own routes only (§4.3.1); the resource-server bearer check on `/api/v1/mcp` itself is a plain Fastify `preHandler`, not bridged |
| Testing | Vitest + Supertest + **Testcontainers** | Integration tests run against a real PostgreSQL, not a mock or shared test DB — §7.9's MCP tool tests follow the same convention |

### 11.1 Image Processing

Uploaded images are **never served as uploaded**. On upload the API:

1. Validates type and size (≤ 10MB; JPEG, PNG, WebP)
2. Re-encodes to WebP at three widths — **400, 800, 1600** — preserving aspect ratio and never upscaling
3. **Strips all EXIF metadata**, which routinely carries GPS coordinates and device identifiers from phone photos
4. Writes variants to the public media prefix and the original to a private prefix
5. Records the storage key; variant URLs are derived by convention

```
war-media-{env}/
├── contestants/{contestant_id}/{image_id}-400.webp     (public)
├── contestants/{contestant_id}/{image_id}-800.webp     (public)
├── contestants/{contestant_id}/{image_id}-1600.webp    (public)
└── originals/{contestant_id}/{image_id}.{ext}          (private, never served)
```

Originals are retained so variant widths can be changed later without re-uploading every image. They are never public-read and are not served through the edge.

Processing is **synchronous** within the upload request. A 10MB source produces three variants in well under a second, and there is no queue primitive in the v1 infrastructure (`war-infra-spec.md` §18.2) to make it asynchronous. Bulk contestant uploads happen in draft mode where latency is tolerable.

**Why this matters.** Serving a 10MB original to a phone showing two cards side by side is simultaneously the worst mobile experience and the largest line on the egress bill — image delivery is the dominant traffic driver for the whole platform (`war-infra-spec.md` §16). A 400px WebP is typically 20–40KB, a 100×+ reduction over an unprocessed upload.

### 11.3 Embedded Video

In `video` mode a contestant is represented by one short video hosted **elsewhere**. The platform stores a reference and never stores, transcodes, or serves video bytes.

#### Supported providers

| Provider | Player API | Embed origin |
|---|---|---|
| YouTube | IFrame Player API | `https://www.youtube-nocookie.com` |
| Vimeo | Player.js | `https://player.vimeo.com` |

The allow-list is deliberately short. Both providers expose a JavaScript player with a reliable **playback-ended event**, which the sequential playback in `war-ui-default-spec.md` §6 depends on. An arbitrary URL in an `<iframe>` gives no such event, and embedding arbitrary third-party origins is a security exposure with no upside here.

YouTube is embedded through `youtube-nocookie.com`, which suppresses tracking cookies for viewers who never press play.

#### Validation at add time

`POST /video` resolves the submitted URL before storing anything:

1. Parse the URL against the provider allow-list; extract the video id → `422` if unrecognised
2. Call the provider's **oEmbed** endpoint. A non-200 means the video is private, deleted, or has embedding disabled → `422` with a message naming the cause
3. Store `provider`, `provider_video_id`, `poster_url`, `title`, and the clip window — **never the submitted URL**
4. Compute and store `duration_seconds`; reject over 60 seconds

Validating at add time rather than at play time is the point: a creator finds out their video cannot be embedded while still in draft, not after voters hit a dead player mid-War.

#### Duration limits and why they matter

| Limit | Value |
|---|---|
| Maximum effective duration | 60 seconds |
| Recommended | ≤ 20 seconds |

Video changes the economics of the whole platform. An image matchup takes about 3 seconds to decide; a video matchup takes **twice the video length**, because both must play. At 20 seconds each that is ~40 seconds per matchup:

| Contestants | Pairs | Image mode | Video mode @ 20s |
|---|---|---|---|
| 12 | 66 | ~3 min | ~44 min |
| 23 | 253 | ~13 min | ~2.8 hours |
| 90 | 4,005 | ~3.3 hours | ~44 hours |

Partial completion is already the expected outcome (§7.4), so this does not break anything — but it does mean a video War gathers votes **an order of magnitude more slowly** per voter. Two consequences:

- Exposure-balanced pair selection (§7.4) matters far more here, because far fewer pairs get decided
- Video Wars should be created with few contestants. The API does not enforce a lower cap, but creation UI should steer toward it

#### Clip windows

`start_seconds` / `end_seconds` let a creator point at a segment of a longer video rather than requiring a purpose-cut upload. Both providers support start/end parameters natively, so the clip is enforced by the player.

#### Availability is not guaranteed

A third-party video can be deleted or made private after it was validated. The platform cannot prevent this. When a player reports the video is unavailable, the client shows an unavailable state **and still allows the vote** (`war-ui-default-spec.md` §6) — blocking the vote would let one broken third-party link stall every matchup that contestant appears in.

### 11.2 OpenAPI Contract

The API publishes an OpenAPI 3.1 document at `GET /api/v1/openapi.json`, generated from the Fastify route schemas — it is never hand-maintained, so it cannot drift from the implementation.

This document is the **contract between the three projects**. `war-ui-default` generates its typed client from it (`war-ui-default-spec.md` §5) rather than hand-writing request and response types. With three independently deployed projects sharing one repository but no shared package, contract drift is the highest-probability integration failure, and generation is what removes it.

**Requirements on the generated document**, so `war-ui-default`'s `openapi-typescript` step has enough to generate a usable client against this API's real base path and auth scheme:

- `openapi`: `3.1.x`
- `info.title` and `info.version` are present
- `servers` contains one entry: the relative reference `/api/v1`, so the same document is valid unchanged across every deployment environment without embedding an environment-specific host
- `components.securitySchemes.bearerAuth` describes the JWT bearer scheme (`type: http`, `scheme: bearer`, `bearerFormat: JWT`), matching §7's `Authorization: Bearer <jwt>` convention
- Every path marked 🔒 anywhere in §7.1–§7.6 carries a `security: [{ bearerAuth: [] }]` requirement; every other published path carries none
- The response's `Content-Type` is `application/json` — per §7's blanket rule for all responses, not `application/vnd.oai.openapi+json`. The plainer type is what `openapi-typescript` and browser tooling expect without content negotiation, and it keeps this endpoint consistent with every other response the API returns
- The endpoint itself requires no authentication
- `/api/v1/mcp` and every `/oauth/*` and `/.well-known/oauth-*` path (§4.3, §7.9) are
  excluded from this document, the same way `/api/v1/internal/*` already is (§7.7) — the
  first speaks MCP's own JSON-RPC framing rather than a per-route REST shape, and the rest
  are Express routes mounted via `@fastify/express` (§4.3.1) rather than Fastify routes
  carrying their own JSON Schema, so `@fastify/swagger` has nothing to generate from for
  them regardless. Their contracts are RFC 8414/9728/7591 and the MCP specification itself,
  not this document's generated OpenAPI.

Endpoints under `/api/v1/internal/*` (§7.7) are excluded from the published document.

### 11.2.1 Request & Response Body Schemas — Core Voting Loop Slice

§11.2 establishes the document's envelope (`openapi`, `info`, `servers`, `bearerAuth`,
excluded paths) but stops short of the operations' own `body`/`response` JSON Schemas.
Nothing required them, and nothing generated them: this repo's routes validate by hand in
the service layer rather than through Fastify's `schema` option, so `@fastify/swagger` has
had nothing to generate bodies from. Every operation currently publishes `"200": {
"description": "Default Response" }` with no `content`, regardless of what status codes or
shapes the handler actually produces, and `components.schemas` is empty.

This subsection closes that gap for exactly the routes `war-ui-default`'s Core Voting Loop
slice calls (`war-ui-default-spec.md` §5.1), so its `openapi-typescript` generation step
produces real request and response types instead of `unknown`. It is **not** a retrofit of
the rest of the API — every other route keeps its current unschemad, hand-validated body
handling until its own slice needs otherwise.

Every shape below is transcribed from the shipped handler and the presenter/service
function it calls, not from prose elsewhere in this document — see "Discrepancies found"
at the end of this subsection for the two places that prose and code disagree. Add each
schema as a Fastify `schema: { body, response }` option on exactly the named route.
**Fastify serializes responses with `fast-json-stringify` against the `response` schema,
which silently drops any property not listed there** — so a response schema that omits a
field the presenter actually returns is not merely an incomplete description, it deletes
that field from the wire response the moment the schema is added. Every field below is
exhaustive for its shape; do not add a `response` schema for a status this subsection does
not list without also transcribing that status's actual shape first.

Shapes named here (`MediaItem`, `ResolvedAttribute`, `WarSummary`, `ContestantDetail`) are
named for cross-reference within this document only. Whether the implementation inlines
them per route or shares them via `app.addSchema` + `$ref` is an implementation choice;
either satisfies this subsection as long as the generated document's `paths` entries carry
the shapes described.

#### Shared shapes

**`MediaItem`** — reflects `src/contestants/mediaPresenter.ts`. Only `kind: "image"` is
ever produced (§15: `video` media mode is unimplemented), so `kind` is a single-value enum
here, not the two-branch shape the "Media Representation" prose above describes for the
full v1 design. Extending this to `video`'s shape is out of scope until that mode ships.

```json
{
  "type": "object",
  "required": ["kind", "id", "display_order", "aspect_ratio", "variants"],
  "properties": {
    "kind": { "type": "string", "enum": ["image"] },
    "id": { "type": "string", "format": "uuid" },
    "display_order": { "type": "integer" },
    "aspect_ratio": { "type": ["number", "null"] },
    "variants": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["width", "url"],
        "properties": {
          "width": { "type": "integer" },
          "url": { "type": "string" }
        }
      }
    }
  }
}
```

**`ResolvedAttribute`** — reflects `src/contestants/schemaValidation.ts`'s
`resolveAttributes`. `value`'s runtime type is always `string` or `number`: schema types
`string`/`text`/`url`/`date` all validate as JS strings, `number` as a JS number.

```json
{
  "type": "object",
  "required": ["key", "label", "type", "value"],
  "properties": {
    "key": { "type": "string" },
    "label": { "type": "string" },
    "type": { "type": "string", "enum": ["string", "number", "text", "url", "date"] },
    "value": { "type": ["string", "number"] }
  }
}
```

**`WarSummary`** — reflects `src/wars/warPresenter.ts`'s `presentWarSummary`, plus
`contestant_count` (not yet in the shipped presenter as of this addendum — see "Addendum
(2026-08-30)" below).

```json
{
  "type": "object",
  "required": ["id", "title", "category", "status", "visibility", "media_mode", "contestant_schema", "ends_at", "contestant_count"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "title": { "type": "string" },
    "category": { "type": ["string", "null"] },
    "status": { "type": "string", "enum": ["draft", "active", "closed"] },
    "visibility": { "type": "string", "enum": ["public", "invite_only"] },
    "media_mode": { "type": "string", "enum": ["image"] },
    "contestant_schema": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["key", "label", "type"],
        "properties": {
          "key": { "type": "string" },
          "label": { "type": "string" },
          "type": { "type": "string", "enum": ["string", "number", "text", "url", "date"] }
        }
      }
    },
    "ends_at": { "type": ["string", "null"], "format": "date-time" },
    "contestant_count": { "type": "integer", "minimum": 0 }
  }
}
```

**`ContestantDetail`** — reflects `src/contestants/contestantPresenter.ts`'s `presentContestant`.

```json
{
  "type": "object",
  "required": ["id", "name", "bio", "attributes", "media", "win_count", "appearance_count"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string" },
    "bio": { "type": ["string", "null"] },
    "attributes": { "type": "array", "items": { "$ref": "ResolvedAttribute" } },
    "media": { "type": "array", "items": { "$ref": "MediaItem" } },
    "win_count": { "type": "integer" },
    "appearance_count": { "type": "integer" }
  }
}
```

#### `POST /auth/refresh`

Reflects `src/auth/routes.ts`. `200`/`401`/`403` are all produced by this handler directly
(not the shared `requireAuth` preHandler, which this route does not use).

- `response.200`: `{ "type": "object", "required": ["token"], "properties": { "token": { "type": "string" } } }`
- `response.401`: `{ "type": "object", "required": ["error"], "properties": { "error": { "type": "string" } } }`
- `response.403`: same shape as `401`

#### `DELETE /auth/session`

Reflects `src/auth/routes.ts`. Always `204` on success (the route has no other outcome of
its own); a missing/invalid bearer token is rejected `401` by the shared `requireAuth`
preHandler before the handler runs.

- `response.204`: no body. Declare it with an empty schema (or omit `content` explicitly,
  however the implementation's Fastify/swagger version expresses "no body for this status")
  so the document shows `204` rather than falling back to the current blanket `200`.

#### `GET /auth/me`

Reflects `src/auth/routes.ts` and `src/auth/votersRepository.ts`'s `Voter`.

- `response.200`:
  ```json
  {
    "type": "object",
    "required": ["voter"],
    "properties": {
      "voter": {
        "type": "object",
        "required": ["id", "display_name", "avatar_url"],
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "display_name": { "type": ["string", "null"] },
          "avatar_url": { "type": ["string", "null"] }
        }
      }
    }
  }
  ```

#### `GET /wars`

Reflects `src/wars/routes.ts` and `WarSummary` above. No `next_cursor` (or any pagination
metadata) is returned — the client derives the next page's `cursor` query param from the
last item's `id`, since `listWars` filters on `id <`.

- `response.200`: `{ "type": "object", "required": ["wars"], "properties": { "wars": { "type": "array", "items": { "$ref": "WarSummary" } } } }`

Each item's `contestant_count` is the number of `contestants` rows for that War
(`contestants.war_id = wars.id`), regardless of the War's `status` — a `draft` War with 2
contestants reports `2`, not `0` (see "Addendum (2026-08-30)" below).

#### `GET /wars/:id`

Reflects `src/wars/routes.ts`'s `getWar` outcome and `presentWarDetail` (`WarSummary` + `contestants`).

- `response.200`: `WarSummary`'s properties/required, plus `contestants` (required):
  `{ "type": "array", "items": { "$ref": "ContestantDetail" } }`
- `response.404`: `{ "type": "object", "required": ["error"], "properties": { "error": { "type": "string" } } }`

`contestant_count` (inherited from `WarSummary`) must equal `contestants.length` in this
response — both are derived from the same rows and must never disagree (see "Addendum
(2026-08-30)" below for why the detail response carries both rather than only the array).

#### `POST /wars/:id/join`

Reflects `src/wars/routes.ts` and `joinWar`'s outcome, mapped by `replyForOutcome`.

- `response.204`: no body (the `'ok'` outcome; `value` is `void`)
- `response.403`: `{ "type": "object", "required": ["error"], "properties": { "error": { "type": "string" } } }`
  (`notActive` → `"War is not active"`)
- `response.404`: same shape as `403` (`notFound` → `"not found"`)

#### `GET /wars/:id/matchups/next`

Reflects `src/matchups/matchupsService.ts`'s `NextMatchupView`. `prefetch` is present only
when a following unvoted pair exists — omit it from `required`.

- `response.200`:
  ```json
  {
    "type": "object",
    "required": ["matchup", "progress"],
    "properties": {
      "matchup": {
        "type": "object",
        "required": ["id", "left", "right"],
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "left": {
            "type": "object",
            "required": ["id", "name", "media"],
            "properties": {
              "id": { "type": "string", "format": "uuid" },
              "name": { "type": "string" },
              "media": { "type": "array", "items": { "$ref": "MediaItem" } }
            }
          },
          "right": { "$ref": "#/properties/matchup/properties/left" }
        }
      },
      "progress": {
        "type": "object",
        "required": ["voted", "total"],
        "properties": {
          "voted": { "type": "integer" },
          "total": { "type": "integer" }
        }
      },
      "prefetch": {
        "type": "object",
        "required": ["matchup_id", "media"],
        "properties": {
          "matchup_id": { "type": "string", "format": "uuid" },
          "media": { "type": "array", "items": { "$ref": "MediaItem" } }
        }
      }
    }
  }
  ```
  (Write `right` as its own copy of `left`'s schema rather than an internal `$ref` if the
  implementation's schema tooling does not resolve intra-document pointers the way the
  sketch above assumes — the two must simply describe the same shape.)
- `response.204`: no body (every pair voted)

#### `POST /wars/:id/matchups/:mId/vote`

Reflects `src/matchups/routes.ts` and `castVoteForVoter`'s `CastVoteOutcome`. The
`default: reply.code(500)…` branch is unreachable given the outcome union above it and is
not part of this schema.

- `body`: `{ "type": "object", "required": ["winner_id"], "properties": { "winner_id": { "type": "string", "format": "uuid" } } }`
- `response.201`: `{ "type": "object", "required": ["vote_id"], "properties": { "vote_id": { "type": "string", "format": "uuid" } } }` (`'created'`)
- `response.200`: `{ "type": "object", "required": ["status"], "properties": { "status": { "type": "string", "enum": ["already recorded"] } } }` (`'retried'`)
- `response.409`: `{ "type": "object", "required": ["error"], "properties": { "error": { "type": "string" } } }` (`'conflict'`)
- `response.422`: same shape as `409` (`'invalidWinner'`)
- `response.403`: **not** the same shape as `409` — carries a `reason` discriminator
  alongside `error` (see "Addendum (2026-08-30)" below; not yet in the shipped handler as of
  this addendum):
  ```json
  {
    "type": "object",
    "required": ["error", "reason"],
    "properties": {
      "error": { "type": "string" },
      "reason": { "type": "string", "enum": ["war_not_active", "not_joined"] }
    }
  }
  ```
  `'warNotActive'` → `{ "error": "War is not active", "reason": "war_not_active" }`;
  `'notJoined'` → `{ "error": "voter has not joined this War", "reason": "not_joined" }`.
- `response.404`: same shape as `409` (`'notFound'`)
- `response.400`: a malformed body (missing `winner_id`, wrong type, or a value that fails
  the `uuid` format check) never reaches `castVoteForVoter` — Fastify's `ajv` validator
  rejects it against the `body` schema above before the handler runs, and Fastify's own
  error handler replies before this route's code executes at all. The shape is **not**
  this API's `{ "error": "..." }` envelope used elsewhere on this route; it is Fastify's
  own validation-error envelope, produced by ajv/`fast-json-stringify`, and its property
  names differ on purpose — do not "fix" it to match the other 4xx responses above, and do
  not add an `error` property to it. Verified against Fastify 5.11.0:
  ```json
  { "statusCode": 400, "code": "FST_ERR_VALIDATION", "error": "Bad Request", "message": "body/winner_id must match format \"uuid\"" }
  ```
  `message`'s exact text varies with which rule fails (missing field vs. wrong format vs.
  wrong type); the envelope shape does not.
  ```json
  {
    "type": "object",
    "required": ["statusCode", "code", "error", "message"],
    "properties": {
      "statusCode": { "type": "integer" },
      "code": { "type": "string" },
      "error": { "type": "string" },
      "message": { "type": "string" }
    }
  }
  ```

#### Discrepancies found (code trusted over prose; flagged here per this addendum's mandate)

1. **`GET /auth/{provider}/callback`'s existing `200` example (§7.1) does not match the
   shipped handler.** §7.1 currently shows a `200` response body of
   `{ "token", "refresh_token", "voter" }`, but `src/auth/routes.ts` performs a `302`
   redirect on success with **no response body at all** — the refresh token travels only as
   an `HttpOnly` cookie, exactly as §4.1 (which is accurate) describes. §7.1's `200` example
   predates §4.1's cookie-based flow and should be read as superseded by it; this addendum
   does not add a `200` body schema for the callback route because the code returns none.
   The stale example in §7.1 itself is left untouched here (out of this addendum's stated
   scope of "routes' body/response schemas") rather than silently rewritten — a spec author
   revising §7.1 directly should reconcile it with §4.1.
2. **`GET /auth/{provider}/callback` is not redirect-only.** Its two `400` failure paths
   (`{ "error": "missing code" }` when the query string omits `code`; `{ "error": "state
   mismatch" }` when the `oauth_state` cookie is absent or does not match) each send a real
   JSON body — contradicting this addendum's originating assumption that this route has "no
   response body to schema." Both share the shape
   `{ "type": "object", "required": ["error"], "properties": { "error": { "type": "string" } } }`
   for `response.400`. `GET /auth/{provider}/login`, by contrast, is confirmed
   redirect-or-empty-404 only — no body to schema on that route.

#### Addendum (2026-08-30): `contestant_count` on `WarSummary`, and a `reason` discriminator on the vote endpoint's `403`

Two gaps surfaced while `war-ui-default` implemented its Core Voting Loop slice against this
contract. **Unlike the rest of §11.2.1, neither shape below is transcribed from shipped
code** — both are new requirements for `war-api`'s next implementation slice to build
against. §15 tracks both as pending until they ship.

**1. `GET /wars` list items carry no contestant count.** `war-ui-default-spec.md`'s WarCard
component (Home page browse list) needs each War's contestant count alongside its title and
category, but `presentWarSummary` never computes one — only `GET /wars/:id`'s
`presentWarDetail` does, indirectly, by fetching the full `contestants` array.

`contestant_count` is added to the shared `WarSummary` shape (above) rather than to a
bespoke list-only shape, because `WarDetailView` is literally `WarSummaryView` plus
`contestants` (`src/wars/warPresenter.ts`) — one presenter function, `presentWarSummary`,
already backs both `GET /wars` and, by composition, `GET /wars/:id`. Giving `WarSummary`
itself the field means both endpoints gain it from a single change, and any client typed
against `WarSummary` sees the same shape regardless of which route produced it — no
detail-only special case where the count must be read from `contestants.length` instead of
the field every other `WarSummary` consumer uses. The alternative (add the field only to the
list shape; let the detail response rely on `contestants.length`) was rejected for exactly
that inconsistency: the two responses share one presenter today, and diverging their shapes
here would be the first crack in that. The cost is one redundant integer on the detail
response — `contestant_count` and `contestants.length` must always agree there (stated as a
requirement in `GET /wars/:id` above); disagreement is a defect, not something for a client
to reconcile.

`contestant_count` counts `contestants` rows for the War (`contestants.war_id = wars.id`),
regardless of the War's `status` — a `draft` War with 2 contestants reports `2`, not `0`.
Whether it's produced by a join, a correlated subquery, or a batched follow-up query keyed
by the page's War ids is an implementation choice this addendum does not constrain.

**2. The vote endpoint's `403` does not distinguish its two causes.**
`POST /wars/:id/matchups/:mId/vote`'s `castVoteForVoter` (`src/votes/votesService.ts`)
returns two distinct `403`-producing outcomes — `'warNotActive'` and `'notJoined'` — and
`src/matchups/routes.ts` maps both to `403 { "error": string }`, distinguished only by
message text. A client that must branch on which case occurred (e.g. "War ended, return to
browse" vs. "you haven't joined — join now") has nothing but that string to match, which
breaks silently if the wording ever changes.

The response gains a `reason` field alongside the existing `error` field (full shape above,
under `POST /wars/:id/matchups/:mId/vote`) — `error` remains the human-readable string,
unchanged; `reason` is the new machine-readable discriminator:

| `CastVoteOutcome.kind` | `error` | `reason` |
|---|---|---|
| `'warNotActive'` | `"War is not active"` | `"war_not_active"` |
| `'notJoined'` | `"voter has not joined this War"` | `"not_joined"` |

This is scoped to the vote endpoint only. `POST /wars/:id/join`'s `403` (§11.2.1's `POST
/wars/:id/join` above) has exactly one cause (`notActive`, via the shared `NotActive`
outcome and `replyForOutcome`) and is unchanged — already unambiguous, nothing to
discriminate.

#### Addendum (2026-08-31): response schema for `GET /wars/:id/rankings` — Rankings slice

`GET /wars/:id/rankings` (§7.5) is fully implemented and already covered end to end by §14's
"Rankings" Gherkin — the endpoint itself needs no behavioural change. The gap is the same
kind §11.2.1 exists to close: the route carries no Fastify `response` schema today, so
`@fastify/swagger` still publishes it as the blanket `"200": { "description": "Default
Response" }` with no `content`, and `war-ui-default`'s `openapi-typescript` generation step
produces `unknown` for it. `war-ui-default`'s Rankings slice (`war-ui-default-spec.md` §12)
needs a real generated type to build its `getRankings` wrapper and `RankingsTable` against.
As with the 2026-08-30 addendum above, this shape is a **new requirement**, not a
transcription of shipped code — §15 tracks it as pending until it ships.

**`RankingContestant`** — the contestant projection §7.5's example nests under `contestant`.
Deliberately narrower than `ContestantDetail` above: rankings display name, image, and the
two counters already surfaced at the entry level (`wins`, `appearances`), not bio or
attributes.

```json
{
  "type": "object",
  "required": ["id", "name", "media"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string" },
    "media": { "type": "array", "items": { "$ref": "MediaItem" } }
  }
}
```

**`RankingEntry`** — one leaderboard row. `rank` is nullable per §8: a contestant with
`appearance_count = 0` is listed with `rank: null`.

```json
{
  "type": "object",
  "required": ["rank", "contestant", "wins", "appearances"],
  "properties": {
    "rank": { "type": ["integer", "null"] },
    "contestant": { "$ref": "RankingContestant" },
    "wins": { "type": "integer" },
    "appearances": { "type": "integer" }
  }
}
```

#### `GET /wars/:id/rankings`

- `response.200`:
  ```json
  {
    "type": "object",
    "required": ["war_id", "status", "updated_at", "rankings"],
    "properties": {
      "war_id": { "type": "string", "format": "uuid" },
      "status": { "type": "string", "enum": ["draft", "active", "closed"] },
      "updated_at": { "type": "string", "format": "date-time" },
      "rankings": { "type": "array", "items": { "$ref": "RankingEntry" } }
    }
  }
  ```
- `response.401`: `{ "type": "object", "required": ["error"], "properties": { "error": { "type": "string" } } }`
  — an unauthenticated request against an `invite_only` War (§14, "Invite-only War rankings
  blocked for anonymous users")
- `response.404`: same shape as `401` — no War exists with the given id

`status` here reflects `effective_status` (§5), exactly as the existing `updated_at` field
and §7.5's caching rules already assume — this addendum does not change that, only gives it
a schema.

#### Addendum (2026-08-31): request/response schemas for the CreateWar wizard's routes — CreateWar slice

The four routes `war-ui-default`'s CreateWar wizard calls (`war-ui-default-spec.md` §6) are
already fully implemented and behaviorally correct — `src/wars/routes.ts` and
`src/contestants/routes.ts` handle all four today — but none carries a Fastify `response`
schema, so each still publishes the same blanket `"200": { "description": "Default
Response" }` §11.2.1's opening paragraph describes, and `war-ui-default`'s
`openapi-typescript` step produces `unknown` for all four. As with the two addenda above,
every shape below is a **new requirement**, not a transcription of a schema that already
exists; §15 tracks it as pending until it ships. Response *bodies* themselves are
transcribed from the shipped handlers (`presentWarSummary`, `presentContestant`, and the
route's own literal object), same as the rest of §11.2.1.

Both `WarSummary` and `ContestantDetail`, defined above under "Shared shapes", are reused
unchanged — a created or activated War is exactly a `WarSummary`, and a created contestant
is exactly a `ContestantDetail`, no narrower projection needed for either.

#### `POST /wars`

Reflects `src/wars/routes.ts` and `createWarForVoter`'s `CreateWarOutcome`.

- `response.201`: `WarSummary` (`'created'`)
- `response.422`:
  ```json
  {
    "type": "object",
    "required": ["error", "details"],
    "properties": {
      "error": { "type": "string" },
      "details": { "type": "array", "items": { "type": "string" } }
    }
  }
  ```
  (`'validationError'` — `error` is always the literal `"validation error"`; `details` carries
  the actual per-field messages, e.g. `"title must be a non-empty string of at most 256
  characters"`)

#### `POST /wars/:id/contestants`

Reflects `src/contestants/routes.ts` and `addContestant`'s `MutationOutcome<ContestantWithWar>`.

- `response.201`: `ContestantDetail` (`'ok'`)
- `response.403`: `errorResponseSchema` shape (both `'forbidden'` → `{ "error": "forbidden"
  }` and `'notDraft'` → `{ "error": "War is no longer editable" }` share this one shape,
  distinguished only by message text — there is no `reason` discriminator on this route,
  unlike the vote endpoint's `403` in the 2026-08-30 addendum above; nothing in this slice
  needs to branch on which occurred)
- `response.404`: `errorResponseSchema` shape (`'notFound'`)
- `response.422`: same shape as `POST /wars`'s `422` above (`'validationError'` — a missing
  `name`, or an `attributes` value §5's schema validation rejects)

#### `POST /wars/:id/contestants/:cId/images`

Reflects `src/contestants/routes.ts`. The request is `multipart/form-data`, a single file
per call — there is no JSON `body` for Fastify's `schema` option to describe here; the
route's own `request.file()` handles the multipart parsing before any outcome is produced.
`war-ui-default`'s `uploadContestantImages(warId, contestantId, files: File[])` (§5.2 of
that spec) issues one call per file for exactly this reason.

- `response.201`:
  ```json
  {
    "type": "object",
    "required": ["id", "display_order"],
    "properties": {
      "id": { "type": "string", "format": "uuid" },
      "display_order": { "type": "integer" }
    }
  }
  ```
  (the route's own literal response object — narrower than the full `MediaItem` shape
  elsewhere in this document, since the caller already has the file it just uploaded and
  needs only the assigned id and order back)
- `response.403`: `errorResponseSchema` shape (`'forbidden'` / `'notDraft'`, same two
  causes and same shape as `POST /wars/:id/contestants` above)
- `response.404`: `errorResponseSchema` shape (`'notFound'` — either the War or the
  contestant)
- `response.422`: **two distinct shapes**, chosen by which of this route's three validation
  failures occurred — this is a correction to the previous (2026-08-31) revision of this
  addendum, which stated only the first shape below and, worse, misdescribed the cause of
  the second as producing the first. It does not; verify against
  `src/contestants/mediaService.ts` and `src/shared/httpOutcomes.ts`'s `replyForOutcome`
  before touching this route again.
  - **No file uploaded** — checked directly in the route handler, before
    `addContestantImage` is ever called: `{ "error": "no file uploaded" }`. Plain, no
    `details`. This is the shape the previous revision documented, and it is unchanged: it
    is deliberately asymmetric with the `{ error, details }` shape below, and with the other
    three routes in this slice — do not normalize it into either.
  - **Too many images, or an unreadable upload** — `addContestantImage` returns a
    `'validationError'` outcome (`kind: 'validationError', errors: [message]`), which goes
    through `replyForOutcome`'s `validationError` branch **the same as every other
    `validationError` in this document** (`POST /wars`, `POST /wars/:id/contestants`, `POST
    /wars/:id/activate` above): `{ "error": "validation error", "details": [message] }`,
    with `details` a one-element array holding whichever of these two messages applies —
    `"a contestant may hold at most 10 images"` (an 11th image) or `"invalid image upload"`
    (the buffer could not be read as an image).

  Both shapes share this one status code, so the JSON Schema declared for this route's
  `422` must accept either body, or `fast-json-stringify` silently drops whichever
  property that schema does not name — which is exactly what happened when the CreateWar
  slice declared plain `errorResponseSchema` here: it stripped `details` from the second
  shape, and with it the only text naming the cause. The declared schema must be a
  **third** shape, distinct from both `errorResponseSchema` and the `{ error, details }`
  shape above — `error` required (both causes have it), `details` optional (only the second
  does):
  ```json
  {
    "type": "object",
    "required": ["error"],
    "properties": {
      "error": { "type": "string" },
      "details": { "type": "array", "items": { "type": "string" } }
    }
  }
  ```
  This is not `validationErrorResponseSchema` (which requires `details` and so is not a
  valid schema for the no-file body) and not `errorResponseSchema` (which has no `details`
  property at all and so truncates the validation-error body) — it needs its own schema,
  scoped to this one route's `422`, reusable if another route ever needs the same
  "sometimes-annotated" plain-error shape but not shared with one that doesn't.

#### `POST /wars/:id/activate`

Reflects `src/wars/routes.ts` and `activateWar`'s `ActivateOutcome`.

- `response.200`: `WarSummary` (`'ok'`)
- `response.403`: `errorResponseSchema` shape (`'forbidden'` / `'notDraft'`, same as above)
- `response.404`: `errorResponseSchema` shape (`'notFound'`)
- `response.422`: same `{ error, details }` shape as `POST /wars`'s `422` above
  (`'validationError'` — fewer than 2 contestants, or a contestant with no image; see
  "`POST /wars/:id/activate` rules", §7.2)

#### Addendum (2026-09-01): `GET /wars`'s `creator=me` filter — MyWars slice

`war-ui-default`'s MyWars slice (`war-ui-default-spec.md` §6, "MyWars Page") needs a way
to list the Wars a voter created, including drafts, so a creator who abandoned the
CreateWar wizard before Activate (`war-ui-default-spec.md` §6, "CreateWar Wizard") has
somewhere to find that draft again. `GET /wars` (§7.2) gains an optional `creator` query
parameter for this. Like the three addenda above, this is a **new requirement**, not a
transcription of shipped code; §15 tracks it as pending until it ships.

**Request.** `creator`'s only accepted value is the literal string `me`, declared on the
route's querystring schema as `{ "type": "string", "enum": ["me"] }`. Any other value
fails Fastify's own ajv validation before the handler runs and returns its standard
envelope — the same shape already documented above for
`POST /wars/:id/matchups/:mId/vote`'s `response.400` — never this API's own `{ error }`
envelope.

**Auth.** `creator=me` requires `Authorization: Bearer <jwt>`. A request carrying
`creator=me` with no bearer token, or an invalid/expired one, returns:

- `response.401`: `{ "type": "object", "required": ["error"], "properties": { "error": { "type": "string" } } }`

Every other combination of query parameters on this route remains unauthenticated,
exactly as today.

**Behaviour and response.** When `creator=me` is present and the token is valid, the
`wars` array is scoped to Wars whose `creator_id` equals the authenticated voter's id,
across every status — draft, active, and closed alike — and combines with `status` and
`category` exactly as those two already combine with each other. The response body is
otherwise unchanged: still `{ "wars": [WarSummary, …] }`, the same shape already pinned by
`war-api/specs/features/openapi.feature`'s "The wars list response schema is an array
under a wars key". Every field the MyWars page needs (`status`, `ends_at`,
`contestant_count`) is already published on `WarSummary` (§11.2.1, "Shared shapes" /
"Addendum (2026-08-30)") — this addendum adds no new response schema, only the
request-side `creator` parameter and its `401`.

---

## 12. CI/CD

See `war-infra` spec for pipeline definitions. The API repo contains:

- `Dockerfile` for containerised deployment
- `.env.example` documenting all required environment variables
- Database migration scripts in `db/migrations/`
- GitHub Actions workflow triggers (defined in infra repo, referenced here)

**Pipeline stages:** lint → test → build → push image → deploy (staging) → smoke test → deploy (production)

---

## 13. Out of Scope (v1)

- HTML rendering of any kind
- WebSocket / SSE real-time updates
- Vote tamper detection analytics
- Admin moderation endpoints
- Multi-provider OAuth account linking
- Weighted votes
- Changing a vote once cast (votes are final — §9.1)
- Asynchronous image processing (synchronous on upload — §11.1)
- Distributed rate-limit counters (in-process only — §9.4)
- Linking multiple OAuth providers to one voter account
- ELO or Borda count scoring, and win-percentage or confidence-adjusted ranking (§8.1)

---

## 14. Gherkin Acceptance Tests

### Authentication

```gherkin
Feature: OAuth Authentication

  Scenario: New voter signs in with Google
    Given a user has never signed in before
    When they authenticate via Google OAuth
    Then a new Voter record is created
    And a JWT and refresh token are returned

  Scenario: Returning voter signs in
    Given a voter has previously signed in with Google
    When they authenticate again via Google OAuth
    Then no new Voter record is created
    And the existing record is returned

  Scenario: Same email, different provider creates separate voters
    Given voter A signed in with Google using "user@example.com"
    When a user signs in with Microsoft using "user@example.com"
    Then a separate Voter record is created
    And the two accounts are not linked

  Scenario: Unauthenticated request to protected endpoint
    Given a request with no Authorization header
    When they call GET /api/v1/auth/me
    Then the response status is 401

  Scenario: No token is placed in the redirect URL
    Given a user completing OAuth with any provider
    When the callback redirects them back to the SPA
    Then the redirect location contains no token in its path, query, or fragment
    And the refresh token is set as an HttpOnly cookie

  Scenario: The SPA obtains its first JWT by exchanging the cookie
    Given a refresh cookie set by a completed OAuth callback
    When the SPA POSTs to /api/v1/auth/refresh
    Then a JWT is returned in the response body

  Scenario: Refresh rotates the token
    Given a valid refresh token
    When it is exchanged at /auth/refresh
    Then a new refresh token is issued
    And the presented token is marked used

  Scenario: Reusing a rotated refresh token revokes the family
    Given a refresh token that has already been exchanged once
    When it is presented again
    Then the response status is 401
    And every token in its family is revoked
    And the voter must re-authenticate

  Scenario: Refresh rejects a cross-origin caller
    Given a valid refresh cookie
    When /auth/refresh is called with an unregistered Origin header
    Then the response status is 403

  Scenario: Logout revokes the whole family
    Given an authenticated voter
    When they call DELETE /auth/session
    Then their refresh token family is revoked
    And a subsequent refresh returns 401
```

```gherkin
Feature: OAuth 2.1 Authorization Server for Third-Party and Machine Clients

  Scenario: The authorization server advertises its endpoints
    When GET /.well-known/oauth-authorization-server is called
    Then the response names an authorization_endpoint, a token_endpoint, and a registration_endpoint
    And code_challenge_methods_supported includes "S256"

  Scenario: The protected resource advertises its authorization server
    When GET /.well-known/oauth-protected-resource/api/v1/mcp is called
    Then the response names this deployment's resource identifier
    And it points to this API's own issuer as the authorizing server

  Scenario: The bare protected-resource path is not where the document is served
    When GET /.well-known/oauth-protected-resource is called with no path suffix
    Then the response status is 404

  Scenario: A new client can register dynamically
    Given a redirect_uris list
    When POST /oauth/register is called with it
    Then a client_id is returned
    And no client_secret is issued

  Scenario: A Client ID Metadata Document is accepted without a registration call
    Given an https URL serving a valid client metadata document
    When that URL is presented as client_id to GET /oauth/authorize
    Then the request proceeds as if the client had been registered

  Scenario: A CIMD fetch targeting a private address is refused
    Given a client_id URL that resolves to a loopback or private address
    When GET /oauth/authorize is called with it
    Then the request is rejected
    And no fetch to that address is attempted

  Scenario: An authorization request naming an unrecognized resource is rejected
    Given a registered client and a valid PKCE challenge
    When GET /oauth/authorize is called with a resource this deployment does not serve
    Then the redirect carries error=invalid_target

  Scenario: A completed authorization redirects to the client's own redirect_uri with a code
    Given a registered client with a valid redirect_uri and PKCE challenge
    When the user completes the existing Google login internally
    Then the browser is redirected to the client's redirect_uri with a code and the original state
    And the redirect also carries this API's issuer identifier

  Scenario: The existing browser flow is unaffected by this authorization server's existence
    Given an ordinary war-ui-default login
    When it completes
    Then the existing cookie-based /auth/{provider}/callback behavior is unchanged

  Scenario: An authorization code is exchanged for a resource-scoped access token
    Given a valid, unexpired authorization code, its matching code_verifier, and its resource
    When POST /oauth/token is called with grant_type=authorization_code
    Then the response status is 200
    And the returned access token's audience is that resource

  Scenario: A code cannot be redeemed twice
    Given an authorization code that has already been redeemed once
    When POST /oauth/token is called again with the same code
    Then the response status is 400 with error invalid_grant

  Scenario: A code is rejected with the wrong code_verifier
    Given a valid, unexpired authorization code
    When POST /oauth/token is called with an unrelated code_verifier
    Then the response status is 400 with error invalid_grant

  Scenario: Refreshing cannot widen a token's audience
    Given a refresh token originally issued for one resource
    When POST /oauth/token is called with grant_type=refresh_token and a different resource
    Then the response status is 400 with error invalid_target

  Scenario: A token issued by this server is revocable exactly like a browser session's
    Given an access token obtained via this authorization server
    When its refresh token's family is revoked
    Then a subsequent refresh with that family returns 401

Feature: MCP Resource Server

  Scenario: A request with no bearer token is challenged
    When a request is made to /api/v1/mcp with no Authorization header
    Then the response status is 401
    And a WWW-Authenticate header names resource_metadata as
      /.well-known/oauth-protected-resource/api/v1/mcp exactly — not the bare
      /.well-known/oauth-protected-resource path

  Scenario: A token audience-bound to a different resource is rejected
    Given an access token whose audience is not this deployment's resource identifier
    When a request is made to /api/v1/mcp bearing that token
    Then the response status is 401

  Scenario: This API never forwards a bearer token it receives to any other service
    Given a valid access token presented to /api/v1/mcp
    When an MCP tool call is handled
    Then the request is served by an in-process function call
    And no outbound HTTP request carrying that token is made to any other service

Feature: Service-Layer Allowlist

  Scenario: The MCP allowlist exports exactly the approved service functions
    Given the src/mcp/allowedActions module
    When its exports are enumerated
    Then they are exactly createWarForVoter, patchWar, activateWar, closeWar,
      listWarsForVoter, getWar, addContestant, patchContestant, addContestantImage,
      and rankingsFor
    And no other function is exported

  Scenario: No tool in the registered surface can cast a vote
    Given the full set of registered MCP tools
    When their backing functions are enumerated
    Then castVoteForVoter, nextMatchupForVoter, and joinWar do not appear among them

  Scenario: A tool handler file importing a service module outside the allowlist fails lint
    Given a file under src/mcp/tools/ that imports directly from votes/votesService.ts
    When lint runs
    Then it fails

Feature: MCP Tool Surface

  Scenario: create_war sends only the fields supplied
    Given a valid access token for an authenticated voter
    When create_war is called with only a title
    Then a War is created via the same function POST /wars uses
    And its stored media_mode is the API's own default, not one the tool call specified

  Scenario: update_war on a War the caller does not own is rejected
    Given a valid access token for Voter B
    And a draft War created by Voter A
    When Voter B calls update_war on Voter A's War
    Then the call is rejected exactly as PATCH /wars/:id would reject it for Voter B

  Scenario: activate_war surfaces the existing activation rules
    Given a valid access token for the War's creator
    And a draft War with only one contestant
    When activate_war is called for that War
    Then it is rejected for having too few contestants
    And the War remains in draft status

  Scenario: list_my_wars with no arguments returns every status, including drafts
    Given a valid access token for a voter who created a draft War, an active War, and a closed War
    When list_my_wars is called with no arguments
    Then all three Wars are returned

  Scenario: list_my_wars does not return another voter's Wars
    Given a valid access token for a voter with no Wars of their own
    And another voter has created an active public War
    When list_my_wars is called with no arguments
    Then the other voter's War is not among the results

  Scenario: get_war returns a War by id with no ownership check applied
    Given a valid access token for any authenticated voter
    And a draft War created by a different voter
    When get_war is called with that War's id
    Then the War's detail is returned, matching GET /wars/:id's own behavior exactly

  Scenario: add_contestant rejects an attribute the War's schema does not declare
    Given a valid access token for the War's creator
    And a draft War with a contestant_schema that does not declare "country"
    When add_contestant is called with a "country" attribute
    Then it is rejected exactly as POST /wars/:id/contestants would reject it
    And no contestant is created

  Scenario: upload_image decodes and stores the provided image
    Given a valid access token for the War's creator
    And a draft War with a contestant
    And a base64-encoded JPEG under the 10MB limit
    When upload_image is called with that data
    Then the image is stored via the same function the multipart upload route uses
    And the stored image's variants match what a REST upload of the same bytes would produce

  Scenario: upload_image rejects a payload over the size limit
    Given a valid access token for the War's creator
    And a base64-encoded payload decoding to over 10MB
    When upload_image is called with it
    Then it is rejected exactly as the multipart route rejects an oversized upload

  Scenario: get_rankings returns a public War's leaderboard
    Given a valid access token for any authenticated voter
    And an active public War with recorded votes
    When get_rankings is called with that War's id
    Then the same ranking order GET /wars/:id/rankings would return is returned

  Scenario: get_rankings on an invite-only War rejects a non-member
    Given a valid access token for a voter who is neither the creator nor a member
    And an invite-only War
    When get_rankings is called with that War's id
    Then it is rejected exactly as GET /wars/:id/rankings rejects that same voter
```

### Images

```gherkin
Feature: Image Processing

  Scenario: Uploaded images are re-encoded into variants
    Given a 10MB JPEG uploaded for a contestant
    When the upload completes
    Then WebP variants are stored at 400, 800, and 1600 pixels wide
    And the original is retained in a private prefix

  Scenario: EXIF metadata is stripped
    Given an uploaded photo containing GPS coordinates in its EXIF data
    When the variants are generated
    Then no EXIF metadata is present in any variant

  Scenario: Images are never upscaled
    Given an uploaded image 600 pixels wide
    When the variants are generated
    Then a 400px variant exists
    And no 800px or 1600px variant is produced

  Scenario: Originals are not publicly reachable
    Given a stored original image
    When it is requested through the public media path
    Then it is not served

  Scenario: Responses expose variants, not raw URLs
    Given a contestant with images
    When any endpoint returns that contestant
    Then each image includes a variants array with width and url

  Scenario: A contestant may hold up to ten images
    Given a contestant with ten images in a draft War
    When an eleventh image is uploaded
    Then the response status is 422

  Scenario: The next matchup's media is offered for prefetch
    Given a voter with at least two pairs remaining
    When they request /matchups/next
    Then the response includes a prefetch block naming the following matchup's media
```

### Contestant Schema

```gherkin
Feature: Contestant Schema

  Scenario: A pageant and a primary use different fields with the same code
    Given a War declaring country, age, and height
    And another War declaring party, state, and office
    When contestants are fetched from each
    Then each returns its own fields resolved with labels and values

  Scenario: An attribute outside the schema is rejected
    Given a War whose schema declares only country
    When a contestant is created with an attribute keyed party
    Then the response status is 422

  Scenario: A mistyped attribute is rejected
    Given a schema declaring age as a number
    When a contestant is created with age set to "twenty-four"
    Then the response status is 422

  Scenario: A dangerous URL never reaches storage
    Given a schema declaring a field of type url
    When a contestant is created with a javascript: value for it
    Then the response status is 422
    And no contestant record is created

  Scenario: Omitted fields are permitted
    Given a schema declaring country, age, and height
    When a contestant is created supplying only country
    Then the contestant is created
    And only country is present in its resolved attributes

  Scenario: Attributes resolve in schema order
    Given a schema declaring country then age
    When a contestant supplies them in the opposite order
    Then the resolved attributes list country before age

  Scenario: The schema is fixed once a War is active
    Given an active War
    When its contestant_schema is modified
    Then the response status is 403
```

### Media Mode

```gherkin
Feature: Media Mode

  Scenario: A video War rejects image uploads
    Given a draft War with media_mode video
    When an image is uploaded for a contestant
    Then the response status is 409

  Scenario: An image War rejects video attachment
    Given a draft War with media_mode image
    When a video URL is attached to a contestant
    Then the response status is 409

  Scenario: Activation requires media matching the mode
    Given a draft War with media_mode video
    And a contestant with no video attached
    When the creator activates the War
    Then the response status is 422
    And the War remains draft

  Scenario: An unembeddable video is rejected when added
    Given a video URL whose owner has disabled embedding
    When it is attached to a contestant
    Then the response status is 422
    And no media record is created

  Scenario: An unsupported provider is rejected
    Given a video URL from a provider outside the allow-list
    When it is attached to a contestant
    Then the response status is 422

  Scenario: Overlong videos are rejected
    Given a video whose effective duration is 90 seconds
    When it is attached to a contestant
    Then the response status is 422

  Scenario: A clip window shortens a longer video
    Given a five-minute video with start_seconds 60 and end_seconds 80
    When it is attached to a contestant
    Then the media record stores a duration of 20 seconds

  Scenario: Video responses carry an identity, never an embed URL
    Given a contestant with a video
    When any endpoint returns that contestant
    Then the media object names a provider and a video id
    And it contains no embed URL
```

### Rate Limiting

```gherkin
Feature: Rate Limiting

  Scenario: Voting beyond the per-voter limit is throttled
    Given a voter who has cast 60 votes within one minute
    When they cast another vote
    Then the response status is 429
    And a Retry-After header is present

  Scenario: Limits are keyed by voter, not by address
    Given two voters sharing one public IP address
    When one of them reaches the vote rate limit
    Then the other can still vote

  Scenario: Throttled votes are not recorded
    Given a voter who is being rate limited
    When their vote is rejected with 429
    Then no Vote record is created
    And no counters change
```

### War Creation

```gherkin
Feature: War Creation

  Scenario: An authenticated voter creates a War
    Given an authenticated voter
    When they POST a title to /api/v1/wars
    Then a new War is created in "draft" status
    And its visibility defaults to "public"

  Scenario: A title is required
    Given an authenticated voter
    When they POST to /api/v1/wars with no title
    Then the response status is 422
    And no War is created

  Scenario: An unauthenticated request cannot create a War
    Given a request with no Authorization header
    When they POST to /api/v1/wars
    Then the response status is 401

  Scenario: The creator adds a contestant to their draft War
    Given a draft War created by the requester
    When they POST a name to /api/v1/wars/:id/contestants
    Then the contestant is created
    And it appears in the War's contestant list

  Scenario: A contestant name is required
    Given a draft War created by the requester
    When they POST to /api/v1/wars/:id/contestants with no name
    Then the response status is 422
    And no contestant is created

  Scenario: A non-creator cannot add a contestant
    Given a War created by Voter A
    When Voter B POSTs a contestant to it
    Then the response status is 403

  Scenario: A contestant cannot be added once the War is active
    Given an active War
    When its creator POSTs a new contestant
    Then the response status is 403
```

### War Lifecycle

```gherkin
Feature: War Lifecycle

  Scenario: Creator activates a War with enough contestants
    Given a War in "draft" status with 3 contestants, each with an image
    When the creator POSTs to /api/v1/wars/:id/activate
    Then the War status becomes "active"
    And exactly 3 matchups are generated

  Scenario: Cannot activate with fewer than 2 contestants
    Given a War in "draft" with 1 contestant
    When the creator POSTs to activate
    Then the response status is 422
    And the War remains "draft"

  Scenario: Cannot activate when a contestant has no image
    Given a War in "draft" with 2 contestants, only one of which has an image
    When the creator POSTs to activate
    Then the response status is 422
    And the War remains "draft"

  Scenario: Cannot edit after activation
    Given a War in "active" status
    When the creator PATCHes the title
    Then the response status is 403

  Scenario: Non-creator cannot activate
    Given a War created by Voter A
    When Voter B POSTs to activate
    Then the response status is 403
```

### Public Wars List Visibility

```gherkin
Feature: Public Wars List Visibility

  Scenario: Anonymous listing excludes drafts, invite-only Wars, and non-active Wars by default
    Given a voter has created a public active War, a public draft War, a public closed War, and an active invite-only War
    When anyone GETs /api/v1/wars
    Then only the public active War is returned

  Scenario: Being authenticated grants no extra visibility on its own
    Given a voter has created a public draft War
    When a different, authenticated voter GETs /api/v1/wars
    Then that draft War is not returned

  Scenario: An explicit status filter does not override visibility scoping
    Given a voter has created a closed, invite-only War
    When anyone GETs /api/v1/wars?status=closed
    Then that War is not returned
```

### My Wars

```gherkin
Feature: My Wars

  Scenario: A voter lists the Wars they created, across every status
    Given a voter has created a draft War, an active War, and a closed War
    And another voter has created a public active War
    When they GET /api/v1/wars?creator=me
    Then only the requester's three Wars are returned

  Scenario: creator=me combines with the status filter
    Given a voter has created a draft War and an active War
    And another voter has created a draft War
    When they GET /api/v1/wars?creator=me&status=draft
    Then only their own draft War is returned

  Scenario: An unauthenticated request for creator=me is rejected
    Given a request with no Authorization header
    When they GET /api/v1/wars?creator=me
    Then the response status is 401

  Scenario: A request for creator=me with an invalid or expired token is rejected
    Given a request bearing an invalid or expired JWT
    When they GET /api/v1/wars?creator=me
    Then the response status is 401

  Scenario: A voter's own invite-only or draft Wars are included, and another voter's are not
    Given a voter has created a draft, invite-only War
    And another voter has created a draft, invite-only War
    When they GET /api/v1/wars?creator=me
    Then their own invite-only draft War is returned
    And the other voter's is not

  Scenario: A creator value other than "me" is rejected
    When they GET /api/v1/wars?creator=someone-else
    Then the response status is 400
    And the response is Fastify's own validation-error envelope, not this API's "error" shape
```

### War Expiry

```gherkin
Feature: War Expiry

  Scenario: An expired War reports as closed before the nightly task runs
    Given an active War whose ends_at passed one minute ago
    And the close-expired-wars task has not yet run
    When anyone GETs /api/v1/wars/:id
    Then the response status field is "closed"

  Scenario: Voting is rejected the moment a War expires
    Given an active War whose ends_at passed one second ago
    And the close-expired-wars task has not yet run
    When a joined voter POSTs a vote
    Then the response status is 403

  Scenario: A War with no end date never expires
    Given an active War with ends_at set to NULL
    When the close-expired-wars task runs
    Then the War remains "active"

  Scenario: The nightly task materialises the stored status
    Given an active War whose ends_at passed six hours ago
    When the close-expired-wars task runs
    Then the stored status column becomes "closed"
    And the response reports 1 War closed

  Scenario: The nightly task is idempotent
    Given the close-expired-wars task has already closed all expired Wars
    When it runs again
    Then zero Wars are modified
    And the response status is 200

  Scenario: Internal endpoints reject a missing or wrong token
    When POST /api/v1/internal/close-expired-wars is called without a valid X-Internal-Token
    Then the response status is 401
    And no War records are modified

  Scenario: Internal endpoints do not accept user JWTs
    Given a valid user JWT for any voter
    When POST /api/v1/internal/close-expired-wars is called with that JWT and no internal token
    Then the response status is 401
```

### Voting

```gherkin
Feature: Voting

  Scenario: Voter casts a vote
    Given a voter who joined an active War
    And matchup M has not been voted on by this voter
    When they POST /vote with a valid winner_id
    Then a Vote record is created
    And the winner's win_count increases by 1
    And both contestants' appearance_count increase by 1

  Scenario: A vote is final
    Given a voter who voted Contestant A in matchup M
    When they POST /vote for matchup M with winner_id = Contestant B
    Then the response status is 409
    And no new Vote record is created
    And no counters change

  Scenario: Re-submitting the same vote is treated as a retry
    Given a voter who voted Contestant A in matchup M
    When they POST /vote for matchup M with winner_id = Contestant A again
    Then the response status is 200
    And no new Vote record is created
    And no counters change

  Scenario: A pairing has no direction
    Given contestants A and B in an active War
    Then exactly one matchup exists for that pair
    And attempting to insert the mirrored pairing violates a constraint

  Scenario: A voter is never served a pair they have voted on
    Given a voter who has voted on matchup M
    When they request /matchups/next repeatedly until 204
    Then matchup M is never returned

  Scenario: Every pair is served before completion
    Given an active War with 4 contestants and therefore 6 pairs
    When a voter requests and votes until /matchups/next returns 204
    Then they have voted on all 6 pairs exactly once

  Scenario: Pair order is randomised but stable per voter
    Given two voters in the same active War
    Then the order pairs are served in differs between them
    And each voter's own order is identical across repeated requests

  Scenario: Pair selection favours the least-shown contestants
    Given an active War where contestant C has the lowest appearance_count
    When a voter requests /matchups/next
    And they have unvoted pairs both containing and not containing C
    Then the returned pair contains C

  Scenario: The displayed side is decided by the API and recorded
    Given a voter served matchup M
    Then the response names which contestant is left and which is right
    And the order is identical if the request is repeated
    When they vote
    Then presented_left_id is stored on the Vote record

  Scenario: Abandoning produces no record
    Given a voter served matchup M who never votes on it
    When they leave the War
    Then no Vote record exists for matchup M
    And neither contestant's counters changed

  Scenario: Cannot vote on a closed War
    Given a War in "closed" status
    When a voter POSTs a vote
    Then the response status is 403

  Scenario: Non-joined voter cannot vote
    Given an active War
    And an authenticated voter who has not joined
    When they POST a vote
    Then the response status is 403
```

### Rankings

```gherkin
Feature: Rankings

  Scenario: Anonymous user views public War rankings
    Given a public War in "active" status
    When an unauthenticated user GETs /wars/:id/rankings
    Then the response status is 200

  Scenario: Contestants are ranked by raw win count
    Given Contestant A has 320 wins and Contestant B has 300 wins
    When rankings are fetched
    Then Contestant A ranks above Contestant B

  Scenario: Ties are broken by fewer appearances
    Given Contestants A and B both have 50 wins
    And Contestant A has 60 appearances and Contestant B has 80
    When rankings are fetched
    Then Contestant A ranks above Contestant B

  Scenario: A high win rate on few showings does not top the board
    Given Contestant A has 3 wins from 3 appearances
    And Contestant B has 320 wins from 400 appearances
    When rankings are fetched
    Then Contestant B ranks above Contestant A

  Scenario: Contestants with no appearances are unranked
    Given Contestant C has an appearance_count of 0
    When rankings are fetched
    Then Contestant C appears at the bottom
    And its rank is null

  Scenario: Exposure stays balanced as a War progresses
    Given an active War that has received several hundred votes
    When contestants' appearance_counts are compared
    Then they are clustered within a narrow range

  Scenario: Rankings are cacheable for public Wars
    Given a public War
    When rankings are fetched
    Then the response sets Cache-Control public with max-age 30

  Scenario: Invite-only rankings are not stored in a shared cache
    Given an invite_only War
    When rankings are fetched by a member
    Then the response sets Cache-Control private

  Scenario: Invite-only War rankings blocked for anonymous users
    Given an invite_only War
    When an unauthenticated user GETs rankings
    Then the response status is 401
```

---

## 15. Implementation Status

This document specifies the full v1 design across all planned OAuth providers, both media
modes, rate limiting, and the custom UI registry. As of 2026-08-31, a single vertical
slice has been built and deployed — the **Core Voting Loop**: sign in, create a
War, add contestants with images, activate, vote, and read rankings, end to end, with
nothing partially built — and it is now consumed for real by `war-ui-default`'s own
Core Voting Loop slice, live in both staging and production for both repos
(`war-ui-default-spec.md` §12).

**Implemented:**
- Auth (§4): Google only. The route shape (`/auth/{provider}/...`) already supports the
  other four providers listed in §4 without restructuring; any `{provider}` other than
  `google` currently returns `404`. The callback's failure responses (§4.1, "Callback
  failure responses") are fully implemented: the OAuth `error` parameter → `403`, missing
  `code`/state mismatch → `400`, an exchange failure → `502` — no client, human or
  automated, sees a raw upstream library error code.
- Media (§5, §11.1): `image` mode only. A request specifying `media_mode: "video"` is
  rejected with `422`. The `video` columns in `contestant_media` (§6) and the video
  endpoints (§7.3, §11.3) exist in this document but are not implemented.
- War lifecycle, contestants, contestant schema, matchups, voting, rankings, and the
  internal `close-expired-wars` endpoint (§7.2–§7.5, §7.7): fully implemented as specified.
- Health check (§7.8): implemented.
- OpenAPI contract publishing (§7, §11.2): implemented, live in production at
  `GET /api/v1/openapi.json`. Generated from Fastify's route JSON Schemas via
  `@fastify/swagger` — never hand-maintained. `/api/v1/internal/*` is excluded, per §7.7.
  Request/response body schemas for the Core Voting Loop slice's routes (§11.2.1) are
  implemented, including `contestant_count` on `WarSummary`, the vote endpoint's `403`
  `reason` discriminator (§11.2.1, "Addendum (2026-08-30)"), and `GET /wars/:id/rankings`'s
  response schema (§11.2.1, "Addendum (2026-08-31)") — the endpoint's own behaviour was
  already implemented and covered by §14's Rankings Gherkin; this addendum's schema is what
  let `war-ui-default`'s Rankings slice generate real types against it. The CreateWar
  wizard's four routes (§11.2.1, "Addendum (2026-08-31): request/response schemas for the
  CreateWar wizard's routes") are implemented too: `POST /wars`, `POST
  /wars/:id/contestants`, `POST /wars/:id/contestants/:cId/images`, and `POST
  /wars/:id/activate` all now publish the response schemas that addendum specifies, in
  place of the blanket unschemad `200` it found when written. The images route needed a
  schema of its own, `imageUploadErrorResponseSchema` (`error` required, `details`
  optional, `src/contestants/routes.ts`) — a correction made after a design review found
  the route's first schema attempt, a plain `errorResponseSchema`, silently stripping
  `details` off that route's second `422` shape, the only text naming which of its two
  validation failures occurred. All four routes' schemas are pinned by four new scenarios
  in `war-api/specs/features/openapi.feature` ("The war creation endpoint's response
  schemas cover its status variations", "The add-contestant endpoint's response schema
  declares the contestant shape", "The image upload endpoint's response schema declares the
  stored media", "The activate endpoint's response schemas cover its status variations");
  the routes' own behaviour, unchanged by this schema work, remains covered by the "War
  Creation" and "War Lifecycle" Gherkin (§14).
- `GET /wars`'s `creator=me` filter (§7.2, §11.2.1 "Addendum (2026-09-01)"): implemented.
  The `creator` querystring param is enum-validated (`["me"]`) by Fastify's own schema, so
  any other value never reaches the handler; `creator=me` is auth-gated (`401` on a
  missing, invalid, or expired token) while every other combination of query params on
  this route stays unauthenticated; and when present, it scopes the list to the
  authenticated voter's own `creator_id` across every status, including their own drafts
  and invite-only Wars. Pinned by the "My Wars" Gherkin (§14), executable at
  `war-api/specs/features/my-wars.feature`.
- `GET /wars`'s default visibility/status scoping when `creator=me` is absent (§7.2,
  "Default scoping (no `creator=me`)"): implemented in `listWars`
  (`war-api/src/wars/warsRepository.ts`), not in the route handler — a deliberate choice so
  every caller of `listWars` inherits the restriction and no future route can bypass it by
  forgetting to apply it. When `filter.creatorId` is absent, the query applies
  `status = (filter.status ?? 'active')` AND `status != 'draft'` AND
  `visibility != 'invite_only'`, which is why an explicit `status=draft` from a non-owner
  is self-contradictory (`status != 'draft'` and `status = 'draft'` can never both hold)
  and returns an empty list rather than leaking another voter's drafts. Pinned by three
  scenarios in the "Public Wars List Visibility" Gherkin (§14), executable at
  `war-api/specs/features/wars-list-visibility.feature`.

**Not yet implemented:**
- Apple, Facebook, Microsoft, and Twitter/X OAuth (§4), and linking multiple providers to
  one voter account
- `video` media mode (§5, §6, §11.3)
- Rate limiting (§9.4) — the edge's volumetric limits (`war-infra-spec.md` §13.1) are live;
  the API's own per-identity limits described here are not
- Custom UI registry endpoints (§7.6, §10) — the `ui_registrations` table and `wars.ui_slug`
  column exist and are reserved; no endpoint reads or writes them yet
- The OAuth 2.1 authorization/resource server role for third-party and MCP clients (§4.3):
  `/oauth/authorize`, `/oauth/token`, `/oauth/register`, both `/.well-known/*` discovery
  documents, the `oauth_clients` and `authorization_codes` tables (§6), and the MCP
  Streamable HTTP endpoint and tool surface (§7.9). None of it is built. The existing
  browser flow (§4.1, §4.2) is unaffected either way. **Two designs previously occupied
  this slot in this document and were discarded outright, not merged**: a Playwright-driven
  cookie-extraction design, and a loopback/native-app (RFC 8252) design for a locally-run
  MCP process — both assumed a local process, which a deployed MCP server accessible from
  Claude's desktop and mobile apps is not. Neither left a trace here beyond this note and
  the revision notes at §4.3 and §7.9.

**Build order for §4.3/§7.9** (this is a multi-slice piece of work; the order below is the
dependency structure, not merely a suggestion). **Client ID Metadata Documents are in slice
1, not Dynamic Client Registration** — the MCP authorization specification states CIMD
support as a SHOULD for both authorization servers and clients, and DCR as a MAY that is
itself "deprecated and retained for backwards compatibility with authorization servers that
do not support Client ID Metadata Documents." Sequencing the deprecated, compatibility-only
mechanism first would have left slice 1 provable only against a test client, not against
any real MCP client that speaks solely CIMD — exactly the risk an earlier draft of this
order left unflagged:

1. **The authorization server core, with CIMD as its registration mechanism** —
   `/oauth/authorize`, `/oauth/token`, PKCE, resource indicators (RFC 8707), Client ID
   Metadata Document resolution (§4.3.3, including its SSRF guards), and the two discovery
   documents. Provable against a real `https://` CIMD document without the MCP endpoint
   existing yet, and — unlike a DCR-first sequencing — provable against whatever
   registration mechanism a real MCP client actually speaks, since CIMD needs no prior
   registration call at all.
2. **The MCP endpoint and tool surface** (§7.9), protected by slice 1's resource-server
   check, including the service-layer allowlist module and both of its enforcement checks
   (the lint rule and the export-set unit test). Depends on slice 1 for anything to
   authenticate against.
3. **Dynamic Client Registration** (§4.3.3) as the compatibility path, alongside CIMD from
   slice 1. Moved behind slices 1–2 because it is the deprecated mechanism the
   specification itself says exists only for authorization servers that don't support
   CIMD — this one already will by slice 1.
4. **Issuer validation, `WWW-Authenticate` scope challenges, and revocation wiring**
   (§4.3.2, §4.3.6, and `revokeToken` on the `OAuthServerProvider`) — hardening that
   completes the MCP authorization spec's normative requirements without changing slice 1,
   2, or 3's observable behavior for a client that never hits these edges.

`war-infra-spec.md` §5.2 records the one infrastructure consequence: none of the above adds
a new deployable, so none of it needs a new App Platform component, deploy pipeline, or
concurrency group.

None of the above is inferred to be in scope from the data model's presence — a reserved
column or table does not mean its feature is built.

**§14's Gherkin covers the full design**, including scenarios for behavior not yet
built (video-mode scenarios under "Media Mode", all of "Rate Limiting"). The scenarios
that actually execute in CI live in `war-api/specs/features/*.feature` — a project-local,
implemented-only adaptation of a subset of §14, bound via `@amiceli/vitest-cucumber`. That
directory is executable test fixture, not a second copy of this document; it does not
duplicate the prose here and should not be read as such.

**Toolchain deviation.** §11 names Node.js 22 in its table, now corrected to 24.x. At the
time the Core Voting Loop slice was built, Node.js 22 was no longer on `winget`'s LTS
channel; `winget install OpenJS.NodeJS.LTS` resolved to Node.js 24.18.1. The
actually-deployed runtime is **Node.js 24.x**.

This section is the status marker for what has shipped. Update it — not by forking a
second prose document in `war-api` — as further slices land.
