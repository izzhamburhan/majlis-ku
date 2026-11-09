import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signStorageUrl } from "@/server/media/signing";
import { fakeStorage, setUpFakeStorage, tearDownFakeStorage } from "../support/fake-storage";

// Record the temporary file the route writes to; the real fs still does the work.
const written = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    createWriteStream: (...args: Parameters<typeof actual.createWriteStream>) => {
      written.paths.push(String(args[0]));
      return actual.createWriteStream(...args);
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: () => ({ HASH_SALT: "test-salt-test-salt" }) }));
vi.mock("@/server/media/storage", async () => (await import("../support/fake-storage")).storageModule);

const { PUT } = await import("@/app/api/storage/upload/route");

const SECRET = "test-secret-test-secret";

beforeAll(setUpFakeStorage);
afterAll(tearDownFakeStorage);

function put(key: string, body = "file bytes") {
  const path = signStorageUrl({ action: "put", key, expiresInSec: 60, maxBytes: 1000, secret: SECRET });
  return PUT(new Request(`http://localhost${path}`, { method: "PUT", body, headers: { "content-length": String(body.length) } }));
}

describe("PUT /api/storage/upload (local driver)", () => {
  it("accepts a correctly signed PUT to an incoming key", async () => {
    const response = await put("events/ev1/up1/incoming");
    expect(response.status).toBe(204);
    expect((await fakeStorage.driver.getObject("events/ev1/up1/incoming")).toString()).toBe("file bytes");
  });

  it("two uploads to the same key in the same millisecond do not share a temporary file", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    written.paths.length = 0;
    const key = "events/ev1/up6/incoming";

    // Two renames onto one target can fail on Windows; this test is about the temporary names, not who wins.
    await Promise.allSettled([put(key), put(key)]);
    vi.restoreAllMocks();

    expect(written.paths).toHaveLength(2);
    expect(new Set(written.paths).size).toBe(2);
    expect(written.paths.every((path) => path.includes(".part-"))).toBe(true);
  });

  it.each(["events/ev1/up2/original", "events/ev1/up2/display.jpg", "events/ev1/cover/v1.jpg"])(
    "refuses a correctly signed PUT to %s, so a signed URL can never write what is served",
    async (key) => {
      const response = await put(key);
      expect(response.status).toBe(403);
      expect(await fakeStorage.driver.stat(key)).toBeNull();
    },
  );

  const send = (path: string) =>
    PUT(new Request(`http://localhost${path}`, { method: "PUT", body: "file bytes", headers: { "content-length": "10" } }));

  it("refuses an expired signed URL and writes nothing", async () => {
    const key = "events/ev1/up3/incoming";
    const path = signStorageUrl({ action: "put", key, expiresInSec: 60, maxBytes: 1000, secret: SECRET, now: new Date(Date.now() - 120_000) });

    const response = await send(path);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("expired");
    expect(await fakeStorage.driver.stat(key)).toBeNull();
  });

  it.each([
    ["the key", (u: URL) => u.searchParams.set("key", "events/ev1/other/incoming")],
    ["the size limit", (u: URL) => u.searchParams.set("max", "999999")],
    ["the expiry", (u: URL) => u.searchParams.set("exp", String(Math.floor(Date.now() / 1000) + 86_400))],
    ["the signature", (u: URL) => u.searchParams.set("sig", "x".repeat(43))],
  ])("refuses a signed URL whose %s was changed, and writes nothing", async (_what, tamper) => {
    const key = "events/ev1/up4/incoming";
    const url = new URL(`http://localhost${signStorageUrl({ action: "put", key, expiresInSec: 60, maxBytes: 1000, secret: SECRET })}`);
    tamper(url);

    const response = await send(url.pathname + url.search);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("bad_signature");
    expect(await fakeStorage.driver.stat(key)).toBeNull();
    expect(await fakeStorage.driver.stat("events/ev1/other/incoming")).toBeNull();
  });

  it("refuses a URL signed for reading when it is used to write", async () => {
    const key = "events/ev1/up5/incoming";
    const path = signStorageUrl({ action: "get", key, expiresInSec: 60, secret: SECRET }).replace("/api/storage/file", "/api/storage/upload");
    const response = await send(path + "&max=1000");
    expect(response.status).toBe(403);
    expect(await fakeStorage.driver.stat(key)).toBeNull();
  });
});
