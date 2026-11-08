import { describe, expect, it } from "vitest";
import { contrastRatio, STORI, storiVars } from "@/lib/stori";

describe("Stori colours", () => {
  it("ink, muted and danger reach 4.5:1 on ground and surface", () => {
    for (const key of ["ink", "muted", "danger"] as const) {
      for (const bg of ["ground", "surface"] as const) {
        expect(contrastRatio(STORI[key], STORI[bg]), `${key} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("on-brand reaches 4.5:1 on brand", () => {
    expect(contrastRatio(STORI.onBrand, STORI.brand)).toBeGreaterThanOrEqual(4.5);
  });

  it("on-ink reaches 4.5:1 on ink", () => {
    expect(contrastRatio(STORI.onInk, STORI.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it("storiVars sets every token variable", () => {
    const vars = storiVars() as Record<string, string>;
    expect(vars).toEqual({
      "--color-cream": STORI.ground,
      "--st-ground-deep": STORI.groundDeep,
      "--color-surface": STORI.surface,
      "--st-surface-lift": STORI.surfaceLift,
      "--st-line": STORI.line,
      "--color-ink": STORI.ink,
      "--color-muted": STORI.muted,
      "--color-brand": STORI.brand,
      "--color-brand-dark": STORI.brandDark,
      "--color-on-brand": STORI.onBrand,
      "--color-on-ink": STORI.onInk,
      "--color-danger": STORI.danger,
    });
    for (const value of Object.values(vars)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
  });

  it("contrastRatio is 21 for black on white and symmetric", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });
});