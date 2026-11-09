import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { S3Client } from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { S3StorageDriver, type S3StorageConfig } from "@/server/media/s3-storage";
import { storageDriverContract } from "./storage-contract";

// Every file handle the driver opens is recorded, with its close() spied on; the real fs does the work.
const fsSpy = vi.hoisted(() => ({ handles: [] as { close: MockInstance<() => Promise<void>> }[] }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      fsSpy.handles.push({ close: vi.spyOn(handle, "close") });
      return handle;
    },
  };
});

/*
 * The shared driver suite runs against a real bucket only when ALL of these are set, and is skipped (and reported
 * as skipped) otherwise. Use a throwaway bucket: keys are unique per run and removed afterwards.
 *   S3_TEST_ENDPOINT, S3_TEST_REGION, S3_TEST_BUCKET, S3_TEST_ACCESS_KEY_ID, S3_TEST_SECRET_ACCESS_KEY
 * Everything else in this file runs offline.
 */

const CONFIG: S3StorageConfig = {
  endpoint: "https://abcdefgh.storage.supabase.co/storage/v1/s3",
  region: "ap-southeast-1",
  bucket: "media",
  accessKeyId: "AKIATESTTESTTESTTEST",
  secretAccessKey: "secret-secret-secret-secret-secret-0",
};

type Sent = { name: string; input: Record<string, unknown> };

/** A stand-in client that records each command and answers from a queue. */
function fakeClient(responses: unknown[] = [], respond?: (call: Sent) => unknown) {
  const sent: Sent[] = [];
  const send = vi.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
    const call = { name: command.constructor.name, input: command.input };
    sent.push(call);
    const next = respond ? respond(call) : responses.shift();
    if (next instanceof Error) throw next;
    return next ?? {};
  });
  // The driver only calls send() in these tests (no presigning), so a partial client is enough.
  return { client: { send } as unknown as S3Client, sent };
}

function params(url: string) {
  const parsed = new URL(url);
  return { parsed, query: parsed.searchParams, signed: (parsed.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";") };
}

describe("S3StorageDriver presigned URLs (offline)", () => {
  const driver = new S3StorageDriver(CONFIG);

  it("presigned PUT signs content type, length and the incoming key, path style host, 900 s expiry", async () => {
    const target = await driver.createUploadUrl("events/e1/u1/incoming", {
      contentType: "image/jpeg",
      maxBytes: 5_000_000,
      expiresInSec: 900,
      sizeBytes: 12345,
    });
    expect(target.method).toBe("PUT");
    expect(target.headers).toEqual({});
    const { parsed, query, signed } = params(target.url);
    expect(parsed.host).toBe("abcdefgh.storage.supabase.co");
    expect(parsed.pathname).toBe("/storage/v1/s3/media/events/e1/u1/incoming");
    expect(query.get("X-Amz-Expires")).toBe("900");
    expect(signed).toContain("content-type");
    expect(signed).toContain("content-length");
    // A browser cannot send SDK checksum headers, so none may be part of the signature.
    expect(target.url.toLowerCase()).not.toContain("checksum");
  });

  it("does not sign a content length when the size is not given", async () => {
    const target = await driver.createUploadUrl("events/e1/u1/incoming", {
      contentType: "image/jpeg",
      maxBytes: 5_000_000,
      expiresInSec: 60,
    });
    const { signed } = params(target.url);
    expect(signed).toContain("content-type");
    expect(signed).not.toContain("content-length");
  });

  it("presigned GET expires in 3600 s and sets response-content-disposition with the filename", async () => {
    const url = await driver.getDownloadUrl("events/e1/u1/original", { expiresInSec: 3600, filename: "kenduri photo.jpg" });
    const { parsed, query } = params(url);
    expect(parsed.host).toBe("abcdefgh.storage.supabase.co");
    expect(parsed.pathname).toBe("/storage/v1/s3/media/events/e1/u1/original");
    expect(query.get("X-Amz-Expires")).toBe("3600");
    expect(query.get("response-content-disposition")).toMatch(/^attachment;.*filename/);
    expect(query.get("response-content-disposition")).toContain("kenduri photo.jpg");
  });

  it("a hostile filename leaves no CR, LF or quote inside the response-content-disposition value", async () => {
    const hostile = 'evil"; filename="x.exe\r\nSet-Cookie: a=b\nX: é "quoted" \\ kenduri‮.jpg';
    const url = await driver.getDownloadUrl("events/e1/u1/original", { expiresInSec: 600, filename: hostile });
    const disposition = params(url).query.get("response-content-disposition") ?? "";
    expect(disposition).not.toMatch(/[\r\n]/);
    // The only quotes left are the pair around the ASCII fallback name.
    expect(disposition.match(/"/g)).toHaveLength(2);
    expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]*"; filename\*=UTF-8''[A-Za-z0-9%._~-]*$/);
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1]!)).toBe(hostile);
  });

  it("percent-encodes ' ( ) * ! in the UTF-8 filename, which encodeURIComponent leaves as they are", async () => {
    const url = await driver.getDownloadUrl("events/e1/u1/original", { expiresInSec: 600, filename: "it's (a) *big* day!.jpg" });
    const disposition = params(url).query.get("response-content-disposition") ?? "";
    const encoded = disposition.split("filename*=UTF-8''")[1]!;
    expect(encoded).not.toMatch(/['()*!]/);
    expect(encoded).toBe("it%27s%20%28a%29%20%2Abig%2A%20day%21.jpg");
  });

  it("presigned GET without a filename sets no content disposition", async () => {
    const url = await driver.getDownloadUrl("events/e1/u1/display.jpg", { expiresInSec: 600 });
    expect(params(url).query.has("response-content-disposition")).toBe(false);
  });
});

describe("S3StorageDriver calls the client with the right input", () => {
  let scratch: string;
  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), "majlis-s3-"));
  });
  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("stat, readHead, getObject, deleteObject, copyObject and putObjectFromFile call the client with the right input", async () => {
    const notFound = Object.assign(new Error("nope"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    const { client, sent } = fakeClient([
      { ContentLength: 42 }, // stat
      notFound, // stat of a missing object
      { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }, // readHead
      { Body: { transformToByteArray: async () => new Uint8Array([4, 5]) } }, // getObject
      {}, // deleteObject
      {}, // copyObject
      {}, // putObject (from file)
    ]);
    const driver = new S3StorageDriver(CONFIG, client);

    expect(await driver.stat("events/e1/u1/original")).toEqual({ size: 42 });
    expect(await driver.stat("events/e1/u1/missing")).toBeNull();
    expect(await driver.readHead("events/e1/u1/original", 16)).toEqual(Buffer.from([1, 2, 3]));
    expect(await driver.getObject("events/e1/u1/original")).toEqual(Buffer.from([4, 5]));
    await driver.deleteObject("events/e1/u1/incoming");
    await driver.copyObject("events/e1/u1/incoming", "events/e1/u1/original");
    const file = join(scratch, "clip.mp4");
    await writeFile(file, Buffer.from("0123456789"));
    await driver.putObjectFromFile("events/e1/u1/display.mp4", file, "video/mp4");

    expect(sent.map((call) => call.name)).toEqual([
      "HeadObjectCommand",
      "HeadObjectCommand",
      "GetObjectCommand",
      "GetObjectCommand",
      "DeleteObjectCommand",
      "CopyObjectCommand",
      "PutObjectCommand",
    ]);
    expect(sent[0]!.input).toEqual({ Bucket: "media", Key: "events/e1/u1/original" });
    expect(sent[2]!.input).toEqual({ Bucket: "media", Key: "events/e1/u1/original", Range: "bytes=0-15" });
    expect(sent[3]!.input).toEqual({ Bucket: "media", Key: "events/e1/u1/original" });
    expect(sent[4]!.input).toEqual({ Bucket: "media", Key: "events/e1/u1/incoming" });
    expect(sent[5]!.input).toEqual({
      Bucket: "media",
      Key: "events/e1/u1/original",
      CopySource: "media/events/e1/u1/incoming",
    });
    expect(sent[6]!.input).toMatchObject({
      Bucket: "media",
      Key: "events/e1/u1/display.mp4",
      ContentType: "video/mp4",
      ContentLength: 10,
    });
  });

  it("copyObject encodes each key segment in CopySource", async () => {
    const { client, sent } = fakeClient();
    await new S3StorageDriver(CONFIG, client).copyObject("events/e1/u1/a b+c", "events/e1/u1/d");
    expect(sent[0]!.input.CopySource).toBe("media/events/e1/u1/a%20b%2Bc");
  });

  it("stat rethrows an error that is not a missing object", async () => {
    const { client } = fakeClient([Object.assign(new Error("denied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } })]);
    await expect(new S3StorageDriver(CONFIG, client).stat("events/e1/u1/original")).rejects.toThrow("denied");
  });

  it("getObjectStream returns the body as a Node stream and downloadToFile writes it to disk", async () => {
    const { client } = fakeClient([{ Body: Readable.from([Buffer.from("hello ")]) }, { Body: Readable.from([Buffer.from("file")]) }]);
    const driver = new S3StorageDriver(CONFIG, client);
    const stream = await driver.getObjectStream("events/e1/u1/original");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
    expect(Buffer.concat(chunks).toString()).toBe("hello ");

    const target = join(scratch, "deep", "downloaded");
    await driver.downloadToFile("events/e1/u1/original", target);
    expect((await readFile(target)).toString()).toBe("file");
  });

  it("readHead never returns more than the bytes asked for, even if the store sends more", async () => {
    const { client } = fakeClient([{ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3, 4, 5, 6]) } }]);
    expect(await new S3StorageDriver(CONFIG, client).readHead("events/e1/u1/original", 4)).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("getObjectStream accepts any stream with pipe(), not only this realm's Readable, and refuses other bodies", async () => {
    const foreign = Object.assign(new EventEmitter(), { pipe: () => undefined });
    const { client } = fakeClient([{ Body: foreign }, { Body: { transformToByteArray: async () => new Uint8Array() } }, {}]);
    const driver = new S3StorageDriver(CONFIG, client);
    expect(await driver.getObjectStream("events/e1/u1/original")).toBe(foreign);
    await expect(driver.getObjectStream("events/e1/u1/original")).rejects.toThrow(/not a Node stream/);
    await expect(driver.getObjectStream("events/e1/u1/original")).rejects.toThrow(/not a Node stream/);
  });

  it("putObjectFromFile sends exactly the file's bytes (across read chunks) and closes the file handle", async () => {
    const bytes = randomBytes(2.5 * 1024 * 1024);
    const file = join(scratch, "big.bin");
    await writeFile(file, bytes);
    let received = Buffer.alloc(0);
    let handleOpenAtSend = false;
    const client = {
      send: async (command: { input: { Body: Readable } }) => {
        const chunks: Buffer[] = [];
        for await (const chunk of command.input.Body) chunks.push(Buffer.from(chunk as Uint8Array));
        received = Buffer.concat(chunks);
        handleOpenAtSend = fsSpy.handles.length > 0 && fsSpy.handles.every((handle) => handle.close.mock.calls.length === 0);
        return {};
      },
    } as unknown as S3Client;
    fsSpy.handles.length = 0;

    await new S3StorageDriver(CONFIG, client).putObjectFromFile("events/e1/u1/display.mp4", file, "video/mp4");

    expect(received.equals(bytes)).toBe(true);
    expect(handleOpenAtSend).toBe(true);
    expect(fsSpy.handles).toHaveLength(1);
    expect(fsSpy.handles[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("putObjectFromFile closes the file handle when the upload fails", async () => {
    const file = join(scratch, "small.bin");
    await writeFile(file, Buffer.from("abc"));
    fsSpy.handles.length = 0;
    const { client } = fakeClient([new Error("network down")]);

    await expect(new S3StorageDriver(CONFIG, client).putObjectFromFile("events/e1/u1/x", file, "video/mp4")).rejects.toThrow("network down");

    expect(fsSpy.handles).toHaveLength(1);
    expect(fsSpy.handles[0]!.close).toHaveBeenCalledTimes(1);
  });

  it("putObject sends the body and content type", async () => {
    const { client, sent } = fakeClient();
    await new S3StorageDriver(CONFIG, client).putObject("events/e1/u1/thumb.webp", Buffer.from("x"), "image/webp");
    expect(sent[0]!.name).toBe("PutObjectCommand");
    expect(sent[0]!.input).toMatchObject({ Bucket: "media", Key: "events/e1/u1/thumb.webp", ContentType: "image/webp" });
  });
});

describe("S3StorageDriver.deletePrefix", () => {
  function listing(keys: string[], next?: string) {
    return { Contents: keys.map((Key) => ({ Key })), IsTruncated: next !== undefined, NextContinuationToken: next };
  }
  const keys = (from: number, count: number) => Array.from({ length: count }, (_, i) => `events/a/u${from + i}/original`);

  it("deletePrefix pages ListObjectsV2 and deletes in batches of 1000", async () => {
    const pages: Record<string, unknown> = {
      first: listing(keys(0, 1500), "page2"),
      page2: listing(keys(1500, 1500), "page3"),
      page3: listing(keys(3000, 100)),
    };
    const { client, sent } = fakeClient([], (call) =>
      call.name === "ListObjectsV2Command" ? pages[(call.input.ContinuationToken as string | undefined) ?? "first"] : {},
    );
    await new S3StorageDriver(CONFIG, client).deletePrefix("events/a");

    const lists = sent.filter((call) => call.name === "ListObjectsV2Command");
    expect(lists.map((call) => call.input)).toEqual([
      { Bucket: "media", Prefix: "events/a/" },
      { Bucket: "media", Prefix: "events/a/", ContinuationToken: "page2" },
      { Bucket: "media", Prefix: "events/a/", ContinuationToken: "page3" },
    ]);
    const deletes = sent.filter((call) => call.name === "DeleteObjectsCommand");
    const batches = deletes.map((call) => (call.input.Delete as { Objects: { Key: string }[] }).Objects);
    expect(batches.every((batch) => batch.length <= 1000)).toBe(true);
    expect(batches.flat()).toHaveLength(3100);
    expect(new Set(batches.flat().map((object) => object.Key)).size).toBe(3100);
    expect(batches.flat().every((object) => object.Key.startsWith("events/a/"))).toBe(true);
    expect(deletes.every((call) => (call.input.Delete as { Quiet?: boolean }).Quiet === true)).toBe(true);
  });

  it("deletePrefix does not double the trailing slash, and events/a never lists events/ab/", async () => {
    const { client, sent } = fakeClient([listing([])]);
    await new S3StorageDriver(CONFIG, client).deletePrefix("events/a/");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.input.Prefix).toBe("events/a/");
    expect((sent[0]!.input.Prefix as string).startsWith("events/ab/")).toBe(false);
  });

  it("deletePrefix refuses an empty prefix", async () => {
    const { client, sent } = fakeClient();
    const driver = new S3StorageDriver(CONFIG, client);
    await expect(driver.deletePrefix("")).rejects.toThrow();
    await expect(driver.deletePrefix("/")).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });

  it("deletePrefix fails loudly when the bucket reports a per-key delete error", async () => {
    const { client } = fakeClient([], (call) =>
      call.name === "ListObjectsV2Command" ? listing(["events/a/u1/original"]) : { Errors: [{ Key: "events/a/u1/original", Code: "AccessDenied" }] },
    );
    await expect(new S3StorageDriver(CONFIG, client).deletePrefix("events/a")).rejects.toThrow(/AccessDenied/);
  });
});

const live = {
  endpoint: process.env.S3_TEST_ENDPOINT,
  region: process.env.S3_TEST_REGION,
  bucket: process.env.S3_TEST_BUCKET,
  accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY,
};
const liveConfig = Object.values(live).every(Boolean) ? (live as S3StorageConfig) : null;

describe.skipIf(!liveConfig)("S3 test bucket", () => {
  storageDriverContract("s3", async () => ({ driver: new S3StorageDriver(liveConfig as S3StorageConfig), cleanup: async () => {} }));
});
