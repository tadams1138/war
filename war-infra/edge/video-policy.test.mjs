import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('static UI responses allow frames only from the supported video players', async () => {
  // Arrange
  const path = new URL('../terraform/ui/asset-headers', import.meta.url)
  // Act
  const headers = await readFile(path, 'utf8')
  // Assert
  assert.match(headers, /^\/\*\r?\n +Content-Security-Policy: frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com\s*$/m)
})

test('both deployment environments receive the YouTube secret from their workflow', async () => {
  // Arrange
  const files = ['staging', 'production'].map((environment) =>
    new URL(`../platform/${environment}.yaml`, import.meta.url))
  // Act
  const templates = await Promise.all(files.map((path) => readFile(path, 'utf8')))
  const workflow = await readFile(new URL('../../.github/workflows/app.yml', import.meta.url), 'utf8')
  // Assert
  for (const template of templates) {
    assert.match(template, /- key: YOUTUBE_API_KEY\r?\n +scope: RUN_TIME\r?\n +type: SECRET\r?\n +value: \$\{YOUTUBE_API_KEY\}/)
  }
  assert.equal(workflow.match(/YOUTUBE_API_KEY: \$\{\{ secrets\.YOUTUBE_API_KEY \}\}/g)?.length, 2)
})
