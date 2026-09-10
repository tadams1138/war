# Pending feature files

Scenarios with no Playwright binding. Nothing here runs — `tests/acceptance/*.spec.ts`
binds feature files explicitly, so an unbound `.feature` is inert.

`unbound.feature` holds 13 scenarios carried over from `war-ui-default-spec.md` when
Gherkin was removed from the specification. They divide into:

- **Video mode** — not built (`MatchupView`'s playback sequence, autoplay fallback,
  unavailable-video handling).
- **Wording variants** — vote-flow and rankings scenarios that already run under
  different names in `../*.feature`. Reconcile or delete rather than binding twice.

The specification's prose is the contract; these are the executable form of the parts
nothing yet exercises.
