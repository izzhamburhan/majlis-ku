// The slideshow's whole state as pure functions: which items exist, which one is shown, what comes next.
import type { GalleryItem } from "@/server/gallery/items";
import type { SlideshowLayout, SlideshowOptions } from "./options";
import { nextSlide, type SlideState } from "./order";

export type ShowState = {
  items: GalleryItem[]; // showable items, newest first
  layout: SlideshowLayout;
  rail: boolean;
  cursor: SlideState; // drives "which item comes next" for every layout
  single: string | null; // id shown in `single`
  collage: string[]; // ids, bottom to top, max 12
  mosaic: { tiles: string[]; next: number }; // max 12 tiles; `next` = tile to replace next
  film: string[]; // ids in the strip, left to right
  last: string | null; // id most recently placed by a tick or the pre-fill; "next item" continues after it
  spotlight: string | null; // id in the spotlight
  waiting: string[]; // ids waiting for the spotlight, max 3
  closed: boolean; // access ended: show the empty state, stop everything
};

export type ShowAction =
  | { type: "tick" }
  | { type: "spotlightDone" }
  | { type: "arrive"; item: GalleryItem }
  | { type: "remove"; id: string }
  | { type: "refresh"; items: GalleryItem[] }
  | { type: "close" }
  | { type: "setOptions"; layout: SlideshowLayout; rail: boolean };

export function showable(item: GalleryItem): boolean {
  return item.moderation === "VISIBLE" && (item.type === "wish" || item.kind === "PHOTO" || item.kind === "VIDEO");
}

const time = (item: GalleryItem) => new Date(item.createdAt).getTime();
const newestFirst = (items: GalleryItem[]) => [...items].sort((a, b) => time(b) - time(a));

export function mainItems(state: ShowState): GalleryItem[] {
  return state.rail ? state.items.filter((i) => i.type !== "wish") : state.items;
}

export function railWishes(state: ShowState, max = 20): GalleryItem[] {
  return state.items.filter((i) => i.type === "wish").slice(0, max);
}

const SLOTS = 12; // collage items on screen, mosaic tiles
const FILM_SLOTS = 12; // film strip length

const emptyCursor = (): SlideState => ({ ids: [], current: 0, queue: [] });

export function initShow(items: GalleryItem[], { layout, rail }: Pick<SlideshowOptions, "layout" | "rail">): ShowState {
  const state: ShowState = {
    items: newestFirst(items.filter(showable)),
    layout,
    rail,
    cursor: emptyCursor(),
    single: null,
    collage: [],
    mosaic: { tiles: [], next: 0 },
    film: [],
    last: null,
    spotlight: null,
    waiting: [],
    closed: false,
  };
  return prefill(fixSingle(state));
}

// Collage, mosaic and film start full (up to 12 of the newest) so the screen is never empty on load.
function prefill(state: ShowState): ShowState {
  if (state.layout === "single") return state;
  const main = mainItems(state).map((i) => i.id);
  if (state.layout === "film") {
    // Newest first, wrapping around: fewer than 12 items repeat.
    const film = main.length === 0 ? [] : Array.from({ length: FILM_SLOTS }, (_, i) => main[i % main.length]!);
    return { ...state, film, last: film.at(-1) ?? null };
  }
  const first = main.slice(0, SLOTS);
  const last = main[Math.min(SLOTS, main.length) - 1] ?? null;
  return state.layout === "collage"
    ? { ...state, collage: first.reverse(), last }
    : { ...state, mosaic: { tiles: first, next: 0 }, last };
}

// The id that follows `last` in newest-first order, new arrivals first.
function advance(state: ShowState): { cursor: SlideState; id: string | null } {
  const ids = mainItems(state).map((i) => i.id);
  const cursor = nextSlide({ ids, current: ids.indexOf(state.last ?? ""), queue: state.cursor.queue });
  return { cursor, id: ids[cursor.current] ?? null };
}

const stack = (list: string[], id: string) => [...list.filter((x) => x !== id), id].slice(-SLOTS);

// Put an id into the layout at once, without moving `last`.
function place(state: ShowState, id: string): ShowState {
  const { tiles, next } = state.mosaic;
  switch (state.layout) {
    case "collage":
      return { ...state, collage: stack(state.collage, id) };
    case "mosaic":
      if (tiles.includes(id)) return state;
      return tiles.length < SLOTS
        ? { ...state, mosaic: { tiles: [...tiles, id], next } }
        : { ...state, mosaic: { tiles: tiles.map((t, i) => (i === next ? id : t)), next: (next + 1) % SLOTS } };
    case "film": // the film tick appends queued ids first, in arrival order
      return { ...state, cursor: { ...state.cursor, queue: [...state.cursor.queue.filter((x) => x !== id), id] } };
    default:
      return state;
  }
}

// Keep `single` if it is still in the layout, else fall back to the first item.
function fixSingle(state: ShowState): ShowState {
  const main = mainItems(state);
  return main.some((i) => i.id === state.single) ? state : { ...state, single: main[0]?.id ?? null };
}

// Swap the item list and drop every id that is no longer in it.
function withItems(state: ShowState, items: GalleryItem[]): ShowState {
  const live = new Set(items.map((i) => i.id));
  const keep = (ids: string[]) => ids.filter((id) => live.has(id));
  const tiles = keep(state.mosaic.tiles);
  const waiting = keep(state.waiting);
  let spotlight = state.spotlight !== null && live.has(state.spotlight) ? state.spotlight : null;
  // The spotlit item is gone: the next waiting one takes its place (multi layouts only).
  if (spotlight === null && state.spotlight !== null && state.layout !== "single") spotlight = waiting.shift() ?? null;
  return {
    ...state,
    items,
    collage: keep(state.collage),
    mosaic: { tiles, next: state.mosaic.next < tiles.length ? state.mosaic.next : 0 },
    film: keep(state.film),
    last: state.last !== null && live.has(state.last) ? state.last : null,
    waiting,
    spotlight,
    cursor: { ...state.cursor, queue: keep(state.cursor.queue) },
  };
}

function remove(state: ShowState, id: string): ShowState {
  const index = mainItems(state).findIndex((i) => i.id === id);
  const next = withItems(state, state.items.filter((i) => i.id !== id));
  if (state.single !== id) return next;
  const main = mainItems(next);
  return { ...next, single: main[main.length > 0 ? index % main.length : 0]?.id ?? null };
}

function arrive(state: ShowState, item: GalleryItem): ShowState {
  if (!showable(item)) return remove(state, item.id);
  if (state.items.some((i) => i.id === item.id)) return { ...state, items: state.items.map((i) => (i.id === item.id ? item : i)) };
  const items = newestFirst([...state.items, item]);
  const queued = { ...state, items, cursor: { ...state.cursor, queue: [...state.cursor.queue, item.id] } };
  if (state.layout === "single") return fixSingle(queued);
  if (item.type === "wish") return state.rail ? { ...state, items } : queued; // never spotlit
  if (state.spotlight === null) return { ...state, items, spotlight: item.id };
  const waiting = [...state.waiting, item.id];
  const oldest = waiting.length > 3 ? waiting.shift() : undefined;
  const waited = { ...state, items, waiting };
  return oldest === undefined ? waited : place(waited, oldest);
}

function tick(state: ShowState): ShowState {
  if (state.layout === "collage") {
    const { cursor, id } = advance(state);
    return id === null ? state : { ...state, cursor, last: id, collage: stack(state.collage, id) };
  }
  if (state.layout === "mosaic") return tickMosaic(state);
  if (state.layout === "film") return tickFilm(state);
  const main = mainItems(state).map((i) => i.id);
  const cursor = nextSlide({ ids: main, current: main.indexOf(state.single ?? ""), queue: state.cursor.queue });
  return { ...state, cursor, single: main[cursor.current] ?? null };
}

// The strip slides left: the next item (queued first, repeats allowed) joins on the right.
// A short strip (started empty, or pruned) refills to 12 in one tick instead of growing a slot per step.
function tickFilm(state: ShowState): ShowState {
  let next: ShowState = { ...state, film: state.film.length >= FILM_SLOTS ? state.film.slice(1) : state.film };
  do {
    const { cursor, id } = advance(next);
    if (id === null) return state;
    next = { ...next, cursor, last: id, film: [...next.film, id] };
  } while (next.film.length < FILM_SLOTS);
  return next;
}

// The next item that is not already on a tile; nothing new to show means no change.
function tickMosaic(state: ShowState): ShowState {
  const total = mainItems(state).length;
  let probe = state;
  for (let i = 0; i < total; i++) {
    const { cursor, id } = advance(probe);
    if (id === null) break;
    probe = { ...probe, cursor, last: id };
    if (!state.mosaic.tiles.includes(id)) return place(probe, id);
  }
  return state;
}

// The spotlight ended: the item joins the layout, the next waiting one takes the stage.
function spotlightDone(state: ShowState): ShowState {
  const placed = state.spotlight === null ? state : place(state, state.spotlight);
  return { ...placed, spotlight: state.waiting[0] ?? null, waiting: state.waiting.slice(1) };
}

function setOptions(state: ShowState, layout: SlideshowLayout, rail: boolean): ShowState {
  const switched = layout !== state.layout;
  let next: ShowState = { ...state, layout, rail };
  // Wishes go to the rail: drop them from the layout lists.
  if (rail && !state.rail) next = { ...withItems(next, state.items.filter((i) => i.type !== "wish")), items: state.items };
  // A new layout starts fresh from the newest items; the spotlit and waiting items come up next in the new cycle.
  if (switched) {
    const pending = [...(state.spotlight ? [state.spotlight] : []), ...state.waiting];
    next = prefill({ ...next, spotlight: null, waiting: [] });
    const queue = next.cursor.queue;
    next = { ...next, cursor: { ...next.cursor, queue: [...queue, ...pending.filter((id) => !queue.includes(id))] } };
  }
  return fixSingle(next);
}

export function showReducer(state: ShowState, action: ShowAction): ShowState {
  if (state.closed) return state;
  switch (action.type) {
    case "tick":
      return tick(state);
    case "spotlightDone":
      return spotlightDone(state);
    case "arrive":
      return arrive(state, action.item);
    case "remove":
      return remove(state, action.id);
    case "refresh":
      return fixSingle(withItems(state, newestFirst(action.items.filter(showable))));
    case "close":
      return { ...withItems(state, []), single: null, cursor: emptyCursor(), closed: true };
    case "setOptions":
      return setOptions(state, action.layout, action.rail);
  }
}
