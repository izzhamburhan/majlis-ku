import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLANS, TEMPLATES } from "../../prisma/seed-data";
import { seedReferenceData, type ReferenceDb } from "../../prisma/seed-reference";

// A stand-in for the two tables the production seed may touch. It has no user, event or account delegate,
// so any attempt to create one throws.
function fakeDb() {
  const plans = new Map<string, unknown>();
  const templates = new Map<string, unknown>();
  const db: ReferenceDb = {
    plan: {
      upsert: async ({ where, create }) => {
        if (!plans.has(where.code)) plans.set(where.code, create);
        return create;
      },
    },
    template: {
      upsert: async ({ where, create }) => {
        if (!templates.has(where.code)) templates.set(where.code, create);
        return create;
      },
    },
  };
  return { db, plans, templates };
}

const dump = (plans: Map<string, unknown>, templates: Map<string, unknown>) =>
  JSON.stringify([[...plans], [...templates]], (_key, value) => (typeof value === "bigint" ? value.toString() : value));

describe("production seed", () => {
  it("creates plans and templates and no user, event or admin, and is idempotent", async () => {
    const { db, plans, templates } = fakeDb();
    await seedReferenceData(db);
    expect([...plans.keys()].sort()).toEqual(PLANS.map((p) => p.code).sort());
    expect([...templates.keys()].sort()).toEqual(TEMPLATES.map((t) => t.code).sort());

    const first = dump(plans, templates);
    await seedReferenceData(db);
    expect(dump(plans, templates)).toBe(first);
    expect(plans.size).toBe(PLANS.length);
    expect(templates.size).toBe(TEMPLATES.length);
  });

  it("never overwrites a plan or template an admin has edited", async () => {
    const updates: unknown[] = [];
    const db: ReferenceDb = {
      plan: { upsert: async (args) => void updates.push(args.update) },
      template: { upsert: async (args) => void updates.push(args.update) },
    };
    await seedReferenceData(db);
    expect(updates.length).toBe(PLANS.length + TEMPLATES.length);
    for (const update of updates) expect(update).toEqual({});
  });

  it("the production script touches no user, event or demo data, and shares the dev seed's upserts", () => {
    const source = readFileSync("prisma/seed-production.ts", "utf8");
    const prod = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n"); // comments may say what the script does not do
    expect(prod).toContain("seedReferenceData");
    expect(prod).not.toMatch(/\.(user|event|account|session|eventMember)\b/);
    expect(prod).not.toMatch(/admin|demo/i);
    expect(readFileSync("prisma/seed.ts", "utf8")).toContain("seedReferenceData");
  });
});