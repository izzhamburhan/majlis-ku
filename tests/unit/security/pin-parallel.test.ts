import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A stand-in for the RateLimit table, so the real limiter code runs against the route.
const store = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  verifications: 0,
  $queryRaw: undefined as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>,
  findUnique: undefined as unknown as (args: { where: { key: string } }) => Promise<unknown>,
  updateMany: undefined as unknown as (args: { where: { key: string; count?: { gt: number } }; data: { count: { decrement: number } } }) => Promise<unknown>,
  deleteMany: undefined as unknown as (args: { where: { key: string } }) => Promise<unknown>,
}));
store.$queryRaw = async (_strings, ...values) => {
  const key = String(values[0]);
  const count = (store.counts.get(key) ?? 0) + 1;
  store.counts.set(key, count);
  return [{ count, windowStart: new Date() }];
};
store.findUnique = async ({ where }) => {
  const count = store.counts.get(where.key);
  return count === undefined ? null : { count, windowStart: new Date() };
};
store.updateMany = async ({ where, data }) => {
  const current = store.counts.get(where.key);
  if (current === undefined || (where.count && !(current > where.count.gt))) return { count: 0 };
  store.counts.set(where.key, current - data.count.decrement);
  return { count: 1 };
};
store.deleteMany = async ({ where }) => void store.counts.delete(where.key);
vi.mock("@/server/db", () => ({
  db: { $queryRaw: store.$queryRaw, rateLimit: { findUnique: store.findUnique, updateMany: store.updateMany, deleteMany: store.deleteMany } },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/env", () => ({ env: () => ({ HASH_SALT: "test-salt-test-salt" }) }));
vi.mock("@/server/guests/context", () => ({
  findGuestEvent: async () => ({ id: "ev1", pinHash: "scrypt$x$y" }),
  ensureDeviceHash: async () => `device-${Math.random()}`,
}));
vi.mock("@/server/guests/pin", () => ({
  pinCookieName: (id: string) => `mk_pin_${id}`,
  signPinPass: () => "pass",
  // scrypt takes real time: every parallel request is still waiting here when the others check the counter.
  verifyPin: async () => {
    store.verifications++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return false;
  },
}));
vi.mock("@/server/media/storage", () => ({ storageSecret: () => "secret-secret-secret" }));
vi.mock("@/server/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/http")>()),
  clientIpHash: async () => "ip-1",
}));

const { POST } = await import("@/app/api/e/[slug]/pin/route");

const post = () =>
  POST(new Request("http://localhost/api/e/x/pin", { method: "POST", body: JSON.stringify({ pin: "1234" }), headers: { "content-type": "application/json" } }), {
    params: Promise.resolve({ slug: "x" }),
  });

beforeEach(() => {
  store.counts.clear();
  store.verifications = 0;
});

describe("PIN per-IP limit under parallel requests", () => {
  it("30 parallel wrong PINs allow at most 20 verifications", async () => {
    const responses = await Promise.all(Array.from({ length: 30 }, () => post()));
    expect(store.verifications).toBeLessThanOrEqual(20);
    expect(responses.filter((r) => r.status === 403)).toHaveLength(20);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(10);
    expect(store.counts.get("pinIp:ev1:ip-1")).toBe(20); // blocked attempts were given back
  });
});
