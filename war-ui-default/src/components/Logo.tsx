// The site's brand mark (the spec, "NavBar"): a faceted hexagon badge in
// the Arcade Showdown palette, with a 13-block mosaic standing in for a "W"
// -- reused everywhere regardless of a War's own active theme, the same way
// the footer already sits outside per-War theming. Geometry matches the
// approved design exactly (hexagon points, mosaic block coordinates); this
// is the one place that geometry is allowed to live, duplicated only in
// public/favicon.svg, which can't reference a React component.
const HEX_POINTS = '50,4 96,27 96,73 50,96 4,73 4,27'

const MOSAIC_BLOCKS: Array<{ x: number; y: number }> = [
  { x: 18.6, y: 20.6 },
  { x: 69.8, y: 20.6 },
  { x: 18.6, y: 32.2 },
  { x: 44.2, y: 32.2 },
  { x: 69.8, y: 32.2 },
  { x: 18.6, y: 43.8 },
  { x: 44.2, y: 43.8 },
  { x: 69.8, y: 43.8 },
  { x: 18.6, y: 55.4 },
  { x: 44.2, y: 55.4 },
  { x: 69.8, y: 55.4 },
  { x: 31.4, y: 67.0 },
  { x: 57.0, y: 67.0 },
]
const MOSAIC_BLOCK_WIDTH = 11.6
const MOSAIC_BLOCK_HEIGHT = 10.4

interface LogoProps {
  // Drop the hard shadow at small sizes -- it reads as fuzz, not a shadow,
  // by the time the mark is app-icon/favicon small (design review).
  shadow?: boolean
}

export function Logo({ shadow = true }: LogoProps) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="logo-badge-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3e7f" />
          <stop offset="1" stopColor="#35e8d4" />
        </linearGradient>
      </defs>
      {shadow && <polygon points={HEX_POINTS} fill="#f4e04d" transform="translate(6,6)" />}
      <polygon points={HEX_POINTS} fill="url(#logo-badge-grad)" />
      <g fill="#0d0b1a">
        {MOSAIC_BLOCKS.map((block) => (
          <rect key={`${block.x}-${block.y}`} x={block.x} y={block.y} width={MOSAIC_BLOCK_WIDTH} height={MOSAIC_BLOCK_HEIGHT} />
        ))}
      </g>
    </svg>
  )
}
