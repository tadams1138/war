# specs

The full specification for this project is [`specs/war-api-spec.md`](../../specs/war-api-spec.md)
at the repository root. Its §15 ("Implementation Status") tracks what's actually built
here versus what the document specifies but this project hasn't implemented yet.

That document sits at the root rather than in this directory because it is one of five
that describe the platform as a whole and cross-reference each other constantly. This
project briefly kept its own narrower copy, adapted to the "Core Voting Loop" slice; it
was folded back into the canonical document to remove a second prose description of the
same behavior, hand-maintained separately, with nothing forcing the two to agree.

`features/*.feature` below is **not** a copy of anything — it's this project's executable
Gherkin, bound to the acceptance tests via `@amiceli/vitest-cucumber` and run by
`npm --prefix war-api test`. It covers only the scenarios for what's actually implemented
(a subset of the canonical spec's §14), and it's the one place where a spec/reality
mismatch would actually break CI rather than silently going stale.
