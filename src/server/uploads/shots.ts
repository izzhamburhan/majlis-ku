import type { PrismaClient } from "@prisma/client";

// Disposable-camera mode: each guest may take `Event.shotsPerGuest` photos (null = unlimited).
// Video and voice never count. Pure rules here; the count query is the only database call.

export type ShotResult = { ok: true } | { ok: false; code: "shots_used_up" };

export function checkShotAllowed(limit: number | null, used: number): ShotResult {
  if (limit === null || used < limit) return { ok: true };
  return { ok: false, code: "shots_used_up" };
}

export function shotsLeft(limit: number | null, used: number): number | null {
  return limit === null ? null : Math.max(0, limit - used);
}

/**
 * Photos this guest has confirmed. Unfinished uploads do not count, so a dropped upload on weak signal never
 * costs a shot; the limit is checked again when each upload completes (see completeUpload).
 */
export function guestShotsUsed(db: Pick<PrismaClient, "upload">, eventId: string, guestId: string) {
  return db.upload.count({ where: { eventId, guestId, kind: "PHOTO", status: { in: ["READY", "PROCESSING"] } } });
}
