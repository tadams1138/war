// Playwright globalSetup, registered only when COVERAGE=1: starts the
// acceptance coverage from an empty .nyc_output/ so a previous run's files
// never leak into the report.
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FullConfig } from '@playwright/test'

export default async function globalSetup(config: FullConfig): Promise<void> {
  const root = config.configFile ? dirname(config.configFile) : process.cwd()
  await rm(join(root, '.nyc_output'), { recursive: true, force: true })
}
