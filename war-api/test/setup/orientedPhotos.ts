import sharp, { type Sharp } from 'sharp';

export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Quadrant = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
export type QuadrantColors = Record<Quadrant, string>;

/** How a correctly oriented photo looks: one distinct colour per quadrant, so any rotation or mirror shows. */
export const UPRIGHT_QUADRANTS: QuadrantColors = {
  topLeft: 'red',
  topRight: 'green',
  bottomLeft: 'blue',
  bottomRight: 'white',
};

const RGB: Record<string, [number, number, number]> = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  white: [255, 255, 255],
};

type Step = (image: Sharp) => Sharp;

const flop: Step = (image) => image.flop();
const flip: Step = (image) => image.flip();
const rotate = (degrees: number): Step => (image) => image.rotate(degrees);

/**
 * The steps that turn the upright photo into the pixels a camera stores under each EXIF orientation: the inverse of
 * what a viewer applies. Each step is its own encode, because within one sharp pipeline flip and flop run before
 * rotation, which would swap orientations 5 and 7.
 */
const STORED_FROM_UPRIGHT: Record<Orientation, Step[]> = {
  1: [],
  2: [flop],
  3: [rotate(180)],
  4: [flip],
  5: [rotate(90), flop],
  6: [rotate(270)],
  7: [rotate(90), flip],
  8: [rotate(90)],
};

async function applySteps(image: Buffer, steps: Step[]): Promise<Buffer> {
  let result = image;
  for (const step of steps) {
    result = await step(sharp(result)).png().toBuffer();
  }
  return result;
}

async function uprightPhoto(width: number, height: number): Promise<Buffer> {
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);
  const block = (colour: string, w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: colour } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: 'white' } })
    .composite([
      { input: await block('red', halfWidth, halfHeight), left: 0, top: 0 },
      { input: await block('green', width - halfWidth, halfHeight), left: halfWidth, top: 0 },
      { input: await block('blue', halfWidth, height - halfHeight), left: 0, top: halfHeight },
    ])
    .png()
    .toBuffer();
}

/**
 * A JPEG as a phone camera writes it: the sensor's pixels plus an EXIF orientation tag saying how to show them. Shown
 * correctly it is `width` by `height` with `UPRIGHT_QUADRANTS`. With `orientation` undefined, no EXIF is written.
 */
export async function phonePhoto(width: number, height: number, orientation?: Orientation): Promise<Buffer> {
  const upright = await uprightPhoto(width, height);
  if (orientation === undefined) {
    return sharp(upright).jpeg({ quality: 95 }).toBuffer();
  }
  const stored = await applySteps(upright, STORED_FROM_UPRIGHT[orientation]);
  return sharp(stored)
    .withMetadata({ orientation, exif: { IFD0: { Make: 'Google', Model: 'Pixel' } } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

function nearestColour(pixel: [number, number, number]): string {
  const distance = (rgb: [number, number, number]) => rgb.reduce((sum, value, i) => sum + Math.abs(value - pixel[i]!), 0);
  return Object.entries(RGB).reduce((best, entry) => (distance(entry[1]) < distance(RGB[best]!) ? entry[0] : best), 'red');
}

/** The colour at the centre of each quadrant of an encoded image, as its pixels are stored (EXIF ignored). */
export async function quadrantColours(image: Buffer): Promise<QuadrantColors> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (fx: number, fy: number): string => {
    const offset = (Math.floor(info.height * fy) * info.width + Math.floor(info.width * fx)) * info.channels;
    return nearestColour([data[offset]!, data[offset + 1]!, data[offset + 2]!]);
  };
  return { topLeft: at(0.25, 0.25), topRight: at(0.75, 0.25), bottomLeft: at(0.25, 0.75), bottomRight: at(0.75, 0.75) };
}
