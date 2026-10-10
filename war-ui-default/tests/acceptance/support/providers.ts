// The sign-in providers Gherkin steps name with the {provider} parameter type
// (steps/parameters.ts). `id` is the API path segment and the button's test id.
// Apple is designed for but not built (PROGRESS.md "To revisit"), so it is absent.
export interface Provider {
  id: string
  label: string
}

export const PROVIDERS: Provider[] = [
  { id: 'google', label: 'Google' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'microsoft', label: 'Microsoft' },
  { id: 'twitter', label: 'X' },
]
