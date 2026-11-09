import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/env", () => ({ env: () => ({ HASH_SALT: "test-salt-test-salt" }) }));

const { clientIp, ipGroup } = await import("@/server/http");

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

describe("clientIp in deployed mode", () => {
  it("never falls back to x-real-ip and uses one constant bucket when the header is too short", () => {
    const real = "198.51.100.9";
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7", "x-real-ip": real }), 2, true)).toBe("unknown");
    expect(clientIp(h({ "x-real-ip": real }), 1, true)).toBe("unknown");
    expect(clientIp(h({}), 1, true)).toBe("unknown");
    expect(clientIp(h({ "x-forwarded-for": " , ", "x-real-ip": real }), 1, true)).toBe("unknown");
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1", "x-real-ip": real }), undefined, true)).toBe("unknown");
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1", "x-real-ip": real }), 0, true)).toBe("unknown");
  });

  it("counts from the right exactly as before when the header is long enough", () => {
    const chain = h({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 10.0.0.1", "x-real-ip": "198.51.100.9" });
    expect(clientIp(chain, 1, true)).toBe("10.0.0.1");
    expect(clientIp(chain, 2, true)).toBe("203.0.113.7");
  });
});

describe("ipGroup", () => {
  it("gives two addresses in the same /64 the same key, and different /64s different keys", () => {
    const a = ipGroup("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(ipGroup("2001:db8:1:2::1")).toBe(a);
    expect(ipGroup("2001:DB8:0001:0002:1:2:3:4")).toBe(a);
    expect(ipGroup("2001:db8:1:3::1")).not.toBe(a);
    expect(ipGroup("2001:db8:2:2::1")).not.toBe(a);
    expect(ipGroup("::1")).toBe(ipGroup("0:0:0:0:ffff::9"));
    expect(ipGroup("fe80::1%eth0")).toBe(ipGroup("fe80::2"));
    // An embedded IPv4 tail (NAT64) counts as the last two groups.
    expect(ipGroup("64:ff9b::203.0.113.7")).toBe(ipGroup("64:ff9b::9"));
    expect(ipGroup("64:ff9b::203.0.113.7")).not.toBe(ipGroup("64:ff9c::9"));
  });

  it("leaves IPv4, IPv4-mapped IPv6 and the constant buckets as they are", () => {
    for (const value of ["203.0.113.7", "::ffff:203.0.113.7", "::FFFF:203.0.113.7", "local", "unknown", "not-an-ip"]) {
      expect(ipGroup(value), value).toBe(value);
    }
  });
});