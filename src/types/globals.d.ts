// Ambient `window` augmentation for the test hooks the mock build exposes
// (src/mocks/authTestHooks.ts, src/main.tsx) so Playwright acceptance
// tests can set up per-scenario network fixtures and drive low-level
// client behaviour that has no dedicated UI trigger (e.g. the
// single-flight refresh scenarios in login-and-auth.feature). None of
// this exists in a real production build — it is only wired up when
// VITE_API_MOCKING is enabled, which the mock build (`npm run
// build:mock`) is the only thing that sets.
//
// This lives here, not as a side-effect import in application code,
// because ambient declarations need only to be within tsconfig.json's
// "include" — importing a module for its global declarations makes the
// dependency graph claim a dependency ("auth requires mocks") that isn't
// real.
import type { SetupWorker } from 'msw/browser'
import type * as apiClient from '../api/client'
import type { MswCallLogEntry } from '../mocks/testHooks'
import type { HandlerRecipe } from '../mocks/scenarios'

declare global {
  interface Window {
    // Set via page.addInitScript before navigation; consumed once on boot.
    __mswScenarioOverride?: HandlerRecipe[]
    // Every request msw's worker sees, in order — used to assert call
    // counts, ordering, and (for POSTs) body content.
    __mswCallLog?: MswCallLogEntry[]
    __msw?: { worker: SetupWorker }
    __apiClient?: typeof apiClient
    // `navigate` performs a real client-side route change (React Router),
    // which — unlike page.goto() — does not reload the page and so
    // preserves the in-memory JWT `login` just set. Acceptance tests use
    // this to reach an authenticated route without a real OAuth round
    // trip; war-ui-default-spec.md's actual navigation (Link clicks) goes
    // through the same router underneath.
    __auth?: { login: (token: string) => void; navigate: (path: string) => void }
  }
}

export {}
