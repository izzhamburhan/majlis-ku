import "server-only";
import type { Event, Guest, Plan, Upload, UploadKind } from "@prisma/client";
import { pendingUploadCount } from "@/server/events/service";
import { ApiError } from "@/server/http";
import { baseMime, detectedMatchesKind, detectMime, isAllowedMime, SNIFF_BYTES } from "@/server/media/file-check";
import { processPhoto } from "@/server/media/images";
import { uploadKey } from "@/server/media/keys";
import { storage, UPLOAD_URL_TTL_SEC } from "@/server/media/storage";
import { checkUploadAllowed, KIND_MAX_BYTES } from "@/server/plans/limits";
import { db } from "@/server/db";
import { enqueueProcessing, publishUpload } from "./processing";
import { checkShotAllowed, guestShotsUsed } from "./shots";

/** Kinds guests can upload. Video still needs a plan with videoAllowed (checked in checkUploadAllowed). */
export const ENABLED_KINDS: readonly UploadKind[] = ["PHOTO", "VIDEO", "VOICE"];

const LIMIT_MESSAGES: Record<string, number> = {
  gallery_not_in_plan: 403,
  video_not_in_plan: 403,
  limit_reached: 409,
  storage_full: 409,
  too_large: 413,
  too_long: 413,
};

export async function startUpload({
  event,
  guest,
  kind,
  mimeType,
  sizeBytes,
  durationSec,
}: {
  event: Event & { plan: Plan };
  guest: Guest;
  kind: UploadKind;
  mimeType: string;
  sizeBytes: number;
  durationSec?: number | null;
}) {
  if (!ENABLED_KINDS.includes(kind)) throw new ApiError("kind_not_available", 400);
  if (!isAllowedMime(kind, mimeType)) throw new ApiError("invalid_type", 415);

  const usage = { uploadCount: event.uploadCount, pendingCount: await pendingUploadCount(event.id), storageBytes: event.storageBytes };
  const allowed = checkUploadAllowed(event.plan, usage, { kind, sizeBytes, durationSec: durationSec ?? null });
  if (!allowed.ok) throw new ApiError(allowed.code, LIMIT_MESSAGES[allowed.code] ?? 400);
  if (kind === "PHOTO" && event.shotsPerGuest !== null) {
    const shot = checkShotAllowed(event.shotsPerGuest, await guestShotsUsed(db, event.id, guest.id));
    if (!shot.ok) throw new ApiError(shot.code, 409);
  }

  const maxBytes = Number(event.plan.maxUploadBytes < KIND_MAX_BYTES[kind] ? event.plan.maxUploadBytes : KIND_MAX_BYTES[kind]);
  const upload = await db.upload.create({
    data: {
      eventId: event.id,
      guestId: guest.id,
      guestName: guest.displayName,
      kind,
      mimeType,
      sizeBytes: BigInt(sizeBytes),
      durationSec: durationSec ?? null,
      // Placeholder key; replaced with the real one (which needs the id) right below.
      objectKey: `pending/${crypto.randomUUID()}`,
      moderation: event.requireApproval ? "PENDING_APPROVAL" : "VISIBLE",
    },
  });
  const objectKey = uploadKey(event.id, upload.id, "original");
  await db.upload.update({ where: { id: upload.id }, data: { objectKey } });
  const target = await storage().createUploadUrl(objectKey, { contentType: mimeType, maxBytes, expiresInSec: UPLOAD_URL_TTL_SEC });
  return { uploadId: upload.id, ...target };
}

async function fail(upload: Upload, code: string): Promise<never> {
  await db.upload.update({ where: { id: upload.id }, data: { status: "FAILED" } });
  await storage().deletePrefix(`events/${upload.eventId}/${upload.id}`);
  throw new ApiError(code, 422);
}

/** Verify the stored file (size, magic bytes), make web copies, and count it against the plan. */
export async function completeUpload({ eventId, uploadId, guestId }: { eventId: string; uploadId: string; guestId: string }) {
  const upload = await db.upload.findFirst({ where: { id: uploadId, eventId, guestId } });
  if (!upload) throw new ApiError("not_found", 404);
  if (upload.status === "READY" || upload.status === "PROCESSING") return { status: upload.status };
  if (upload.status === "FAILED") throw new ApiError("invalid_file", 422);

  const store = storage();
  const info = await store.stat(upload.objectKey);
  if (!info) throw new ApiError("not_uploaded", 409);
  if (info.size === 0 || info.size > Number(KIND_MAX_BYTES[upload.kind])) return fail(upload, "invalid_file");

  const detected = await detectMime(await store.readHead(upload.objectKey, SNIFF_BYTES));
  if (!detectedMatchesKind(upload.kind, detected)) return fail(upload, "invalid_file");

  // Disposable-camera mode: the limit holds at completion too, so uploads started in parallel cannot all get through.
  if (upload.kind === "PHOTO" && upload.guestId) {
    const event = await db.event.findUnique({ where: { id: eventId }, select: { shotsPerGuest: true } });
    const shot = checkShotAllowed(event?.shotsPerGuest ?? null, await guestShotsUsed(db, eventId, upload.guestId));
    if (!shot.ok) {
      await db.upload.update({ where: { id: upload.id }, data: { status: "FAILED" } });
      await store.deletePrefix(`events/${upload.eventId}/${upload.id}`);
      throw new ApiError(shot.code, 409);
    }
  }

  let data: Partial<Upload> = {};
  if (upload.kind === "PHOTO") {
    try {
      const photo = await processPhoto(await store.getObject(upload.objectKey));
      const displayKey = uploadKey(eventId, upload.id, "display.jpg");
      const thumbKey = uploadKey(eventId, upload.id, "thumb.webp");
      await store.putObject(displayKey, photo.display, "image/jpeg");
      await store.putObject(thumbKey, photo.thumb, "image/webp");
      data = { displayKey, thumbKey, width: photo.width, height: photo.height };
    } catch {
      return fail(upload, "invalid_file");
    }
  }

  // Photos are ready now; video and voice are converted in the background (see processing.ts).
  // Either way the item counts against the plan from this moment, so parallel uploads cannot overshoot it.
  const size = BigInt(info.size);
  const status = upload.kind === "PHOTO" ? ("READY" as const) : ("PROCESSING" as const);
  const mimeType = upload.kind === "PHOTO" && detected ? detected : baseMime(upload.mimeType);
  await db.$transaction([
    db.upload.update({ where: { id: upload.id }, data: { ...data, status, mimeType, sizeBytes: size } }),
    db.event.update({ where: { id: eventId }, data: { uploadCount: { increment: 1 }, storageBytes: { increment: size } } }),
  ]);
  if (status === "READY") await publishUpload(upload.id);
  else void enqueueProcessing(upload);
  return { status };
}