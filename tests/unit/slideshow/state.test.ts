import { describe, expect, it } from "vitest";
import type { GalleryItem } from "@/server/gallery/items";
import { initShow, mainItems, railWishes, showReducer, type ShowAction, type ShowState } from "@/components/slideshow/state";

// A larger `t` is a newer item.
const at = (t: number) => new Date(Date.UTC(2026, 11, 12, 3, t));

const photo = (id: string, t: number, extra: Partial<Extract<GalleryItem, { type: "upload" }>> = {}): GalleryItem => ({
  type: "upload",
  id,
  kind: "PHOTO",
  guestName: "Ali",
  createdAt: at(t),
  moderation: "VISIBLE",
  width: 10,
  height: 10,
  durationSec: null,
  thumbUrl: `/t/${id}`,
  displayUrl: `/d/${id}`,
  originalUrl: null,
  ...extra,
});

const video = (id: string, t: number): GalleryItem => photo(id, t, { kind: "VIDEO", durationSec: 5 });

const wish = (id: string, t: number): GalleryItem => ({
  type: "wish",
  id,
  guestName: "Siti",
  createdAt: at(t),
  moderation: "VISIBLE",
  message: `Wish ${id}`,
});

const single = { layout: "single", rail: false } as const;
const run = (state: ShowState, ...actions: ShowAction[]) => actions.reduce(showReducer, state);
const ids = (items: GalleryItem[]) => items.map((i) => i.id);

describe("initShow", () => {
  it("keeps only showable items and starts single on the newest", () => {
    const hidden = photo("h1", 9, { moderation: "HIDDEN" });
    const voiceNote = photo("n1", 8, { kind: "VOICE" });
    const state = initShow([photo("p1", 1), hidden, voiceNote, video("v1", 3), photo("p2", 2)], single);
    expect(ids(state.items)).toEqual(["v1", "p2", "p1"]);
    expect(state.single).toBe("v1");
    expect(state.closed).toBe(false);
  });
});

describe("showReducer", () => {
  const abc = () => initShow([photo("a", 3), photo("b", 2), photo("c", 1)], single);

  it("tick in single cycles like today", () => {
    let state = abc();
    const seen: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      state = run(state, { type: "tick" });
      seen.push(state.single);
    }
    expect(seen).toEqual(["b", "c", "a"]);
  });

  it("arrive in single shows the new item next and keeps the current one", () => {
    let state = run(abc(), { type: "tick" });
    expect(state.single).toBe("b");
    state = run(state, { type: "arrive", item: photo("n", 9) });
    expect(state.single).toBe("b");
    expect(ids(state.items)).toEqual(["n", "a", "b", "c"]);
    state = run(state, { type: "tick" });
    expect(state.single).toBe("n");
    // Back to the normal order: the item after `n` in newest-first order.
    state = run(state, { type: "tick" });
    expect(state.single).toBe("a");
  });

  it("arrive of a hidden item removes it", () => {
    const state = run(abc(), { type: "arrive", item: photo("b", 2, { moderation: "HIDDEN" }) });
    expect(ids(state.items)).toEqual(["a", "c"]);
  });

  it("remove drops the item everywhere, including the queue", () => {
    let state = run(abc(), { type: "arrive", item: photo("n", 9) });
    expect(state.cursor.queue).toEqual(["n"]);
    state = { ...state, collage: ["n", "a"], mosaic: { tiles: ["a", "n"], next: 1 }, film: ["n"], waiting: ["n", "c"], spotlight: "n" };
    state = run(state, { type: "remove", id: "n" });
    expect(ids(state.items)).toEqual(["a", "b", "c"]);
    expect(state.cursor.queue).toEqual([]);
    expect(state.collage).toEqual(["a"]);
    expect(state.mosaic.tiles).toEqual(["a"]);
    expect(state.film).toEqual([]);
    expect(state.waiting).toEqual(["c"]);
    expect(state.spotlight).toBeNull();
  });

  it("remove of the current item moves single to the one after it, wrapping", () => {
    let state = run(abc(), { type: "remove", id: "a" });
    expect(state.single).toBe("b");
    state = run(state, { type: "tick" }, { type: "remove", id: "c" });
    expect(state.single).toBe("b");
    state = run(state, { type: "remove", id: "b" });
    expect(state.single).toBeNull();
  });

  it("refresh keeps the current item and updates its URLs", () => {
    const state = run(abc(), { type: "tick" }, { type: "arrive", item: photo("q", 8) });
    const fresh = [photo("a", 3), photo("b", 2, { displayUrl: "/d/b?new" }), photo("d", 0)];
    const next = run(state, { type: "refresh", items: fresh });
    expect(next.single).toBe("b");
    expect(mainItems(next).find((i) => i.id === "b")).toMatchObject({ displayUrl: "/d/b?new" });
    // `c` and `q` are gone, `d` is new and not queued.
    expect(ids(next.items)).toEqual(["a", "b", "d"]);
    expect(next.cursor.queue).toEqual([]);
  });

  it("refresh never resets the queue", () => {
    let state = run(abc(), { type: "arrive", item: photo("n", 9) });
    state = run(state, { type: "refresh", items: [photo("n", 9), photo("a", 3), photo("b", 2), photo("c", 1)] });
    expect(state.cursor.queue).toEqual(["n"]);
    expect(run(state, { type: "tick" }).single).toBe("n");
  });

  it("close empties everything", () => {
    let state = run(abc(), { type: "arrive", item: photo("n", 9) }, { type: "close" });
    expect(state.items).toEqual([]);
    expect(state.closed).toBe(true);
    expect(state.single).toBeNull();
    expect(state.cursor.queue).toEqual([]);
    state = run(state, { type: "arrive", item: photo("x", 5) }, { type: "refresh", items: [photo("y", 5)] }, { type: "tick" });
    expect(state.items).toEqual([]);
    expect(state.closed).toBe(true);
  });

  it("close empties every layout's state, including spotlight and queue", () => {
    let state = run(
      initShow([photo("a", 3), photo("b", 2), photo("c", 1)], { layout: "collage", rail: false }),
      { type: "tick" },
      { type: "arrive", item: photo("n0", 8) },
      { type: "arrive", item: photo("n1", 9) },
      { type: "arrive", item: wish("w", 10) }, // queued, not spotlit
    );
    state = { ...state, mosaic: { tiles: ["a", "b"], next: 1 }, film: ["a", "b"], single: "a" };
    expect(state.collage.length).toBeGreaterThan(0);
    expect(state.spotlight).toBe("n0");
    expect(state.waiting).toEqual(["n1"]);
    expect(state.cursor.queue.length).toBeGreaterThan(0);
    expect(state.last).not.toBeNull();
    state = run(state, { type: "close" });
    expect(state.closed).toBe(true);
    expect(state.items).toEqual([]);
    expect(state.collage).toEqual([]);
    expect(state.mosaic.tiles).toEqual([]);
    expect(state.film).toEqual([]);
    expect(state.spotlight).toBeNull();
    expect(state.waiting).toEqual([]);
    expect(state.cursor.queue).toEqual([]);
    expect(state.single).toBeNull();
    expect(state.last).toBeNull();
  });

  it("setOptions switches layout without losing items", () => {
    const state = run(abc(), { type: "setOptions", layout: "collage", rail: false });
    expect(state.layout).toBe("collage");
    expect(ids(state.items)).toEqual(["a", "b", "c"]);
    expect(state.single).toBe("a");
  });
});

describe("mainItems and railWishes", () => {
  const mixed = [photo("p1", 1), wish("w1", 2), video("v1", 3)];

  it("rail on keeps wishes out of the layout", () => {
    expect(ids(mainItems(initShow(mixed, { layout: "single", rail: true })))).toEqual(["v1", "p1"]);
    expect(ids(mainItems(initShow(mixed, { layout: "single", rail: false })))).toEqual(["v1", "w1", "p1"]);
  });

  it("rail on moves single off a wish when options change", () => {
    const state = run(initShow([wish("w1", 5), photo("p1", 1)], single), { type: "setOptions", layout: "single", rail: true });
    expect(state.single).toBe("p1");
  });

  it("railWishes lists visible wishes newest first, at most 20", () => {
    const wishes = Array.from({ length: 25 }, (_, i) => wish(`w${i + 1}`, i + 1));
    const state = initShow([photo("p1", 0), ...wishes], { layout: "single", rail: true });
    const rail = railWishes(state);
    expect(rail).toHaveLength(20);
    expect(rail[0]?.id).toBe("w25");
    expect(rail[19]?.id).toBe("w6");
    expect(railWishes(state, 3)).toHaveLength(3);
  });
});

describe("collage, mosaic and the spotlight", () => {
  // p1 is the oldest, pN the newest.
  const many = (n: number) => Array.from({ length: n }, (_, i) => photo(`p${i + 1}`, i + 1));
  const tick = { type: "tick" } as const;
  const done = { type: "spotlightDone" } as const;
  const collage = { layout: "collage", rail: false } as const;
  const mosaic = { layout: "mosaic", rail: false } as const;
  const abc = (options: Parameters<typeof initShow>[1]) => initShow([photo("a", 3), photo("b", 2), photo("c", 1)], options);

  it("collage lays the next item on top and keeps 12", () => {
    const state = initShow(many(15), collage);
    expect(state.collage).toHaveLength(12);
    expect(state.collage[0]).toBe("p4");
    expect(state.collage.at(-1)).toBe("p15");
    const next = run(state, tick);
    expect(next.collage).toHaveLength(12);
    expect(next.collage.at(-1)).toBe("p3");
    expect(next.collage).not.toContain("p4");
  });

  it("collage with fewer than 12 cycles them to the top", () => {
    let state = abc(collage);
    expect(state.collage).toEqual(["c", "b", "a"]);
    const tops: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      state = run(state, tick);
      tops.push(state.collage.at(-1));
      expect(new Set(state.collage).size).toBe(3);
    }
    expect(tops).toEqual(["a", "b", "c", "a"]);
  });

  it("mosaic fills, then replaces tiles in turn without duplicates", () => {
    let state = initShow(many(20), mosaic);
    expect(state.mosaic.tiles).toHaveLength(12);
    expect(state.mosaic.next).toBe(0);
    for (let k = 1; k <= 12; k++) {
      const before = state.mosaic.tiles;
      state = run(state, tick);
      const changed = state.mosaic.tiles.flatMap((id, i) => (id !== before[i] ? [i] : []));
      expect(changed).toEqual([k - 1]);
      expect(state.mosaic.next).toBe(k % 12);
      expect(new Set(state.mosaic.tiles).size).toBe(12);
    }
  });

  it("mosaic with 12 or fewer items does not change until a new item arrives", () => {
    const start = initShow(many(5), mosaic);
    expect(start.mosaic.tiles).toHaveLength(5);
    let state = start;
    for (let i = 0; i < 10; i++) state = run(state, tick);
    expect(state).toEqual(start);
    state = run(state, { type: "arrive", item: photo("n", 9) });
    expect(state.spotlight).toBe("n");
    state = run(state, done);
    expect(state.mosaic.tiles).toHaveLength(6);
    expect(state.mosaic.tiles).toContain("n");
  });

  it("switching to mosaic pre-fills it", () => {
    const state = run(initShow(many(20), single), { type: "setOptions", layout: "mosaic", rail: false });
    expect(state.mosaic.tiles).toHaveLength(12);
    expect(state.mosaic.next).toBe(0);
  });

  it("turning the rail on takes wishes out of the collage", () => {
    const state = initShow([photo("a", 1), wish("w", 2)], collage);
    expect(state.collage).toEqual(["a", "w"]);
    expect(run(state, { type: "setOptions", layout: "collage", rail: true }).collage).toEqual(["a"]);
  });

  it("arrive in a multi layout goes to the spotlight", () => {
    let state = run(abc(collage), { type: "arrive", item: photo("n", 9) });
    expect(state.spotlight).toBe("n");
    expect(state.collage).not.toContain("n");
    state = run(state, done);
    expect(state.spotlight).toBeNull();
    expect(state.collage.at(-1)).toBe("n");

    let full = initShow(many(20), mosaic);
    const index = full.mosaic.next;
    full = run(full, { type: "arrive", item: photo("n", 99) }, done);
    expect(full.mosaic.tiles[index]).toBe("n");
    expect(full.mosaic.next).toBe(index + 1);
  });

  it("arrivals wait their turn, at most 3", () => {
    const arrivals = ["n0", "n1", "n2", "n3", "n4"].map((id, i) => ({ type: "arrive", item: photo(id, 10 + i) }) as const);
    const state = run(abc(collage), ...arrivals);
    expect(state.spotlight).toBe("n0");
    expect(state.waiting).toEqual(["n2", "n3", "n4"]);
    expect(state.collage.at(-1)).toBe("n1");
    const after = run(state, done);
    expect(after.collage.at(-1)).toBe("n0");
    expect(after.spotlight).toBe("n2");
    expect(after.waiting).toEqual(["n3", "n4"]);
  });

  it("a new wish skips the spotlight", () => {
    const rail = run(abc({ layout: "collage", rail: true }), { type: "arrive", item: wish("w", 9) });
    expect(rail.spotlight).toBeNull();
    expect(railWishes(rail)[0]?.id).toBe("w");
    expect(rail.cursor.queue).toEqual([]);

    let state = run(abc(collage), { type: "arrive", item: wish("w", 9) });
    expect(state.spotlight).toBeNull();
    state = run(state, tick);
    expect(state.collage.at(-1)).toBe("w");
  });

  it("removing the spotlit item ends the spotlight", () => {
    let state = run(abc(collage), { type: "arrive", item: photo("n1", 8) }, { type: "arrive", item: photo("n2", 9) });
    expect(state.spotlight).toBe("n1");
    expect(state.waiting).toEqual(["n2"]);
    state = run(state, { type: "remove", id: "n1" });
    expect(state.spotlight).toBe("n2");
    expect(state.waiting).toEqual([]);
    state = run(state, { type: "remove", id: "n2" });
    expect(state.spotlight).toBeNull();
  });

  it("refresh in a multi layout keeps spotlight, waiting and collage, and updates URLs", () => {
    let state = run(abc(collage), { type: "arrive", item: photo("n0", 8) }, { type: "arrive", item: photo("n1", 9) });
    const collageBefore = state.collage;
    const fresh = [photo("n1", 9), photo("n0", 8), photo("a", 3, { thumbUrl: "/t/a?new" }), photo("b", 2), photo("c", 1)];
    state = run(state, { type: "refresh", items: fresh });
    expect(state.spotlight).toBe("n0");
    expect(state.waiting).toEqual(["n1"]);
    expect(state.collage).toEqual(collageBefore);
    expect(collageBefore).toContain("a");
    expect(state.items.find((i) => i.id === "a")).toMatchObject({ thumbUrl: "/t/a?new" });
  });

  it("refresh with the same ids leaves the mosaic tiles alone", () => {
    const state = initShow(many(20), mosaic);
    const next = run(state, { type: "refresh", items: many(20) });
    expect(next.mosaic).toEqual(state.mosaic);
  });

  it("switching layout mid-spotlight queues the spotlit and waiting items next", () => {
    let state = run(abc(collage), { type: "arrive", item: photo("n0", 8) }, { type: "arrive", item: photo("n1", 9) });
    expect(state.spotlight).toBe("n0");
    expect(state.waiting).toEqual(["n1"]);
    state = run(state, { type: "setOptions", layout: "film", rail: false });
    expect(state.spotlight).toBeNull();
    expect(state.waiting).toEqual([]);
    expect(state.cursor.queue).toEqual(["n0", "n1"]);
    // Film pre-fill does not hold them at the tail, so they enter the strip next, in order.
    state = run(state, { type: "tick" }, { type: "tick" });
    expect(state.film.slice(-2)).toEqual(["n0", "n1"]);
  });

  describe("film", () => {
    const filmOptions = { layout: "film", rail: false } as const;

    it("film fills 12 slots, repeating when there are fewer items", () => {
      expect(abc(filmOptions).film).toEqual("abcabcabcabc".split(""));
      expect(initShow([], filmOptions).film).toEqual([]);
    });

    it("film tick drops the left slot and appends the next item", () => {
      let state = initShow(many(30), filmOptions);
      expect(state.film).toEqual(Array.from({ length: 12 }, (_, i) => `p${30 - i}`));
      const seen = new Set(state.film);
      for (let i = 0; i < 30; i++) {
        const before = state.film;
        state = run(state, tick);
        expect(state.film).toHaveLength(12);
        expect(state.film.slice(0, 11)).toEqual(before.slice(1));
        state.film.forEach((id) => seen.add(id));
      }
      expect(seen.size).toBe(30);
    });

    it("a tick with no items changes nothing", () => {
      const state = initShow([], filmOptions);
      expect(run(state, tick)).toEqual(state);
    });

    it("a spotlit arrival enters the film strip next", () => {
      let state = run(initShow(many(20), filmOptions), { type: "arrive", item: photo("n", 99) });
      expect(state.spotlight).toBe("n");
      expect(state.film).not.toContain("n");
      state = run(state, done);
      expect(state.film).not.toContain("n");
      state = run(state, tick);
      expect(state.film.at(-1)).toBe("n");
      expect(state.film).toHaveLength(12);
    });

    it("spotlit arrivals enter the film strip in arrival order", () => {
      let state = run(
        initShow(many(20), filmOptions),
        { type: "arrive", item: photo("n0", 98) },
        { type: "arrive", item: photo("n1", 99) },
      );
      expect(state.spotlight).toBe("n0");
      expect(state.waiting).toEqual(["n1"]);
      state = run(state, done, done, tick, tick);
      expect(state.film.slice(-2)).toEqual(["n0", "n1"]);
    });

    it("a pruned strip refills to 12", () => {
      let state = initShow(many(20), filmOptions);
      state = run(state, { type: "remove", id: "p15" });
      expect(state.film).toHaveLength(11);
      state = run(state, tick);
      expect(state.film).toHaveLength(12);
    });

    it("a short film strip refills to 12 in one tick", () => {
      let state = run(
        initShow([], filmOptions),
        ...["n0", "n1", "n2"].map((id, i) => ({ type: "arrive", item: photo(id, 10 + i) }) as const),
        done,
        done,
        done,
      );
      expect(state.film).toEqual([]);
      state = run(state, tick);
      expect(state.film).toHaveLength(12);
      expect(state.film.slice(0, 3)).toEqual(["n0", "n1", "n2"]); // queued arrivals first, then the cycle goes on
      expect(state.last).toBe(state.film.at(-1));
    });

    it("switching to film pre-fills it", () => {
      const state = run(initShow(many(20), single), { type: "setOptions", layout: "film", rail: false });
      expect(state.film).toHaveLength(12);
      expect(state.film[0]).toBe("p20");
    });
  });
});
