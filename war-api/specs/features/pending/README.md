# Pending feature files

Scenarios that are **not bound to step definitions** and therefore do not run.
`@amiceli/vitest-cucumber` loads a `.feature` only when a `test/features/*.steps.ts`
calls `loadFeature()` on it, so nothing here executes or affects the suite.

They live here because they are specification worth keeping, in the only form that
can become a test without being rewritten.

| File | Why it is unbound |
|---|---|
| `oauth-authorization-server.feature` | Behaviour **is shipped** (OAuth 2.1 AS, MCP endpoint and tools). Covered today by Vitest unit and integration tests, not by Gherkin. Binding these is a real coverage gap, not a future feature. |
| `oauth-authentication.feature` | One provider-rejection edge case, shipped, unbound. |
| `media-mode.feature` | `video` media mode is not built. |
| `rate-limiting.feature` | The API's per-voter rate limits are not built. |
| `war-expiry.feature` | Three expiry scenarios beyond those already bound in `../war-expiry.feature`. |

Move a file up one directory and write its `.steps.ts` when you bind it.
