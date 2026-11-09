import { describe, expect, it, vi } from "vitest";
import { assertDeployedConfig, enforceDeployedConfig, isDeployed } from "@/lib/deployed";

const SECRET_VALUES = {
  HASH_SALT: "salt-salt-salt-salt-0123456789",
  AUTH_SECRET: "auth-secret-".padEnd(40, "x"),
  AUTH_GOOGLE_SECRET: "google-client-secret-value",
  S3_SECRET_ACCESS_KEY: "s3-secret-access-key-value",
};

const good: Record<string, string> = {
  DEPLOYED: "1",
  ...SECRET_VALUES,
  AUTH_URL: "https://majlisku.onrender.com",
  NEXT_PUBLIC_APP_URL: "https://majlisku.onrender.com",
  AUTH_GOOGLE_ID: "google-client-id",
  ADMIN_EMAILS: "owner@example.com",
  TRUSTED_PROXY_HOPS: "1",
  STORAGE_DRIVER: "s3",
  S3_ENDPOINT: "https://abc.storage.supabase.co/storage/v1/s3",
  S3_REGION: "ap-southeast-1",
  S3_BUCKET: "media",
  S3_ACCESS_KEY_ID: "AKIATESTTESTTESTTEST",
};

describe("isDeployed", () => {
  it("is true only for DEPLOYED=1", () => {
    expect(isDeployed({ DEPLOYED: "1" })).toBe(true);
    for (const value of [undefined, "", "0", "true", "yes", " 1"]) expect(isDeployed({ DEPLOYED: value }), String(value)).toBe(false);
  });
});

describe("assertDeployedConfig", () => {
  it("returns nothing for a safe deployed configuration", () => {
    expect(assertDeployedConfig(good)).toEqual([]);
  });

  it("returns nothing when DEPLOYED is unset", () => {
    expect(assertDeployedConfig({})).toEqual([]);
    expect(assertDeployedConfig({ HASH_SALT: "change-me", STORAGE_DRIVER: "local", NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toEqual([]);
    expect(assertDeployedConfig({ DEPLOYED: "0", HASH_SALT: "change-me" })).toEqual([]);
  });

  it("assertDeployedConfig lists every unsafe value", () => {
    const problems = assertDeployedConfig({
      DEPLOYED: "1",
      HASH_SALT: "change-me",
      AUTH_SECRET: "short-secret",
      AUTH_URL: "http://majlisku.example.com",
      NEXT_PUBLIC_APP_URL: "http://majlisku.example.com",
      AUTH_GOOGLE_ID: "",
      ADMIN_EMAILS: " , ",
      STORAGE_DRIVER: "local",
    });
    for (const name of ["HASH_SALT", "AUTH_SECRET", "AUTH_URL", "NEXT_PUBLIC_APP_URL", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ADMIN_EMAILS", "TRUSTED_PROXY_HOPS", "STORAGE_DRIVER"]) {
      expect(problems.filter((problem) => problem.startsWith(`${name}:`)), name).toHaveLength(1);
    }
    expect(problems).toHaveLength(9);
  });

  it("flags a short HASH_SALT, a non-https URL and a bad hop count one by one", () => {
    expect(assertDeployedConfig({ ...good, HASH_SALT: "x".repeat(15) })).toEqual([expect.stringMatching(/^HASH_SALT:/)]);
    expect(assertDeployedConfig({ ...good, HASH_SALT: "x".repeat(16) })).toEqual([]);
    expect(assertDeployedConfig({ ...good, AUTH_SECRET: "x".repeat(31) })).toEqual([expect.stringMatching(/^AUTH_SECRET:/)]);
    expect(assertDeployedConfig({ ...good, AUTH_URL: "http://x.example.com" })).toEqual([expect.stringMatching(/^AUTH_URL:/)]);
    expect(assertDeployedConfig({ ...good, NEXT_PUBLIC_APP_URL: "ftp://x" })).toEqual([expect.stringMatching(/^NEXT_PUBLIC_APP_URL:/)]);
    for (const hops of ["-1", "1.5", "two", " "]) {
      expect(assertDeployedConfig({ ...good, TRUSTED_PROXY_HOPS: hops }), hops).toEqual([expect.stringMatching(/^TRUSTED_PROXY_HOPS:/)]);
    }
    // 0 means "no proxy in front", which would trust a header any visitor can forge.
    expect(assertDeployedConfig({ ...good, TRUSTED_PROXY_HOPS: "0" })).toEqual([expect.stringMatching(/^TRUSTED_PROXY_HOPS:/)]);
    expect(assertDeployedConfig({ ...good, TRUSTED_PROXY_HOPS: "1" })).toEqual([]);
    expect(assertDeployedConfig({ ...good, TRUSTED_PROXY_HOPS: "2" })).toEqual([]);
  });

  it("names each missing S3 variable when STORAGE_DRIVER is s3, so a deploy cannot boot and fail on the first upload", () => {
    for (const name of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
      const env = { ...good, [name]: "" };
      expect(assertDeployedConfig(env), name).toEqual([expect.stringMatching(new RegExp(`^${name}:`))]);
    }
    const { S3_ENDPOINT: _endpoint, S3_BUCKET: _bucket, ...rest } = good;
    expect(assertDeployedConfig(rest)).toHaveLength(2);
  });

  it("never puts a secret value in a message", () => {
    const problems = assertDeployedConfig({
      ...good,
      HASH_SALT: "change-me",
      AUTH_SECRET: SECRET_VALUES.AUTH_SECRET.slice(0, 20),
      AUTH_URL: "http://user:password-in-url@example.com",
      TRUSTED_PROXY_HOPS: "secret-hops-value",
      S3_SECRET_ACCESS_KEY: "",
    });
    const text = problems.join("\n");
    expect(problems.length).toBeGreaterThan(3);
    for (const value of [SECRET_VALUES.AUTH_SECRET.slice(0, 20), "password-in-url", "secret-hops-value", SECRET_VALUES.AUTH_GOOGLE_SECRET, SECRET_VALUES.HASH_SALT]) {
      expect(text).not.toContain(value);
    }
  });
});

describe("enforceDeployedConfig", () => {
  it("prints each problem on its own line and exits non-zero", () => {
    const write = vi.fn();
    const exit = vi.fn();
    enforceDeployedConfig({ DEPLOYED: "1", HASH_SALT: "change-me" }, { write, exit });
    expect(exit).toHaveBeenCalledWith(1);
    const lines = write.mock.calls.map((call) => String(call[0]));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.endsWith("\n") && line.indexOf("\n") === line.length - 1)).toBe(true);
    expect(lines.join("")).toContain("HASH_SALT");
  });

  it("does nothing for a safe or non-deployed environment", () => {
    const write = vi.fn();
    const exit = vi.fn();
    enforceDeployedConfig(good, { write, exit });
    enforceDeployedConfig({}, { write, exit });
    expect(write).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});