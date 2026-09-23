// Generates a War's share image client-side from two of its own contestants
// (the spec, "The share image is set one of two ways"): a 1200x630 canvas,
// each contestant's largest image covering its own half, with a "VS" badge
// styled per the War's theme centered over the seam -- the same visual
// language the vote page's own matchup divider (.vs-divider, themes.css)
// uses, replicated here as Canvas 2D paths since CSS clip-path/gradients
// don't apply to a canvas. Colors/fonts are copied from themes.css directly;
// if that file's theme tokens ever change, this drifts and needs updating
// by hand -- there's no shared source between CSS and Canvas 2D.
import type { ContestantDetail, WarDetailResponse } from '../api/client'

const WIDTH = 1200
const HEIGHT = 630

function largestVariant(item: ContestantDetail['media'][number]): { width: number; url: string } {
  return item.variants.reduce((largest, variant) => (variant.width > largest.width ? variant : largest))
}

function qualifies(contestant: ContestantDetail): boolean {
  return contestant.media.length > 0
}

function pickTwoRandom<T>(items: T[]): [T, T] {
  const shuffled = [...items].sort(() => Math.random() - 0.5)
  return [shuffled[0]!, shuffled[1]!]
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  return img
}

// Cover-fit: crop, never letterbox, matching object-fit: cover everywhere
// else this app draws a contestant's image.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  const drawWidth = img.width * scale
  const drawHeight = img.height * scale
  const offsetX = x + (w - drawWidth) / 2
  const offsetY = y + (h - drawHeight) / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
  ctx.restore()
}

function hexagonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  // Same six-point facet the theme's own .vs-divider clip-path draws
  // (polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)).
  const points: [number, number][] = [
    [cx, cy - r],
    [cx + r, cy - r / 2],
    [cx + r, cy + r / 2],
    [cx, cy + r],
    [cx - r, cy + r / 2],
    [cx - r, cy - r / 2],
  ]
  ctx.moveTo(...points[0]!)
  for (const point of points.slice(1)) ctx.lineTo(...point)
  ctx.closePath()
}

function drawArcadeBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const r = 90
  hexagonPath(ctx, cx, cy, r)
  const gradient = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  gradient.addColorStop(0, '#ff3e7f')
  gradient.addColorStop(1, '#35e8d4')
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.fillStyle = '#0d0b1a'
  ctx.font = "700 40px 'Press Start 2P', monospace"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', cx, cy + 4)
}

function drawFightCardBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((-6 * Math.PI) / 180)
  const w = 220
  const h = 120
  ctx.beginPath()
  // polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%)
  ctx.moveTo(-w / 2 + w * 0.1, -h / 2)
  ctx.lineTo(w / 2 - w * 0.1, -h / 2)
  ctx.lineTo(w / 2, 0)
  ctx.lineTo(w / 2 - w * 0.1, h / 2)
  ctx.lineTo(-w / 2 + w * 0.1, h / 2)
  ctx.lineTo(-w / 2, 0)
  ctx.closePath()
  ctx.fillStyle = '#e8442c'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = "700 52px 'Anton', sans-serif"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', 0, 4)
  ctx.restore()
}

function drawScrapbookBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((-8 * Math.PI) / 180)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 6
  ctx.beginPath()
  ctx.arc(0, 0, 85, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#ff6f59'
  ctx.font = "700 44px 'Permanent Marker', cursive"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', 0, 6)
  ctx.restore()
}

const BADGE_BY_THEME: Record<string, (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void> = {
  arcade: drawArcadeBadge,
  fight_card: drawFightCardBadge,
  scrapbook: drawScrapbookBadge,
}

const FONT_LOAD_SPEC_BY_THEME: Record<string, string> = {
  arcade: "700 40px 'Press Start 2P'",
  fight_card: "700 52px 'Anton'",
  scrapbook: "700 44px 'Permanent Marker'",
}

/**
 * Returns null when fewer than two contestants have an image -- the caller
 * disables the Generate control and explains why (spec) rather than this
 * function failing silently.
 */
export async function generateShareImage(war: WarDetailResponse): Promise<Blob | null> {
  const qualifying = war.contestants.filter(qualifies)
  if (qualifying.length < 2) return null

  const [left, right] = pickTwoRandom(qualifying)

  // Canvas text does not wait on CSS @import the way DOM text does --
  // without this, the badge's "VS" silently falls back to a system font.
  await document.fonts.load(FONT_LOAD_SPEC_BY_THEME[war.theme] ?? FONT_LOAD_SPEC_BY_THEME.arcade!)

  const [leftImg, rightImg] = await Promise.all([
    loadImage(largestVariant(left.media[0]!).url),
    loadImage(largestVariant(right.media[0]!).url),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  drawCover(ctx, leftImg, 0, 0, WIDTH / 2, HEIGHT)
  drawCover(ctx, rightImg, WIDTH / 2, 0, WIDTH / 2, HEIGHT)

  const drawBadge = BADGE_BY_THEME[war.theme] ?? drawArcadeBadge
  drawBadge(ctx, WIDTH / 2, HEIGHT / 2)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
  })
}
