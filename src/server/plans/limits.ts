import type { Plan, UploadKind } from "@prisma/client";

const MB = 1024n * 1024n;

/** Hard per-file caps by kind, on top of the plan's own per-file cap. */
export const KIND_MAX_BYTES: Record<UploadKind, bigint> = {
  PHOTO: 15n * MB,
  VIDEO: 200n * MB,
  VOICE: 10n * MB,
};

/** Longest voice message accepted, whatever the plan. */
export const MAX_VOICE_SECONDS = 180;

export type PlanLimits = Pick<
  Plan,
  "includesGallery" | "uploadLimit" | "videoAllowed" | "maxVideoSeconds" | "maxUploadBytes" | "storageLimitBytes"
>;

export type EventUsage = {
  uploadCount: number; // confirmed items
  pendingCount: number; // upload URLs issued but not yet confirmed
  storageBytes: bigint;
};

export type UploadRequest = { kind: UploadKind; sizeBytes: number; durationSec?: number | null };

/**
 * Largest single file accepted for a kind: the smaller of the kind's hard cap, the plan's cap and an optional
 * deployment cap (S3_MAX_OBJECT_BYTES, for a storage service with its own per-file limit).
 */
export function maxObjectBytes(plan: Pick<PlanLimits, "maxUploadBytes">, kind: UploadKind, objectCap?: number): bigint {
  let cap = KIND_MAX_BYTES[kind];
  if (plan.maxUploadBytes < cap) cap = plan.maxUploadBytes;
  if (objectCap !== undefined && BigInt(objectCap) < cap) cap = BigInt(objectCap);
  return cap;
}

export type LimitCode =
  | "gallery_not_in_plan"
  | "limit_reached"
  | "too_large"
  | "storage_full"
  | "video_not_in_plan"
  | "too_long";

export type LimitResult = { ok: true } | { ok: false; code: LimitCode };

/** Server-side gate for every upload. The client's numbers are only a declaration; the server re-checks after upload. */
export function checkUploadAllowed(plan: PlanLimits, usage: EventUsage, request: UploadRequest, objectCap?: number): LimitResult {
  if (!plan.includesGallery) return { ok: false, code: "gallery_not_in_plan" };
  if (request.kind === "VIDEO" && !plan.videoAllowed) return { ok: false, code: "video_not_in_plan" };

  if (plan.uploadLimit !== null && usage.uploadCount + usage.pendingCount >= plan.uploadLimit) {
    return { ok: false, code: "limit_reached" };
  }

  const size = BigInt(Math.trunc(request.sizeBytes));
  const cap = maxObjectBytes(plan, request.kind, objectCap);
  if (size <= 0n || size > cap) return { ok: false, code: "too_large" };

  if (plan.storageLimitBytes !== null && usage.storageBytes + size > plan.storageLimitBytes) {
    return { ok: false, code: "storage_full" };
  }

  const duration = request.durationSec ?? null;
  if (request.kind === "VIDEO" && duration !== null && plan.maxVideoSeconds !== null && duration > plan.maxVideoSeconds) {
    return { ok: false, code: "too_long" };
  }
  if (request.kind === "VOICE" && duration !== null && duration > MAX_VOICE_SECONDS) {
    return { ok: false, code: "too_long" };
  }
  return { ok: true };
}

/**
 * The same size and storage rules, applied to the object that actually arrived (completeUpload). The item count and
 * the video flag were settled when the upload URL was issued, so they are not checked again.
 */
export function checkStoredObject(
  plan: Pick<PlanLimits, "maxUploadBytes" | "storageLimitBytes">,
  storageBytes: bigint,
  kind: UploadKind,
  actualBytes: number | bigint,
  objectCap?: number,
): LimitResult {
  const size = BigInt(actualBytes);
  if (size <= 0n || size > maxObjectBytes(plan, kind, objectCap)) return { ok: false, code: "too_large" };
  if (plan.storageLimitBytes !== null && storageBytes + size > plan.storageLimitBytes) return { ok: false, code: "storage_full" };
  return { ok: true };
}
