// Shared glue between Playwright and the mock build's test hooks
// (src/mocks/testHooks.ts). See that module's comment for why this exists:
// a Playwright test runs in Node and cannot hand a live closure across to
// the browser, so scenarios are serialized as data instead.
import type { Page } from '@playwright/test'
import type { HandlerRecipe } from '../../../src/mocks/scenarios'

export const API = '/api/v1'

// Must be called before page.goto() — it seeds the override that
// main.tsx's bootstrap reads once, on load, before starting the MSW
// worker.
export async function useScenario(page: Page, recipes: HandlerRecipe[]): Promise<void> {
  await page.addInitScript((override) => {
    window.__mswScenarioOverride = override
  }, recipes)
}

// Bypasses the OAuth UI for scenarios that only need "an authenticated
// voter" as a precondition — the login-and-auth.feature scenarios that are
// actually about the sign-in flow itself drive it for real instead.
export async function loginAsTestVoter(page: Page, token = 'test-voter-token'): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__auth))
  await page.evaluate((t) => window.__auth?.login(t), token)
}

// A client-side route change (React Router), not a full page.goto() —
// page.goto() reloads the page and, correctly per the spec, wipes the
// in-memory JWT loginAsTestVoter just set. This is how an authenticated
// test reaches a protected route without a real OAuth round trip.
export async function navigateAuthenticated(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => window.__auth?.navigate(p), path)
  await page.waitForFunction((p) => window.location.pathname + window.location.search === p, path)
}

export interface MswCallLogEntry {
  method: string
  url: string
  time: number
  body?: string
}

export async function getCallLog(page: Page): Promise<MswCallLogEntry[]> {
  return page.evaluate(() => window.__mswCallLog ?? [])
}
