// Where a collage thumbnail sits: derived from its id so a refresh lays it out the same way.
// Units: x and y are percentages of the stage for the thumbnail's top-left corner, rotate is degrees.
// Values are fractional on purpose, so two ids almost never share a spot.

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i); // UTF-16 code unit
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// murmur3's 32-bit finaliser: flips about half the bits for any single-bit change, so seeds give unrelated values.
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// A number in [0, 1], one per seed: x, y and rotate come from the same id hash, mixed with different seeds.
const unit = (hash: number, seed: number) => fmix32(hash ^ Math.imul(seed, 0x9e3779b1)) / 0xffffffff;

export function placement(id: string): { x: number; y: number; rotate: number } {
  const hash = fnv1a(id);
  return { x: 4 + unit(hash, 1) * 68, y: 4 + unit(hash, 2) * 58, rotate: -8 + unit(hash, 3) * 16 };
}
