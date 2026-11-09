import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));

const { createDevSession, devLoginAllowed } = await import("@/server/auth/dev-login");

describe("createDevSession", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("dev login refuses when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_SERVER", "");
    await expect(createDevSession("admin@majlisku.test")).rejects.toThrow(/only available in local development/);
  });

  it("refuses while deployed, even if NODE_ENV is not production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("EMAIL_SERVER", "");
    vi.stubEnv("DEPLOYED", "1");
    await expect(createDevSession("admin@majlisku.test")).rejects.toThrow(/only available in local development/);
  });
});

describe("devLoginAllowed", () => {
  it("allows instant sign-in on a developer machine without real email", () => {
    expect(devLoginAllowed("development", undefined)).toBe(true);
    expect(devLoginAllowed("development", "")).toBe(true);
    expect(devLoginAllowed("test", undefined)).toBe(true);
  });

  it("never allows it in production, even without email configured", () => {
    expect(devLoginAllowed("production", undefined)).toBe(false);
    expect(devLoginAllowed("production", "")).toBe(false);
  });

  it("is off once real email is configured, so a shared dev server is not left open", () => {
    expect(devLoginAllowed("development", "smtp://user:pass@mail.example.com:587")).toBe(false);
  });
});
