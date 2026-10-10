// The form fields Gherkin steps name with the {field} parameter type
// (steps/parameters.ts): a control by what a person calls it, and the key the
// API calls it when the form is saved. Add a field here, not a new step.
import { THEME_LABELS } from '../../../src/theme/themeCookie'

export interface FieldRef {
  testId: string
  // A drop-down, chosen by the label it shows; any other field is typed into.
  select?: boolean
  // The key the saved value goes under, and what a shown value means there.
  api: string
  toApi?: (shown: string) => unknown
}

const themeValue = (label: string) => Object.entries(THEME_LABELS).find(([, shown]) => shown === label)?.[0]

export const FIELDS: Record<string, FieldRef> = {
  title: { testId: 'edit-war-title-input', api: 'title' },
  category: { testId: 'edit-war-category-input', api: 'category' },
  visibility: { testId: 'edit-war-visibility-select', select: true, api: 'visibility', toApi: (label) => label.toLowerCase() },
  theme: { testId: 'edit-war-theme-select', select: true, api: 'theme', toApi: themeValue },
  "contestant's name": { testId: 'edit-war-contestant-name-input', api: 'name' },
  "contestant's bio": { testId: 'bio-textarea', api: 'bio' },
  "new contestant's name": { testId: 'add-contestant-name-input', api: 'name' },
}

// What a table of shown values means in a request body.
export function bodyFrom(rows: string[][]): Record<string, unknown> {
  return Object.fromEntries(rows.map(([name, shown]) => [FIELDS[name!]!.api, (FIELDS[name!]!.toApi ?? ((value: string) => value))(shown!)]))
}
