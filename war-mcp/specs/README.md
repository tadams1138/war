# specs

The full specification for this project is [`specs/war-mcp-spec.md`](../../specs/war-mcp-spec.md)
at the repository root. Its §12 ("Implementation Status") tracks what's actually built here
versus what the document specifies but this project hasn't implemented yet.

That document sits at the root rather than in this directory because it is one of five that
describe the platform as a whole and cross-reference each other constantly — the same
reason `war-api-spec.md` and the others live there (see `war-api/specs/README.md`).

`features/*.feature` below is **not** a copy of anything — it's this project's executable
Gherkin, bound to the acceptance tests via `@amiceli/vitest-cucumber` and run by
`npm --prefix war-mcp test`. It covers only the scenarios for what's actually implemented
(a subset of the canonical spec's §11), and it's the one place where a spec/reality
mismatch would actually break CI rather than silently going stale.
