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
| [`specs/`](specs) | Specifications for all of the above |
| [`.github/workflows/`](.github/workflows) | CI/CD for every project |

These were three separate repositories until they were consolidated here; see
`specs/war-infra-spec.md` §20.6 for why. Their full histories are preserved in this
one.

## Status

The **Core Voting Loop** slice is live in staging and production: sign in with Google,
browse Wars, view a War and its contestants, and vote on image-mode matchups, served
end to end by the API.

Not yet built: the Rankings page, the Create War wizard, My Wars, video-mode matchups,
OAuth providers other than Google, API rate limiting, and the custom UI registry.
`specs/war-api-spec.md` §15 and `specs/war-ui-default-spec.md` §12 are the authoritative
status markers — a section describing the full design does not mean it has been built.

## Environments

Both environments run one DigitalOcean App Platform app serving the API and the default
UI from a single domain:

| Environment | URL |
|---|---|
| staging | https://staging.war.tmad.dev |
| production | https://war.tmad.dev |

## Working in this repo

Build and test commands, and the TDD/BDD process this project follows, are documented in
[`CLAUDE.md`](CLAUDE.md). All commands run from the repository root.
