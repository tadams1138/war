// Shape of one entry in window.__mswCallLog (see src/types/globals.d.ts
// for the ambient declaration and why it isn't imported by application
// code). Kept here, not inline, since both main.tsx (writer) and the
// acceptance suite's mirrored interface (tests/acceptance/support/mocking.ts,
// reader — a separate TS program) need the same shape.
export interface MswCallLogEntry {
  method: string
  url: string
  time: number
  // Only captured for methods that can carry one (POST) — see main.tsx's
  // request:start handler. Lets a test assert *which* contestant a vote
  // request named, not just that a request happened.
  body?: string
}
