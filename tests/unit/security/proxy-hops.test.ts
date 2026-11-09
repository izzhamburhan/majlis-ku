import { describe, expect, it, vi } from "vitest";
import { createProxyHopsLogger, proxyHopsLine } from "@/server/security/proxy-hops";

const h = (values: Record<string, string>) => new Headers(values);
const ADDRESS_LIKE = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[0-9a-f]{1,4}:[0-9a-f:]*:[0-9a-f]{1,4}/i;

describe("proxyHopsLine", () => {
  it("states only the entry count and whether x-real-ip is present, never an address", () => {
    const headers = h({ "x-forwarded-for": "203.0.113.7, 2001:db8:1:2::9, 10.0.0.1", "x-real-ip": "198.51.100.9" });
    const line = proxyHopsLine(headers);
    expect(line).toContain("entries=3");
    expect(line).toContain("x-real-ip=present");
    expect(line).not.toMatch(ADDRESS_LIKE);
    expect(proxyHopsLine(h({}))).toContain("entries=0");
    expect(proxyHopsLine(h({}))).toContain("x-real-ip=absent");
    expect(proxyHopsLine(h({ "x-forwarded-for": " , " }))).toContain("entries=0");
  });
});

describe("createProxyHopsLogger", () => {
  it("logs nothing when off", () => {
    const write = vi.fn();
    const log = createProxyHopsLogger({ enabled: false, limit: 20, write });
    log(h({ "x-forwarded-for": "203.0.113.7" }));
    expect(write).not.toHaveBeenCalled();
  });

  it("logs the first 20 requests only, and no line ever holds an address", () => {
    const write = vi.fn();
    const log = createProxyHopsLogger({ enabled: true, limit: 20, write });
    for (let i = 0; i < 50; i++) log(h({ "x-forwarded-for": `203.0.113.${i}, 10.0.0.1`, "x-real-ip": "198.51.100.9" }));
    expect(write).toHaveBeenCalledTimes(20);
    for (const call of write.mock.calls) expect(String(call[0])).not.toMatch(ADDRESS_LIKE);
  });
});