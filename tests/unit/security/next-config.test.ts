import { describe, expect, it } from "vitest";
import config from "../../../next.config";

async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = await (config as { headers?: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> }).headers!();
  const rule = rules.find((candidate) => candidate.source === "/:path*");
  expect(rule, `a header rule for ${path}`).toBeDefined();
  return Object.fromEntries(rule!.headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

describe("next.config security headers", () => {
  it("next.config sends Strict-Transport-Security without preload", async () => {
    const headers = await headersFor("/");
    expect(headers["strict-transport-security"]).toBe("max-age=31536000");
    expect(headers["strict-transport-security"]).not.toMatch(/preload|includeSubDomains/i);
  });

  it("keeps the existing headers", async () => {
    const headers = await headersFor("/");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
});