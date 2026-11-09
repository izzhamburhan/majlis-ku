import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, fakeState, resetFakeDb } from "../support/fake-db";
import { fakeStorage, setUpFakeStorage, tearDownFakeStorage } from "../support/fake-storage";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", async () => ({ db: (await import("../support/fake-db")).fakeDb }));
vi.mock("@/server/media/storage", async () => (await import("../support/fake-storage")).storageModule);
const purgeExpiredEvents = vi.hoisted(() => vi.fn(async () => ({ archived: 2, failed: 1 })));
vi.mock("@/server/retention/purge", () => ({ purgeExpiredEvents }));

const { sweepStalePending } = await import("@/server/uploads/sweep");
const { runPurgeOnce } = await import("@/server/retention/schedule");

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-11-09T12:00:00Z");

beforeAll(setUpFakeStorage);
afterAll(tearDownFakeStorage);
beforeEach(() => {
  resetFakeDb();
  purgeExpiredEvents.mockClear();
});

async function addUpload(minutesOld: number, status: "PENDING" | "READY" = "PENDING") {
  const row = await fakeDb.upload.create({
    data: { eventId: "ev1", status, objectKey: `events/ev1/x/original`, createdAt: new Date(now.getTime() - minutesOld * 60_000) },
  });
  const base = `events/ev1/${row.id}`;
  await fakeStorage.driver.putObject(`${base}/incoming`, Buffer.from("partial"), "video/mp4");
  await fakeStorage.driver.putObject(`${base}/original`, Buffer.from("whole"), "video/mp4");
  return { row, base };
}

describe("sweepStalePending", () => {
  it("sweepStalePending deletes the prefix and marks FAILED after one hour, keeps newer", async () => {
    const stale = await addUpload(61);
    const fresh = await addUpload(59);
    const done = await addUpload(300, "READY");

    expect(await sweepStalePending(now)).toBe(1);

    expect(fakeState.uploads.find((u) => u.id === stale.row.id)?.status).toBe("FAILED");
    expect(await fakeStorage.driver.stat(`${stale.base}/incoming`)).toBeNull();
    expect(await fakeStorage.driver.stat(`${stale.base}/original`)).toBeNull();

    expect(fakeState.uploads.find((u) => u.id === fresh.row.id)?.status).toBe("PENDING");
    expect(await fakeStorage.driver.stat(`${fresh.base}/incoming`)).not.toBeNull();
    expect(fakeState.uploads.find((u) => u.id === done.row.id)?.status).toBe("READY");
    expect(await fakeStorage.driver.stat(`${done.base}/original`)).not.toBeNull();
  });

  it("keeps an upload that is exactly one hour old and does nothing when there is nothing to sweep", async () => {
    const edge = await addUpload(60);
    expect(await sweepStalePending(now)).toBe(0);
    expect(fakeState.uploads.find((u) => u.id === edge.row.id)?.status).toBe("PENDING");
    expect(await sweepStalePending(new Date(now.getTime() + HOUR))).toBe(1);
  });
});

describe("runPurgeOnce", () => {
  it("runs the purge and the pending sweep together and reports both", async () => {
    await addUpload(120);
    vi.useFakeTimers({ toFake: ["Date"] }); // the schedule reads the clock itself
    vi.setSystemTime(now);
    try {
      const result = await runPurgeOnce();
      expect(purgeExpiredEvents).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ archived: 2, failed: 1, swept: 1 });
    } finally {
      vi.useRealTimers();
    }
  });
});
