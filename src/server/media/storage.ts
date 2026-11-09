import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { LocalStorageDriver } from "./local-storage";
import { S3StorageDriver } from "./s3-storage";
import type { StorageDriver } from "./storage-driver";

/** Key for signing storage URLs, derived from AUTH_SECRET so there is one less secret to manage. */
export function storageSecret(): string {
  return createHash("sha256").update(`storage:${env().AUTH_SECRET}`).digest("base64url");
}

let local: LocalStorageDriver | undefined;

/** The local disk driver, or null when another driver is configured. Only the /api/storage routes need it. */
export function localDriver(): LocalStorageDriver | null {
  if (env().STORAGE_DRIVER !== "local") return null;
  local ??= new LocalStorageDriver(env().LOCAL_MEDIA_DIR, storageSecret());
  return local;
}

let s3: S3StorageDriver | undefined;

const S3_VARIABLES = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;

/** The S3 driver from the S3_* variables. Names every missing variable, never a value. */
function s3Driver(): S3StorageDriver {
  if (s3) return s3;
  const config = env();
  const { S3_ENDPOINT: endpoint, S3_REGION: region, S3_BUCKET: bucket } = config;
  const { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = config;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    const missing = S3_VARIABLES.filter((name) => !config[name]);
    throw new Error(`STORAGE_DRIVER=s3 needs ${missing.join(", ")}. See .env.example.`);
  }
  s3 = new S3StorageDriver({ endpoint, region, bucket, accessKeyId, secretAccessKey });
  return s3;
}

/**
 * At server start: with STORAGE_DRIVER=s3, build the driver now so a missing S3_* variable stops the server with a
 * clear message instead of failing on the first guest upload. Names only, never values. Does nothing for the local driver.
 */
export function enforceStorageConfig(
  io: { write: (text: string) => void; exit: (code: number) => void } = {
    write: (text) => void process.stderr.write(text),
    exit: (code) => process.exit(code),
  },
): void {
  if (env().STORAGE_DRIVER !== "s3") return;
  try {
    s3Driver();
  } catch (error) {
    io.write(`[config] ${error instanceof Error ? error.message : "storage is not configured"}
`);
    io.exit(1);
  }
}

/** The configured driver, as the interface: callers must not depend on which one it is. */
export function storage(): StorageDriver {
  if (env().STORAGE_DRIVER === "s3") return s3Driver();
  const driver = localDriver();
  if (!driver) throw new Error("No storage driver is configured");
  return driver;
}

/** How long signed media URLs stay valid. */
export const MEDIA_URL_TTL_SEC = 60 * 60;
export const UPLOAD_URL_TTL_SEC = 15 * 60;
