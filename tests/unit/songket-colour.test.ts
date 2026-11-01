import { describe, expect, it } from "vitest";
import { contrastRatio, IVORY, songketPalette } from "@/lib/songket";

describe("songketPalette", () => {
  it("keeps ivory text readable (at least 7:1) on the ground for any host colour", () => {
    for (const colour of ["#8B5E3C", "#FFFFFF", "#000000", "#F4D35E", "#2E7D32", "#7B1FA2", "#00BCD4", "#C62828"]) {
      const { ground, groundDeep } = songketPalette(colour);
      expect(contrastRatio(IVORY, ground), colour).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(IVORY, groundDeep), colour).toBeGreaterThanOrEqual(7);
    }
  });

  it("keeps the host colour's hue: a green host gets a green ground, a red host a red one", () => {
    const green = songketPalette("#2E7D32").ground;
    const red = songketPalette("#C62828").ground;
    const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [gr, gg, gb] = channels(green);
    const [rr, rg, rb] = channels(red);
    expect(gg).toBeGreaterThan(gr!);
    expect(gg).toBeGreaterThan(gb!);
    expect(rr).toBeGreaterThan(rg!);
    expect(rr).toBeGreaterThan(rb!);
  });

  it("falls back to the default brown for an invalid colour", () => {
    expect(songketPalette("not-a-colour")).toEqual(songketPalette("#8B5E3C"));
  });

  it("returns six-digit hex values", () => {
    const palette = songketPalette("#8B5E3C");
    for (const value of Object.values(palette)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });
});
