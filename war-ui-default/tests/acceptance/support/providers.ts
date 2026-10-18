// The sign-in providers Gherkin steps name with the {provider} parameter type
// (steps/parameters.ts). `id` is the API path segment and the button's test id.
// Apple is designed for but not built (PROGRESS.md "To revisit"), and Facebook is
// withheld until Meta business verification completes, so both are absent.
export interface Provider {
  id: string
  label: string
}

export const PROVIDERS: Provider[] = [
  { id: 'google', label: 'Google' },
  { id: 'microsoft', label: 'Microsoft' },
  { id: 'twitter', label: 'X' },
]
