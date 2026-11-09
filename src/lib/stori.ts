import type { CSSProperties } from "react";

// Stori colours: the only place a Stori colour is written. Change a value here and every Stori surface follows.
// Pure and isomorphic; `storiVars()` becomes inline CSS custom properties on the `.stori` wrapper.

export const STORI = {
  ground: "#251D2A",
  groundDeep: "#1A1420",
  surface: "#352A3D",
  surfaceLift: "#40344A",
  line: "#6B5B75",
  ink: "#FFFFFF",
  muted: "#D6CADB",
  brand: "#F2D6C4",
  brandDark: "#E3BFA8",
  onBrand: "#251D2A",
  onInk: "#251D2A",
  danger: "#FFB4A8",
  success: "#A8E0B8",
} as const;

export type StoriToken = keyof typeof STORI;

/** CSS custom properties for the `.stori` wrapper. Tailwind tokens (`cream`, `ink`, ...) are overridden in scope. */
export function storiVars(): CSSProperties {
  // Custom properties are not in CSSProperties, so the object is built as a record and widened once.
  const vars: Record<string, string> = {
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
    "--color-success": STORI.success,
  };
  return vars as CSSProperties;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two six-digit hex colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}