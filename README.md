# war

A web-first social voting platform where authenticated users rank contestants through
head-to-head binary matchups. See [`specs/war-spec.md`](specs/war-spec.md) for the
overview, goals, and roles.

## Layout

| Directory | What it is |
|---|---|
| [`war-api/`](war-api) | Backend REST API — Node/TypeScript, Fastify, Kysely, PostgreSQL |
| [`war-ui-default/`](war-ui-default) | Default web frontend — React SPA, Vite, Playwright |
| [`war-infra/`](war-infra) | Terraform, App Platform specs, Cloudflare Workers, deploy scripts |
| [`war-ui-custom/`](war-ui-custom) | Not built yet — holds only the pending custom-UI template-contract scenarios |
| [`specs/`](specs) | The platform specification, [`war-spec.md`](specs/war-spec.md) |
| [`.github/workflows/`](.github/workflows) | CI/CD for every project |

Each project keeps its own `package.json` and `node_modules`; there is no workspace tying
them together. All commands run from the repository root — `npm --prefix <project>` and
`terraform -chdir=war-infra/...` reach into a subdirectory without `cd`. See
[`CLAUDE.md`](CLAUDE.md) for the full command list and the TDD/BDD process this project
follows.

## Status

Live in staging and production: sign in with Google, browse Wars, view a War and its
contestants, vote on image-mode matchups, Rankings, the Create War wizard, and My Wars.

Not yet built: video-mode matchups, sign-in providers other than Google, the API's
per-voter rate limiting, and custom UIs with their registry.

[`PROGRESS.md`](PROGRESS.md) is the authoritative status board — a section of the spec
describing the full design does not mean it has been built.

## Environments

Both environments run one DigitalOcean App Platform app serving the API and the default
UI from a single domain:

| Environment | URL |
|---|---|
| staging | https://staging.war.tmad.dev |
| production | https://war.tmad.dev |

## Specification and tests

`specs/war-spec.md` is the single specification and the contract — one document for the
whole platform, describing **what** it does in implementation-agnostic terms. Implementation
detail (stack, folder layout, build commands) lives in [`CLAUDE.md`](CLAUDE.md), not the
spec. Where a test and the spec disagree, the spec wins (spec section 13).

Executable Gherkin lives with the code that implements it, never in the spec document. It is
test fixture, not a second copy of the spec, and covers only behaviour that is actually
built:

| Project | Feature files | Bound by | Run with |
|---|---|---|---|
| API | `war-api/specs/features/` | `war-api/test/features/*.steps.ts` (`@amiceli/vitest-cucumber`) | `npm --prefix war-api test` |
| Default UI | `war-ui-default/features/` | `war-ui-default/tests/acceptance/*.spec.ts` (Playwright, explicit) | `npm --prefix war-ui-default run test:acceptance` |
| Infrastructure | `war-infra/specs/features/` | — no runner; `war-infra` has no test project | — |
| Custom UI | `war-ui-custom/specs/features/` | — project does not exist yet | — |

Each project has a `pending/` subdirectory holding scenarios with **no binding**, so nothing
in it runs: behaviour not built, or built but not yet covered at the acceptance layer.

| File | Scenarios | Why it is pending |
|---|---|---|
| `war-api/specs/features/pending/oauth-authentication.feature` | 1 | Same email across two providers yields separate voters — needs a second sign-in provider; only Google is built. |
| `war-api/specs/features/pending/media-mode.feature` | 8 | `video` media mode is not built. |
| `war-api/specs/features/pending/rate-limiting.feature` | 3 | The API's per-voter rate limits are not built. |
| `war-api/specs/features/pending/war-expiry.feature` | 3 | Expiry scenarios beyond those already bound in `../war-expiry.feature`. |
| `war-ui-default/features/pending/unbound.feature` | 13 | Video-mode playback, plus wording variants of vote-flow and rankings scenarios that already run under other names. |
| `war-infra/specs/features/pending/routing.feature` | 27 | Edge, routing, concurrency-group and secrets behaviour. No runner in this project; verifiable only by hand against a live environment. |
| `war-ui-custom/specs/features/pending/template-contract.feature` | 11 | The contract a custom UI bundle must satisfy. `war-ui-custom` does not exist yet. |

To bind a pending API scenario, move the file up one directory and write its `.steps.ts`.
