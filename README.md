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
| [`.github/workflows/`](.github/workflows) | CI/CD for every project |

A brand-specific custom UI (war-spec.md §11) is its own separate repository, not a directory
here — [`.github/workflows/ui-custom.yml`](.github/workflows/ui-custom.yml) is the reusable
pipeline each one calls.

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

Not yet built: video-mode matchups and custom UIs with their registry. Apple sign-in is
fully designed but deliberately deferred (see PROGRESS.md, "To revisit").

[`PROGRESS.md`](PROGRESS.md) is the authoritative status board — a section of the spec
describing the full design does not mean it has been built.

## Stack

Node.js/TypeScript throughout. `war-api` is Fastify + Kysely + PostgreSQL, with Vitest
(`@amiceli/vitest-cucumber` for Gherkin) and Testcontainers for integration tests.
`war-ui-default` is a React SPA on Vite, tested with Vitest (unit) and Playwright
(acceptance, MSW-mocked). `war-infra` is Terraform, deployed as one DigitalOcean App
Platform app behind Cloudflare, with object storage for media and custom-UI bundles.

## Local development

`scripts/local-dev-up.ps1` (PowerShell — Windows only today) stands up the full stack
behind HTTPS on port 3000: Postgres and MinIO in Docker, `war-api`, and `war-ui-default`'s
Vite dev server, unified by an nginx TLS proxy so real OAuth login works locally. Run it
from the repository root; see the script's own header comment for the one-time OAuth
redirect-URI setup it requires. There's no macOS/Linux equivalent yet — the same pieces
(Postgres, MinIO, `npm --prefix war-api run dev`, `npm --prefix war-ui-default run dev`)
can be run by hand, just without the unified HTTPS origin the script gives you.

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

Each project has a `pending/` subdirectory holding scenarios with **no binding**, so nothing
in it runs: behaviour not built, or built but not yet covered at the acceptance layer. See
[`PROGRESS.md`](PROGRESS.md)'s "Test coverage gaps" section for the current file-by-file
breakdown — kept there, not duplicated here, so it can't drift out of sync as scenarios get
bound.

To bind a pending API scenario, move the file up one directory and write its `.steps.ts`.

## How this was built

I built this with [Claude Code](https://claude.com/product/claude-code) as an implementation
partner, working test-first (Red-Green-Refactor; see [`CLAUDE.md`](CLAUDE.md)). I own the
spec, the architecture, and every review — `war-spec.md` and the acceptance/unit test suites
are the guardrails that keep an AI-assisted change honest, not a substitute for reading the
diff. `.claude/settings.json` turns off Claude's commit attribution because I'm the one
taking responsibility for what's in this repo, not to hide how it was made.

## License

Copyright © 2026 Tom Adams. All rights reserved.

This repository is publicly available for viewing and evaluation purposes only. No
permission is granted to copy, modify, distribute, sublicense, or use this software or its
source code for commercial purposes without prior written permission.
