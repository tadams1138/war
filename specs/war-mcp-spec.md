# War — MCP Server Specification
**Repo:** `war-mcp`
**Version:** 1.0
**Status:** Draft
**Date:** 2026-09-09

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Principles](#2-architecture-principles)
3. [Repository Structure](#3-repository-structure)
4. [Authentication](#4-authentication)
5. [Tool Surface](#5-tool-surface)
6. [Error Mapping](#6-error-mapping)
7. [Tech Stack](#7-tech-stack)
8. [Testing Strategy](#8-testing-strategy)
9. [CI/CD](#9-cicd)
10. [Out of Scope (v1)](#10-out-of-scope-v1)
11. [Gherkin Acceptance Tests](#11-gherkin-acceptance-tests)
12. [Implementation Status](#12-implementation-status)

---

## 1. Overview

`war-mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that lets
a War Creator build and edit War content — Wars, contestants, and images — from an MCP
client (an agent such as Claude Code or Claude Desktop) instead of the `war-ui-default`
creation wizard.

It is a **client of the public War API**, in the same sense `war-ui-default` and a custom
UI (`war-ui-custom-spec.md`) are clients. It talks to `war-api` over HTTPS exactly as any
other client does, holds no database connection, and runs no business logic of its own —
every rule about what a War Creator may do lives in `war-api`, and `war-mcp` inherits it by
construction rather than by re-implementing it.

It runs locally, launched by the MCP client as a child process communicating over stdio
(§2). It is not hosted, has no public network listener, and is not part of `war-infra`'s
deploy surface.

---

## 2. Architecture Principles

### 2.1 The API is the only authority — no backdoor

**This is the constraint the rest of this document exists to protect.** `war-mcp` calls
the exact same versioned public REST API (`war-api-spec.md` §7) that `war-ui-default` and
any custom UI call. It has no private route, no direct database access, and no
war-api-internal credential of any kind. Every request it makes carries an ordinary
`Authorization: Bearer <jwt>` for a real Voter, obtained through the same OAuth identity
(`war-api-spec.md` §4) any other client uses.

The reasoning, stated plainly so a later change does not quietly erode it:

- **Authorization stays in one place.** `war-api` decides who may create, edit, activate,
  or close a War (`war-api-spec.md` §7.2–§7.3: creator-only, draft-only, etc.). `war-mcp`
  never re-implements or second-guesses that decision — it relays the request and relays
  the response, including a `403` or `404`, verbatim. A tool that "helpfully" pre-checked
  ownership client-side and skipped the API call on failure would be a second enforcement
  path, and the two paths drifting apart is exactly the failure mode this constraint
  prevents.
- **Future platform controls apply automatically.** `war-api-spec.md` §9.4 specifies
  per-identity rate limits, not yet built (§15), and moderation is an explicitly later
  slice (`war-spec.md` §2). Because `war-mcp` is just another Bearer-authenticated caller
  of the public API, the day either lands, it constrains `war-mcp` with zero code change
  here. A direct-database or privileged-path design would need its own copy of both,
  forever.
- **A custom UI already establishes this pattern for presentation** (`war-ui-custom-spec.md`
  §1: "consumes the same API, enforces no rules of its own"). `war-mcp` is the same
  principle applied to a second *kind* of secondary client — not a different one.

Nothing in this document specifies a `war-mcp`-only permission, filter, or validation rule
that the API does not already enforce. Where a tool's behavior might look like a rule (for
example, §5's note that `create_war` never sends `media_mode`), it is a *client-side
omission* that lets the API's own default apply — never a `war-mcp`-side decision about
what is or isn't allowed.

### 2.2 Transport: stdio only

`war-mcp` speaks MCP over stdio (`StdioServerTransport`, §7). It is launched, owned, and
terminated by its MCP client, exactly like any other local MCP server — no port, no TLS
certificate, no listener reachable over a network, and nothing for `war-infra` to deploy or
scale. A remote/HTTP MCP transport is a later question, out of scope here (§10).

### 2.3 Thin, stateless-per-call

Beyond the credential cache (§4.3), `war-mcp` holds no state of its own. It does not cache
War or contestant data, does not resolve names to ids on the client side (a tool that needs
a contestant id is given one, typically from a prior tool call's result or from `get_war`),
and does not retry a request the API has answered — only the *auth* layer transparently
retries once, per §4.4.

---

## 3. Repository Structure

```
war-mcp/
├── src/
│   ├── cli.ts             # bin entrypoint: `war-mcp` (serve) / `war-mcp login`
│   ├── server.ts           # McpServer construction and tool registration
│   ├── auth/
│   │   ├── login.ts         # one-time browser-driven OAuth capture (§4.2)
│   │   ├── tokenStore.ts     # local credential cache read/write (§4.3)
│   │   └── authorizedClient.ts  # attaches JWT; single-flight refresh on 401 (§4.4)
│   ├── warApiClient.ts     # one function per endpoint this project calls (§5)
│   └── tools/               # one module per tool in §5
├── specs/
│   └── features/            # executable Gherkin (§8, §11) — this project's own subset
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Authentication

### 4.1 Decision: reuse the existing Google OAuth flow — no new `war-api` endpoint

Two shapes were considered:

1. **Reuse `war-api`'s existing Google OAuth flow** (`war-api-spec.md` §4), the way a
   browser does today. No new `war-api` surface at all.
2. **Personal Access Tokens** — a new, long-lived, revocable, scoped credential issued and
   revoked by new `war-api` endpoints. The better long-term fit for a machine client (and
   it pairs naturally with a future moderation slice — revoking a token becomes a
   moderation action), but it is new API surface, new spec, and new tests, all of which
   this slice's brief puts out of scope for `war-api`.

**This slice takes option 1.** It costs more inside `war-mcp` (§4.2 below is real
complexity, not a footnote) but it changes nothing in `war-api`, which is what the brief
for this slice asks for. PATs remain the better shape once a second machine client exists
to justify them; §12 records this as deferred, not rejected.

### 4.2 The technical problem option 1 has to solve, and how

`war-api`'s OAuth callback never returns a bearer token to its caller. It sets the refresh
token as an **`HttpOnly` cookie** on the browser and redirects to `${uiOrigins[0]}/auth/callback`
carrying no credential of any kind (`war-api-spec.md` §4.1) — deliberately, so that no
script on any page can ever read it. `war-ui-default` itself never sees the refresh token's
value either; the browser attaches it automatically on `POST /auth/refresh`
(`war-ui-default-spec.md` §7).

A Node process has no browser cookie jar. There is consequently no ordinary HTTP call
`war-mcp` can make to obtain that cookie's value — by design, since that design is what
makes token theft via a compromised page impossible. The only place the value is
legitimately readable outside of page JavaScript is through a **browser automation
session**, which operates at the browser-engine level rather than through page script and
is unaffected by `HttpOnly`.

**`war-mcp login` therefore launches a real, visible (non-headless) browser via Playwright**
and drives it through the *unmodified* flow a human would use:

1. Navigate to `${WAR_API_BASE_URL}/api/v1/auth/google/login`.
2. The user completes Google's own sign-in and consent UI themselves, in that window,
   exactly as they would in any browser. `war-mcp` does not touch the login form.
3. Wait for the browser to land on `${WAR_API_BASE_URL}/auth/callback` (this
   deployment's UI and API share one domain per environment — `war-infra-spec.md` §5.5,
   §20 — so this is the same host as step 1).
4. Read the `refresh_token` cookie from the browser context (Playwright's
   `BrowserContext.cookies()`, which is not subject to `HttpOnly`'s page-script
   restriction) and close the browser.
5. Store it via the token store (§4.3).

**Stated risk.** Google applies anti-automation heuristics to sign-in attempts from
browsers under programmatic control, independent of this design; a flow that never
automates the login form itself (step 2) is the mitigation this document takes, not a
guarantee. If this proves unreliable in practice, the fallback is the Personal Access
Token shape from §4.1, as a `war-api` companion slice — not a workaround invented here.

`war-mcp login` is a **separate, explicit, human-run step**, not something a tool call
triggers mid-conversation. An MCP tool invocation that silently popped up a browser and
blocked for however long a human takes to sign in would be a poor experience for whichever
client is driving it. Every tool in §5 instead **fails fast** with a clear
"not authenticated — run `war-mcp login`" error when no usable credential is cached
(§6, §11).

### 4.3 Token storage

The refresh token is cached at `envPaths('war-mcp', { suffix: '' }).config/credentials.json`
(§7 — resolved per-OS: e.g. `~/.config/war-mcp/credentials.json` on Linux,
`~/Library/Preferences/war-mcp/credentials.json` on macOS, `%APPDATA%\war-mcp\Config\credentials.json`
on Windows). The file is written with the most restrictive permissions the OS honors for a
single-user file (POSIX mode `0600`); Windows has no equivalent primitive, and this
document relies on the user-profile directory's own ACL there rather than claiming a
protection this project cannot provide. It is not encrypted at rest. Both are stated
limits, not oversights: an OS keychain integration is strictly more work than a first MCP
server needs, and it is a natural hardening candidate for a later slice, not a blocker for
this one.

### 4.4 Using the credential

Every tool call that needs one (all of them — §5 has no anonymous tool) goes through the
same sequence:

1. If no refresh token is cached, fail immediately with the "not authenticated" error
   (§4.2) — **no HTTP request of any kind is made.**
2. If a JWT is already cached in memory and unexpired, use it.
3. Otherwise, call `POST /api/v1/auth/refresh` with the cached refresh token as the
   `Cookie` header and `Origin: ${WAR_API_BASE_URL}` (the API enforces this origin check,
   `war-api-spec.md` §4.1; because API and UI share a domain per environment, §4.2, this is
   one configured value, not two). On success, cache the returned JWT and the **rotated**
   refresh token the response's `Set-Cookie` carries (`war-api-spec.md` §4.2 — the
   presented token is single-use), replacing the stored one.
4. Issue the tool's actual API call with `Authorization: Bearer <jwt>`.
5. If that call itself returns `401`, treat the cached JWT as stale, repeat step 3 exactly
   once, and retry the original call exactly once — mirroring `war-ui-default-spec.md` §7's
   "refresh is single-flight… a failed refresh is terminal." A second `401` (including a
   failed refresh — reuse detection revoked the whole family, per `war-api-spec.md` §4.2)
   clears the cached credential entirely and fails with the "not authenticated — run
   `war-mcp login`" error, the same as step 1. `war-mcp` never retries a refresh.

---

## 5. Tool Surface

Each tool maps to exactly one `war-api` endpoint from `war-api-spec.md` §7 that is actually
implemented today (§15 there). No tool is specified for an endpoint that document marks
unbuilt.

| Tool | Maps to | Notes |
|---|---|---|
| `create_war` | `POST /wars` | §5.1 |
| `update_war` | `PATCH /wars/:id` | §5.1 |
| `activate_war` | `POST /wars/:id/activate` | §5.1 |
| `close_war` | `POST /wars/:id/close` | §5.1 |
| `list_my_wars` | `GET /wars?creator=me` | §5.2 |
| `get_war` | `GET /wars/:id` | §5.2 |
| `add_contestant` | `POST /wars/:id/contestants` | §5.3 |
| `update_contestant` | `PATCH /wars/:id/contestants/:cId` | §5.3 |
| `upload_image` | `POST /wars/:id/contestants/:cId/images` | §5.4 |

**Deliberately excluded from this slice** (a trim, not an oversight):

- `DELETE /wars/:id/contestants/:cId` and the media reorder/delete endpoints
  (`PATCH`/`DELETE /wars/:id/contestants/:cId/media/:mId`) — removal and reordering are
  less central to "help me build content" than create/add/edit, and are a natural
  follow-up once this surface is in use.
- `POST /wars/:id/join` — a voter action, not a content-authoring one; out of place next to
  the rest of this tool set.
- Anything under matchups, voting, or rankings (`war-api-spec.md` §7.4–§7.5) — that is the
  voter-facing surface `war-ui-default` already serves; a War Creator authoring content has
  no need of it here.
- `POST /wars/:id/contestants/:cId/video` — not implemented in `war-api` at all yet (§15);
  specifying a tool for it would violate this slice's own ground rule.

### 5.1 War lifecycle tools

**`create_war`** — `title` (required, 1–256 chars, else the API's `422` surfaces verbatim,
§6), `category` (optional), `visibility` (optional; `"public"` or `"invite_only"`),
`contestant_schema` (optional, `war-api-spec.md` §5's field rules), `ends_at` (optional
ISO-8601 datetime).

**`media_mode` is not a tool argument in this slice.** The API rejects `video` outright
(§15) and `image` is its own default, so the only value this argument could ever validly
carry is the one that already happens by omission — exposing it invites a caller to pass
`"video"` and receive a `422` for no reason. `create_war` never sends `media_mode`; the
War is created however the API's own default resolves it. If `video` mode ships in
`war-api`, this is revisited then, not pre-built speculatively now.

Any field left out of the call is simply not sent — `war-mcp` applies no default of its
own for anything the API already defaults (visibility → `public`, media_mode → `image`).
Duplicating those defaults here would create a second copy that could drift from the one
in `war-api-spec.md` §7.2.

**`update_war`** — `war_id` (required) plus any subset of `create_war`'s optional fields.
Only the fields supplied are sent; an omitted field is not part of the request body at all,
so `war-api`'s own "unspecified stays unchanged" `PATCH` semantics apply untouched.

**`activate_war`**, **`close_war`** — `war_id` only. Both are pure pass-throughs to their
endpoints; every rule in `war-api-spec.md` §7.2 (≥2 contestants, every contestant has an
image, creator-only, correct starting status) is enforced by the API and surfaces through
§6, never re-checked here.

### 5.2 Listing and lookup tools

**`list_my_wars`** — optional `status`, `category`, forwarded as-is to the querystring
alongside a fixed `creator=me`. **With no arguments, this returns every War the
authenticated voter created, across every status — draft, active, closed, invite-only
included** (`war-api-spec.md` §7.2's `creator=me` semantics, unchanged). `war-mcp` applies
no narrower default of its own; the one place a default is decided is `war-api`, and this
tool inherits it exactly, including the parts of it (a voter's own invite-only and draft
Wars) that a *different* default — the one that applies when `creator=me` is absent — would
hide from anyone else.

**`get_war`** — `war_id` only, mapping directly to `GET /wars/:id`. This endpoint carries
**no visibility or ownership restriction today** (`war-api-spec.md` §7.2 documents no such
rule for single-War lookup by id, and the implementation applies none) — it returns any
War by id to any caller, including another voter's draft. `war-mcp` does not add one: doing
so would itself be exactly the kind of second, `war-mcp`-only authorization decision §2.1
rules out. If `war-api` narrows this endpoint later, `get_war` narrows with it automatically,
by virtue of calling it rather than reimplementing it.

### 5.3 Contestant tools

**`add_contestant`** — `war_id` (required), `name` (required, 1–256 chars), `bio`
(optional), `attributes` (optional, validated by the API against the War's
`contestant_schema` — an unknown key or a type mismatch is a `422` surfaced verbatim, §6).

**`update_contestant`** — `war_id`, `contestant_id` (required), plus any subset of `name`,
`bio`, `attributes`. Same omitted-field semantics as `update_war`.

Both are draft-only and creator-only at the API (`war-api-spec.md` §7.3); both failure
modes surface as `403` through §6, not as a client-side check.

### 5.4 Media tool

**`upload_image`** — `war_id`, `contestant_id` (required), `image_path` (required): an
absolute filesystem path readable by the `war-mcp` process. `war-mcp` runs locally
alongside the creator's own files, so a path is the natural input — no base64 encoding
step, no separate upload protocol. If the path cannot be read (missing file, a directory,
a permissions error), the tool fails with a clear "could not read `<path>`" error **before
any HTTP request is made** (§6, §11) — reading the file is this tool's own responsibility;
everything about whether the *content* is acceptable (readable as an image, the
contestant's 10-image cap, `war-api-spec.md` §7.3) is the API's, and surfaces verbatim.

---

## 6. Error Mapping

Every tool call resolves to exactly one of:

1. **Success** — the API's `2xx` response, re-expressed as the tool's structured result.
   `war-mcp` does not reshape, rename, or drop fields the API returned; it presents what it
   was given, the same principle `war-ui-custom-spec.md` §4.1 states for a template.
2. **A precondition failure** — no cached credential (§4.2, §4.4 step 1/5's terminal
   case), or a locally unreadable file (§5.4). **No HTTP request is made in this case.**
   This is the one class of failure `war-mcp` decides on its own, and it is a precondition
   for making a call at all, never a judgment about whether the call *should* be allowed.
3. **An API-decided failure** — any non-2xx response `war-api` returns, after the retry-once
   handling in §4.4 has run its course. The tool result carries that status and the API's
   own `error` (and `details`, when present) text, unmodified. `war-mcp` does not
   special-case `403` vs `404` vs `422` vs `409` with its own wording — the API's message is
   the message.
4. **A transport failure** — the request could not reach `war-api` at all (DNS, connection
   refused, timeout). Reported as a distinct "unable to reach the War API" error, never
   confused with case 3's "the API answered and declined."

In every case the tool call itself completes (MCP `isError: true` where applicable); none
of the above ever throws in a way the MCP client has to interpret as a protocol-level
failure.

---

## 7. Tech Stack

| Component | Choice | Why |
|---|---|---|
| Runtime | Node.js 24.x (TypeScript) | Matches `war-api` (`war-api-spec.md` §11); one Node version across the Node projects in this monorepo |
| MCP server | `@modelcontextprotocol/sdk` ^1.30.0 | The official TypeScript SDK; `McpServer` + `registerTool` for the tool surface, `StdioServerTransport` for §2.2 |
| Tool schemas | `zod` ^4.6.0 | Accepted directly by the SDK's `registerTool` (`zod ^3.25 \|\| ^4.0`) |
| Browser automation (login only) | `playwright` ^1.63.0 | Drives the one-time interactive login capture (§4.2); not used anywhere in the tool-call path |
| HTTP client | Node's built-in `fetch`/`FormData`/`Blob` | Node 24 ships all three; no separate HTTP dependency needed for either JSON or the multipart upload in `upload_image` |
| Credential path resolution | `env-paths` ^4.0.0 | OS-appropriate config directory (§4.3) |
| Testing | Vitest + `@amiceli/vitest-cucumber` + `msw` | Vitest and `@amiceli/vitest-cucumber` match `war-api`'s own choices (`war-api-spec.md` §11); `msw` matches `war-ui-default`'s existing convention for mocking an HTTP dependency (`war-ui-default-spec.md` §9, `src/api/__tests__/client.test.ts`) |
| Lint / typecheck | ESLint (`typescript-eslint`) ^10.10.0 / ^8.70.0, TypeScript ^6.0.3 | Matches `war-api`'s pinned majors |

**Package name:** `war-mcp`, exposing a single bin also named `war-mcp` (§4.2, §4.4).

---

## 8. Testing Strategy

### 8.1 What is genuinely testable, and at what layer

`war-mcp`'s interesting behavior is **tool call in → HTTP request out → result mapped
back** (plus the auth layer that decides *whether* that HTTP request carries a valid
token). That boundary is exactly where these tests sit:

- The MCP protocol boundary is exercised for real: a test `Client`
  (`@modelcontextprotocol/sdk/client`) and the real `McpServer` are connected via
  `InMemoryTransport.createLinkedPair()` — no stdio process, no serialization mocked away,
  but no OS process boundary either. `client.callTool(...)` drives every scenario.
- The `war-api` boundary is mocked with `msw`, exactly as `war-ui-default` already mocks
  it. A scenario's `Given` arranges the mocked response (including a captured request), and
  its `Then` asserts **both** the tool's result **and** that `msw` actually received the
  expected request — method, path, and (where the scenario is about it) body or headers.

  **This second assertion is what rules out a do-nothing implementation.** A tool that
  always returns success without ever calling the API would pass a `Then` that checks only
  the result; asserting the mock was actually hit is what a do-nothing implementation
  cannot satisfy. Every scenario in §11 that asserts a boundary — "the API is asked," "no
  request is made," "the request carries the caller's own token" — is written this way for
  that reason.
- Credential loading and storage (§4.3) are tested against a temp directory injected in
  place of the real config path, not the developer's own `~/.config`.

### 8.2 What is not testable here, and is not pretended to be

**The interactive login capture (§4.2 steps 1–4: launching a real browser and completing
Google's own sign-in) is not covered by an automated test, in this project or any other.**
It requires a real Google account, a real human completing a real consent screen, and is
exactly the kind of round-trip this pipeline has no way to automate honestly. Simulating it
with a fake browser or a stubbed Google response would test Playwright's cookie-reading API
and nothing about whether real login actually works — worse than no test, since it would
read as coverage.

What *is* covered, at the boundary the rest of this document treats as the actual seam
(§4.3, §4.4): every scenario in §11's authentication feature starts from **a refresh token
already present in the store**, as if `war-mcp login` had already succeeded, and exercises
everything downstream of that — refresh, retry-once, rotation, and the terminal
"re-authenticate" case — against a mocked `war-api`. That is genuinely testable, and it is
the part of §4 that actually runs on every tool call; §4.2 runs exactly once per login.

This is a known, stated gap, not an oversight: verifying the login capture itself is manual
verification against a real staging environment and a real account, and stays that way
unless a future slice finds a safe way to automate it.

---

## 9. CI/CD

On every pull request: `npm --prefix war-mcp ci`, then lint, typecheck, and test (§8).
There is no deploy stage — `war-mcp` is not hosted (§2.2) and ships, in this slice, only as
source in this repository; packaging it for distribution (an npm publish, a
`npx war-mcp`-style entrypoint) is a later question, not specified further here.

---

## 10. Out of Scope (v1)

- Moderation and admin surfaces of any kind (a later slice, `war-spec.md` §2)
- Any change to `war-ui-default`
- Remote or HTTP MCP transport (§2.2) — stdio only
- Any change to `war-api` — this slice's auth decision (§4.1) was made specifically to
  avoid needing one
- Personal Access Tokens (§4.1) — the better long-term auth shape, deferred until a second
  machine client justifies the `war-api` work it needs
- `DELETE /wars/:id/contestants/:cId`, contestant media reordering/removal, `join_war`,
  video attachment, and anything in the matchup/voting/rankings surface (§5)
- Video `media_mode` (not built in `war-api` — §15 there)
- Packaging/distribution (npm publish, auto-update) — §9
- An OS keychain or other encrypted-at-rest credential store (§4.3)
- Non-Google OAuth providers — inherits directly from `war-api-spec.md` §15 ("Google only");
  `war-mcp` has no provider selection of its own

---

## 11. Gherkin Acceptance Tests

The scenarios below are `war-mcp`'s full design and are, at the point this document is
written, identical to what executes in `war-mcp/specs/features/*.feature` — there is no
partially-built subset yet (§12). As slices land unevenly, `specs/features/` becomes the
executable, implemented-only adaptation, exactly as it already is for `war-api`
(`war-api-spec.md` §15).

```gherkin
Feature: Authentication

  Background:
    Given war-mcp has no cached refresh token

  Scenario: A tool call with no cached credential fails without calling the API
    When the create_war tool is called
    Then the result reports "not authenticated - run war-mcp login"
    And no request was made to the War API

  Scenario: A cached refresh token is exchanged for a JWT on first use
    Given a valid refresh token is cached
    When the list_my_wars tool is called
    Then a request is made to POST /api/v1/auth/refresh
    And the resulting JWT is sent as the Authorization header of the list_my_wars request

  Scenario: A cached JWT is reused without refreshing again
    Given a valid refresh token is cached
    And a JWT was already obtained earlier in this session
    When the list_my_wars tool is called
    Then no request is made to POST /api/v1/auth/refresh
    And the cached JWT is sent as the Authorization header

  Scenario: An expired JWT is refreshed once and the original call retried
    Given a valid refresh token is cached
    And the War API rejects the first list_my_wars request with 401
    When the list_my_wars tool is called
    Then a request is made to POST /api/v1/auth/refresh
    And the list_my_wars request is retried exactly once with the new JWT
    And the tool call succeeds

  Scenario: A revoked refresh token fails the tool call and clears the cache
    Given a cached refresh token that the War API rejects at POST /api/v1/auth/refresh
    When the list_my_wars tool is called
    Then the result reports "not authenticated - run war-mcp login"
    And no cached refresh token remains afterward

Feature: War Lifecycle Tools

  Scenario: create_war sends only the fields supplied
    Given a valid cached credential
    When create_war is called with only a title
    Then a POST /api/v1/wars request is made whose body contains no media_mode field
    And the created War's fields are returned as the API reported them

  Scenario: create_war surfaces a validation failure verbatim
    Given a valid cached credential
    And the War API rejects POST /api/v1/wars with 422 and a message about the title
    When create_war is called with an empty title
    Then the result reports that same 422 message
    And no War is treated as created

  Scenario: update_war omits fields that were not supplied
    Given a valid cached credential
    And a draft War the authenticated voter created
    When update_war is called with only a new category
    Then the PATCH /api/v1/wars/:id request body contains only the category field

  Scenario: update_war on a War the caller does not own is rejected by the API
    Given a valid cached credential for Voter B
    And a draft War created by Voter A
    When Voter B calls update_war on Voter A's War
    Then a PATCH /api/v1/wars/:id request is made bearing Voter B's token
    And the result reports the API's 403

  Scenario: activate_war surfaces the API's activation rules
    Given a valid cached credential
    And a draft War with only one contestant
    When activate_war is called for that War
    Then the result reports the API's 422 for too few contestants
    And the War remains in draft status

  Scenario: close_war closes an active War the caller owns
    Given a valid cached credential
    And an active War the authenticated voter created
    When close_war is called for that War
    Then a POST /api/v1/wars/:id/close request is made
    And the result reports the War's closed status

  Scenario: close_war on a War the caller does not own is rejected by the API
    Given a valid cached credential for Voter B
    And an active War created by Voter A
    When Voter B calls close_war on Voter A's War
    Then a POST /api/v1/wars/:id/close request is made bearing Voter B's token
    And the result reports the API's 403

Feature: Listing and Lookup Tools

  Scenario: list_my_wars with no arguments returns every status, including drafts
    Given a valid cached credential
    And the authenticated voter has created a draft War, an active War, and a closed War
    When list_my_wars is called with no arguments
    Then a GET /api/v1/wars?creator=me request is made
    And all three Wars are returned

  Scenario: list_my_wars does not return another voter's Wars
    Given a valid cached credential
    And the authenticated voter has created no Wars
    And another voter has created an active public War
    When list_my_wars is called with no arguments
    Then a GET /api/v1/wars?creator=me request is made
    And the other voter's War is not among the results

  Scenario: list_my_wars combines with the status filter
    Given a valid cached credential
    And the authenticated voter has created a draft War and an active War
    When list_my_wars is called with status "draft"
    Then a GET /api/v1/wars?creator=me&status=draft request is made
    And only the draft War is returned

  Scenario: get_war returns a War by id with no ownership check applied
    Given a valid cached credential
    And a draft War created by a different voter
    When get_war is called with that War's id
    Then a GET /api/v1/wars/:id request is made
    And the War's detail is returned

  Scenario: get_war reports a not-found War as the API reports it
    Given a valid cached credential
    And no War exists with a given id
    When get_war is called with that id
    Then the result reports the API's 404

Feature: Contestant Tools

  Scenario: add_contestant adds a contestant to the caller's own draft War
    Given a valid cached credential
    And a draft War the authenticated voter created
    When add_contestant is called with a name
    Then a POST /api/v1/wars/:id/contestants request is made
    And the created contestant is returned

  Scenario: add_contestant rejects an attribute the War's schema does not declare
    Given a valid cached credential
    And a draft War with a contestant_schema that does not declare "country"
    And the War API rejects the request with 422 for the unknown attribute
    When add_contestant is called with a "country" attribute
    Then the result reports that same 422 message
    And no contestant is treated as created

  Scenario: add_contestant on a War the caller does not own is rejected by the API
    Given a valid cached credential for Voter B
    And a draft War created by Voter A
    When Voter B calls add_contestant on Voter A's War
    Then a POST /api/v1/wars/:id/contestants request is made bearing Voter B's token
    And the result reports the API's 403

  Scenario: update_contestant edits an existing contestant's fields
    Given a valid cached credential
    And a draft War the authenticated voter created with an existing contestant
    When update_contestant is called with a new bio
    Then a PATCH /api/v1/wars/:id/contestants/:cId request body contains only the bio field
    And the updated contestant is returned

  Scenario: update_contestant on a War that is no longer draft is rejected
    Given a valid cached credential
    And an active War the authenticated voter created with an existing contestant
    When update_contestant is called for that contestant
    Then a PATCH request is made to the API
    And the result reports the API's 403

Feature: Image Upload Tool

  Scenario: upload_image reads the file and uploads it
    Given a valid cached credential
    And a draft War the authenticated voter created with a contestant
    And a readable image file on disk
    When upload_image is called with that file's path
    Then a POST /api/v1/wars/:id/contestants/:cId/images request is made carrying the file's bytes
    And the result reports the stored image's id

  Scenario: upload_image fails before any request when the path cannot be read
    Given a valid cached credential
    And a path that does not exist on disk
    When upload_image is called with that path
    Then the result reports that the file could not be read
    And no request is made to the War API

  Scenario: upload_image surfaces the API's per-contestant image limit
    Given a valid cached credential
    And a contestant that already has ten images
    And a readable image file on disk
    And the War API rejects the upload with 422 naming the ten-image limit
    When upload_image is called with that file's path
    Then the result reports that same 422 message

  Scenario: upload_image on a contestant the caller does not own is rejected by the API
    Given a valid cached credential for Voter B
    And a contestant belonging to a draft War created by Voter A
    And a readable image file on disk
    When Voter B calls upload_image for that contestant
    Then a POST request is made bearing Voter B's token
    And the result reports the API's 403
```

---

## 12. Implementation Status

This document specifies the full design of `war-mcp`'s v1 tool surface, authentication, and
testing approach. As of 2026-09-09, **nothing in this document has been built** — this is
the specification stage of the pipeline, and `war-mcp` does not yet exist as a project.

**Not yet implemented:** everything in §5 (all nine tools), §4 (login capture, token store,
authorized client), and the project scaffold itself (§3, §7).

**Deferred, not rejected:** Personal Access Tokens (§4.1) as a `war-api` companion slice,
once a second machine client exists to justify the additional API surface.
