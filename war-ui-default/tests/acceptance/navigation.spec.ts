// Binds features/navigation.feature.
import { expect, test } from '@playwright/test'
import { buildRankingsResponse, buildWarSummary } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

function nav(page: import('@playwright/test').Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

test('An anonymous visitor sees only anonymous navigation', async ({ page }) => {
  // Arrange / Act
  await page.goto('/')

  // Assert
  await expect(nav(page).getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'My Wars' })).toHaveCount(0)
  await expect(nav(page).getByRole('link', { name: 'Create War' })).toHaveCount(0)
  await expect(nav(page).getByTestId('nav-identity')).toHaveCount(0)
})

test("An authenticated voter's identity is shown in the navigation", async ({ page }) => {
  // Arrange
  await useScenario(page, [
    {
      method: 'GET',
      path: `${API}/auth/me`,
      responses: [{ status: 200, body: { voter: { id: 'voter-1', display_name: 'Jordan', avatar_url: null } } }],
    },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/')

  // Assert
  await expect(nav(page)).toContainText('Jordan')
})

test('A voter with no display name on file is shown a fallback', async ({ page }) => {
  // Arrange
  await useScenario(page, [
    {
      method: 'GET',
      path: `${API}/auth/me`,
      responses: [{ status: 200, body: { voter: { id: 'voter-1', display_name: null, avatar_url: null } } }],
    },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/')

  // Assert — a fixed, non-blank fallback label, never the literal "null"
  // or an empty identity slot.
  const identity = nav(page).getByTestId('nav-identity')
  await expect(identity).toBeVisible()
  await expect(identity).not.toHaveText('')
  await expect(identity).not.toContainText('null')
})

// Scenario Outline: Create War and My Wars remain reachable from every route.
// The voter must actually have a War of their own before this test starts —
// a voter with none would hit MyWars's own empty-state "Create a War" CTA on
// the My Wars row, which carries the same accessible name as NavBar's own
// link and would let that row pass even if NavBar itself carried no such
// link at all. Scoping every assertion to the `nav` landmark, not the page,
// is the second, independent safeguard against the same failure mode.
const CREATED_WAR = buildWarSummary({ id: 'war-nav-created', title: 'Nav War' })

const REACHABILITY_ROWS: { page: string; path: string }[] = [
  { page: 'the home page', path: '/' },
  { page: 'their My Wars page', path: '/my-wars' },
  { page: 'the Create War page', path: '/wars/new' },
  { page: "that War's detail page", path: `/wars/${CREATED_WAR.id}` },
  { page: "that War's vote page", path: `/wars/${CREATED_WAR.id}/vote` },
  { page: "that War's rankings page", path: `/wars/${CREATED_WAR.id}/rankings` },
]

for (const { page: pageLabel, path } of REACHABILITY_ROWS) {
  test(`Create War and My Wars remain reachable from ${pageLabel}`, async ({ page }) => {
    // Arrange — a voter who has already created a War (CREATED_WAR), so
    // My Wars renders a non-empty list rather than its own empty-state CTA.
    await useScenario(page, [
      { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [CREATED_WAR] } }] },
      {
        method: 'GET',
        path: `${API}/wars/${CREATED_WAR.id}/rankings`,
        responses: [{ status: 200, body: buildRankingsResponse({ war_id: CREATED_WAR.id }) }],
      },
    ])
    await page.goto('/')
    await loginAsTestVoter(page)

    // Act
    await navigateAuthenticated(page, path)

    // Assert — scoped to the nav landmark, not the page, so a same-named
    // in-page CTA (e.g. MyWars's or Home's own "Create a War" link) cannot
    // satisfy this assertion in NavBar's place.
    await expect(nav(page).getByRole('link', { name: 'Home' })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'My Wars' })).toBeVisible()
    await expect(nav(page).getByRole('link', { name: 'Create War' })).toBeVisible()
  })
}

test('The current page is indicated in the navigation', async ({ page }) => {
  // Arrange
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] }])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/my-wars')

  // Assert
  await expect(nav(page).getByRole('link', { name: 'My Wars' })).toHaveAttribute('aria-current', 'page')
  await expect(nav(page).getByRole('link', { name: 'Create War' })).not.toHaveAttribute('aria-current', 'page')
})

test("Logging out returns the navigation to its anonymous state", async ({ page }) => {
  // Arrange
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')
  await expect(nav(page).getByTestId('nav-logout')).toBeVisible()

  // Act
  await nav(page).getByTestId('nav-logout').click()

  // Assert
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toBeVisible()
  await expect(nav(page).getByTestId('nav-identity')).toHaveCount(0)
  await expect(nav(page).getByTestId('nav-logout')).toHaveCount(0)
})
