# TDD Plan: Slideshow layouts and side rail

Spec: `docs/specs/slideshow-layouts.md` (approved 2026-10-22). Plan approved by the developer on 2026-10-22. Branch: `feat/media-slideshow-layouts`, worktree `.worktrees/feat/media-slideshow-layouts`.

Slices run one after the other in this worktree, because most of them touch `src/components/slideshow/`. Each slice is one implementer dispatch followed by one reviewer pass. The orchestrator runs the final evidence.

Unit tests stay pure (Vitest, `environment: "node"`, `tests/unit/**/*.test.ts`, no React testing library), as in the rest of the repo. So all slideshow behaviour goes into a **pure reducer** that is unit-tested, and the React component only renders the state and runs timers and effects. Rendering, timers, the dialog and the stream are covered by the e2e suite (slices 7 and 8).

## Global constraints

- Zod at every boundary: page query parameters and the stream's `view` parameter. The client component never imports zod; it gets parsed options as props.
- Server owns the truth: which items the TV may see is decided on the server (`toSlideshowMessage`, `slideshowItems`). The client's `showable()` filter stays only as defence in depth.
- Both locales: every new string in `messages/ms.json` and `messages/en.json` (`tests/unit/messages.test.ts` enforces parity).
- No new dependency. Motion only through CSS transforms and keyframes. `prefers-reduced-motion` respected.
- No plan limits or prices are touched.
- Editor quirk (`docs/HANDOFF.md:41`): after writing any file under a `[bracket]` folder, run `grep -rnE '^commit [0-9a-f]{40}' src tests` and delete any pasted git log text.
- **Must not change:**
  - `prisma/` (schema, migrations, seed);
  - `src/server/slideshow/service.ts`;
  - `src/server/gallery/` and `src/components/gallery/`;
  - the guest stream route `src/app/api/e/[slug]/stream/route.ts`;
  - `toGuestMessage` and `toHostMessage` behaviour;
  - the guest upload flow (`src/components/guest/`, `src/server/uploads/`);
  - plans and payments code;
  - specs and plans of earlier changes.

## Interfaces produced

```ts
// src/lib/schemas/slideshow.ts (server side only)
export const SLIDESHOW_LAYOUTS = ["single", "collage", "film", "mosaic"] as const;
export const slideshowOptionsSchema: z.ZodType<SlideshowOptions>; // each field z.enum([...]).catch(default)
export const streamQuerySchema = z.object({ view: z.enum(["host", "slideshow"]).default("host") }).strict();

// src/components/slideshow/options.ts (isomorphic, no zod)
export type SlideshowLayout = "single" | "collage" | "film" | "mosaic";
export type SlideshowOptions = { layout: SlideshowLayout; frame: "none" | "print"; names: boolean; rail: boolean };
export const DEFAULT_OPTIONS: SlideshowOptions; // single, none, true, false
export function optionsQuery(options: SlideshowOptions): string; // "" for defaults, else "?layout=mosaic&rail=1" (only non-defaults, fixed order)

// src/server/realtime/bus.ts
export function toSlideshowMessage(message: BusMessage): BusMessage | null; // "closed" → null, else toGuestMessage

// src/components/slideshow/state.ts (pure)
export type ShowState = {
  items: GalleryItem[];        // showable items, newest first
  layout: SlideshowLayout;
  rail: boolean;
  cursor: SlideState;          // from order.ts; drives "which item comes next" for every layout
  single: string | null;       // id shown in `single`
  collage: string[];           // ids, bottom to top, max 12
  mosaic: { tiles: string[]; next: number };  // max 12 tiles; `next` = tile to replace next
  film: string[];              // ids in the strip, left to right, length 12 when there are items
  spotlight: string | null;    // id in the spotlight
  waiting: string[];           // ids waiting for the spotlight, max 3
  last: string | null;         // id most recently placed by a multi-layout tick or pre-fill (added in slice 4)
  closed: boolean;             // access ended; show the empty state, stop everything
};
export type ShowAction =
  | { type: "tick" }                                  // the layout's timer fired (single 7 s or video end, collage 4 s, mosaic 3 s, film when a slot leaves)
  | { type: "spotlightDone" }                         // 5 s spotlight ended
  | { type: "arrive"; item: GalleryItem }             // stream "item"
  | { type: "remove"; id: string }                    // stream "remove"
  | { type: "refresh"; items: GalleryItem[] }         // 20-minute refetch succeeded
  | { type: "close" }                                 // refetch got 401/403/404
  | { type: "setOptions"; layout: SlideshowLayout; rail: boolean };
export function initShow(items: GalleryItem[], options: Pick<SlideshowOptions, "layout" | "rail">): ShowState;
export function showReducer(state: ShowState, action: ShowAction): ShowState;
export function mainItems(state: ShowState): GalleryItem[];   // what the layout may show (no wishes when rail is on)
export function railWishes(state: ShowState, max?: number): GalleryItem[]; // visible wishes, newest first, max 20

// src/components/slideshow/placement.ts (pure)
export function placement(id: string): { x: number; y: number; rotate: number }; // x 4..72 (%), y 4..62 (%), rotate -8..8 (deg); FNV-1a hash of id
```

`showable()` moves from `slideshow.tsx` to `state.ts` (exported) with its behaviour unchanged.

## Slice 1: option and stream query schemas

- Files: new `src/lib/schemas/slideshow.ts`, `src/components/slideshow/options.ts`; new test `tests/unit/schemas/slideshow.test.ts`.
- Red, `tests/unit/schemas/slideshow.test.ts`:
  - "slideshowOptionsSchema gives the defaults for an empty query": `parse({})` equals `DEFAULT_OPTIONS`.
  - "slideshowOptionsSchema parses valid values": `{ layout: "mosaic", frame: "print", names: "0", rail: "1" }` gives `{ layout: "mosaic", frame: "print", names: false, rail: true }`.
  - "slideshowOptionsSchema falls back on invalid and repeated values": `{ layout: "spiral", names: "yes", rail: ["1", "0"], frame: "" }` gives the defaults, without throwing.
  - "optionsQuery omits defaults": `optionsQuery(DEFAULT_OPTIONS)` is `""`; `optionsQuery({ ...DEFAULT_OPTIONS, layout: "film", names: false })` is `"?layout=film&names=0"`; the result parses back to the same options.
  - "streamQuerySchema defaults to host and refuses unknown views": `parse({})` gives `{ view: "host" }`; `safeParse({ view: "tv" }).success` is `false`; `safeParse({ view: "slideshow" })` succeeds.
- Command: `npx vitest run tests/unit/schemas/slideshow.test.ts`. Expected red: cannot resolve `@/lib/schemas/slideshow`.
- Green: the two modules exactly as in "Interfaces produced".
- Validate: `npm test`, `npm run typecheck`, `npm run lint`.

## Slice 2: slideshow stream filter and the `view` parameter

- Files: `src/server/realtime/bus.ts`, `src/app/api/events/[id]/stream/route.ts`; test `tests/unit/realtime/bus.test.ts` (add a `describe("toSlideshowMessage")`).
- Red, in `tests/unit/realtime/bus.test.ts`:
  - "toSlideshowMessage drops closed": `toSlideshowMessage({ type: "closed" })` is `null`.
  - "toSlideshowMessage strips the original link": a visible photo gives `{ ...photo, originalUrl: null }`.
  - "toSlideshowMessage turns hidden or pending items into removals": `HIDDEN` and `PENDING` give `{ type: "remove", id: "u1" }`.
  - "toSlideshowMessage passes removals through": `{ type: "remove", id: "u1" }` is unchanged.
- Command: `npx vitest run tests/unit/realtime/bus.test.ts`. Expected red: `toSlideshowMessage` is not exported.
- Green:
  - `toSlideshowMessage = (m) => (m.type === "closed" ? null : toGuestMessage(m))`.
  - In the stream route, after `requireEventMemberApi`, parse `Object.fromEntries(new URL(request.url).searchParams)` with `streamQuerySchema`. On failure, throw `new ApiError("validation", 400, ...)`. Pass `view === "slideshow" ? toSlideshowMessage : toHostMessage` to `sseResponse`.
  - Auth stays first, so an outsider still gets 404 and never sees a 400.
- Validate: `npm test`, `npm run typecheck`, `npm run lint`, the editor-quirk grep. The route's 400 and filtering get e2e coverage in slice 7.

## Slice 3: show reducer, core and `single` layout (includes the refresh fix logic)

- Files: new `src/components/slideshow/state.ts`; new test `tests/unit/slideshow/state.test.ts`. `order.ts` and its test are unchanged.
- Red, `tests/unit/slideshow/state.test.ts` (fixtures: photos `p1..pN`, a video `v1`, wishes `w1..wN`, built like the `photo` fixture in `bus.test.ts`):
  - "initShow keeps only showable items and starts single on the newest": a hidden photo and a voice note are dropped; `single` is the first item.
  - "tick in single cycles like today": three ticks over `[a, b, c]` show `b`, `c`, `a` (AC 6).
  - "arrive in single shows the new item next and keeps the current one" (AC 12): arrive `n` while on `b`, then tick shows `n`, then the next tick carries on from `n`'s place in the newest-first list (as today's `nextSlide`).
  - "arrive of a hidden item removes it" and "remove drops the item everywhere, including the queue" (AC 17).
  - "rail on keeps wishes out of the layout": `mainItems` has no wishes with `rail: true`, and has them with `rail: false` (AC 18, 20, 23).
  - "railWishes lists visible wishes newest first, at most 20": 25 wishes give 20, newest first (AC 22).
  - "refresh keeps the current item and updates its URLs" (AC 28): on `b`, refresh with fresh copies of `[a, b, c, d]` where `b.displayUrl` changed. `single` is still `b`, and `mainItems` returns the new URL. An id missing from the refresh is removed; a new id is added but not queued.
  - "refresh never resets the queue": queued arrivals still come next after a refresh.
  - "close empties everything" (AC 29): after `close`, `items` is `[]`, `closed` is `true`, and later `arrive` and `refresh` actions are ignored.
  - "setOptions switches layout without losing items".
- Command: `npx vitest run tests/unit/slideshow/state.test.ts`. Expected red: cannot resolve `@/components/slideshow/state`.
- Green:
  - `initShow`, `showReducer` (single-layout branches, `arrive`, `remove`, `refresh`, `close`, `setOptions`), `mainItems`, `railWishes` and `showable`.
  - Layout state holds ids only; `remove` and `refresh` prune every id list (`collage`, `mosaic.tiles`, `film`, `waiting`, `spotlight`, `cursor.queue`) of ids no longer in `items`.
  - The `collage`, `mosaic` and `film` branches of `tick` return the state unchanged until slices 4 and 5.
- Validate: `npm test`, `npm run typecheck`, `npm run lint`.

## Slice 4: collage, mosaic and the spotlight

- Files: `src/components/slideshow/state.ts`, new `src/components/slideshow/placement.ts`; tests `tests/unit/slideshow/state.test.ts`, new `tests/unit/slideshow/placement.test.ts`.
- Red, `tests/unit/slideshow/placement.test.ts`:
  - "placement is stable per id and stays on screen": the same id twice gives equal results; 500 random ids all fall within the ranges in "Interfaces produced"; two different ids usually differ (at least 450 of 500 distinct `x`).
- Refinement decided during implementation (2026-10-22): `initShow`, and `setOptions` when switching into collage or mosaic, **pre-fill** the layout with up to 12 items, so the TV is never empty on load. `last` records the last item placed, so ticks carry on with the 13th item.
- Red, `tests/unit/slideshow/state.test.ts`:
  - "collage lays the next item on top and keeps 12" (AC 7): 15 photos; `initShow` pre-fills 12, newest on top. The next tick puts the 13th-newest on top, the length stays 12, and the bottom item has left.
  - "collage with fewer than 12 cycles them to the top": 3 photos, pre-filled; each tick moves the next one to the top, with no duplicates.
  - "mosaic fills, then replaces tiles in turn without duplicates" (AC 9): 20 photos; `initShow` gives 12 tiles. The next 12 ticks replace tiles 0..11 in order, and no tile list ever holds a duplicate.
  - "switching to mosaic pre-fills it": `setOptions` from single to mosaic with 20 items gives 12 tiles.
  - "mosaic with 12 or fewer items does not change until a new item arrives": 5 photos, 10 ticks, tiles unchanged. An arrival then takes the next tile after its spotlight.
  - "arrive in a multi layout goes to the spotlight" (AC 13, 15): with `layout: "collage"`, arrive `n` sets `spotlight: "n"`. After `spotlightDone`, `n` is on top of `collage`. In mosaic, it is in tile `mosaic.next`.
  - "arrivals wait their turn, at most 3" (AC 14): with the spotlight busy, 4 arrivals leave `waiting` with the 3 newest. The oldest joins the layout directly.
  - "a new wish skips the spotlight" (AC 16): rail on, it is first in `railWishes`; rail off, it is the next item placed by `tick`.
  - "removing the spotlit item ends the spotlight" (AC 17): `remove` of the spotlit id moves the next waiting id into the spotlight, or clears it.
- Command: `npx vitest run tests/unit/slideshow`. Expected red: `placement` is not found, and the collage and mosaic ticks return unchanged state.
- Green: `placement` (FNV-1a over the id, mapped into the ranges); the `collage` and `mosaic` branches of `tick`; `arrive` routes uploads to `spotlight` or `waiting` in multi layouts; `spotlightDone` places the item and promotes the next waiting one. "Next item" always comes from `nextSlide` on `cursor`, skipping ids already in mosaic tiles (bounded by `items.length`).
- Validate: `npm test`, `npm run typecheck`, `npm run lint`.

## Slice 5: film strip

- Files: `src/components/slideshow/state.ts`; test `tests/unit/slideshow/state.test.ts`.
- Red:
  - "film fills 12 slots, repeating when there are fewer items" (AC 8): 3 photos give a strip of 12 that cycles `a b c a b c …`; 0 items give `[]`.
  - "film tick drops the left slot and appends the next item": 30 photos, and after 30 ticks every photo has been in the strip at least once.
  - "a spotlit arrival enters the film strip next" (AC 15): after `spotlightDone`, the next tick appends that id.
- Command: `npx vitest run tests/unit/slideshow/state.test.ts -t film`. Expected red: the film tick returns unchanged state and `initShow` leaves `film` empty.
- Green: the `film` branches in `initShow` and `tick`.
- Validate: `npm test`, `npm run typecheck`, `npm run lint`.

## Slice 6: strings

- Files: `messages/ms.json`, `messages/en.json`: the 14 keys in spec §7 under `slideshow`.
- Red: none that fails on its own (the parity test passes only once both files have the keys). Add the keys to both files in one step; `tests/unit/messages.test.ts` must stay green.
- Validate: `npx vitest run tests/unit/messages.test.ts`.

## Slice 7: page, stream, refresh fix, `single` layout, rail, frame, names and the settings dialog

- Files:
  - `src/app/[locale]/slideshow/[eventId]/page.tsx`: await `searchParams`, parse with `slideshowOptionsSchema`, and pass `options` plus the new labels.
  - `src/components/slideshow/slideshow.tsx`: rewrite around `useReducer(showReducer, …)`.
  - New `src/components/slideshow/settings-dialog.tsx`, `src/components/slideshow/rail.tsx`, `src/components/slideshow/photo.tsx` (the shared image with print frame and name).
  - New `tests/e2e/slideshow.spec.ts`.
  - `tests/e2e/helpers.ts`: move `joinAsGuest`, `openDemoEvent` and `SLUG` here from `tests/e2e/media.spec.ts`, which then imports them, with no behaviour change.
- Component rules:
  - The stream URL is `/api/events/${eventId}/stream?view=slideshow`.
  - The refresh effect depends only on `eventId`, uses `setInterval(REFRESH_MS)`, and dispatches `refresh`. On a 401, 403 or 404 it dispatches `close` and closes the `EventSource`.
  - Timers per layout dispatch `tick` (single: 7 s, or video `onEnded` / 20 s).
  - Settings changes call `history.replaceState(null, "", location.pathname + optionsQuery(next))` and dispatch `setOptions`. Frame and names are plain component state.
  - `cursor: none` stays on the container. Buttons and the dialog set `cursor: auto`.
  - The dialog is `role="dialog"` with `aria-modal`, labelled by `settings`. It closes on Escape and **Close**, moves focus to the first radio on open and back to the button on close.
  - Data attributes for tests: `data-testid="slideshow"` with `data-layout`, `data-testid="slideshow-rail"`, `data-testid="spotlight"`, `data-testid="slideshow-main"`.
- Red, `tests/e2e/slideshow.spec.ts` (host is the demo host at 1280 × 720, guest via `joinAsGuest`):
  - "invalid options fall back to the defaults": `/slideshow/{id}?layout=spiral&names=yes` shows `data-layout="single"` and the Settings button (AC 2, 3).
  - "settings change the layout without a reload": set `window.__marker = 1`, open Settings, pick Mosaic. `data-layout` becomes `mosaic`, the URL contains `layout=mosaic`, `window.__marker` is still `1`, Escape closes the dialog and focus returns to Settings (AC 4).
  - "rail shows a new wish and the main area does not": `?rail=1`, the guest sends a wish; it appears in `slideshow-rail` within 15 s and not in `slideshow-main` (AC 16, 21, 23).
  - "names=0 hides guest names": `?names=0`, the guest uploads a photo; `oleh {name}` never appears and the photo does (AC 19).
  - "the slideshow refreshes signed URLs every 20 minutes" (AC 28): `page.clock.install()` before `goto`. Advance 30 s of slide changes with `clock.runFor`, then `clock.fastForward("20:00")`, and expect a request to `/api/events/{id}/slideshow` (`page.waitForRequest`). Expected red against today's code: no request, because the interval restarts on every slide.
  - "the slideshow clears when access ends" (AC 29): `page.route` makes `/api/events/*/slideshow` return 404. Fast-forward 20 minutes; the empty text "Menunggu kenangan pertama…" shows and no image remains.
  - "the slideshow stream refuses an unknown view" (AC 34): `host.request.get('/api/events/{id}/stream?view=tv')` gives 400 with `error.code === "validation"`.
  - "no scrollbars at 1280 × 720 and 1920 × 1080" for `single` with `rail=0` and `rail=1` (AC 27): `document.documentElement.scrollWidth <= innerWidth`, and the same for height.
- Commands: `npm run build`, then `npx playwright test tests/e2e/slideshow.spec.ts`. Expected red: no Settings button, no rail, no request at 20 minutes, and the stream accepts `view=tv` (today it ignores the parameter and returns 200).
- Green: as listed in "Files" and "Component rules". `single` renders as today, plus the alt text and the 10-line clamp on wishes; with the rail on, its caption sits bottom left.
- Validate: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npx playwright test tests/e2e/slideshow.spec.ts tests/e2e/media.spec.ts` (the existing live test must still pass), and the editor-quirk grep.

## Slice 8: collage, mosaic, film and spotlight rendering, and reduced motion

- Files: new `src/components/slideshow/layouts.tsx` (`CollageLayout`, `MosaicLayout`, `FilmLayout`, `Spotlight`); `src/components/slideshow/slideshow.tsx` (timers and picking the layout); `src/app/globals.css` (slideshow keyframes and their `prefers-reduced-motion` overrides, next to the existing block at `globals.css:21`); `tests/e2e/slideshow.spec.ts`.
- Rendering rules:
  - Layout tiles use `thumbUrl`. The spotlight uses `displayUrl` for photos and `thumbUrl` for videos. No `<video>` outside `single`.
  - Film: the track animates `translateX` by one slot width (linear, about 6 s), and on `animationend` dispatches `tick` and restarts. With reduced motion, a 4 s timeout dispatches `tick`, with no animation.
  - Rail: under 20 wishes, scroll with CSS when the list overflows. With reduced motion, show pages of 4 wishes, changing every 8 s.
  - Collage tilt and entry, and mosaic fades, are disabled with reduced motion.
- Red, `tests/e2e/slideshow.spec.ts`:
  - "a new photo is spotlit, then joins the mosaic" (AC 13, 15): `?layout=mosaic`, the guest uploads. `spotlight` shows the photo's guest name within 15 s; after about 6 s, `spotlight` is gone and an `img` in `slideshow-main` has that photo's thumbnail URL.
  - "multi layouts render no video element and at most 12 images" (AC 10, 11): for `collage`, `film` and `mosaic`, `slideshow-main` has `video` count `0` and `img` count `<= 12`.
  - "no scrollbars in every layout at 1280 × 720 and 1920 × 1080, with and without the rail" (AC 27).
  - "reduced motion stops the film animation" (AC 26): `page.emulateMedia({ reducedMotion: "reduce" })`, `?layout=film`. The track's computed `animation-name` is `none`, and after `clock.runFor(4000)` the first slot's id has changed.
- Commands: `npm run build`, then `npx playwright test tests/e2e/slideshow.spec.ts`. Expected red: `data-layout="mosaic"` renders the single view, so there is no spotlight and the `img` counts and attributes are missing.
- Green: as listed.
- Validate: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npx playwright test tests/e2e/slideshow.spec.ts tests/e2e/media.spec.ts`, and the editor-quirk grep.
- Manual check (orchestrator, with the Playwright MCP): screenshots of each layout at 1920 × 1080 with `frame=print` and `rail=1`; the film strip scrolls without a visible jump (AC 8); a smart-TV browser, if one is available (AC 32).

## Slice 9: docs

- Files:
  - `docs/HANDOFF.md`: what changed, the refresh bug fix, and the manual checks done or not done.
  - `CLAUDE.md` and `AGENTS.md`: the status line for phase 3 gains "slideshow layouts and QR & wishes panel", if the developer wants it recorded there; the same wording in both.
- Skill: `doc-drift`.
- Validate: `node scripts/skills.mjs check`.

## Final evidence (orchestrator, Gate 6)

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `node scripts/skills.mjs check`, `npm run test:e2e` (full suite, after `npm run build`, with no stale `next start`). Then a whole-branch review by `majlis-final-reviewer`.

## Recorded deviations (2026-10-22)

- Slice 3, AC 12: after an arrival jumps the queue, the next tick carries on from the arrival's place in the newest-first list, as `nextSlide` does today (the plan first said "continues to `c`").
- Slice 4: collage, mosaic and film pre-fill up to 12 items on load and on a layout switch; a `last` field records the last item placed.
- Slices 4 and 5 review: film arrivals join in arrival order; a layout switch during a spotlight queues the spotlit and waiting items next instead of dropping them.
- Slice 8 screenshots: collage placement uses independent hashes for x, y and tilt (they were correlated); the print frame hugs the image and the guest name shows once; the stage keeps a top band clear for the controls.
- AC 27: the test checks the bounding boxes of the main area, the rail and its contents against the viewport, and the rail text size, instead of `scrollWidth` and `scrollHeight`, which cannot fail on a `fixed overflow-hidden` root.
- AC 26: under reduced motion the rail pages by measured fit, not a fixed 4 wishes.
- Whole-branch review: the `single` slide timer re-arms after every tick and arrival (a slideshow with one item froze); a short film strip refills to 12 in one tick; an e2e test checks that the slideshow stream sends no original links; collage cards sit straight under reduced motion.

## Spec coverage

| AC | Slice |
| --- | --- |
| 1–3 | 1, 7 |
| 4, 5 | 7 |
| 6, 12 | 3, 7 |
| 7, 9, 13–15, 17 | 3, 4, 8 |
| 8 | 5, 8 (smoothness manual) |
| 10, 11 | 8 |
| 16, 18–25 | 3, 4, 7 |
| 26 | 8 |
| 27 | 7, 8 |
| 28, 29 | 3, 7 |
| 30, 31 | 7 (unchanged behaviour; empty state covered by the access-ended test) |
| 32 | manual |
| 33, 34 | 2, 7 |
