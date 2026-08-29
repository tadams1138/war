import { expect, test } from '@playwright/test'

// war-ui-default has no application yet (spec: war-infra-spec.md §15.2's
// bootstrap-image note applies here too — this is a placeholder standing in
// for App Platform's build step until the real SPA is built under its own
// TDD process). This is that placeholder's only behaviour.
test('shows a coming-soon placeholder', async ({ page }) => {
  // Arrange / Act
  await page.goto('/')

  // Assert
  await expect(page.getByRole('heading', { name: 'War' })).toBeVisible()
  await expect(page.getByText('Coming soon.')).toBeVisible()
})
