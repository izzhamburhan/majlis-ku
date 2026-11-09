import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, fakeState, resetFakeDb, type FakeEvent } from "../support/fake-db";
import { fakeStorage, setUpFakeStorage, tearDownFakeStorage } from "../support/fake-storage";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", async () => ({ db: (await import("../support/fake-db")).fakeDb }));
vi.mock("@/server/media/storage", async () => (await import("../support/fake-storage")).storageModule);
vi.mock("@/server/gallery/items", () => ({ uploadToItem: vi.fn(), wishToItem: vi.fn() }));
vi.mock("@/server/realtime/bus", () => ({ bus: { publish: vi.fn() } }));

const { processMedia } = await import("@/server/uploads/processing");

let tmpRoot: string;
const roots: string[] = [];
let event: FakeEvent;
let poster: Buffer;

beforeAll(async () => {
  await setUpFakeStorage();
  poster = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#369" } }).jpeg().toBuffer();
});
afterAll(tearDownFakeStorage);
beforeEach(async () => {
  event = resetFakeDb({ uploadCount: 1, storageBytes: 11n });
  tmpRoot = await mkdtemp(join(tmpdir(), "majlis-proc-test-"));
  roots.push(tmpRoot);
});

async function addProcessing(kind: "VIDEO" | "VOICE") {
  const row = await fakeDb.upload.create({
    data: { eventId: "ev1", kind, status: "PROCESSING", mimeType: kind === "VIDEO" ? "video/mp4" : "audio/webm", sizeBytes: 11n, objectKey: "events/ev1/pending/original" },
  });
  const original = `events/ev1/${row.id}/original`;
  await fakeStorage.driver.putObject(original, Buffer.from("raw original"), "video/mp4");
  row.objectKey = original;
  return { row, original };
}

const leftovers = () => readdir(tmpRoot);

describe("processMedia", () => {
  it("processing leaves no temporary files when ffmpeg fails", async () => {
    const { row } = await addProcessing("VIDEO");
    let seenInput = "";
    let seenInputText = "";
    const makeVideoCopies = vi.fn(async (input: string, outDir: string) => {
      seenInput = input;
      seenInputText = (await readFile(input)).toString(); // the original was downloaded to a temporary file
      await writeFile(join(outDir, "display.mp4"), "half written");
      throw new Error("ffmpeg exited with 1: boom");
    });

    await processMedia(row.id, { makeVideoCopies, makeVoiceCopy: vi.fn(), tmpRoot });

    expect(seenInput.startsWith(tmpRoot)).toBe(true);
    expect(seenInputText).toBe("raw original");
    expect(await leftovers()).toEqual([]);
    expect(fakeState.uploads[0]?.status).toBe("FAILED");
    expect(await fakeStorage.driver.stat(`events/ev1/${row.id}/original`)).toBeNull();
    expect(event.uploadCount).toBe(0);
    await expect(access(seenInput)).rejects.toThrow();
  });

  it("uploads the video copies from files and removes the temporary files", async () => {
    const { row } = await addProcessing("VIDEO");
    const makeVideoCopies = vi.fn(async (_input: string, outDir: string) => {
      await writeFile(join(outDir, "display.mp4"), "web video");
      await writeFile(join(outDir, "poster.jpg"), poster);
      return { video: join(outDir, "display.mp4"), poster: join(outDir, "poster.jpg"), durationSec: 2.4 };
    });

    await processMedia(row.id, { makeVideoCopies, makeVoiceCopy: vi.fn(), tmpRoot });

    expect(fakeState.uploads[0]).toMatchObject({ status: "READY", durationSec: 2, displayKey: `events/ev1/${row.id}/display.mp4`, thumbKey: `events/ev1/${row.id}/thumb.webp` });
    expect((await fakeStorage.driver.getObject(`events/ev1/${row.id}/display.mp4`)).toString()).toBe("web video");
    expect(await fakeStorage.driver.stat(`events/ev1/${row.id}/thumb.webp`)).not.toBeNull();
    expect(await leftovers()).toEqual([]);
  });

  it("uploads the voice copy from a file and removes the temporary files", async () => {
    const { row } = await addProcessing("VOICE");
    const makeVoiceCopy = vi.fn(async (_input: string, outDir: string) => {
      await writeFile(join(outDir, "display.m4a"), "web voice");
      return { audio: join(outDir, "display.m4a"), durationSec: 5 };
    });

    await processMedia(row.id, { makeVideoCopies: vi.fn(), makeVoiceCopy, tmpRoot });

    expect(fakeState.uploads[0]).toMatchObject({ status: "READY", displayKey: `events/ev1/${row.id}/display.m4a` });
    expect((await fakeStorage.driver.getObject(`events/ev1/${row.id}/display.m4a`)).toString()).toBe("web voice");
    expect(await leftovers()).toEqual([]);
  });

  it("removes temporary files when the video is too long", async () => {
    const { row } = await addProcessing("VIDEO");
    const makeVideoCopies = vi.fn(async (_input: string, outDir: string) => {
      await writeFile(join(outDir, "display.mp4"), "x");
      await writeFile(join(outDir, "poster.jpg"), poster);
      return { video: join(outDir, "display.mp4"), poster: join(outDir, "poster.jpg"), durationSec: 999 };
    });
    await processMedia(row.id, { makeVideoCopies, makeVoiceCopy: vi.fn(), tmpRoot });
    expect(fakeState.uploads[0]?.status).toBe("FAILED");
    expect(await leftovers()).toEqual([]);
  });
});

afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
});
