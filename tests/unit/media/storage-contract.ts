import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StorageDriver } from "@/server/media/storage-driver";

export type ContractHarness = { driver: StorageDriver; cleanup(): Promise<void> };

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

/**
 * The behaviour every StorageDriver must share. It runs against the local driver always, and against the S3 driver
 * when S3_TEST_* variables are set (slice 2 passes its own factory). Keys are unique per run, so a real bucket is safe.
 */
export function storageDriverContract(name: string, make: () => Promise<ContractHarness>) {
  describe(`shared driver suite (${name})`, () => {
    let harness: ContractHarness;
    let scratch: string;
    const run = randomUUID().slice(0, 8);

    beforeAll(async () => {
      harness = await make();
      scratch = await mkdtemp(join(tmpdir(), "majlis-contract-"));
    });

    afterAll(async () => {
      await harness.driver.deletePrefix(`events/contract-${run}`);
      await harness.driver.deletePrefix(`events/contract-${run}-a`);
      await harness.driver.deletePrefix(`events/contract-${run}-ab`);
      await harness.cleanup();
      await rm(scratch, { recursive: true, force: true });
    });

    it("stream, file download, upload from file and copy round trip", async () => {
      const driver = harness.driver;
      const source = `events/contract-${run}/u1/original`;
      await driver.putObject(source, Buffer.from("hello stream"), "text/plain");

      expect((await readAll(await driver.getObjectStream(source))).toString()).toBe("hello stream");

      const downloaded = join(scratch, "downloaded");
      await driver.downloadToFile(source, downloaded);
      expect((await readFile(downloaded)).toString()).toBe("hello stream");

      const local = join(scratch, "to-upload.mp4");
      await writeFile(local, Buffer.from("from a file"));
      const uploaded = `events/contract-${run}/u1/display.mp4`;
      await driver.putObjectFromFile(uploaded, local, "video/mp4");
      expect((await driver.getObject(uploaded)).toString()).toBe("from a file");

      const copied = `events/contract-${run}/u1/copy`;
      await driver.copyObject(source, copied);
      expect((await driver.getObject(copied)).toString()).toBe("hello stream");
      expect(await driver.stat(source)).toEqual({ size: 12 });
    });

    it("reading, downloading or copying a missing object rejects", async () => {
      const driver = harness.driver;
      const missing = `events/contract-${run}/nothing/original`;
      await expect(driver.getObjectStream(missing)).rejects.toThrow();
      await expect(driver.downloadToFile(missing, join(scratch, "never"))).rejects.toThrow();
      await expect(driver.copyObject(missing, `events/contract-${run}/nothing/copy`)).rejects.toThrow();
      expect(await driver.stat(`events/contract-${run}/nothing/copy`)).toBeNull();
    });

    it("deletePrefix events/a does not touch events/ab/", async () => {
      const driver = harness.driver;
      const a = `events/contract-${run}-a/u1/original`;
      const ab = `events/contract-${run}-ab/u1/original`;
      await driver.putObject(a, Buffer.from("a"), "text/plain");
      await driver.putObject(ab, Buffer.from("ab"), "text/plain");

      await driver.deletePrefix(`events/contract-${run}-a`);

      expect(await driver.stat(a)).toBeNull();
      expect(await driver.stat(ab)).toEqual({ size: 2 });
    });

    it("deletePrefix with and without a trailing slash", async () => {
      const driver = harness.driver;
      for (const suffix of ["", "/"]) {
        const prefix = `events/contract-${run}-slash${suffix ? "1" : "0"}`;
        const keep = `${prefix}x/u1/original`;
        const gone = `${prefix}/u1/original`;
        await driver.putObject(gone, Buffer.from("1"), "text/plain");
        await driver.putObject(keep, Buffer.from("22"), "text/plain");
        await driver.deletePrefix(`${prefix}${suffix}`);
        expect(await driver.stat(gone)).toBeNull();
        expect(await driver.stat(keep)).toEqual({ size: 2 });
        await driver.deletePrefix(`${prefix}x`);
      }
    });

    it("deletePrefix refuses an empty prefix, so it can never wipe the bucket", async () => {
      await expect(harness.driver.deletePrefix("")).rejects.toThrow();
      await expect(harness.driver.deletePrefix("/")).rejects.toThrow();
    });
  });
}
