import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the RateLimit table: release must only decrement, atomically, and never below zero.
const store = vi.hoisted(() => ({
  rows: new Map<string, number>(),
  updateMany: undefined as unknown as (args: {
    where: { key: string; count?: { gt: number } };
    data: { count: { decrement: number } };
  }) => Promise<{ count: number }>,
}));
store.updateMany = async ({ where, data }) => {
  const current = store.rows.get(where.key);
  if (current === undefined || (where.count && !(current > where.count.gt))) return { count: 0 };
  store.rows.set(where.key, current - data.count.decrement);
  return { count: 1 };
};
vi.mock("@/server/db", () => ({ db: { rateLimit: { updateMany: store.updateMany } } }));

const { createRateLimiter } = await import("@/server/security/rate-limit");

const limiter = createRateLimiter({ name: "t", limit: 3, windowMs: 600_000 });

beforeEach(() => store.rows.clear());

describe("createRateLimiter release", () => {
  it("gives one attempt back", async () => {
    store.rows.set("t:k", 3);
    await limiter.release("k");
    expect(store.rows.get("t:k")).toBe(2);
  });

  it("never goes below zero and ignores a key with no row", async () => {
    store.rows.set("t:k", 1);
    await limiter.release("k");
    await limiter.release("k");
    await limiter.release("k");
    expect(store.rows.get("t:k")).toBe(0);
    await limiter.release("missing");
    expect(store.rows.has("t:missing")).toBe(false);
  });
});