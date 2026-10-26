# 11 — Restore Facebook sign-in

## Summary
Show Facebook as a sign-in option in the UI again.

## Motivation
It is hidden (Google, Microsoft and X only) until Meta business verification completes. The
API still serves Facebook sign-in (`war-api/src/auth/providers/facebook.ts`).

## Acceptance criteria
- Owner action done: Meta business verification completed. App Review for the Login product
  is blocked until a verified business account exists.
- The Facebook button appears on the login page and sign-in works end to end on staging, then
  production.

## Technical notes
- The UI change is one line in `war-ui-default/src/pages/Login.tsx` (the logo and label stay
  in `src/components/ProviderLogo.tsx`). The Gherkin provider list in
  `war-ui-default/tests/acceptance/support/providers.ts` also omits Facebook; add it there.
- README "First-time setup of an environment" step 2 says Facebook verification is not done;
  update it when this ships.

## Dependencies
- External: Meta business verification (owner).
