// Songket colour world: the host's theme colour becomes a deep woven ground, with gold weft and ivory text.
// Pure and isomorphic; pages compute the palette on the server and pass it as CSS variables.

export const IVORY = "#f6eedc";
export const GOLD = "#c9a24a";
export const GOLD_LIGHT = "#ecd394";
const DEFAULT_THEME = "#8B5E3C";

type Oklch = { l: number; c: number; h: number };

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToOklch([r, g, b]: [number, number, number]): Oklch {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function oklchToRgb({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Lower the chroma until the colour fits in sRGB, so the hue survives the conversion. */
function inGamut(colour: Oklch): string {
  for (let c = colour.c; c >= 0; c -= 0.005) {
    const rgb = oklchToRgb({ ...colour, c });
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) return rgbToHex(rgb);
  }
  return rgbToHex(oklchToRgb({ ...colour, c: 0 }));
}

export type SongketPalette = { ground: string; groundDeep: string; groundLift: string; ink: string };

/** Ground (main field), groundDeep (bands, shadows), groundLift (raised parts), ink (wish handwriting on ivory paper). */
export function songketPalette(themeColor: string): SongketPalette {
  const hex = /^#[0-9a-fA-F]{6}$/.test(themeColor) ? themeColor : DEFAULT_THEME;
  const base = rgbToOklch(hexToRgb(hex));
  // Near-grey hosts (white, black, silver) keep a quiet warm ground rather than a dead grey.
  const hue = base.c < 0.03 ? 1.0 : base.h;
  const chroma = Math.min(Math.max(base.c, 0.05), 0.13);
  return {
    ground: inGamut({ l: 0.3, c: chroma, h: hue }),
    groundDeep: inGamut({ l: 0.22, c: chroma * 0.9, h: hue }),
    groundLift: inGamut({ l: 0.37, c: chroma, h: hue }),
    ink: inGamut({ l: 0.27, c: Math.min(chroma, 0.09), h: hue }),
  };
}

/** CSS custom properties for a page wrapper. */
export function songketVars(themeColor: string): Record<string, string> {
  const p = songketPalette(themeColor);
  return {
    "--sk-ground": p.ground,
    "--sk-ground-deep": p.groundDeep,
    "--sk-ground-lift": p.groundLift,
    "--sk-ink": p.ink,
    "--sk-gold": GOLD,
    "--sk-gold-light": GOLD_LIGHT,
    "--sk-ivory": IVORY,
  };
}
