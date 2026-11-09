import { mediaQueue } from "./job-queue";
import sharp from "./sharp";

export const DISPLAY_MAX = 2048;
export const THUMB_WIDTH = 400;
/** Decoded pixels a photo may have: 50 megapixels is well above any phone camera, and decodes in about 150 MB. */
export const MAX_INPUT_PIXELS = 50_000_000;

const INPUT = { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS } as const;

export type ProcessedPhoto = {
  display: Buffer; // JPEG, rotated upright, no metadata (EXIF and GPS removed)
  thumb: Buffer; // WebP, 400 px wide
  width: number; // upright size of the original
  height: number;
};

/**
 * Photos are processed one at a time per server: a 12 MP decode needs well over 100 MB, and the 512 MB free tier
 * cannot hold several at once. Callers still await the result, so completeUpload behaves as before.
 */
export function processPhoto(original: Buffer): Promise<ProcessedPhoto> {
  return mediaQueue.enqueue("photo", () => makePhotoCopies(original));
}

async function makePhotoCopies(original: Buffer): Promise<ProcessedPhoto> {
  // The header read applies the pixel limit before any decoding. Orientations 5 to 8 turn the picture on its side.
  const meta = await sharp(original, INPUT).metadata();
  const turned = (meta.orientation ?? 1) >= 5;
  const [rawWidth, rawHeight] = [meta.width ?? 0, meta.height ?? 0];
  // One pipeline: rotate() applies the EXIF orientation, then the resize; sharp drops metadata unless asked to keep it.
  const display = await sharp(original, INPUT)
    .rotate()
    .resize({ width: DISPLAY_MAX, height: DISPLAY_MAX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  // The thumbnail comes from the display copy (at most 2048 px), not a second decode of the full photo.
  const thumb = await sharp(display).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  return { display, thumb, width: turned ? rawHeight : rawWidth, height: turned ? rawWidth : rawHeight };
}

/** Cover photos: one upright JPEG, at most 1600 px. */
export async function processCover(original: Buffer): Promise<Buffer> {
  return sharp(original, INPUT)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
