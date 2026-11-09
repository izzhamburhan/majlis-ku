import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the RateLimit table: one fixed window per stored key, as the real upsert does.
const store = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  windows: [] as number[],
  $queryRaw: undefined as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>,
}));
store.$queryRaw = async (_strings, ...values) => {
  const key = String(values[0]);
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates[0] && dates[1]) store.windows.push(dates[0].getTime() - dates[1].getTime());
  const count = (store.counts.get(key) ?? 0) + 1;
  store.counts.set(key, count);
  return [{ count, windowStart: new Date() }];
};
vi.mock("@/server/db", () => ({ db: { $queryRaw: store.$queryRaw } }));

const { limiters } = await import("@/server/security/rate-limit");

beforeEach(() => {
  store.counts.clear();
  store.windows.length = 0;
});

describe("pinIp limiter", () => {
  it("pinIp limiter allows 20 per 10 minutes per event and IP, and another event has its own bucket", async () => {
    const eventA = "event-a:ip-hash-1";
    for (let i = 1; i <= 20; i++) expect((await limiters.pinIp.hit(eventA)).ok, `hit ${i}`).toBe(true);
    expect((await limiters.pinIp.hit(eventA)).ok).toBe(false);
    expect((await limiters.pinIp.hit(eventA)).ok).toBe(false);

    // Another event, and another IP on the same event, have their own buckets.
    expect((await limiters.pinIp.hit("event-b:ip-hash-1")).ok).toBe(true);
    expect((await limiters.pinIp.hit("event-a:ip-hash-2")).ok).toBe(true);

    // The window is 10 minutes, and the stored key is pinIp:<eventId>:<hash>.
    expect(new Set(store.windows)).toEqual(new Set([10 * 60_000]));
    expect([...store.counts.keys()]).toContain("pinIp:event-a:ip-hash-1");
  });

  it("is a separate limiter from the 5-per-device pinAttempt", async () => {
    for (let i = 1; i <= 5; i++) expect((await limiters.pinAttempt.hit("event-a:device-1")).ok).toBe(true);
    expect((await limiters.pinAttempt.hit("event-a:device-1")).ok).toBe(false);
    expect((await limiters.pinIp.hit("event-a:device-1")).ok).toBe(true);
  });
});