import type { Upload } from "@prisma/client";

// A small in-memory stand-in for the parts of Prisma the upload code uses, so these tests need no database.
// Tests mock "@/server/db" with `fakeDb` and call `resetFakeDb` in beforeEach. Upload ids keep counting across
// resets, so files left in the shared temporary storage by an earlier test are never mistaken for a later one's.

const MB = 1024n * 1024n;

export type FakePlan = {
  includesGallery: boolean;
  uploadLimit: number | null;
  videoAllowed: boolean;
  maxVideoSeconds: number | null;
  maxUploadBytes: bigint;
  storageLimitBytes: bigint | null;
};

export type FakeEvent = {
  id: string;
  uploadCount: number;
  storageBytes: bigint;
  shotsPerGuest: number | null;
  requireApproval: boolean;
  plan: FakePlan;
};

export const openPlan: FakePlan = {
  includesGallery: true,
  uploadLimit: null,
  videoAllowed: true,
  maxVideoSeconds: 60,
  maxUploadBytes: 200n * MB,
  storageLimitBytes: null,
};

export const fakeState = {
  uploads: [] as Upload[],
  events: new Map<string, FakeEvent>(),
  nextId: 1,
};

export function resetFakeDb(event?: Partial<FakeEvent>): FakeEvent {
  fakeState.uploads = [];
  fakeState.events = new Map();
  const created: FakeEvent = {
    id: "ev1",
    uploadCount: 0,
    storageBytes: 0n,
    shotsPerGuest: null,
    requireApproval: false,
    plan: { ...openPlan },
    ...event,
  };
  fakeState.events.set(created.id, created);
  return created;
}

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
      const condition = expected as { lt?: Date; gt?: Date; in?: unknown[] };
      if (condition.lt !== undefined) return (actual as Date) < condition.lt;
      if (condition.gt !== undefined) return (actual as Date) > condition.gt;
      if (condition.in !== undefined) return condition.in.includes(actual);
    }
    return actual === expected;
  });
}

function apply(row: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      const op = value as { increment?: number | bigint; decrement?: number | bigint };
      const current = row[key] as number | bigint;
      if (op.increment !== undefined) row[key] = typeof current === "bigint" ? current + BigInt(op.increment) : current + Number(op.increment);
      else if (op.decrement !== undefined) row[key] = typeof current === "bigint" ? current - BigInt(op.decrement) : current - Number(op.decrement);
      else row[key] = value;
    } else {
      row[key] = value;
    }
  }
}

function withEvent(upload: Upload, include?: { event?: unknown }) {
  if (!include?.event) return upload;
  return { ...upload, event: fakeState.events.get(upload.eventId) };
}

export const fakeDb = {
  upload: {
    create: async ({ data }: { data: Partial<Upload> }): Promise<Upload> => {
      const now = new Date();
      const row = {
        id: `up${fakeState.nextId++}`,
        guestId: null,
        status: "PENDING",
        moderation: "VISIBLE",
        thumbKey: null,
        displayKey: null,
        durationSec: null,
        width: null,
        height: null,
        caption: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      } as Upload;
      fakeState.uploads.push(row);
      return row;
    },
    update: async ({ where, data }: { where: Where; data: Record<string, unknown> }): Promise<Upload> => {
      const row = fakeState.uploads.find((u) => matches(u, where));
      if (!row) throw new Error("fake db: upload not found");
      apply(row as unknown as Record<string, unknown>, data);
      return row;
    },
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const rows = fakeState.uploads.filter((u) => matches(u, where));
      for (const row of rows) apply(row as unknown as Record<string, unknown>, data);
      return { count: rows.length };
    },
    findFirst: async ({ where }: { where: Where }) => fakeState.uploads.find((u) => matches(u, where)) ?? null,
    findUnique: async ({ where, include }: { where: Where; include?: { event?: unknown } }) => {
      const row = fakeState.uploads.find((u) => matches(u, where));
      return row ? withEvent(row, include) : null;
    },
    findMany: async ({ where = {} }: { where?: Where } = {}) => fakeState.uploads.filter((u) => matches(u, where)),
    count: async ({ where = {} }: { where?: Where } = {}) => fakeState.uploads.filter((u) => matches(u, where)).length,
    delete: async ({ where }: { where: Where }) => {
      const index = fakeState.uploads.findIndex((u) => matches(u, where));
      return fakeState.uploads.splice(index, 1)[0];
    },
  },
  event: {
    findUnique: async ({ where }: { where: Where; include?: unknown; select?: unknown }) => fakeState.events.get(where.id as string) ?? null,
    update: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const row = fakeState.events.get(where.id as string);
      if (!row) throw new Error("fake db: event not found");
      apply(row as unknown as Record<string, unknown>, data);
      return row;
    },
  },
  // The operations were already started when they were passed in, so waiting for them is enough.
  $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
};
