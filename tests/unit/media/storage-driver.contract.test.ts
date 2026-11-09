import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorageDriver } from "@/server/media/local-storage";
import { storageDriverContract } from "./storage-contract";

storageDriverContract("local", async () => {
  const dir = await mkdtemp(join(tmpdir(), "majlis-media-"));
  return {
    driver: new LocalStorageDriver(dir, "test-secret-test-secret"),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
});
