import type { UploadKind } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, fakeState, resetFakeDb, type FakeEvent } from "../support/fake-db";
import { hugePng } from "../support/huge-png";
import { fakeStorage, setUpFakeStorage, tearDownFakeStorage } from "../support/fake-storage";

vi.mock("server-only", () => ({}));
const testEnv = vi.hoisted(() => ({ cap: undefined as number | undefined }));
vi.mock("@/lib/env", () => ({ env: () => ({ S3_MAX_OBJECT_BYTES: testEnv.cap, HASH_SALT: "test-salt-test-salt" }) }));
vi.mock("@/server/db", async () => ({ db: (await import("../support/fake-db")).fakeDb }));
vi.mock("@/server/media/storage", async () => (await import("../support/fake-storage")).storageModule);
vi.mock("@/server/events/service", async () => ({
  pendingUploadCount: async (eventId: string) => (await import("../support/fake-db")).fakeDb.upload.count({ where: { eventId, status: "PENDING" } }),
}));
vi.mock("@/server/uploads/processing", () => ({ enqueueProcessing: vi.fn(), publishUpload: vi.fn(async () => undefined) }));

const { startUpload, completeUpload } = await import("@/server/uploads/service");

type StartArgs = Parameters<typeof startUpload>[0];
const guest = { id: "g1", displayName: "Pak Mat" } as unknown as StartArgs["guest"];
const MB = 1024 * 1024;

let jpeg: Buffer;
let event: FakeEvent;

beforeAll(async () => {
  await setUpFakeStorage();
  jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#b33" } }).jpeg().toBuffer();
});
afterAll(tearDownFakeStorage);
afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  event = resetFakeDb();
  testEnv.cap = undefined;
});

/** Start an upload and return the key the signed URL is for (what the browser would PUT to). */
async function start(bytes: Buffer, kind: UploadKind = "PHOTO", mimeType = "image/jpeg") {
  const target = await startUpload({ event: event as unknown as StartArgs["event"], guest, kind, mimeType, sizeBytes: bytes.length });
  const signedKey = new URL(target.url, "http://localhost").searchParams.get("key")!;
  const base = `events/${event.id}/${target.uploadId}`;
  return { uploadId: target.uploadId, signedKey, incoming: `${base}/incoming`, original: `${base}/original` };
}

const complete = (uploadId: string) => completeUpload({ eventId: event.id, uploadId, guestId: guest.id });
const put = (key: string, bytes: Buffer) => fakeStorage.driver.putObject(key, bytes, "image/jpeg");

async function expectRejectedAndDeleted(uploadId: string, code: string, status: number, keys: string[]) {
  await expect(complete(uploadId)).rejects.toMatchObject({ code, status });
  for (const key of keys) expect(await fakeStorage.driver.stat(key)).toBeNull();
  expect(fakeState.uploads.find((u) => u.id === uploadId)?.status).toBe("FAILED");
  expect(event.uploadCount).toBe(0);
  expect(event.storageBytes).toBe(0n);
}

describe("startUpload", () => {
  it("signs the incoming key and stores the original key", async () => {
    const { signedKey, incoming, original, uploadId } = await start(jpeg);
    expect(signedKey).toBe(incoming);
    expect(fakeState.uploads.find((u) => u.id === uploadId)?.objectKey).toBe(original);
  });

  it("refuses a declared size above S3_MAX_OBJECT_BYTES before any upload row exists", async () => {
    testEnv.cap = 100;
    await expect(start(Buffer.alloc(500, 1))).rejects.toMatchObject({ code: "too_large", status: 413 });
    expect(fakeState.uploads).toHaveLength(0);
  });
});

describe("completeUpload", () => {
  it("completeUpload copies incoming to original and deletes incoming", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    await put(incoming, jpeg);

    expect(await complete(uploadId)).toEqual({ status: "READY" });

    expect(await fakeStorage.driver.getObject(original)).toEqual(jpeg);
    expect(await fakeStorage.driver.stat(incoming)).toBeNull();
    expect(event.uploadCount).toBe(1);
    expect(event.storageBytes).toBe(BigInt(jpeg.length));
    expect(fakeState.uploads[0]?.displayKey).toBe(`events/${event.id}/${uploadId}/display.jpg`);
  });

  it("completeUpload hands the stored content type to the copy, so guest-sent headers do not carry over", async () => {
    const copy = vi.spyOn(fakeStorage.driver, "copyObject");
    const { uploadId, incoming, original } = await start(jpeg);
    await put(incoming, jpeg);
    await complete(uploadId);
    expect(copy).toHaveBeenCalledWith(incoming, original, { contentType: "image/jpeg" });
  });

  it("a replaced incoming object cannot change original after complete", async () => {
    const { uploadId, signedKey, original } = await start(jpeg);
    await put(signedKey, jpeg);
    await complete(uploadId);

    // The signed URL is still valid for a while; whatever is PUT to it now must not reach what is served.
    await put(signedKey, Buffer.from("swapped after the check"));
    expect(await complete(uploadId)).toEqual({ status: "READY" });

    expect(await fakeStorage.driver.getObject(original)).toEqual(jpeg);
  });

  it("is idempotent on a retry after it already succeeded", async () => {
    const { uploadId, incoming } = await start(jpeg);
    await put(incoming, jpeg);
    await complete(uploadId);
    await complete(uploadId);
    expect(event.uploadCount).toBe(1);
    expect(event.storageBytes).toBe(BigInt(jpeg.length));
  });

  it("finishes when an earlier attempt already moved incoming to original but did not record it", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    await put(incoming, jpeg);
    await fakeStorage.driver.copyObject(incoming, original);
    await fakeStorage.driver.deleteObject(incoming);

    expect(await complete(uploadId)).toEqual({ status: "READY" });
    expect(event.uploadCount).toBe(1);
  });

  it("answers not_uploaded while nothing has arrived, and leaves the upload pending", async () => {
    const { uploadId } = await start(jpeg);
    await expect(complete(uploadId)).rejects.toMatchObject({ code: "not_uploaded", status: 409 });
    expect(fakeState.uploads[0]?.status).toBe("PENDING");
  });

  it("rejects when actual size differs from declared", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    await put(incoming, Buffer.concat([jpeg, Buffer.alloc(10)]));
    await expectRejectedAndDeleted(uploadId, "invalid_file", 422, [incoming, original]);
  });

  it("rejects an empty object", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    await put(incoming, Buffer.alloc(0));
    await expectRejectedAndDeleted(uploadId, "invalid_file", 422, [incoming, original]);
  });

  it("rejects bytes that are not the declared kind of file", async () => {
    const text = Buffer.from("this is not a picture at all, just some text");
    const { uploadId, incoming, original } = await start(text);
    await put(incoming, text);
    await expectRejectedAndDeleted(uploadId, "invalid_file", 422, [incoming, original]);
  });

  it("rejects a photo with more pixels than the limit as invalid_file and deletes it", async () => {
    const huge = hugePng(12000, 12000);
    const { uploadId, incoming, original } = await start(huge, "PHOTO", "image/png");
    await put(incoming, huge);
    await expectRejectedAndDeleted(uploadId, "invalid_file", 422, [incoming, original]);
  });

  it("rejects above min(kind limit, plan.maxUploadBytes): the plan cap", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    event.plan.maxUploadBytes = BigInt(jpeg.length - 1); // lowered after the URL was issued
    await put(incoming, jpeg);
    await expectRejectedAndDeleted(uploadId, "too_large", 413, [incoming, original]);
  });

  it("rejects above min(kind limit, plan.maxUploadBytes): the kind limit", async () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(15 * MB)]); // still starts like a JPEG, but over the 15 MB photo limit
    const { uploadId, incoming, original } = await start(jpeg);
    fakeState.uploads[0]!.sizeBytes = BigInt(big.length); // declared == actual, so only the limit can reject it
    await put(incoming, big);
    await expectRejectedAndDeleted(uploadId, "too_large", 413, [incoming, original]);
  });

  it("rejects when it would pass storageLimitBytes", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    event.plan.storageLimitBytes = BigInt(jpeg.length * 3);
    event.storageBytes = BigInt(jpeg.length * 2 + 1); // other uploads finished meanwhile
    await put(incoming, jpeg);
    await expect(complete(uploadId)).rejects.toMatchObject({ code: "storage_full", status: 409 });
    for (const key of [incoming, original]) expect(await fakeStorage.driver.stat(key)).toBeNull();
    expect(fakeState.uploads[0]?.status).toBe("FAILED");
    expect(event.uploadCount).toBe(0);
  });

  it("rejects above S3_MAX_OBJECT_BYTES", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    testEnv.cap = jpeg.length - 1;
    await put(incoming, jpeg);
    await expectRejectedAndDeleted(uploadId, "too_large", 413, [incoming, original]);
  });

  it("a second complete for the same upload does not count it twice", async () => {
    const { uploadId, incoming } = await start(jpeg);
    await put(incoming, jpeg);
    const stale = { ...fakeState.uploads[0]! }; // what a double submit read before the first call finished
    expect(await complete(uploadId)).toEqual({ status: "READY" });

    vi.spyOn(fakeDb.upload, "findFirst").mockResolvedValueOnce(stale);
    expect(await complete(uploadId)).toEqual({ status: "READY" });

    expect(event.uploadCount).toBe(1);
    expect(event.storageBytes).toBe(BigInt(jpeg.length));
  });

  it("complete after the sweep marked it FAILED stays FAILED", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    await put(incoming, jpeg);
    // The sweep runs while this call is making the web copies: it has already read the row as PENDING.
    const realPut = fakeStorage.driver.putObject.bind(fakeStorage.driver);
    vi.spyOn(fakeStorage.driver, "putObject").mockImplementation(async (key, body, type) => {
      if (key.endsWith("display.jpg")) fakeState.uploads[0]!.status = "FAILED";
      return realPut(key, body, type);
    });

    await expect(complete(uploadId)).rejects.toMatchObject({ code: "invalid_file", status: 422 });

    expect(fakeState.uploads[0]?.status).toBe("FAILED");
    expect(event.uploadCount).toBe(0);
    expect(event.storageBytes).toBe(0n);
    // Whatever this call wrote after the sweep deleted the files goes too.
    expect(await fakeStorage.driver.stat(original)).toBeNull();
    expect(await fakeStorage.driver.stat(`events/${event.id}/${uploadId}/display.jpg`)).toBeNull();
  });

  it("two completes near the limit: only one fits", async () => {
    event.plan.storageLimitBytes = BigInt(jpeg.length + 10); // room for one file, not two
    const first = await start(jpeg);
    const second = await start(jpeg);
    await put(first.incoming, jpeg);
    await put(second.incoming, jpeg);

    // Both read the event before either finished, so both pass the early check; only the counting step can decide.
    const results = await Promise.allSettled([complete(first.uploadId), complete(second.uploadId)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "storage_full", status: 409 });
    expect(event.uploadCount).toBe(1);
    expect(event.storageBytes).toBe(BigInt(jpeg.length));

    const [loser, winner] = results[0]?.status === "rejected" ? [first, second] : [second, first];
    const loserRow = fakeState.uploads.find((u) => u.id === loser.uploadId)!;
    expect(loserRow.status).toBe("FAILED");
    expect(loserRow.displayKey).toBeNull(); // the claim was rolled back, not kept
    expect(await fakeStorage.driver.stat(loser.original)).toBeNull();
    expect(fakeState.uploads.find((u) => u.id === winner.uploadId)?.status).toBe("READY");
    expect(await fakeStorage.driver.stat(winner.original)).not.toBeNull();
  });

  it("a copy that was made but whose incoming delete failed completes on retry without counting twice", async () => {
    const { uploadId, incoming, original } = await start(jpeg);
    await put(incoming, jpeg);
    vi.spyOn(fakeStorage.driver, "deleteObject").mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(complete(uploadId)).rejects.toThrow("storage unavailable");
    expect(await fakeStorage.driver.stat(original)).not.toBeNull();
    expect(fakeState.uploads[0]?.status).toBe("PENDING");
    expect(event.uploadCount).toBe(0);

    expect(await complete(uploadId)).toEqual({ status: "READY" });
    expect(await complete(uploadId)).toEqual({ status: "READY" });
    expect(await fakeStorage.driver.stat(incoming)).toBeNull();
    expect(event.uploadCount).toBe(1);
    expect(event.storageBytes).toBe(BigInt(jpeg.length));
  });
});