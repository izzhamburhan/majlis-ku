import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A stand-in for the RateLimit table, so the real limiter code runs against the route.
const store = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  ip: "ip-1",
  pinOk: false,
  $queryRaw: undefined as unknown as (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>,
  findUnique: undefined as unknown as (args: { where: { key: string } }) => Promise<unknown>,
  deleteMany: undefined as unknown as (args: { where: { key: string } }) => Promise<unknown>,
  updateMany: undefined as unknown as (args: { where: { key: string; count?: { gt: number } }; data: { count: { decrement: number } } }) => Promise<unknown>,
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
store.deleteMany = async ({ where }) => void store.counts.delete(where.key);
store.updateMany = async ({ where, data }) => {
  const current = store.counts.get(where.key);
  if (current === undefined || (where.count && !(current > where.count.gt))) return { count: 0 };
  store.counts.set(where.key, current - data.count.decrement);
  return { count: 1 };
};
vi.mock("@/server/db", () => ({
  db: { $queryRaw: store.$queryRaw, rateLimit: { findUnique: store.findUnique, deleteMany: store.deleteMany, updateMany: store.updateMany } },
}));

const events = vi.hoisted(() => ({ current: "ev1" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/env", () => ({ env: () => ({ HASH_SALT: "test-salt-test-salt" }) }));
vi.mock("@/server/guests/context", () => ({
  findGuestEvent: async () => ({ id: events.current, pinHash: "scrypt$x$y" }),
  // A new device for every request: only the per-IP limit can stop these guesses.
  ensureDeviceHash: async () => `device-${Math.random()}`,
}));
vi.mock("@/server/guests/pin", () => ({
  pinCookieName: (id: string) => `mk_pin_${id}`,
  signPinPass: () => "pass",
  verifyPin: async () => store.pinOk,
}));
vi.mock("@/server/media/storage", () => ({ storageSecret: () => "secret-secret-secret" }));
vi.mock("@/server/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/http")>()),
  clientIpHash: async () => store.ip,
}));

const { POST } = await import("@/app/api/e/[slug]/pin/route");

const post = () =>
  POST(new Request("http://localhost/api/e/x/pin", { method: "POST", body: JSON.stringify({ pin: "1234" }), headers: { "content-type": "application/json" } }), {
    params: Promise.resolve({ slug: "x" }),
  });

beforeEach(() => {
  store.counts.clear();
  store.pinOk = false;
  store.ip = "ip-1";
  events.current = "ev1";
});

describe("per-IP PIN limit counts failures only", () => {
  it("a correct PIN does not use up the per-IP allowance", async () => {
    store.pinOk = true;
    for (let i = 0; i < 40; i++) expect((await post()).status, `guest ${i}`).toBe(204);
    expect(store.counts.get("pinIp:ev1:ip-1") ?? 0).toBe(0); // counted, then given back
    // A wrong PIN after 40 successes is still a normal wrong PIN, not a lockout.
    store.pinOk = false;
    expect((await post()).status).toBe(403);
  });

  it("20 wrong PINs lock that IP and event, and another event is unaffected", async () => {
    for (let i = 1; i <= 20; i++) expect((await post()).status, `wrong ${i}`).toBe(403);
    expect(store.counts.get("pinIp:ev1:ip-1")).toBe(20);

    // Locked now, even with the right PIN and a fresh device.
    store.pinOk = true;
    const locked = await post();
    expect(locked.status).toBe(429);
    expect((await locked.json()).error.code).toBe("locked");
    expect(store.counts.get("pinIp:ev1:ip-1")).toBe(20); // a blocked attempt adds nothing

    events.current = "ev2";
    expect((await post()).status).toBe(204);
  });
});
