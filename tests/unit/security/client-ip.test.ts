import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/env", () => ({ env: () => ({ HASH_SALT: "test-salt-test-salt" }) }));

const { clientIp } = await import("@/server/http");

const h = (values: Record<string, string>) => new Headers(values);

describe("clientIp", () => {
  it("counts from the right by hops, falls back to today's behaviour when unset, and never returns an empty string", () => {
    const chain = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.1" });
    // Unset: today's behaviour, the first entry (which a client can forge; that is why deployed mode requires hops).
    expect(clientIp(chain)).toBe("6.6.6.6");
    expect(clientIp(chain, undefined)).toBe("6.6.6.6");
    // hops=1 is the last entry (the address the nearest proxy saw), hops=2 the one before.
    expect(clientIp(chain, 1)).toBe("10.0.0.1");
    expect(clientIp(chain, 2)).toBe("203.0.113.7");
    expect(clientIp(chain, 3)).toBe("6.6.6.6");
    // A forged leading entry changes nothing when counting from the right.
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 6.6.6.6, 203.0.113.7" }), 1)).toBe("203.0.113.7");

    // Fewer entries than hops: x-real-ip, then "local".
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.9" }), 2)).toBe("198.51.100.9");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }), 2)).toBe("local");
    expect(clientIp(h({}), 1)).toBe("local");
    expect(clientIp(h({ "x-real-ip": "198.51.100.9" }), 1)).toBe("198.51.100.9");
    // hops=0 trusts no proxy: the header is not read.
    expect(clientIp(chain, 0)).toBe("local");

    // Never empty.
    for (const header of ["", " ", ",", " , ,", "a,,"]) {
      for (const hops of [undefined, 0, 1, 2, 3]) {
        const value = clientIp(h({ "x-forwarded-for": header }), hops);
        expect(value, `${JSON.stringify(header)} hops=${hops}`).not.toBe("");
      }
    }
    expect(clientIp(h({ "x-forwarded-for": " , " }), 1)).toBe("local");
    expect(clientIp(h({ "x-forwarded-for": "a,,", "x-real-ip": "198.51.100.9" }), 1)).toBe("198.51.100.9");
  });

  it("keeps today's behaviour exactly when hops is unset", () => {
    expect(clientIp(h({ "x-forwarded-for": "  1.1.1.1 ,2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(h({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(h({ "x-forwarded-for": "", "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(h({}))).toBe("local");
  });
});