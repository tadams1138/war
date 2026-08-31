// Binds features/contestant-attributes.feature.
import { expect, test } from '@playwright/test'
import { buildContestant, buildMatchupResponse, buildWarDetail } from '../../src/mocks/fixtures'
import { API, loginAsTestVoter, navigateAuthenticated, useScenario } from './support/mocking'

test('Declared fields render on the War detail page', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: 'war-pageant',
    contestants: [
      buildContestant({
        id: 'c-1',
        name: 'Ada',
        attributes: [
          { key: 'country', label: 'Country', type: 'string', value: 'Nigeria' },
          { key: 'age', label: 'Age', type: 'number', value: 24 },
          { key: 'height', label: 'Height', type: 'string', value: '178cm' },
        ],
      }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-pageant`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-pageant')

  // Assert
  const item = page.getByTestId('contestant-gallery-item').filter({ hasText: 'Ada' })
  await expect(item.getByText('Country')).toBeVisible()
  await expect(item.getByText('Nigeria')).toBeVisible()
  await expect(item.getByText('Age')).toBeVisible()
  await expect(item.getByText('24')).toBeVisible()
  await expect(item.getByText('Height')).toBeVisible()
  await expect(item.getByText('178cm')).toBeVisible()
})

test('The same component renders an entirely different campaign', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: 'war-election',
    contestants: [
      buildContestant({
        id: 'c-1',
        name: 'Grace',
        attributes: [
          { key: 'party', label: 'Party', type: 'string', value: 'Independent' },
          { key: 'state', label: 'State', type: 'string', value: 'Ohio' },
          { key: 'office', label: 'Office', type: 'string', value: 'Senate' },
        ],
      }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-election`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-election')

  // Assert
  const item = page.getByTestId('contestant-gallery-item').filter({ hasText: 'Grace' })
  await expect(item.getByText('Party')).toBeVisible()
  await expect(item.getByText('Independent')).toBeVisible()
  await expect(item.getByText('State')).toBeVisible()
  await expect(item.getByText('Ohio')).toBeVisible()
  await expect(item.getByText('Office')).toBeVisible()
  await expect(item.getByText('Senate')).toBeVisible()
})

test('Omitted fields are not rendered', async ({ page }) => {
  // Arrange — the API's resolved `attributes` array simply omits a field
  // the contestant supplied no value for.
  const detail = buildWarDetail({
    id: 'war-pageant-2',
    contestants: [
      buildContestant({
        id: 'c-1',
        name: 'Mae',
        attributes: [{ key: 'country', label: 'Country', type: 'string', value: 'Kenya' }],
      }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-pageant-2`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-pageant-2')

  // Assert
  const item = page.getByTestId('contestant-gallery-item').filter({ hasText: 'Mae' })
  await expect(item.getByText('Country')).toBeVisible()
  await expect(item.getByText('Height')).toHaveCount(0)
})

test('A url-typed attribute renders as a safe link', async ({ page }) => {
  // Arrange
  const detail = buildWarDetail({
    id: 'war-links',
    contestants: [
      buildContestant({
        id: 'c-1',
        name: 'Ada',
        attributes: [{ key: 'website', label: 'Website', type: 'url', value: 'https://example.com/ada' }],
      }),
    ],
  })
  await useScenario(page, [{ method: 'GET', path: `${API}/wars/war-links`, responses: [{ status: 200, body: detail }] }])

  // Act
  await page.goto('/wars/war-links')

  // Assert
  const link = page.getByRole('link', { name: 'https://example.com/ada' })
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(link).toHaveAttribute('href', 'https://example.com/ada')
})

test('Attributes do not appear on vote cards', async ({ page }) => {
  // Arrange — the matchup response the vote screen renders from has no
  // attributes field at all (war-api-spec.md — matchup.left/right only
  // carry id/name/media), so this holds structurally as well as visually.
  const matchup = buildMatchupResponse({
    matchup: {
      id: 'matchup-attrs',
      left: { id: 'left', name: 'Ada', media: [] },
      right: { id: 'right', name: 'Grace', media: [] },
    },
  })
  await useScenario(page, [
    { method: 'POST', path: `${API}/wars/war-vote-attrs/join`, responses: [{ status: 204 }] },
    { method: 'GET', path: `${API}/wars/war-vote-attrs/matchups/next`, responses: [{ status: 200, body: matchup }] },
  ])
  await page.goto('/')
  await loginAsTestVoter(page)

  // Act
  await navigateAuthenticated(page, '/wars/war-vote-attrs/vote')

  // Assert
  await expect(page.getByTestId('contestant-card').filter({ hasText: 'Ada' })).toBeVisible()
  await expect(page.locator('dl')).toHaveCount(0)
})
