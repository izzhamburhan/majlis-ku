import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { LocalStorageDriver } from "./local-storage";
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

/** The configured driver, as the interface: callers must not depend on which one it is. */
export function storage(): StorageDriver {
  const driver = localDriver();
  if (!driver) throw new Error("Only STORAGE_DRIVER=local is implemented. An S3/R2 driver comes with hosting.");
  return driver;
}

/** How long signed media URLs stay valid. */
export const MEDIA_URL_TTL_SEC = 60 * 60;
export const UPLOAD_URL_TTL_SEC = 15 * 60;
