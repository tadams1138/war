# 3 — Apple sign-in

## Summary
Add Apple as a sign-in provider alongside Google, Microsoft, Facebook and Twitter/X.

## Motivation
Designed for but not built. Out of scope until a paid Apple Developer Program membership
($99/yr) exists for this project; the remaining question is that cost, not design.

## Technical notes
- **Client secret** is an ES256-signed JWT: `iss` is the team id, `sub` the client id, signed
  with a `.p8` private key. It is re-signed per token exchange, because Apple caps its lifetime
  at six months.
- **No userinfo endpoint.** Identity is `sub` from the id token alone.
- **`openid` scope only** (no `name`/`email`). That keeps the callback an ordinary GET instead
  of Apple's `form_post` response mode.
- **It slots into the existing provider abstraction** (`OAuthProvider` in
  `war-api/src/auth/oauthProvider.ts`; `exchangeCode` returns an `OAuthProfile`). Existing
  providers live in `war-api/src/auth/providers/{google,microsoft,facebook,twitter}.ts`, with
  the OIDC-backed base in `war-api/src/auth/openIdBackedProvider.ts`. Register the new provider
  in `war-api/src/auth/providerRegistry.ts` and add config in `war-api/src/config.ts`.
- **Display name and avatar are null** with `openid` only; `OAuthProfile` allows null for both.
- **UI:** `war-ui-default/src/pages/Login.tsx` (its header comment names Apple as unbuilt; it
  points at this item), `src/components/ProviderLogo.tsx`, and the Gherkin provider list in
  `war-ui-default/tests/acceptance/support/providers.ts` (its comment also points here).
- **Platform:** `war-infra/platform/{staging,production}.yaml` (~line 141) carry a comment that
  Apple is absent because it is unimplemented, so there is nothing to substitute; add the Apple
  secrets there (substituted by envsubst from GitHub Actions secrets) only once the provider
  exists, and update that comment. The README "Secrets and configuration" table and "First-time
  setup of an environment" step 1 list the providers and need Apple added.

## Dependencies
- External: the paid Apple Developer Program membership.

## Open questions
- Whether to build on `openIdBackedProvider.ts` or a bespoke provider like Twitter/X's, given
  the generated client secret. Not decided.
