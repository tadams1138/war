/**
 * The service-layer allowlist (spec §7.9, "Service-Layer Allowlist") — the
 * *only* import path a file under `src/mcp/tools/` may use to reach a
 * domain service. Calling a service function directly, in process, means
 * every service function in this codebase is reachable from an MCP tool
 * handler by default, not only the ones a tool happens to invoke on
 * purpose. This module is the answer: exactly the ten functions below, one
 * per tool, and nothing else.
 *
 * A lint rule (`eslint.config.js`, scoped to `src/mcp/tools/**\/*.ts`) fails
 * the build on a direct import from any of the six service modules this
 * module would otherwise let a handler bypass:
 * `wars/warsService.ts`, `contestants/contestantsService.ts`,
 * `contestants/mediaService.ts`, `votes/votesService.ts`,
 * `matchups/matchupsService.ts`, `auth/authService.ts`. A unit test
 * (`test/unit/mcpAllowedActions.test.ts`) asserts this module's export set
 * is exactly these ten, so widening the allowlist itself is a visible,
 * reviewed diff rather than a silent addition.
 *
 * Deliberately absent, by name, and why (spec §7.9):
 * - `castVoteForVoter`, `nextMatchupForVoter`, `joinWar` — the voting path.
 *   Votes are final and unchangeable by design (`war-spec.md` §2); an MCP
 *   tool handler must never be a path to casting one.
 * - `removeContestant`, `removeContestantMedia`, `reorderContestantMedia` —
 *   already excluded from the tool surface; denied here too so a *future*
 *   tool cannot acquire one of them by a handler simply importing it.
 * - `beginLogin`, `exchangeGoogleCode`, `completeCallback`, `refresh`,
 *   `logout`, `currentVoter`, `authenticatedVoterId` — the entire auth
 *   module. Identity is established once, before a tool handler ever runs
 *   (the resource server's own bearer-token check, §4.3.6); no tool touches
 *   token issuance, exchange, or session machinery.
 */
export { createWarForVoter, patchWar, activateWar, closeWar, listWarsForVoter, getWar } from '../wars/warsService.js';
export { addContestant, patchContestant } from '../contestants/contestantsService.js';
export { addContestantImage } from '../contestants/mediaService.js';
export { rankingsFor } from '../rankings/rankingsService.js';
