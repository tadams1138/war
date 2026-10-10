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
  'My Wars': { path: () => '/my-wars' },
  'the Import page': { path: () => '/wars/import' },
  // Wars given by "a War ..." steps are numbered war-1, war-2, ... (see World.nextWarId)
  "the first War's detail page": { path: () => '/wars/war-1' },
  "that War's detail page": { path: (warId) => `/wars/${warId}` },
  // War detail is also its results page (war-spec.md §10.4)
  "that War's results page": { path: (warId) => `/wars/${warId}` },
  "that War's Edit page": { path: (warId) => `/wars/${warId}/edit`, landmark: 'edit-war-title-input' },
  "that War's vote page": { path: (warId) => `/wars/${warId}/vote` },
}

export function literalPage(path: string): PageRef {
  return { path: () => path }
}
