import { createHash } from "node:crypto";

/** Opaque per-guest key for grouping items on screens; a salted hash, so the guest id never leaves the server. */
export function guestKeyFor(guestId: string | null, salt: string): string | null {
  if (!guestId) return null;
  return createHash("sha256").update(`${salt}:guest:${guestId}`).digest("hex").slice(0, 12);
}
