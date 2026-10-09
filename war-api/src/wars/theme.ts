/**
 * The full set of valid War themes ("Visual Theme"). Defined once so the JSON Schemas in `warPresenter.ts` and
 * `rankingsService.ts` and the validation in `warsService.ts` cannot drift apart.
 */
export const THEMES = ['arcade', 'fight_card', 'scrapbook'] as const;
export type WarTheme = (typeof THEMES)[number];

export function isWarTheme(value: unknown): value is WarTheme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}
