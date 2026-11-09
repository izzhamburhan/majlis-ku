import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signStorageUrl } from "@/server/media/signing";
import { fakeStorage, setUpFakeStorage, tearDownFakeStorage } from "../support/fake-storage";

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

  it.each(["events/ev1/up2/original", "events/ev1/up2/display.jpg", "events/ev1/cover/v1.jpg"])(
    "refuses a correctly signed PUT to %s, so a signed URL can never write what is served",
    async (key) => {
      const response = await put(key);
      expect(response.status).toBe(403);
      expect(await fakeStorage.driver.stat(key)).toBeNull();
    },
  );
});
