/**
 * The full set of valid War themes (spec, "Visual Theme"). Defined once
 * here rather than repeated as a literal union in `warPresenter.ts`'s JSON
 * Schema, `warsService.ts`'s validation, and `rankingsService.ts`'s
 * schema -- three independent copies of this list silently diverging is
 * exactly the failure mode `wars/routes.ts`'s `wantsOwnWars` comment warns
 * about for a different enum.
 */
export const THEMES = ['arcade', 'fight_card', 'scrapbook'] as const;
export type WarTheme = (typeof THEMES)[number];

export function isWarTheme(value: unknown): value is WarTheme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
