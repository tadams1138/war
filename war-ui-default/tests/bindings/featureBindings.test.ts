import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findBindingDrift } from './featureBindings'

const ROOT = join(__dirname, '..', '..')

function readDir(dir: string, suffix: string): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const file of readdirSync(join(ROOT, dir)).filter((name) => name.endsWith(suffix))) {
    entries[file.slice(0, -suffix.length)] = readFileSync(join(ROOT, dir, file), 'utf8')
  }
  return entries
}

describe('feature to acceptance test binding', () => {
  it('reports a scenario that has no test with the same title', () => {
    // Arrange
    const features = { home: 'Feature: Home\n  Scenario: Opens the page\n' }
    const specs = { home: "test('Opens the home page', async () => {})" }

    // Act
    const drift = findBindingDrift(features, specs)

    // Assert
    expect(drift).toEqual([
      'home.feature: scenario has no test: "Opens the page"',
      'home.spec.ts: test has no scenario: "Opens the home page"',
    ])
  })

  it('reports nothing when titles match, including escaped quotes and outline placeholders', () => {
    // Arrange
    const features = {
      home: [
        "Scenario: A War's card",
        'Scenario Outline: Reachable from <page>',
      ].join('\n'),
    }
    const specs = {
      home: ["test('A War\\'s card', async () => {})", 'test(`Reachable from ${label}`, async () => {})'].join('\n'),
    }

    // Act
    const drift = findBindingDrift(features, specs)

    // Assert
    expect(drift).toEqual([])
  })

  it('reports a feature without a spec and duplicate titles', () => {
    // Arrange
    const features = { lonely: 'Scenario: One\nScenario: One' }
    const specs = {}

    // Act
    const drift = findBindingDrift(features, specs)

    // Assert
    expect(drift).toEqual([
      'lonely.feature: duplicate scenario: "One"',
      'lonely.feature: no tests/acceptance/lonely.spec.ts',
    ])
  })

  it('holds for every feature and acceptance spec in the repository', () => {
    // Arrange
    const features = readDir('features', '.feature')
    const specs = readDir('tests/acceptance', '.spec.ts')

    // Act
    const drift = findBindingDrift(features, specs)

    // Assert
    expect(drift).toEqual([])
  })
})
