# 9 — Turn on per-address rate limits (TRUST_PROXY_HOPS)

## Summary
Per-address rate limits are off because `TRUST_PROXY_HOPS` is not set. Verify the real hop
count between the internet and the API, then set it per environment.

## Motivation
Until then the Cloudflare edge's coarse rule on `/api/v1/auth/*` is the only address-keyed
protection.

## Acceptance criteria
- The hop count (Cloudflare plus App Platform ingress) is measured.
- `TRUST_PROXY_HOPS` is set in `war-infra/platform/staging.yaml` and `production.yaml`.
- The API keys its per-address limits (spec 8.4) on the real client address in both
  environments.

## Technical notes
- Procedure: README "Rate limiting" (measure the hop count, set `TRUST_PROXY_HOPS` in
  `platform/{env}.yaml`). The variable is in the README configuration table.
- Code: `war-api/src/config.ts` reads it; the limiter is exercised by
  `war-api/test/features/rate-limiting.steps.ts` and `war-api/test/unit/rateLimit.test.ts`.
- Once done, update the README "Rate limiting" section, which says the limits are off.
