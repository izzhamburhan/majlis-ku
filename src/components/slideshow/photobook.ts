import type { GalleryItem } from "@/server/gallery/items";

// The Photobook layout: one guest per spread, a photo of theirs on the left page and their wish on
// the right. Pure functions (no React) so the order and frame rules are unit-tested with a seeded random.

export type Rand = () => number;

export type BookPhoto = { id: string; src: string; thumb: string; portrait: boolean };
export type Spread = { key: string; guestName: string; photos: BookPhoto[]; wishes: { id: string; message: string }[] };
/** How a single print is mounted on the page: in a gilded frame with a mat, or as a polaroid held by tape. */
export type Mount = "gilded" | "polaroid";
export type Page = { key: string; guestName: string; frame: "single" | "strip" | "monogram"; mount: Mount; photos: BookPhoto[]; wish: string | null };
export type BookState = { order: string[]; pos: number; promoted: string[] };

/** Small deterministic generator for tests; the screen uses Math.random. */
export function seededRandom(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], rand: Rand): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The spread a gallery item belongs to. */
export const spreadKey = (item: GalleryItem) => item.guestKey ?? `name:${item.guestName.trim().toLowerCase()}`;

/** Spreads in first-seen order (the item list is newest first). Videos and image-less uploads are left out. */
export function buildSpreads(items: readonly GalleryItem[]): Spread[] {
  const spreads = new Map<string, Spread>();
  for (const item of items) {
    const key = spreadKey(item);
    if (item.type === "upload") {
      const src = item.displayUrl ?? item.thumbUrl;
      if (item.kind !== "PHOTO" || !src) continue;
      const spread = spreads.get(key) ?? { key, guestName: item.guestName, photos: [], wishes: [] };
      spread.photos.push({ id: item.id, src, thumb: item.thumbUrl ?? src, portrait: (item.height ?? 0) > (item.width ?? 0) });
      spreads.set(key, spread);
    } else {
      const spread = spreads.get(key) ?? { key, guestName: item.guestName, photos: [], wishes: [] };
      spread.wishes.push({ id: item.id, message: item.message });
      spreads.set(key, spread);
    }
  }
  return [...spreads.values()];
}

/** One look at a spread: which frame, which photos, which wish. Chosen again each time the spread comes round. */
export function composePage(spread: Spread, rand: Rand): Page {
  const wish = spread.wishes.length ? spread.wishes[Math.floor(rand() * spread.wishes.length)]!.message : null;
  const mount: Mount = rand() < 0.5 ? "gilded" : "polaroid";
  const base = { key: spread.key, guestName: spread.guestName, wish, mount };
  if (spread.photos.length === 0) return { ...base, frame: "monogram", photos: [] };
  if (spread.photos.length >= 3 && rand() < 0.5) return { ...base, frame: "strip", photos: shuffle(spread.photos, rand).slice(0, 3) };
  return { ...base, frame: "single", photos: [spread.photos[Math.floor(rand() * spread.photos.length)]!] };
}

export function startBook(): BookState {
  return { order: [], pos: 0, promoted: [] };
}

/** A new photo or wish from this guest: show their spread next (once). */
export function promote(state: BookState, key: string): BookState {
  return state.promoted.includes(key) ? state : { ...state, promoted: [...state.promoted, key] };
}

/** Promoted spreads first, then a shuffled cycle in which every spread shows once before any repeats. */
export function nextSpread(state: BookState, keys: readonly string[], rand: Rand): { state: BookState; key: string | null } {
  const present = new Set(keys);
  const promoted = state.promoted.filter((key) => present.has(key));
  if (promoted.length) return { state: { ...state, promoted: promoted.slice(1) }, key: promoted[0]! };
  if (keys.length === 0) return { state: { ...state, promoted: [] }, key: null };

  let { order, pos } = state;
  // Skip spreads that were removed since the cycle was shuffled.
  while (pos < order.length && !present.has(order[pos]!)) pos++;
  if (pos >= order.length) {
    // New cycle; spreads that arrived mid-cycle join here.
    order = shuffle(keys, rand);
    pos = 0;
  }
  return { state: { order, pos: pos + 1, promoted: [] }, key: order[pos]! };
}
