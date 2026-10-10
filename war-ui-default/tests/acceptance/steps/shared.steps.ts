// Steps whose text and behaviour are identical in every converted feature.
// Feature-specific steps live in <feature>.steps.ts, scoped by feature tag
// (see create-war.steps.ts); anything here must stay unscoped and generic.
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from './fixtures'
import { loginAsTestVoter, useScenario } from '../support/mocking'

const { Given, Then } = createBdd(test)

Given('an authenticated voter', async ({ page, world }) => {
  // Arrange
  world.booted = true
  await useScenario(page, world.recipes)
  await page.goto('/')
  await loginAsTestVoter(page)
})

Then("they are redirected to that War's Edit page", async ({ page, world }) => {
  // Assert
  await expect(page).toHaveURL(`/wars/${world.warId}/edit`)
  await expect(page.getByTestId('edit-war-title-input')).toBeVisible()
})
