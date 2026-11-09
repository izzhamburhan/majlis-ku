import { Readable } from "node:stream";
import type { Event } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  uploads: [] as { id: string; kind: "PHOTO"; guestName: string; mimeType: string; objectKey: string; createdAt: Date }[],
  opened: [] as string[],
  open: 0,
  maxOpen: 0,
}));

vi.mock("@/server/db", () => ({
  db: {
    upload: { findMany: async () => state.uploads },
    wish: { findMany: async () => [] },
  },
}));

// Only the StorageDriver interface is offered here: the export must not reach for file paths.
vi.mock("@/server/media/storage", () => ({
  storage: () => ({
    stat: async () => ({ size: 9 }),
    getObjectStream: async (key: string) => {
      state.opened.push(key);
      state.open += 1;
      state.maxOpen = Math.max(state.maxOpen, state.open);
      const stream = Readable.from(
        (async function* () {
          for (const part of ["abc", "def", "ghi"]) {
            await new Promise((resolve) => setTimeout(resolve, 2));
            yield Buffer.from(part);
          }
        })(),
      );
      stream.on("end", () => (state.open -= 1));
      return stream;
    },
  }),
}));

const { eventZipStream } = await import("@/server/export/event-export");

const event = { id: "ev1", hostNames: "Aisyah & Daniel", title: "Majlis", startsAt: new Date("2026-12-01T10:00:00Z"), themeColor: "#7a1f2b" } as Event;

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

beforeEach(() => {
  state.opened = [];
  state.open = 0;
  state.maxOpen = 0;
  state.uploads = [1, 2, 3].map((n) => ({
    id: `up${n}`,
    kind: "PHOTO" as const,
    guestName: `Tetamu ${n}`,
    mimeType: "image/jpeg",
    objectKey: `events/ev1/up${n}/original`,
    createdAt: new Date("2026-12-01T11:00:00Z"),
  }));
});

describe("eventZipStream", () => {
  it("event export streams entries one at a time", async () => {
    const zip = await readAll(await eventZipStream(event, "ms"));

    expect(state.opened).toEqual(["events/ev1/up1/original", "events/ev1/up2/original", "events/ev1/up3/original"]);
    expect(state.maxOpen).toBe(1);
    const text = zip.toString("latin1");
    for (const n of [1, 2, 3]) expect(text).toContain(`gambar/Tetamu ${n}-up${n}.jpg`);
    expect(text).toContain("ucapan.pdf");
    expect(text).toContain("ucapan.csv");
    expect(text).toContain("abcdefghi");
  });
});
