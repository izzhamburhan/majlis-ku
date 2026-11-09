import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/lib/env";

vi.mock("server-only", () => ({}));

const BASE = {
  DATABASE_URL: "postgresql://u:p@localhost:5433/db",
  AUTH_SECRET: "x".repeat(32),
  HASH_SALT: "salt-salt-salt-salt",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};
const S3 = {
  STORAGE_DRIVER: "s3",
  S3_ENDPOINT: "https://abcdefgh.storage.supabase.co/storage/v1/s3",
  S3_REGION: "ap-southeast-1",
  S3_BUCKET: "media",
  S3_ACCESS_KEY_ID: "AKIATESTTESTTESTTEST",
  S3_SECRET_ACCESS_KEY: "secret-secret-secret-secret-secret-0",
};

async function load(source: Record<string, string | undefined>) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({ env: () => parseEnv(source) }));
  return import("@/server/media/storage");
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock("@/lib/env"));

describe("enforceStorageConfig (start-up check)", () => {
  it("names each missing S3 variable and exits non-zero, without waiting for the first upload", async () => {
    const { S3_BUCKET: _bucket, S3_SECRET_ACCESS_KEY: _secret, ...partial } = S3;
    const { enforceStorageConfig } = await load({ ...BASE, ...partial });
    const write = vi.fn();
    const exit = vi.fn();
    enforceStorageConfig({ write, exit });
    expect(exit).toHaveBeenCalledWith(1);
    const text = write.mock.calls.map((call) => String(call[0])).join("");
    expect(text).toContain("S3_BUCKET");
    expect(text).toContain("S3_SECRET_ACCESS_KEY");
    expect(text).not.toContain("S3_ENDPOINT");
    expect(text).not.toContain(S3.S3_ACCESS_KEY_ID);
  });

  it("does nothing for a complete S3 configuration or for the local driver", async () => {
    for (const source of [{ ...BASE, ...S3 }, BASE]) {
      const { enforceStorageConfig } = await load(source);
      const write = vi.fn();
      const exit = vi.fn();
      enforceStorageConfig({ write, exit });
      expect(write).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
    }
  });
});

describe("start-up wiring", () => {
  it("instrumentation-node runs the storage check", async () => {
    vi.resetModules();
    const enforceStorageConfig = vi.fn();
    vi.doMock("@/server/media/storage", () => ({ enforceStorageConfig }));
    vi.doMock("@/server/retention/schedule", () => ({ startPurgeSchedule: vi.fn() }));
    vi.doMock("@/server/uploads/processing", () => ({ resumeProcessing: vi.fn(async () => 0) }));
    await import("@/instrumentation-node");
    expect(enforceStorageConfig).toHaveBeenCalledTimes(1);
    vi.doUnmock("@/server/media/storage");
    vi.doUnmock("@/server/retention/schedule");
    vi.doUnmock("@/server/uploads/processing");
  });
});