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

describe("storage()", () => {
  it("storage() throws a clear message when an S3 variable is missing", async () => {
    const { S3_BUCKET: _bucket, S3_REGION: _region, ...partial } = S3;
    const { storage } = await load({ ...BASE, ...partial });
    expect(() => storage()).toThrow(/S3_BUCKET/);
    expect(() => storage()).toThrow(/S3_REGION/);
    expect(() => storage()).not.toThrow(/S3_ENDPOINT/);
  });

  it("returns an S3 driver built from the S3 variables, as one shared instance", async () => {
    const { storage, localDriver } = await load({ ...BASE, ...S3 });
    const { S3StorageDriver } = await import("@/server/media/s3-storage");
    expect(storage()).toBeInstanceOf(S3StorageDriver);
    expect(storage()).toBe(storage());
    expect(localDriver()).toBeNull();
  });

  it("returns the local driver by default", async () => {
    const { storage, localDriver } = await load(BASE);
    expect(storage()).toBe(localDriver());
  });
});

describe("/api/storage routes under the S3 driver", () => {
  it("/api/storage routes return 404 when the driver is s3", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({ env: () => parseEnv({ ...BASE, ...S3 }) }));
    const { signStorageUrl } = await import("@/server/media/signing");
    const { storageSecret } = await import("@/server/media/storage");
    const upload = await import("@/app/api/storage/upload/route");
    const file = await import("@/app/api/storage/file/route");

    const putPath = signStorageUrl({
      action: "put",
      key: "events/e1/u1/incoming",
      expiresInSec: 60,
      maxBytes: 100,
      secret: storageSecret(),
    });
    const putResponse = await upload.PUT(
      new Request(`http://localhost${putPath}`, { method: "PUT", body: "x", headers: { "content-length": "1" } }),
    );
    expect(putResponse.status).toBe(404);

    const getPath = signStorageUrl({ action: "get", key: "events/e1/u1/original", expiresInSec: 60, secret: storageSecret() });
    const getResponse = await file.GET(new Request(`http://localhost${getPath}`));
    expect(getResponse.status).toBe(404);
  });
});