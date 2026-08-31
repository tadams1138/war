# war-ui-default

War default static frontend. See [specs](https://github.com/tadams1138/war-infra/tree/master/specs) for full documentation.

## Status

The Core Voting Loop slice is implemented: browse Wars (`/`), OAuth login and
the auth flow (`/login`, `/auth/callback`), War detail with a contestant
gallery (`/wars/:id`), and image-mode binary voting (`/wars/:id/vote`). See
`war-ui-default-spec.md` §12 for exactly what's in scope for this slice and
what's deferred to a later one (Rankings, Create War, My Wars, video-mode
matchups, the shared `runtime/v1.js` build artifact).

Build and test commands, and this repo's TDD/BDD process, are documented in
`CLAUDE.md`.
