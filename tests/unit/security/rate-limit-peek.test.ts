import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the RateLimit table. peek must read, never write.
const store = vi.hoisted(() => ({
  rows: new Map<string, { count: number; windowStart: Date }>(),
  writes: 0,
  $queryRaw: undefined as unknown as () => Promise<unknown>,
  findUnique: undefined as unknown as (args: { where: { key: string } }) => Promise<unknown>,
}));
store.$queryRaw = async () => {
  store.writes++;
  return [{ count: 1, windowStart: new Date() }];
};
store.findUnique = async ({ where }) => store.rows.get(where.key) ?? null;
vi.mock("@/server/db", () => ({ db: { $queryRaw: store.$queryRaw, rateLimit: { findUnique: store.findUnique } } }));

const { createRateLimiter } = await import("@/server/security/rate-limit");

const limiter = createRateLimiter({ name: "t", limit: 3, windowMs: 600_000 });

beforeEach(() => {
  store.rows.clear();
  store.writes = 0;
});

describe("createRateLimiter peek", () => {
  it("allows when there is no row and never writes", async () => {
    expect((await limiter.peek("k")).ok).toBe(true);
    expect(store.writes).toBe(0);
  });

  it("allows while the count is below the limit and blocks once it has reached it", async () => {
    store.rows.set("t:k", { count: 2, windowStart: new Date() });
    expect((await limiter.peek("k")).ok).toBe(true);
    store.rows.set("t:k", { count: 3, windowStart: new Date() });
    const blocked = await limiter.peek("k");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(store.writes).toBe(0);
  });

  it("allows again once the window has expired", async () => {
    store.rows.set("t:k", { count: 9, windowStart: new Date(Date.now() - 601_000) });
    expect((await limiter.peek("k")).ok).toBe(true);
  });
});