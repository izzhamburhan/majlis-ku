import { describe, expect, it } from "vitest";
import { buildSpreads, composePage, nextSpread, promote, seededRandom, startBook, type Spread } from "@/components/slideshow/photobook";
import type { GalleryItem } from "@/server/gallery/items";

const photo = (id: string, guestName: string, guestKey: string | null, kind: "PHOTO" | "VIDEO" = "PHOTO"): GalleryItem => ({
  type: "upload",
  id,
  kind,
  guestName,
  guestKey,
  createdAt: "2026-12-12T03:00:00Z",
  moderation: "VISIBLE",
  width: 1200,
  height: 900,
  durationSec: null,
  thumbUrl: `/t/${id}`,
  displayUrl: `/d/${id}`,
  originalUrl: null,
});
const wish = (id: string, guestName: string, guestKey: string | null, message = "Tahniah!"): GalleryItem => ({
  type: "wish",
  id,
  guestName,
  guestKey,
  createdAt: "2026-12-12T03:00:00Z",
  moderation: "VISIBLE",
  message,
});

describe("buildSpreads", () => {
  it("groups photos and wishes by guest key, falling back to the name", () => {
    const spreads = buildSpreads([
      photo("p1", "Kiah", "k1"),
      wish("w1", "Kiah", "k1"),
      photo("p2", "Hamid", "k2"),
      photo("p3", "Siti", null),
      wish("w2", "siti ", null),
    ]);
    expect(spreads.map((s) => [s.key, s.photos.map((p) => p.id), s.wishes.map((w) => w.id)])).toEqual([
      ["k1", ["p1"], ["w1"]],
      ["k2", ["p2"], []],
      ["name:siti", ["p3"], ["w2"]],
    ]);
  });

  it("leaves out videos and photos without an image, so a guest with only those gets no spread", () => {
    const noImage = { ...photo("p9", "Ali", "k9"), displayUrl: null, thumbUrl: null };
    expect(buildSpreads([photo("v1", "Ali", "k9", "VIDEO"), noImage])).toEqual([]);
  });
});

describe("composePage", () => {
  const spread = (photos: number, wishes: number): Spread => ({
    key: "k",
    guestName: "Kiah",
    photos: Array.from({ length: photos }, (_, i) => ({ id: `p${i}`, src: `/d/p${i}`, thumb: `/t/p${i}`, portrait: false })),
    wishes: Array.from({ length: wishes }, (_, i) => ({ id: `w${i}`, message: `Ucapan ${i}` })),
  });

  it("uses a single print when the guest has one or two photos", () => {
    for (let seed = 1; seed < 30; seed++) {
      expect(composePage(spread(2, 1), seededRandom(seed)).frame).toBe("single");
    }
  });

  it("uses a strip of three distinct photos or a single print when the guest has three or more", () => {
    const frames = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const page = composePage(spread(5, 1), seededRandom(seed));
      frames.add(page.frame);
      if (page.frame === "strip") {
        expect(page.photos).toHaveLength(3);
        expect(new Set(page.photos.map((p) => p.id)).size).toBe(3);
      } else expect(page.photos).toHaveLength(1);
    }
    expect(frames).toEqual(new Set(["single", "strip"]));
  });

  it("gives a wish-only guest a monogram page and a photo-only guest no wish", () => {
    const monogram = composePage(spread(0, 2), seededRandom(3));
    expect(monogram.frame).toBe("monogram");
    expect(monogram.photos).toEqual([]);
    expect(monogram.wish).toMatch(/^Ucapan [01]$/);
    expect(composePage(spread(1, 0), seededRandom(3)).wish).toBeNull();
  });
});

describe("book order", () => {
  it("shows every spread once before any repeats", () => {
    const keys = ["a", "b", "c", "d", "e"];
    let state = startBook();
    const seen: string[] = [];
    const rand = seededRandom(7);
    for (let i = 0; i < 10; i++) {
      const step = nextSpread(state, keys, rand);
      state = step.state;
      seen.push(step.key!);
    }
    expect(new Set(seen.slice(0, 5))).toEqual(new Set(keys));
    expect(new Set(seen.slice(5, 10))).toEqual(new Set(keys));
  });

  it("shows a promoted spread next, once, even when promoted twice", () => {
    const keys = ["a", "b", "c"];
    const rand = seededRandom(2);
    let state = nextSpread(startBook(), keys, rand).state;
    state = promote(promote(state, "c"), "c");
    const first = nextSpread(state, keys, rand);
    expect(first.key).toBe("c");
    expect(first.state.promoted).toEqual([]);
  });

  it("skips keys that disappeared and returns null when the book is empty", () => {
    const rand = seededRandom(4);
    const state = promote(startBook(), "gone");
    expect(nextSpread(state, ["a"], rand).key).toBe("a");
    expect(nextSpread(startBook(), [], rand).key).toBeNull();
  });
});
describe("mounts", () => {
  const spread = (photos: { w: number; h: number }[]): Spread => ({
    key: "k",
    guestName: "Kiah",
    photos: photos.map((p, i) => ({ id: `p${i}`, src: `/d/p${i}`, thumb: `/t/p${i}`, portrait: p.h > p.w })),
    wishes: [],
  });

  it("mounts a single print either in a gilded frame or as a taped polaroid", () => {
    const mounts = new Set<string>();
    for (let seed = 1; seed < 40; seed++) mounts.add(composePage(spread([{ w: 1200, h: 900 }]), seededRandom(seed)).mount);
    expect(mounts).toEqual(new Set(["gilded", "polaroid"]));
  });

  it("marks portrait photos so the frame keeps their shape", () => {
    const items = [
      { type: "upload", id: "a", kind: "PHOTO", guestName: "Ali", guestKey: "g", createdAt: "", moderation: "VISIBLE", width: 900, height: 1200, durationSec: null, thumbUrl: "/t", displayUrl: "/d", originalUrl: null },
      { type: "upload", id: "b", kind: "PHOTO", guestName: "Ali", guestKey: "g", createdAt: "", moderation: "VISIBLE", width: 1200, height: 900, durationSec: null, thumbUrl: "/t", displayUrl: "/d", originalUrl: null },
    ] as GalleryItem[];
    expect(buildSpreads(items)[0]!.photos.map((p) => p.portrait)).toEqual([true, false]);
  });
});
