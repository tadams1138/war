// Binds features/navigation.feature.
import { expect, test } from '@playwright/test'
import { buildRankingsResponse, buildWarDetail, buildWarSummary } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

function nav(page: import('@playwright/test').Page) {
  return page.getByRole('navigation', { name: 'Primary' })
}

function identityTrigger(page: import('@playwright/test').Page) {
  return nav(page).getByTestId('nav-identity')
}

function identityMenu(page: import('@playwright/test').Page) {
  return nav(page).getByRole('menu')
}

async function openIdentityMenu(page: import('@playwright/test').Page): Promise<void> {
  await identityTrigger(page).click()
  await expect(identityMenu(page)).toBeVisible()
}

function footer(page: import('@playwright/test').Page) {
  return page.getByRole('contentinfo')
}

test("Every page shows a persistent footer with attribution and project links", async ({ page }) => {
  // Arrange / Act
  await page.goto('/')

  // Assert
  await expect(footer(page)).toContainText('©')
  await expect(footer(page).getByRole('link', { name: /GitHub/i })).toHaveAttribute(
    'href',
    'https://github.com/tadams1138/war',
  )
  await expect(footer(page).getByRole('link', { name: /import/i })).toHaveAttribute(
    'href',
    'https://github.com/tadams1138/war/blob/master/docs/building-a-war-import.md',
  )
  await expect(footer(page).getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy')
  await expect(footer(page).getByRole('link', { name: /terms of service/i })).toHaveAttribute('href', '/terms')
})

test('The Privacy Policy page is reachable and shows its content', async ({ page }) => {
  // Arrange / Act
  await page.goto('/privacy')

  // Assert
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
})

test('The Terms of Service page is reachable and shows its content', async ({ page }) => {
  // Arrange / Act
  await page.goto('/terms')

  // Assert
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible()
})

test('An anonymous visitor sees a link to log in and the Home brand mark', async ({ page }) => {
  // Arrange / Act
  await page.goto('/')

  // Assert — visibility alone does not prove reachability; the destination
  // is the assertion the Gherkin's "a link to /login" actually makes. The
  // Home brand mark is not an "authenticated destination" -- Home itself
  // needs no auth (spec 10.1) -- so it's shown either way, not gated here.
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toBeVisible()
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  await expect(nav(page).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  await expect(identityTrigger(page)).toHaveCount(0)
})

test('The Home brand mark sits left of the theme switcher and links to Home', async ({ page }) => {
  // Arrange / Act
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')

  // Assert
  const home = nav(page).getByTestId('nav-home')
  await expect(home).toHaveAttribute('href', '/')
  const homeBox = await home.boundingBox()
  const switcherBox = await nav(page).getByTestId('nav-theme-select').boundingBox()
  expect(homeBox).not.toBeNull()
  expect(switcherBox).not.toBeNull()
  expect(homeBox!.x).toBeLessThan(switcherBox!.x)
})

test("An authenticated voter's identity is shown in the navigation, menu closed", async ({ page }) => {
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
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toHaveCount(0)
  await expect(identityTrigger(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(identityMenu(page)).toHaveCount(0)
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

  // Assert — a fixed, non-blank fallback label, never the literal "null",
  // an empty identity slot, or an internal id leaking into the header.
  await expect(identityTrigger(page)).toBeVisible()
  await expect(identityTrigger(page)).toHaveText('Voter')
  await expect(identityTrigger(page)).not.toContainText('null')
})

test('Opening the identity menu reveals My Wars, Create War and Log out', async ({ page }) => {
  // Arrange
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')

  // Act
  await openIdentityMenu(page)

  // Assert — Home is not in this menu; it's the brand mark in the nav bar
  // itself, shown to every visitor regardless of auth state (NavBar.tsx).
  await expect(identityMenu(page).getByRole('menuitem', { name: 'My Wars' })).toHaveAttribute('href', '/my-wars')
  await expect(identityMenu(page).getByRole('menuitem', { name: 'Create War' })).toHaveAttribute('href', '/wars/new')
  await expect(identityMenu(page).getByRole('menuitem', { name: 'Log out' })).toBeVisible()
})

test("The identity menu has its own background, not the page behind it", async ({ page }) => {
  // Arrange — a themed War detail page is exactly the case that can put a
  // contestant's own media directly behind the header (war-spec.md 10.2).
  const detail = buildWarDetail({ id: 'war-1', theme: 'fight_card' })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-1`, responses: [{ status: 200, body: detail }] }])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/wars/war-1')

  // Act
  await openIdentityMenu(page)

  // Assert — not fully transparent (alpha 0), whatever color/opacity a
  // theme picks for it.
  const alpha = await identityMenu(page).evaluate((el) => {
    const match = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)
    return match && match.length === 4 ? Number(match[3]) : 1
  })
  expect(alpha).toBeGreaterThan(0)
})

// Scenario Outline: My Wars and Create War remain reachable, via the
// identity menu, from every route -- and Home, via the nav bar's brand
// mark, alongside them. The voter must actually have a War of
// their own before this test starts — a voter with none would hit MyWars's
// own empty-state "Create a War" CTA, which carries the same accessible name
// as the identity menu's own item and would let that row pass even if the
// menu itself carried no such item at all. Scoping every assertion to the
// menu landmark, not the page, is the second, independent safeguard against
// the same failure mode.
const CREATED_WAR = buildWarSummary({ id: 'war-nav-created', title: 'Nav War' })
const DRAFT_WAR = buildWarDetail({ id: 'war-nav-draft', title: 'Draft Nav War', status: 'draft', contestants: [] })

const REACHABILITY_ROWS: { page: string; path: string }[] = [
  { page: 'the home page', path: '/' },
  { page: 'their My Wars page', path: '/my-wars' },
  { page: "a draft War's Edit page", path: `/wars/${DRAFT_WAR.id}/edit` },
  { page: "that War's detail page", path: `/wars/${CREATED_WAR.id}` },
  { page: "that War's vote page", path: `/wars/${CREATED_WAR.id}/vote` },
]

for (const { page: pageLabel, path } of REACHABILITY_ROWS) {
  test(`My Wars, Create War and Home remain reachable from ${pageLabel}`, async ({
    page,
  }) => {
    // Arrange — a voter who has already created a War (CREATED_WAR), so
    // My Wars renders a non-empty list rather than its own empty-state CTA.
    await useScenario(page, [
      { method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [CREATED_WAR] } }] },
      {
        method: 'GET',
        path: `${API}/wars/${CREATED_WAR.id}/rankings`,
        responses: [{ status: 200, body: buildRankingsResponse({ war_id: CREATED_WAR.id }) }],
      },
      { method: 'GET', path: `${API}/wars/${DRAFT_WAR.id}`, responses: [{ status: 200, body: DRAFT_WAR }] },
    ])
    await page.goto('/')
    await loginAsTestVoter(page)

    // Act
    await navigateAuthenticated(page, path)
    await openIdentityMenu(page)

    // Assert
    await expect(nav(page).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    await expect(identityMenu(page).getByRole('menuitem', { name: 'My Wars' })).toHaveAttribute('href', '/my-wars')
    await expect(identityMenu(page).getByRole('menuitem', { name: 'Create War' })).toHaveAttribute(
      'href',
      '/wars/new',
    )
  })
}

test('Selecting an item in the identity menu navigates there and closes the menu', async ({ page }) => {
  // Arrange
  const createdWar = buildWarSummary({ id: 'war-nav-menu-created', title: null, status: 'draft' })
  const detail = buildWarDetail({ id: 'war-nav-menu-created', title: null, status: 'draft', contestants: [] })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars`, responses: [{ status: 201, body: createdWar }] },
    { method: 'GET', path: `${API}/wars/war-nav-menu-created`, responses: [{ status: 200, body: detail }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')
  await openIdentityMenu(page)

  // Act
  await identityMenu(page).getByRole('menuitem', { name: 'Create War' }).click()

  // Assert
  await page.waitForURL('**/wars/war-nav-menu-created/edit')
  await expect(page.getByTestId('edit-war-title-input')).toBeVisible()
  await expect(identityMenu(page)).toHaveCount(0)
  await expect(identityTrigger(page)).toHaveAttribute('aria-expanded', 'false')
})

test('The current page is indicated within the identity menu', async ({ page }) => {
  // Arrange
  await useScenario(page, [{ method: 'GET', path: `${API}/wars`, responses: [{ status: 200, body: { wars: [] } }] }])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/my-wars')

  // Act
  await openIdentityMenu(page)

  // Assert — the spec says the other item is unmarked.
  await expect(identityMenu(page).getByRole('menuitem', { name: 'My Wars' })).toHaveAttribute('aria-current', 'page')
  await expect(identityMenu(page).getByRole('menuitem', { name: 'Create War' })).not.toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('Clicking outside the identity menu closes it', async ({ page }) => {
  // Arrange
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')
  await openIdentityMenu(page)

  // Act
  await page.mouse.click(10, 10)

  // Assert
  await expect(identityMenu(page)).toHaveCount(0)
  await expect(identityTrigger(page)).toHaveAttribute('aria-expanded', 'false')
})

test('Pressing Escape closes the identity menu', async ({ page }) => {
  // Arrange
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')
  await openIdentityMenu(page)

  // Act
  await page.keyboard.press('Escape')

  // Assert
  await expect(identityMenu(page)).toHaveCount(0)
  await expect(identityTrigger(page)).toHaveAttribute('aria-expanded', 'false')
})

test('Logging out returns the navigation to its anonymous state', async ({ page }) => {
  // Arrange
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')
  await openIdentityMenu(page)

  // Act
  await identityMenu(page).getByRole('menuitem', { name: 'Log out' }).click()

  // Assert
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toBeVisible()
  await expect(identityTrigger(page)).toHaveCount(0)
  await expect(identityMenu(page)).toHaveCount(0)
})

test('A failed server-side logout still logs the voter out locally', async ({ page }) => {
  // Arrange — the spec, "Logout always succeeds from the
  // voter's point of view": a failing DELETE /auth/session must not gate,
  // delay, or surface an error for the client-side effect. The delay below
  // is what gives this test teeth against the "delay" half of that
  // requirement, not just the "fail" half — a fix that still awaits the
  // request before clearing local state would pass a 503 fixture with no
  // delay just as easily, but would miss this tight timeout.
  await useScenario(page, [{ method: 'DELETE', path: `${API}/auth/session`, responses: [{ status: 503, delayMs: 3000 }] }])
  await page.goto('/')
  await loginAsTestVoter(page)
  await navigateAuthenticated(page, '/')
  await openIdentityMenu(page)

  // Act
  await identityMenu(page).getByRole('menuitem', { name: 'Log out' }).click()

  // Assert — the client-side effect happens immediately, well before the
  // 3s server response, and never surfaces an error.
  await expect(nav(page).getByRole('link', { name: 'Log in' })).toBeVisible({ timeout: 500 })
  await expect(identityTrigger(page)).toHaveCount(0)
  await expect(identityMenu(page)).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
})
