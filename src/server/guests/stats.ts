import "server-only";
import { db } from "@/server/db";
import { guestShotsUsed } from "@/server/uploads/shots";

/** Counts for the guest page header, and this guest's shots when the event is in disposable-camera mode. */
export async function guestPageStats(event: { id: string; shotsPerGuest: number | null }, guestId: string | null) {
  const [photos, guests, used] = await Promise.all([
    db.upload.count({ where: { eventId: event.id, status: "READY", moderation: "VISIBLE", kind: { in: ["PHOTO", "VIDEO"] } } }),
    db.guest.count({ where: { eventId: event.id } }),
    event.shotsPerGuest !== null && guestId ? guestShotsUsed(db, event.id, guestId) : Promise.resolve(0),
  ]);
  return { photos, guests, shots: event.shotsPerGuest === null ? null : { limit: event.shotsPerGuest, used } };
}
