import sharp from "./sharp";

export const DISPLAY_MAX = 2048;
export const THUMB_WIDTH = 400;

export type ProcessedPhoto = {
  display: Buffer; // JPEG, rotated upright, no metadata (EXIF and GPS removed)
  thumb: Buffer; // WebP, 400 px wide
  width: number; // upright size of the original
  height: number;
};

export async function processPhoto(original: Buffer): Promise<ProcessedPhoto> {
  // rotate() with no argument applies the EXIF orientation; sharp drops metadata unless asked to keep it.
  const upright = sharp(original, { failOn: "error" }).rotate();
  const { data, info } = await upright.toBuffer({ resolveWithObject: true });
  const display = await sharp(data)
    .resize({ width: DISPLAY_MAX, height: DISPLAY_MAX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const thumb = await sharp(data).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
  return { display, thumb, width: info.width, height: info.height };
}

/** Cover photos: one upright JPEG, at most 1600 px. */
export async function processCover(original: Buffer): Promise<Buffer> {
  return sharp(original, { failOn: "error" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}