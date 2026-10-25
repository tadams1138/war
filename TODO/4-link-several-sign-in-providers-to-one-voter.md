# 4 — Link several sign-in providers to one voter

## Summary
Let one voter sign in through more than one provider and keep a single identity, votes and
roles.

## Current state
- `voters` stores exactly one identity per row: `provider` and `provider_user_id` columns
  (`war-api/src/db/types.ts`, `VotersTable`).
- `findOrCreateVoter` in `war-api/src/auth/votersRepository.ts` looks up by `(provider,
  provider_user_id)` and creates a new voter otherwise. Its doc comment records that signing in
  with two providers yields two different voters: there is no cross-account merge.

## Technical notes
- Likely shape: a separate identities table (voter_id, provider, provider_user_id, unique on
  the pair) with the voters columns migrated into it; `findOrCreateVoter` then resolves via
  identities, plus an authenticated "link provider" flow in `war-api/src/auth/routes.ts` and
  `authService.ts` (the callback must know it is linking, not logging in).
- Touches anything that reads `voters.provider`: admin voter views
  (`war-api/src/admin/adminVotersRepository.ts`), the data-deletion path, and the UI identity
  menu (`war-ui-default/src/components/IdentityMenu.tsx`, `voterIdentity.ts`).
- Cross-account merge of two existing voters is a separate, harder problem (votes, Wars, roles,
  bans).

## Open questions
- Linking only, or merging existing duplicate voters too?
- How a ban or suspension applies across all linked identities.
- Whether Apple (#3) is built on the identities table from the start.
