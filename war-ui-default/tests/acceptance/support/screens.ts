// The screen sizes Gherkin steps name with the {screen} parameter type
// (steps/parameters.ts). Add a size here, not a new viewport step.
export const SCREENS: Record<string, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1200, height: 800 },
  wide: { width: 1920, height: 1000 },
  // A phone turned on its side: under 900px wide, but wider than it is tall.
  'narrow landscape': { width: 751, height: 384 },
  'narrow portrait': { width: 751, height: 1200 },
}

export const SIDES = ['left', 'right'] as const
export type Side = (typeof SIDES)[number]
