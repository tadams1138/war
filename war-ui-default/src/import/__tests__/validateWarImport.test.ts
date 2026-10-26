import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { validateWarImport } from '../validateWarImport'

function validWarJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Miss Universe 2026',
    category: 'Pageant',
    visibility: 'public',
    theme: 'arcade',
    ends_at: null,
    contestants: [
      {
        name: 'Ada',
        bio: 'A brilliant mathematician.',
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
  it('accepts a video War reference without a media file', () => {
    // Arrange
    const zip = zipFrom({ 'war.json': JSON.stringify(validWarJson({ media_mode: 'video', contestants: [{ name: 'Ada', bio: null, media: [{ kind: 'video', provider: 'vimeo', video_id: '123456', start_seconds: 2, end_seconds: 12 }] }] })) })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.metadata.media_mode).toBe('video')
  })

  it('rejects a video archive with an unlisted provider before creating a War', () => {
    // Arrange
    const zip = zipFrom({ 'war.json': JSON.stringify(validWarJson({ media_mode: 'video', contestants: [{ name: 'Ada', bio: null, media: [{ kind: 'video', provider: 'evil', video_id: '123456', start_seconds: 0, end_seconds: 10 }] }] })) })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
  })

  it('rejects video media in an image War archive', () => {
    // Arrange
    const zip = zipFrom({ 'war.json': JSON.stringify(validWarJson({ contestants: [{ name: 'Ada', bio: null, media: [{ kind: 'video', provider: 'vimeo', video_id: '123456', start_seconds: 0, end_seconds: 10 }] }] })) })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
  })

  it('rejects multiple video clips for one contestant', () => {
    // Arrange
    const clip = { kind: 'video', provider: 'vimeo', video_id: '123456', start_seconds: 0, end_seconds: 10 }
    const zip = zipFrom({ 'war.json': JSON.stringify(validWarJson({ media_mode: 'video', contestants: [{ name: 'Ada', bio: null, media: [clip, clip] }] })) })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
  })

  it.each([
    ['an incomplete YouTube identifier', { provider: 'youtube', video_id: 'a', start_seconds: 0, end_seconds: 10 }],
    ['a nonnumeric Vimeo identifier', { provider: 'vimeo', video_id: 'not-numeric', start_seconds: 0, end_seconds: 10 }],
    ['a fractional clip start', { provider: 'vimeo', video_id: '123456', start_seconds: 1.5, end_seconds: 10 }],
    ['a clip longer than one minute', { provider: 'vimeo', video_id: '123456', start_seconds: 0, end_seconds: 61 }],
  ])('rejects %s in a video archive', (_description, video) => {
    // Arrange
    const zip = zipFrom({ 'war.json': JSON.stringify(validWarJson({ media_mode: 'video', contestants: [{ name: 'Ada', bio: null, media: [{ kind: 'video', ...video }] }] })) })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
  })
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

  it('accepts a share_image path and returns it', () => {
    // Arrange
    const zip = zipFrom({
      'war.json': JSON.stringify(validWarJson({ share_image: 'share-image.jpg' })),
      'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]),
      'share-image.jpg': new Uint8Array([4, 5, 6]),
    })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.metadata.share_image).toBe('share-image.jpg')
  })

  it('defaults share_image to null for an older export that never had the field', () => {
    // Arrange — validWarJson() has no share_image key at all
    const zip = zipFrom({
      'war.json': JSON.stringify(validWarJson()),
      'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]),
    })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.metadata.share_image).toBeNull()
  })

  it('rejects a share_image path that is not present in the zip', () => {
    // Arrange
    const zip = zipFrom({
      'war.json': JSON.stringify(validWarJson({ share_image: 'share-image.jpg' })),
      'media/c-1/m-1.jpg': new Uint8Array([1, 2, 3]),
    })

    // Act
    const result = validateWarImport(zip)

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/image|media/i)
  })
})
