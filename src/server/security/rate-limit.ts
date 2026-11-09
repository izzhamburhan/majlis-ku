import { db } from "@/server/db";
import { rateLimitResult, type RateLimitResult } from "./rate-limit-rules";

// Fixed-window rate limiter stored in Postgres, so every server instance shares one count.
// One atomic upsert per hit; a database error rejects the request instead of letting it through.
export function createRateLimiter({ name, limit, windowMs }: { name: string; limit: number; windowMs: number }) {
  async function hit(key: string): Promise<RateLimitResult> {
    const now = new Date();
    const windowEdge = new Date(now.getTime() - windowMs); // rows started at or before this are expired
    const storedKey = `${name}:${key}`;
    // The column is TIMESTAMP(3) without a zone: bind dates as UTC wall time so the session timezone cannot shift them.
    const rows = await db.$queryRaw<{ count: number; windowStart: Date }[]>`
      INSERT INTO "RateLimit" ("key", "windowStart", "count")
      VALUES (${storedKey}, (${now}::timestamptz AT TIME ZONE 'UTC'), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "windowStart" = CASE WHEN "RateLimit"."windowStart" <= (${windowEdge}::timestamptz AT TIME ZONE 'UTC') THEN (${now}::timestamptz AT TIME ZONE 'UTC') ELSE "RateLimit"."windowStart" END,
        "count" = CASE WHEN "RateLimit"."windowStart" <= (${windowEdge}::timestamptz AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimit"."count" + 1 END
      RETURNING "count", "windowStart"`;
    const row = rows[0];
    if (!row) throw new Error("rate limit upsert returned no row"); // cannot happen; never fail open
    return rateLimitResult(row, limit, windowMs, now);
  }

  // Reads the count without adding to it: ok while fewer than `limit` hits are recorded in the live window.
  // Use it before an action whose failures alone should count (then call hit on a failure).
  async function peek(key: string): Promise<RateLimitResult> {
    const now = new Date();
    const row = await db.rateLimit.findUnique({ where: { key: `${name}:${key}` } });
    if (!row || row.windowStart.getTime() <= now.getTime() - windowMs) return { ok: true, retryAfterSec: 0 };
    return rateLimitResult({ count: row.count + 1, windowStart: row.windowStart }, limit, windowMs, now); // +1: the attempt being checked
  }

  async function reset(key: string): Promise<void> {
    await db.rateLimit.deleteMany({ where: { key: `${name}:${key}` } });
  }

  // Gives one attempt back, for a hit that turned out not to count (a correct PIN, a refused attempt). Atomic, and
  // never takes the count below zero. An expired window has nothing to give back; the next hit starts a fresh one.
  async function release(key: string): Promise<void> {
    await db.rateLimit.updateMany({ where: { key: `${name}:${key}`, count: { gt: 0 } }, data: { count: { decrement: 1 } } });
  }

  return { hit, peek, reset, release };
}

const MINUTE = 60_000;

// Shared limiters for the guest API. Keys are device hashes or salted IP hashes, never raw IPs.
export const limiters = {
  uploadStart: createRateLimiter({ name: "uploadStart", limit: 120, windowMs: 10 * MINUTE }),
  wish: createRateLimiter({ name: "wish", limit: 20, windowMs: 10 * MINUTE }),
  guestJoin: createRateLimiter({ name: "guestJoin", limit: 30, windowMs: 10 * MINUTE }),
  pinAttempt: createRateLimiter({ name: "pinAttempt", limit: 5, windowMs: 10 * MINUTE }),
  // Per event and salted IP hash, on top of pinAttempt: clearing cookies gives a new device but not a new address.
  // Counts wrong PINs only: the attempt is counted BEFORE the slow check, so parallel guesses cannot all pass a read,
  // and given back (release) when the PIN is right or the attempt was refused, so guests behind one venue Wi-Fi address
  // who enter the right PIN never use it up. 20 leaves room for typos from many guests or carrier NAT.
  pinIp: createRateLimiter({ name: "pinIp", limit: 20, windowMs: 10 * MINUTE }),
  rsvp: createRateLimiter({ name: "rsvp", limit: 10, windowMs: 10 * MINUTE }),
  report: createRateLimiter({ name: "report", limit: 5, windowMs: 10 * MINUTE }),
};
