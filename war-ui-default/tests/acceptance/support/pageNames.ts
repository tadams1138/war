// The pages Gherkin steps name with the {page} parameter type
// (steps/parameters.ts). Add a page here, not a new navigation step.
// `landmark` is a test id that is visible once the page has rendered; "they
// are redirected to {page}" waits for it when present.
// The ids of the War and Voter in scope ("that War", "that Voter"; see World).
export interface Ids {
  warId: string
  voterId: string
}

export interface PageRef {
  path: (ids: Ids) => string
  landmark?: string
  // Test id of the one error the page shows when what it does on its own fails.
  error?: string
}

export const PAGES: Record<string, PageRef> = {
  Home: { path: () => '/' },
  'the login page': { path: () => '/login' },
  'the Start a War page': { path: () => '/wars/new', error: 'create-war-error' },
  'My Wars': { path: () => '/my-wars' },
  'the Admin Dashboard': { path: () => '/admin' },
  'the Import page': { path: () => '/wars/import', error: 'import-war-error' },
  'the Privacy Policy page': { path: () => '/privacy' },
  'the Terms of Service page': { path: () => '/terms' },
  'the Data Deletion instructions page': { path: () => '/data-deletion' },
  // Wars given by "a War ..." steps are numbered war-1, war-2, ... (see World.nextWarId)
  "the first War's detail page": { path: () => '/wars/war-1' },
  "the first War's Staff detail page": { path: () => '/admin/wars/war-1' },
  "that War's detail page": { path: ({ warId }) => `/wars/${warId}` },
  // War detail is also its results page (war-spec.md §10.4)
  "that Voter's Staff detail page": { path: ({ voterId }) => `/admin/voters/${voterId}` },
  // The signed-in voter is voter-1 (see World.nextVoterId)
  'their own Staff detail page': { path: () => '/admin/voters/voter-1' },
  "that War's Staff detail page": { path: ({ warId }) => `/admin/wars/${warId}` },
  "that War's results page": { path: ({ warId }) => `/wars/${warId}` },
  "the first War's Edit page": { path: () => '/wars/war-1/edit', landmark: 'edit-war-title-input' },
  "that War's Edit page": { path: ({ warId }) => `/wars/${warId}/edit`, landmark: 'edit-war-title-input' },
  "that War's vote page": { path: ({ warId }) => `/wars/${warId}/vote` },
}

export function literalPage(path: string): PageRef {
  return { path: () => path }
}
