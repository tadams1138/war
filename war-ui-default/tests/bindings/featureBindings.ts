// Every Gherkin scenario in features/ has exactly one Playwright test with the
// identical title, and every acceptance test has a scenario.

const SCENARIO_LINE = /^\s*Scenario(?: Outline)?:\s*(.+?)\s*$/gm
const TEST_OPENER = /^\s*test\(\s*(['"`])/gm

// Outline placeholders (<page>) and template-literal holes (${label}) compare equal.
function normalise(title: string): string {
  return title.replace(/\$\{[^}]*\}/g, '<x>').replace(/<[^>]*>/g, '<x>').replace(/\s+/g, ' ').trim()
}

export function scenarioTitles(featureText: string): string[] {
  return [...featureText.matchAll(SCENARIO_LINE)].map((match) => normalise(match[1]))
}

const BACKSLASH = String.fromCharCode(92)

function readLiteral(source: string, start: number, quote: string): string {
  let title = ''
  for (let i = start; i < source.length && source[i] !== quote; i++) {
    if (source[i] === BACKSLASH) i++
    title += source[i]
  }
  return title
}

export function testTitles(specText: string): string[] {
  return [...specText.matchAll(TEST_OPENER)].map((match) =>
    normalise(readLiteral(specText, match.index + match[0].length, match[1])),
  )
}

function duplicates(titles: string[]): string[] {
  return titles.filter((title, index) => titles.indexOf(title) !== index)
}

function missingFrom(titles: string[], others: string[]): string[] {
  return titles.filter((title) => !others.includes(title))
}

function driftForPair(name: string, featureText: string, specText: string | undefined): string[] {
  const scenarios = scenarioTitles(featureText)
  if (specText === undefined) return [`${name}.feature: no tests/acceptance/${name}.spec.ts`]
  const tests = testTitles(specText)
  return [
    ...missingFrom(scenarios, tests).map((title) => `${name}.feature: scenario has no test: "${title}"`),
    ...missingFrom(tests, scenarios).map((title) => `${name}.spec.ts: test has no scenario: "${title}"`),
  ]
}

export function findBindingDrift(features: Record<string, string>, specs: Record<string, string>): string[] {
  const problems = Object.entries(features).flatMap(([name, text]) => [
    ...duplicates(scenarioTitles(text)).map((title) => `${name}.feature: duplicate scenario: "${title}"`),
    ...driftForPair(name, text, specs[name]),
  ])
  const orphanSpecs = Object.keys(specs).filter((name) => !(name in features))
  return [...problems, ...orphanSpecs.map((name) => `${name}.spec.ts: no features/${name}.feature`)]
}
