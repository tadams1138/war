# war

A web-first social voting platform where authenticated users rank contestants through
head-to-head binary matchups. See [`war-spec.md`](war-spec.md) for the
overview, goals, and roles.

Building a War import feature for a new client? See
[`docs/building-a-war-import.md`](docs/building-a-war-import.md) — instructions written for
an AI coding assistant to follow.

## Layout

| Directory | What it is |
|---|---|
| [`war-api/`](war-api) | Backend REST API |
| [`war-ui-default/`](war-ui-default) | Default web frontend |
| [`war-infra/`](war-infra) | Terraform, deploy scripts, and other infrastructure |
| [`war-ui-custom/`](war-ui-custom) | Not built yet — holds only the pending custom-UI template-contract scenarios |
| [`.github/workflows/`](.github/workflows) | CI/CD for every project |

See [`CLAUDE.md`](CLAUDE.md) for the tech stack each project uses. The platform specification,
[`war-spec.md`](war-spec.md), lives at the repo root alongside this file — see below.

Each project keeps its own `package.json` and `node_modules`; there is no workspace tying
them together. All commands run from the repository root — `npm --prefix <project>` and
`terraform -chdir=war-infra/...` reach into a subdirectory without `cd`. See
[`CLAUDE.md`](CLAUDE.md) for the full command list and the TDD/BDD process this project
follows.

## Status

Live in staging and production: sign in with Google, Microsoft, Facebook, or Twitter/X; browse,
create, edit, delete, export, and import Wars; view a War and vote on image-mode matchups; and
My Wars. Three selectable visual themes and a persistent nav ship across every page.

Not yet built: video-mode matchups, the API's per-voter rate limiting, and custom UIs with
their registry. Apple sign-in is fully designed but deliberately deferred (see PROGRESS.md,
"To revisit").

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

`war-spec.md` is the single specification and the contract — one document for the
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
in it runs: behaviour not built, or built but not yet covered at the acceptance layer. See
[`PROGRESS.md`](PROGRESS.md)'s "Test coverage gaps" section for the current file-by-file
breakdown — kept there, not duplicated here, so it can't drift out of sync as scenarios get
bound.

To bind a pending API scenario, move the file up one directory and write its `.steps.ts`.
