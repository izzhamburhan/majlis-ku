import { describe, expect, it } from "vitest";
// A plain .mjs file, so the server can load it without TypeScript installed (next.config.ts needs the compiler at start-up).
// @ts-expect-error TS7016: allowJs is off, so the config file has no types here; it is cast below.
import config from "../../../next.config.mjs";

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