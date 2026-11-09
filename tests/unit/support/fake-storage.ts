import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorageDriver } from "@/server/media/local-storage";

// A real LocalStorageDriver in a temporary folder, standing in for "@/server/media/storage" in service tests.

export const fakeStorage = { dir: "", driver: undefined as unknown as LocalStorageDriver };

export async function setUpFakeStorage(): Promise<void> {
  fakeStorage.dir = await mkdtemp(join(tmpdir(), "majlis-svc-"));
  fakeStorage.driver = new LocalStorageDriver(fakeStorage.dir, "test-secret-test-secret");
}

export async function tearDownFakeStorage(): Promise<void> {
  await rm(fakeStorage.dir, { recursive: true, force: true });
}

export const storageModule = {
  storage: () => fakeStorage.driver,
  localDriver: () => fakeStorage.driver,
  storageSecret: () => "test-secret-test-secret",
  UPLOAD_URL_TTL_SEC: 900,
  MEDIA_URL_TTL_SEC: 3600,
};
