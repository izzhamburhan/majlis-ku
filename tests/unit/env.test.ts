import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const minimal = {
  DATABASE_URL: "postgresql://majlis:majlis@localhost:5432/majlis",
  AUTH_SECRET: "x".repeat(32),
  HASH_SALT: "salt-salt-salt-salt",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("accepts a minimal valid set and fills defaults", () => {
    const env = parseEnv(minimal);
    expect(env.DATABASE_URL).toBe(minimal.DATABASE_URL);
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.ADMIN_EMAILS).toEqual([]);
  });

  it("splits and lowercases ADMIN_EMAILS", () => {
    const env = parseEnv({ ...minimal, ADMIN_EMAILS: "Admin@Example.com, ops@example.com" });
    expect(env.ADMIN_EMAILS).toEqual(["admin@example.com", "ops@example.com"]);
  });

  it("names the missing variable", () => {
    const rest: Record<string, string> = { ...minimal };
    delete rest.DATABASE_URL;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it("treats empty strings as unset", () => {
    expect(() => parseEnv({ ...minimal, AUTH_SECRET: "" })).toThrow(/AUTH_SECRET/);
  });

  it("rejects a CRON_SECRET shorter than 16 characters", () => {
    expect(() => parseEnv({ ...minimal, CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
    expect(parseEnv({ ...minimal, CRON_SECRET: "x".repeat(16) }).CRON_SECRET).toBe("x".repeat(16));
    expect(parseEnv(minimal).CRON_SECRET).toBeUndefined();
    expect(parseEnv({ ...minimal, CRON_SECRET: "" }).CRON_SECRET).toBeUndefined();
  });

  it("DEPLOYED, AUTH_URL and TRUSTED_PROXY_HOPS are optional and checked when set", () => {
    const base = parseEnv(minimal);
    expect(base.DEPLOYED).toBeUndefined();
    expect(base.AUTH_URL).toBeUndefined();
    expect(base.TRUSTED_PROXY_HOPS).toBeUndefined();
    expect(parseEnv({ ...minimal, DEPLOYED: "", TRUSTED_PROXY_HOPS: "", AUTH_URL: "" }).TRUSTED_PROXY_HOPS).toBeUndefined();
    const set = parseEnv({ ...minimal, DEPLOYED: "1", TRUSTED_PROXY_HOPS: "2", AUTH_URL: "https://majlisku.example.com" });
    expect(set).toMatchObject({ DEPLOYED: "1", TRUSTED_PROXY_HOPS: 2, AUTH_URL: "https://majlisku.example.com" });
    expect(parseEnv({ ...minimal, TRUSTED_PROXY_HOPS: "0" }).TRUSTED_PROXY_HOPS).toBe(0);
    for (const bad of ["-1", "1.5", "two"]) expect(() => parseEnv({ ...minimal, TRUSTED_PROXY_HOPS: bad }), bad).toThrow(/TRUSTED_PROXY_HOPS/);
    // "true" would silently leave deployed mode off, so it is refused instead.
    expect(() => parseEnv({ ...minimal, DEPLOYED: "true" })).toThrow(/DEPLOYED/);
  });

  it("S3_MAX_OBJECT_BYTES is an optional positive whole number", () => {
    expect(parseEnv(minimal).S3_MAX_OBJECT_BYTES).toBeUndefined();
    expect(parseEnv({ ...minimal, S3_MAX_OBJECT_BYTES: "" }).S3_MAX_OBJECT_BYTES).toBeUndefined();
    expect(parseEnv({ ...minimal, S3_MAX_OBJECT_BYTES: "52428800" }).S3_MAX_OBJECT_BYTES).toBe(52428800);
    for (const bad of ["0", "-5", "1.5", "50MB"]) {
      expect(() => parseEnv({ ...minimal, S3_MAX_OBJECT_BYTES: bad }), bad).toThrow(/S3_MAX_OBJECT_BYTES/);
    }
  });
});
