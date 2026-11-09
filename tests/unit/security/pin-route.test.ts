import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => ({
  hits: [] as string[],
  peeks: [] as string[],
  resets: [] as string[],
  blocked: new Set<string>(),
  pinOk: false,
  cookies: [] as string[],
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string) => calls.cookies.push(name) }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/env", () => ({ env: () => ({ HASH_SALT: "test-salt-test-salt" }) }));
vi.mock("@/server/guests/context", () => ({
  findGuestEvent: async () => ({ id: "ev1", pinHash: "scrypt$x$y" }),
  ensureDeviceHash: async () => "device-hash",
}));
vi.mock("@/server/guests/pin", () => ({
  pinCookieName: (id: string) => `mk_pin_${id}`,
  signPinPass: () => "pass",
  verifyPin: async () => calls.pinOk,
}));
vi.mock("@/server/media/storage", () => ({ storageSecret: () => "secret-secret-secret" }));
function limiter(name: string) {
  return {
    hit: async (key: string) => {
      calls.hits.push(`${name}:${key}`);
      return calls.blocked.has(name) ? { ok: false, retryAfterSec: 30 } : { ok: true, retryAfterSec: 0 };
    },
    peek: async (key: string) => {
      calls.peeks.push(`${name}:${key}`);
      return calls.blocked.has(name) ? { ok: false, retryAfterSec: 30 } : { ok: true, retryAfterSec: 0 };
    },
    reset: async (key: string) => void calls.resets.push(`${name}:${key}`),
  };
}
vi.mock("@/server/security/rate-limit", () => ({ limiters: { pinAttempt: limiter("pinAttempt"), pinIp: limiter("pinIp") } }));

vi.mock("@/server/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/http")>()),
  clientIpHash: async () => "ip-hash",
}));

const { POST } = await import("@/app/api/e/[slug]/pin/route");

const post = (pin = "1234") =>
  POST(new Request("http://localhost/api/e/x/pin", { method: "POST", body: JSON.stringify({ pin }), headers: { "content-type": "application/json" } }), {
    params: Promise.resolve({ slug: "x" }),
  });

beforeEach(() => {
  calls.hits.length = 0;
  calls.peeks.length = 0;
  calls.resets.length = 0;
  calls.blocked.clear();
  calls.cookies.length = 0;
  calls.pinOk = false;
});

describe("POST /api/e/[slug]/pin per-IP limit", () => {
  it("counts a wrong PIN against the device key and the event and IP key", async () => {
    const response = await post();
    expect(response.status).toBe(403);
    expect(calls.peeks).toEqual(["pinIp:ev1:ip-hash"]);
    expect(calls.hits).toEqual(["pinAttempt:ev1:device-hash", "pinIp:ev1:ip-hash"]);
  });

  it("locks out when the IP is over its limit, even with the right PIN and a fresh device", async () => {
    calls.blocked.add("pinIp");
    calls.pinOk = true;
    const response = await post("2468");
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("locked");
    expect(calls.cookies).toEqual([]);
  });

  it("still locks out on the device limit alone", async () => {
    calls.blocked.add("pinAttempt");
    expect((await post()).status).toBe(429);
  });

  it("a correct PIN resets the device counter but not the shared IP counter", async () => {
    calls.pinOk = true;
    const response = await post("2468");
    expect(response.status).toBe(204);
    expect(calls.resets).toEqual(["pinAttempt:ev1:device-hash"]);
    expect(calls.hits).toEqual(["pinAttempt:ev1:device-hash"]); // a correct PIN adds nothing to the IP count
    expect(calls.cookies).toEqual(["mk_pin_ev1"]);
  });
});
