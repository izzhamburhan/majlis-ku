import "server-only";
import { db } from "@/server/db";
import { incomingKey } from "@/server/media/keys";
import { storage } from "@/server/media/storage";

/** An upload URL is valid for 15 minutes; an upload still PENDING after this long was abandoned. */
const STALE_AFTER_MS = 60 * 60 * 1000;
/** Uploads older than STALE_AFTER_MS but younger than this get their `incoming` object removed, whatever their status. */
const INCOMING_WINDOW_MS = 2 * 60 * 60 * 1000;
const BATCH = 500;

/**
 * Delete the files of uploads that stayed PENDING for over an hour and mark them FAILED. Guests who close the tab
 * mid-upload leave an object behind that no row counts against the plan; this is what removes it.
 * Also removes the `incoming` object of any upload created one to two hours ago: completing deletes it, but the
 * signed URL stays valid for up to 15 minutes, so a guest could still write a new one afterwards. The sweep runs
 * hourly, so every upload passes through that window once, long after its URL expired.
 * Returns how many PENDING uploads were swept.
 */
export async function sweepStalePending(now: Date = new Date()): Promise<number> {
  const stale = await db.upload.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } },
    select: { id: true, eventId: true },
    take: BATCH,
  });
  let swept = 0;
  for (const { id, eventId } of stale) {
    // Claim first: an upload that completed in the meantime is no longer PENDING and keeps its files.
    const claimed = await db.upload.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
    if (claimed.count !== 1) continue;
    try {
      await storage().deletePrefix(`events/${eventId}/${id}`);
    } catch (error) {
      // The row is FAILED either way; event deletion and the retention purge remove whatever is left.
      console.warn(`[sweep] files of upload ${id} not deleted: ${error instanceof Error ? error.name : "Error"}`);
    }
    swept += 1;
  }

  const expiredUrls = await db.upload.findMany({
    where: { createdAt: { lt: new Date(now.getTime() - STALE_AFTER_MS), gt: new Date(now.getTime() - INCOMING_WINDOW_MS) } },
    select: { id: true, eventId: true },
    take: BATCH,
  });
  for (const { id, eventId } of expiredUrls) {
    try {
      await storage().deleteObject(incomingKey(eventId, id));
    } catch (error) {
      console.warn(`[sweep] incoming file of upload ${id} not deleted: ${error instanceof Error ? error.name : "Error"}`);
    }
  }
  return swept;
}
