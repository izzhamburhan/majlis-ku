import { describe, expect, it } from "vitest";
import { checkStoredObject, checkUploadAllowed, KIND_MAX_BYTES, maxObjectBytes, type PlanLimits } from "@/server/plans/limits";

const MB = 1024 * 1024;

const free: PlanLimits = {
  includesGallery: true,
  uploadLimit: 100,
  videoAllowed: false,
  maxVideoSeconds: null,
  maxUploadBytes: BigInt(15 * MB),
  storageLimitBytes: BigInt(2048 * MB),
};
const premium: PlanLimits = {
  includesGallery: true,
  uploadLimit: null,
  videoAllowed: true,
  maxVideoSeconds: 60,
  maxUploadBytes: BigInt(200 * MB),
  storageLimitBytes: null,
};
const usage = { uploadCount: 0, pendingCount: 0, storageBytes: 0n };

describe("checkUploadAllowed", () => {
  it("allows a normal photo on the free plan", () => {
    expect(checkUploadAllowed(free, usage, { kind: "PHOTO", sizeBytes: 2 * MB })).toEqual({ ok: true });
  });

  it("refuses when the plan has no gallery", () => {
    expect(checkUploadAllowed({ ...free, includesGallery: false }, usage, { kind: "PHOTO", sizeBytes: MB })).toEqual({
      ok: false,
      code: "gallery_not_in_plan",
    });
  });

  it("allows the 100th item and refuses the 101st, counting pending uploads", () => {
    expect(checkUploadAllowed(free, { ...usage, uploadCount: 98, pendingCount: 1 }, { kind: "PHOTO", sizeBytes: MB }).ok).toBe(true);
    expect(checkUploadAllowed(free, { ...usage, uploadCount: 99, pendingCount: 1 }, { kind: "PHOTO", sizeBytes: MB })).toEqual({
      ok: false,
      code: "limit_reached",
    });
  });

  it("never limits the count on an unlimited plan", () => {
    expect(checkUploadAllowed(premium, { ...usage, uploadCount: 100_000 }, { kind: "PHOTO", sizeBytes: MB }).ok).toBe(true);
  });

  it("refuses files over the plan cap or the kind cap", () => {
    expect(checkUploadAllowed(free, usage, { kind: "PHOTO", sizeBytes: 16 * MB })).toEqual({ ok: false, code: "too_large" });
    expect(checkUploadAllowed(premium, usage, { kind: "PHOTO", sizeBytes: Number(KIND_MAX_BYTES.PHOTO) + 1 })).toEqual({
      ok: false,
      code: "too_large",
    });
    expect(checkUploadAllowed(premium, usage, { kind: "VOICE", sizeBytes: 11 * MB })).toEqual({ ok: false, code: "too_large" });
  });

  it("refuses empty files", () => {
    expect(checkUploadAllowed(free, usage, { kind: "PHOTO", sizeBytes: 0 })).toEqual({ ok: false, code: "too_large" });
  });

  it("refuses when storage would go over the limit", () => {
    expect(
      checkUploadAllowed(free, { ...usage, storageBytes: BigInt(2048 * MB - MB) }, { kind: "PHOTO", sizeBytes: 2 * MB }),
    ).toEqual({ ok: false, code: "storage_full" });
  });

  it("refuses video on a plan without video and long videos on premium", () => {
    expect(checkUploadAllowed(free, usage, { kind: "VIDEO", sizeBytes: MB, durationSec: 10 })).toEqual({
      ok: false,
      code: "video_not_in_plan",
    });
    expect(checkUploadAllowed(premium, usage, { kind: "VIDEO", sizeBytes: MB, durationSec: 61 })).toEqual({
      ok: false,
      code: "too_long",
    });
    expect(checkUploadAllowed(premium, usage, { kind: "VIDEO", sizeBytes: MB, durationSec: 60 }).ok).toBe(true);
  });
});

// Characterization for an admin plan change: the limits are read from the event's current plan on every upload.
describe("checkUploadAllowed after an admin plan change", () => {
  it("a Premium event with 150 uploads moved to Free gets limit_reached", () => {
    expect(checkUploadAllowed(free, { ...usage, uploadCount: 150 }, { kind: "PHOTO", sizeBytes: MB })).toEqual({
      ok: false,
      code: "limit_reached",
    });
  });

  it("a Free event at 100 uploads moved to Premium accepts the next upload", () => {
    expect(checkUploadAllowed(premium, { ...usage, uploadCount: 100 }, { kind: "PHOTO", sizeBytes: MB })).toEqual({ ok: true });
  });
});

describe("deployment object cap (S3_MAX_OBJECT_BYTES)", () => {
  it("maxObjectBytes is the smallest of the kind cap, the plan cap and the deployment cap", () => {
    expect(maxObjectBytes(free, "PHOTO")).toBe(BigInt(15 * MB));
    expect(maxObjectBytes(premium, "PHOTO")).toBe(KIND_MAX_BYTES.PHOTO);
    expect(maxObjectBytes(premium, "VIDEO")).toBe(BigInt(200 * MB));
    expect(maxObjectBytes(premium, "VIDEO", 50 * MB)).toBe(BigInt(50 * MB));
    expect(maxObjectBytes(premium, "VIDEO", 500 * MB)).toBe(BigInt(200 * MB));
  });

  it("checkUploadAllowed refuses a size above the deployment cap", () => {
    expect(checkUploadAllowed(premium, usage, { kind: "VIDEO", sizeBytes: 51 * MB }, 50 * MB)).toEqual({ ok: false, code: "too_large" });
    expect(checkUploadAllowed(premium, usage, { kind: "VIDEO", sizeBytes: 50 * MB }, 50 * MB).ok).toBe(true);
  });
});

describe("checkStoredObject", () => {
  it("accepts a size inside every limit", () => {
    expect(checkStoredObject(free, 0n, "PHOTO", 2 * MB)).toEqual({ ok: true });
  });

  it("refuses empty, over-cap and over-storage objects, counting the actual size", () => {
    expect(checkStoredObject(free, 0n, "PHOTO", 0)).toEqual({ ok: false, code: "too_large" });
    expect(checkStoredObject(free, 0n, "PHOTO", 16 * MB)).toEqual({ ok: false, code: "too_large" });
    expect(checkStoredObject(premium, 0n, "VIDEO", 51 * MB, 50 * MB)).toEqual({ ok: false, code: "too_large" });
    expect(checkStoredObject(free, BigInt(2048 * MB - MB), "PHOTO", 2 * MB)).toEqual({ ok: false, code: "storage_full" });
    expect(checkStoredObject(free, BigInt(2048 * MB - 2 * MB), "PHOTO", 2 * MB)).toEqual({ ok: true });
  });

  it("does not look at the item count or the video flag, which were settled when the upload started", () => {
    const noVideoNoItems: PlanLimits = { ...free, uploadLimit: 0, videoAllowed: false };
    expect(checkStoredObject(noVideoNoItems, 0n, "VIDEO", MB)).toEqual({ ok: true });
  });
});

