import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processPhoto } from "@/server/media/images";
import { mediaQueue } from "@/server/media/job-queue";
import { hugePng } from "../support/huge-png";

describe("processPhoto", () => {
  it("makes a display copy without EXIF and a thumbnail at most 400 px wide", async () => {
    const original = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#ffffff" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "Secret Location Owner" } })
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const result = await processPhoto(original);

    expect(result.width).toBe(3000);
    expect(result.height).toBe(2000);
    const display = await sharp(result.display).metadata();
    expect(display.exif).toBeUndefined();
    expect(Math.max(display.width ?? 0, display.height ?? 0)).toBeLessThanOrEqual(2048);
    const thumb = await sharp(result.thumb).metadata();
    expect(thumb.format).toBe("webp");
    expect(thumb.width).toBeLessThanOrEqual(400);
  });

  it("applies the EXIF orientation before stripping it", async () => {
    const portrait = await sharp({ create: { width: 200, height: 100, channels: 3, background: "#000000" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await processPhoto(portrait);
    expect(result.width).toBe(100);
    expect(result.height).toBe(200);
  });

  it("rejects something that is not an image", async () => {
    await expect(processPhoto(Buffer.from("not an image"))).rejects.toThrow();
  });

  it("a 20000x20000 PNG is rejected before decoding", async () => {
    // 400 megapixels would need over a gigabyte to decode: the pixel limit refuses it from the header alone.
    await expect(processPhoto(hugePng(20000, 20000))).rejects.toThrow(/pixel limit/i);
  });

  it("a 12000x12000 PNG (144 megapixels, under sharp's own default limit) is rejected before decoding", async () => {
    await expect(processPhoto(hugePng(12000, 12000))).rejects.toThrow(/pixel limit/i);
  });

  it("accepts a normal phone photo size (12 megapixels)", async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#336699" } }).jpeg({ quality: 40 }).toBuffer();
    const result = await processPhoto(big);
    expect(result.width).toBe(4000);
    expect(result.height).toBe(3000);
  });
});

describe("photo processing lane", () => {
  afterEach(() => vi.restoreAllMocks());

  it("two photo jobs never run at once", async () => {
    const original = mediaQueue.enqueue.bind(mediaQueue);
    let active = 0;
    let peak = 0;
    let lanes: string[] = [];
    vi.spyOn(mediaQueue, "enqueue").mockImplementation(((lane: string, job: () => Promise<unknown>) => {
      lanes.push(lane);
      return original(lane, async () => {
        active++;
        peak = Math.max(peak, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return await job();
        } finally {
          active--;
        }
      });
    }) as typeof mediaQueue.enqueue);

    const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#b33" } }).jpeg().toBuffer();
    lanes = [];
    await Promise.all([processPhoto(jpeg), processPhoto(jpeg), processPhoto(jpeg)]);

    expect(lanes).toEqual(["photo", "photo", "photo"]); // all three go through the one photo lane
    expect(peak).toBe(1); // ...and the lane runs them one after another
  });
});