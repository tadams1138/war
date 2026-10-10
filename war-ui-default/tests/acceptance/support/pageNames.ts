// The pages Gherkin steps name with the {page} parameter type
// (steps/parameters.ts). Add a page here, not a new navigation step.
// `landmark` is a test id that is visible once the page has rendered; "they
// are redirected to {page}" waits for it when present.
export interface PageRef {
  path: (warId: string) => string
  landmark?: string
}

export const PAGES: Record<string, PageRef> = {
  Home: { path: () => '/' },
  'the login page': { path: () => '/login' },
  'the Start a War page': { path: () => '/wars/new' },
  'the Import page': { path: () => '/wars/import' },
  "that War's detail page": { path: (warId) => `/wars/${warId}` },
  "that War's Edit page": { path: (warId) => `/wars/${warId}/edit`, landmark: 'edit-war-title-input' },
  "that War's vote page": { path: (warId) => `/wars/${warId}/vote` },
}

export function literalPage(path: string): PageRef {
  return { path: () => path }
}
