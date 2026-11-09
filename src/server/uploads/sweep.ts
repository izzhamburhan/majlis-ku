import "server-only";
import { db } from "@/server/db";
import { storage } from "@/server/media/storage";

/** An upload URL is valid for 15 minutes; an upload still PENDING after this long was abandoned. */
const STALE_AFTER_MS = 60 * 60 * 1000;
const BATCH = 500;

/**
 * Delete the files of uploads that stayed PENDING for over an hour and mark them FAILED. Guests who close the tab
 * mid-upload leave an object behind that no row counts against the plan; this is what removes it.
 * Returns how many uploads were swept.
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
  return swept;
}
