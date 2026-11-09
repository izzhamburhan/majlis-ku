import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const findMany = vi.fn();
vi.mock("@/server/db", () => ({ db: { plan: { findMany } } }));

const { listPublicPlans, planCard } = await import("@/server/plans/public");

const FREE = {
  code: "FREE" as const,
  nameMs: "Percuma",
  nameEn: "Free",
  priceSen: 0,
  uploadLimit: 100,
  retentionDays: 30,
  includesGallery: true,
  includesEcard: false,
};

describe("planCard", () => {
  it("formats price with formatSen", () => {
    expect(planCard(FREE, "ms").price).toBe("RM 0.00");
    expect(planCard({ ...FREE, priceSen: 4000 }, "en").price).toBe("RM 40.00");
    expect(planCard({ ...FREE, priceSen: 12050 }, "ms").price).toBe("RM 120.50");
  });

  it("uses the plan name for the locale", () => {
    expect(planCard(FREE, "ms").name).toBe("Percuma");
    expect(planCard(FREE, "en").name).toBe("Free");
  });

  it("null uploadLimit reads as unlimited", () => {
    expect(planCard({ ...FREE, uploadLimit: null }, "ms")).toMatchObject({ unlimited: true, uploadLimit: null });
    expect(planCard(FREE, "ms")).toMatchObject({ unlimited: false, uploadLimit: 100 });
  });

  it("passes the stored limits and flags through unchanged", () => {
    expect(planCard({ ...FREE, includesEcard: true, retentionDays: 365 }, "ms")).toMatchObject({
      code: "FREE",
      retentionDays: 365,
      includesGallery: true,
      includesEcard: true,
    });
  });
});

describe("listPublicPlans", () => {
  beforeEach(() => findMany.mockReset());

  it("reads active plans by sortOrder then code and selects only public columns", async () => {
    findMany.mockResolvedValue([FREE]);
    expect(await listPublicPlans()).toEqual([FREE]);
    const args = findMany.mock.calls[0]![0] as { where: unknown; orderBy: unknown; select: Record<string, boolean> };
    expect(args.where).toEqual({ active: true });
    // code breaks ties, so two plans with the same sortOrder never swap places between requests.
    expect(args.orderBy).toEqual([{ sortOrder: "asc" }, { code: "asc" }]);
    expect(Object.keys(args.select).sort()).toEqual(
      ["code", "includesEcard", "includesGallery", "nameEn", "nameMs", "priceSen", "retentionDays", "uploadLimit"],
    );
  });
});