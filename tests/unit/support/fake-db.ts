import type { Upload } from "@prisma/client";

// A small in-memory stand-in for the parts of Prisma the upload code uses, so these tests need no database.
// Tests mock "@/server/db" with `fakeDb` and call `resetFakeDb` in beforeEach. Upload ids keep counting across
// resets, so files left in the shared temporary storage by an earlier test are never mistaken for a later one's.
// `$transaction(fn)` hands `fn` a client that journals every write; if `fn` throws, the writes are undone.

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
type Undo = () => void;

// Ordered comparison on numbers, bigints and dates alike; the operands are always of one kind.
const lessThan = (a: unknown, b: unknown) => (a as number) < (b as number);
const greaterThan = (a: unknown, b: unknown) => (a as number) > (b as number);

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected !== null && typeof expected === "object" && !(expected instanceof Date)) {
      const c = expected as { lt?: unknown; lte?: unknown; gt?: unknown; gte?: unknown; in?: unknown[] };
      if (Object.values(c).some((value) => value !== undefined)) {
        return (
          (c.lt === undefined || lessThan(actual, c.lt)) &&
          (c.lte === undefined || !greaterThan(actual, c.lte)) &&
          (c.gt === undefined || greaterThan(actual, c.gt)) &&
          (c.gte === undefined || !lessThan(actual, c.gte)) &&
          (c.in === undefined || c.in.includes(actual))
        );
      }
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

/** A client whose writes are recorded in `journal` (when given), so a failed transaction can undo them. */
function makeClient(journal?: Undo[]) {
  const write = (row: object, data: Record<string, unknown>) => {
    if (journal) {
      const snapshot = { ...row };
      journal.push(() => {
        for (const key of Object.keys(row)) delete (row as Record<string, unknown>)[key];
        Object.assign(row, snapshot);
      });
    }
    apply(row as Record<string, unknown>, data);
  };

  return {
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
        journal?.push(() => {
          const index = fakeState.uploads.indexOf(row);
          if (index >= 0) fakeState.uploads.splice(index, 1);
        });
        return row;
      },
      update: async ({ where, data }: { where: Where; data: Record<string, unknown> }): Promise<Upload> => {
        const row = fakeState.uploads.find((u) => matches(u, where));
        if (!row) throw new Error("fake db: upload not found");
        write(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const rows = fakeState.uploads.filter((u) => matches(u, where));
        for (const row of rows) write(row, data);
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
        const [row] = fakeState.uploads.splice(index, 1);
        if (row) journal?.push(() => void fakeState.uploads.splice(index, 0, row));
        return row;
      },
    },
    event: {
      // Like Prisma, a read returns a copy: later writes do not change what the caller already holds.
      findUnique: async ({ where }: { where: Where; include?: unknown; select?: unknown }) => {
        const row = fakeState.events.get(where.id as string);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const row = fakeState.events.get(where.id as string);
        if (!row) throw new Error("fake db: event not found");
        write(row, data);
        return row;
      },
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const rows = [...fakeState.events.values()].filter((e) => matches(e as unknown as Record<string, unknown>, where));
        for (const row of rows) write(row, data);
        return { count: rows.length };
      },
    },
  };
}

type Client = ReturnType<typeof makeClient>;

export const fakeDb = {
  ...makeClient(),
  // An array holds operations that were already started, so waiting for them is enough. A function runs against a
  // client that journals its writes; if it throws, they are undone and the error goes on.
  $transaction: async <T>(work: Promise<unknown>[] | ((tx: Client) => Promise<T>)) => {
    if (Array.isArray(work)) return Promise.all(work);
    const journal: Undo[] = [];
    try {
      return await work(makeClient(journal));
    } catch (error) {
      for (const undo of journal.reverse()) undo();
      throw error;
    }
  },
};
