import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Wrap two fs calls so a test can make one fail or see what name the other was given; everything else is real.
const fsSpy = vi.hoisted(() => ({ stat: undefined as unknown as ReturnType<typeof vi.fn>, copyFile: undefined as unknown as ReturnType<typeof vi.fn> }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  fsSpy.stat = vi.fn(actual.stat);
  fsSpy.copyFile = vi.fn(actual.copyFile);
  return { ...actual, stat: fsSpy.stat, copyFile: fsSpy.copyFile };
});

const { LocalStorageDriver } = await import("@/server/media/local-storage");

let dir: string;
let storage: InstanceType<typeof LocalStorageDriver>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "majlis-media-err-"));
  storage = new LocalStorageDriver(dir, "test-secret-test-secret");
});
afterAll(() => rm(dir, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

describe("LocalStorageDriver.deletePrefix errors", () => {
  it("does nothing when the prefix does not exist", async () => {
    await expect(storage.deletePrefix("events/never/was")).resolves.toBeUndefined();
  });

  it("does nothing when a part of the prefix is a file (ENOTDIR)", async () => {
    await storage.putObject("events/e9/file", Buffer.from("x"), "text/plain");
    await expect(storage.deletePrefix("events/e9/file/below")).resolves.toBeUndefined();
    expect(await storage.stat("events/e9/file")).toEqual({ size: 1 });
  });

  it("rethrows any other error instead of reporting the prefix as deleted", async () => {
    await storage.putObject("events/e10/a/original", Buffer.from("x"), "text/plain");
    fsSpy.stat.mockRejectedValueOnce(Object.assign(new Error("permission denied"), { code: "EACCES" }));

    await expect(storage.deletePrefix("events/e10")).rejects.toMatchObject({ code: "EACCES" });
    expect(await storage.stat("events/e10/a/original")).toEqual({ size: 1 });
  });
});

describe("LocalStorageDriver.stat errors", () => {
  it("returns null for a missing object, a missing folder and a path through a file (ENOENT, ENOTDIR)", async () => {
    await storage.putObject("events/e12/file", Buffer.from("x"), "text/plain");
    expect(await storage.stat("events/e12/nothing")).toBeNull();
    expect(await storage.stat("events/never/was/here")).toBeNull();
    expect(await storage.stat("events/e12/file/below")).toBeNull();
    expect(await storage.stat("events/e12")).toBeNull(); // a folder is not an object
  });

  it("rethrows any other error instead of reporting the object as missing", async () => {
    await storage.putObject("events/e13/file", Buffer.from("x"), "text/plain");
    fsSpy.stat.mockRejectedValueOnce(Object.assign(new Error("permission denied"), { code: "EACCES" }));
    await expect(storage.stat("events/e13/file")).rejects.toMatchObject({ code: "EACCES" });
    expect(await storage.stat("events/e13/file")).toEqual({ size: 1 });
  });
});

describe("LocalStorageDriver copy temp names", () => {
  it("two copies in the same millisecond do not share a temporary file", async () => {
    await storage.putObject("events/e11/src", Buffer.from("same"), "text/plain");
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    fsSpy.copyFile.mockClear();

    // Two renames onto one target can fail on Windows; this test is about the temporary names, not who wins.
    await Promise.allSettled([storage.copyObject("events/e11/src", "events/e11/dst"), storage.copyObject("events/e11/src", "events/e11/dst")]);

    const temps = fsSpy.copyFile.mock.calls.map((call) => String(call[1]));
    expect(temps).toHaveLength(2);
    expect(new Set(temps).size).toBe(2);
    expect((await storage.getObject("events/e11/dst")).toString()).toBe("same");
  });
});
