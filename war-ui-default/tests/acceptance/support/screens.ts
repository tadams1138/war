// The screen sizes Gherkin steps name with the {screen} parameter type
// (steps/parameters.ts). Add a size here, not a new viewport step.
export const SCREENS: Record<string, { width: number; height: number }> = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1200, height: 800 },
}

export const SIDES = ['left', 'right'] as const
export type Side = (typeof SIDES)[number]
