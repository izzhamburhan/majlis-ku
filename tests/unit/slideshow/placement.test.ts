import { describe, expect, it } from "vitest";
import { placement } from "@/components/slideshow/placement";

describe("placement", () => {
  it("is stable per id and stays on screen", () => {
    expect(placement("abc")).toEqual(placement("abc"));
    const xs = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const p = placement(`cm${i.toString(36)}-${i * 7919}`);
      expect(p.x).toBeGreaterThanOrEqual(4);
      expect(p.x).toBeLessThanOrEqual(72);
      expect(p.y).toBeGreaterThanOrEqual(4);
      expect(p.y).toBeLessThanOrEqual(62);
      expect(p.rotate).toBeGreaterThanOrEqual(-8);
      expect(p.rotate).toBeLessThanOrEqual(8);
      xs.add(p.x);
    }
    expect(xs.size).toBeGreaterThanOrEqual(450);
  });

  it("placement spreads cards across the stage", () => {
    const points = Array.from({ length: 500 }, (_, i) => placement(`cm${i.toString(36)}-${i * 7919}`));
    const n = points.length;
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / n;
    const mx = mean(points.map((p) => p.x));
    const my = mean(points.map((p) => p.y));
    let sxy = 0, sxx = 0, syy = 0;
    for (const p of points) {
      sxy += (p.x - mx) * (p.y - my);
      sxx += (p.x - mx) ** 2;
      syy += (p.y - my) ** 2;
    }
    expect(Math.abs(sxy / Math.sqrt(sxx * syy))).toBeLessThan(0.2);
    // Quadrants split at the midpoints of the x range (4..72) and y range (4..62).
    const quadrants = [0, 0, 0, 0];
    for (const p of points) {
      const q = (p.x > 38 ? 1 : 0) + (p.y > 33 ? 2 : 0);
      quadrants[q] = (quadrants[q] ?? 0) + 1;
    }
    for (const q of quadrants) expect(q / n).toBeGreaterThanOrEqual(0.15);
  });
});
