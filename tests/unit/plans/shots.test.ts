import { describe, expect, it } from "vitest";
import { checkShotAllowed, shotsLeft } from "@/server/uploads/shots";

describe("checkShotAllowed", () => {
  it("allows any number of photos when the event has no limit", () => {
    expect(checkShotAllowed(null, 0)).toEqual({ ok: true });
    expect(checkShotAllowed(null, 5000)).toEqual({ ok: true });
  });

  it("allows a photo while the guest has shots left", () => {
    expect(checkShotAllowed(24, 0)).toEqual({ ok: true });
    expect(checkShotAllowed(24, 23)).toEqual({ ok: true });
  });

  it("refuses once the guest has used every shot", () => {
    expect(checkShotAllowed(24, 24)).toEqual({ ok: false, code: "shots_used_up" });
    expect(checkShotAllowed(1, 3)).toEqual({ ok: false, code: "shots_used_up" });
  });
});

describe("shotsLeft", () => {
  it("is null when unlimited", () => {
    expect(shotsLeft(null, 7)).toBeNull();
  });

  it("counts down and never goes below zero", () => {
    expect(shotsLeft(24, 6)).toBe(18);
    expect(shotsLeft(24, 24)).toBe(0);
    expect(shotsLeft(24, 30)).toBe(0);
  });
});
