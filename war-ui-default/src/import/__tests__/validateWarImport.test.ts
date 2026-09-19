import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { validateWarImport } from '../validateWarImport'

function validWarJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Miss Universe 2026',
    category: 'Pageant',
    visibility: 'public',
    theme: 'arcade',
    contestant_schema: [],
    ends_at: null,
    contestants: [
      {
        name: 'Ada',
        bio: 'A brilliant mathematician.',
        attributes: [],
        media: [{ display_order: 0, aspect_ratio: 0.75, path: 'media/c-1/m-1.jpg' }],
      },
    ],
    ...overrides,
  }
}

function zipFrom(files: Record<string, Uint8Array | string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) {
    encoded[path] = typeof content === 'string' ? strToU8(content) : content
  }
  return zipSync(encoded)
}

describe('validateWarImport', () => {
  it('accepts a well-formed export and returns its parsed metadata and contestants', () => {
    // Arrange
    const zip = zipFrom({
      'war.json': JSON.stringify(validWarJson()),
      'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]),
    })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.metadata.title).toBe('Miss Universe 2026')
    expect(result.data.contestants).toHaveLength(1)
    expect(result.data.contestants[0].name).toBe('Ada')
    expect(result.data.contestants[0].media[0].path).toBe('media/c-1/m-1.jpg')
  })

  it('rejects a file that is not a readable zip', () => {
    // Arrange
    const notAZip = strToU8('this is plain text, not a zip file')

    // Act
    const result = validateWarImport(notAZip)

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/zip/i)
  })

  it('rejects a zip with no war.json', () => {
    // Arrange
    const zip = zipFrom({ 'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]) })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/war\.json/i)
  })

  it('rejects a war.json that is not valid JSON', () => {
    // Arrange
    const zip = zipFrom({ 'war.json': '{not valid json' })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
  })

  it('rejects a war.json missing required fields', () => {
    // Arrange
    const broken = validWarJson()
    delete broken.contestants
    const zip = zipFrom({ 'war.json': JSON.stringify(broken) })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
  })

  it('rejects a contestant whose media path is not present in the zip', () => {
    // Arrange — war.json references media/c-1/m-1.jpg, but the zip has no such file
    const zip = zipFrom({ 'war.json': JSON.stringify(validWarJson()) })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/image|media/i)
  })
})
