import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildContestant, buildMediaItem, buildWarDetail } from '../../mocks/fixtures'
import { generateShareImage } from '../generateShareImage'

function stubCanvas() {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(this: HTMLCanvasElement, callback) {
    callback(new Blob(['fake-jpeg'], { type: 'image/jpeg' }))
  })
  return ctx
}

describe('generateShareImage', () => {
  beforeEach(() => {
    stubCanvas()
    // jsdom implements neither HTMLImageElement.decode() nor the Font
    // Loading API at all -- assigning a stub, not spying on one, since
    // there's nothing there yet to spy on.
    Image.prototype.decode = vi.fn().mockResolvedValue(undefined)
    if (!document.fonts) {
      Object.defineProperty(document, 'fonts', { value: {}, configurable: true })
    }
    document.fonts.load = vi.fn().mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when fewer than two contestants have an image', async () => {
    // Arrange
    const war = buildWarDetail({
      contestants: [
        buildContestant({ id: 'c-1', media: [buildMediaItem({ id: 'm-1' })] }),
        buildContestant({ id: 'c-2', media: [] }),
      ],
    })

    // Act
    const result = await generateShareImage(war)

    // Assert
    expect(result).toBeNull()
  })

  it('produces a JPEG Blob when at least two contestants have an image', async () => {
    // Arrange
    const war = buildWarDetail({
      contestants: [
        buildContestant({ id: 'c-1', name: 'Ada', media: [buildMediaItem({ id: 'm-1' })] }),
        buildContestant({ id: 'c-2', name: 'Grace', media: [buildMediaItem({ id: 'm-2' })] }),
      ],
    })

    // Act
    const result = await generateShareImage(war)

    // Assert
    expect(result).not.toBeNull()
    expect(result!.type).toBe('image/jpeg')
  })

  it('loads the theme display font before drawing, per theme', async () => {
    // Arrange
    const war = buildWarDetail({
      theme: 'fight_card',
      contestants: [
        buildContestant({ id: 'c-1', media: [buildMediaItem({ id: 'm-1' })] }),
        buildContestant({ id: 'c-2', media: [buildMediaItem({ id: 'm-2' })] }),
      ],
    })

    // Act
    await generateShareImage(war)

    // Assert
    expect(document.fonts.load).toHaveBeenCalledWith(expect.stringContaining('Anton'))
  })

  it('returns null when the canvas 2D context is unavailable', async () => {
    // Arrange
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const war = buildWarDetail({
      contestants: [
        buildContestant({ id: 'c-1', media: [buildMediaItem({ id: 'm-1' })] }),
        buildContestant({ id: 'c-2', media: [buildMediaItem({ id: 'm-2' })] }),
      ],
    })

    // Act
    const result = await generateShareImage(war)

    // Assert
    expect(result).toBeNull()
  })
})
