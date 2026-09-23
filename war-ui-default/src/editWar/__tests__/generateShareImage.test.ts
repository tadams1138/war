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

  it("uses each contestant's primary (display_order 0) image, not just the first array entry", async () => {
    // Arrange — the second array entry is the one declared display_order:
    // 0, mirroring war-detail.spec.ts's own "primary image" regression
    // test (ResultsTable had this exact bug once).
    const ctx = stubCanvas()
    const war = buildWarDetail({
      contestants: [
        buildContestant({
          id: 'c-1',
          name: 'Ada',
          media: [
            buildMediaItem({ id: 'second-in-array', display_order: 1 }),
            buildMediaItem({ id: 'actually-primary', display_order: 0 }),
          ],
        }),
        buildContestant({ id: 'c-2', name: 'Grace', media: [buildMediaItem({ id: 'm-2', display_order: 0 })] }),
      ],
    })

    // Act
    await generateShareImage(war)

    // Assert — whichever contestant landed on the left or right, Ada's
    // drawn image must be her display_order:0 one, never the array's
    // first entry.
    const drawnSrcs = ctx.drawImage.mock.calls.map((call) => (call[0] as HTMLImageElement).src)
    expect(drawnSrcs.some((src) => src.includes('actually-primary'))).toBe(true)
    expect(drawnSrcs.some((src) => src.includes('second-in-array'))).toBe(false)
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
