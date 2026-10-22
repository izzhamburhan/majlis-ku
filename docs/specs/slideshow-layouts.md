# Spec: Slideshow layouts and side rail

Status: approved by the developer on 2026-10-22. The final reviewer reviewed v1 on 2026-10-22; its findings are folded in.
Branch: `feat/media-slideshow-layouts`. First of six changes picked on 2026-10-22 (low-risk first: A slideshow, B QR prints, C e-card, D free-plan cap, E sub-events, F marketing site).
Requirement source: `docs/brief.md`, "Slideshow mode: full-screen auto-rotating display for a TV/projector that shows new uploads in real time." This change extends phase 3's slideshow.

Decisions taken with the developer on 2026-10-22:

1. Four layouts: one at a time, collage, film strip, mosaic. The drifting photo wall is cut for now.
2. The collage uses 400 px thumbnails. Only the spotlight uses the full display image.
3. The slideshow gets its own filtered live stream, so hidden and unapproved items and links to originals never reach the TV browser.
4. The existing signed-URL refresh bug (below) is fixed in this change.
5. With reduced motion, collage cards sit straight (no tilt), as AC 26 says.
6. Known limit, accepted: if the host deletes the event while the TV shows it, the slideshow keeps its wishes on screen (with broken media) until its next refresh, at most 20 minutes, and then clears (AC 29). The slideshow stream drops "closed", which deletion publishes. Clearing at once would need a separate "deleted" message, which is out of scope.

**Second existing bug fixed here** (found in the whole-branch review). In `single`, the slide timer re-arms only when the shown item changes. With exactly one item, a tick and a new arrival both keep the same item, so the slideshow freezes on the first photo until the 20-minute refresh. That is the usual start at a venue, so AC 12 depends on this fix.

**Existing bug fixed here.** The 20-minute refresh of signed URLs never runs. Its effect depends on `current` (`src/components/slideshow/slideshow.tsx:95`), so the interval restarts on every slide change. Signed URLs live one hour (`MEDIA_URL_TTL_SEC`, `src/server/media/storage.ts:22`), so a slideshow left running longer than that loses all its media. The refresh also replaces the item list and resets the position.

## 1. Goal and non-goals

**Goal.** The host can choose how the venue slideshow looks: one of four layouts, an optional printed-photo frame, guest names on or off, and an optional side rail that keeps the upload QR and the newest wishes on screen. New uploads still appear live, the slideshow keeps working for a whole event, and the TV never receives items the guests may not see.

**Non-goals.**

- Saving the choice on the server or per event (it lives in the page URL; see §9), or remembering it when the host reopens the slideshow from the dashboard.
- A drifting photo wall layout.
- Playing several videos at once, or sound in any layout.
- Voice notes in the slideshow (left out today; unchanged).
- Keeping an 800 px video poster (only the 400 px thumbnail exists; see §2.11).
- Changing which items the slideshow loads (`slideshowItems`: up to 200 visible items).
- Hiding the controls automatically when the mouse is still.

## 2. Acceptance criteria

Criteria marked *(manual)* are checked by eye in a browser; all others get an automated test.

Options and settings

1. The page `/slideshow/{eventId}` reads four query parameters: `layout` (`single` | `collage` | `film` | `mosaic`), `frame` (`none` | `print`), `names` (`1` | `0`) and `rail` (`1` | `0`).
2. With no parameters, the slideshow shows the same content in the same way as today (`layout=single`, `frame=none`, `names=1`, `rail=0`). The only visible addition is a **Settings** button next to **Full screen**.
3. A missing, invalid or repeated value falls back to its default, without an error page. For example, `layout=spiral` gives `single`, `names=yes` gives `1`, and `layout=film&layout=x` gives `single`.
4. **Settings** opens a dialog (labelled "Settings", closed by Escape or **Close**, with focus moved into it on open and back to the button on close). It holds a layout choice (radio buttons) and three checkboxes: print frame, guest names and the QR & wishes panel. Each change applies at once and rewrites the URL with `history.replaceState`, with no navigation or server request, so a refresh or bookmark keeps the choice.
5. The mouse pointer is hidden over the slideshow, as today, but visible over the buttons and the dialog.

Layouts

6. `single`: one item at a time, as today (photo, video with `onEnded` or a 20 s cap, wish as a quote of at most 10 lines).
7. `collage`: thumbnails are scattered on screen with small tilts. Every 4 s the next item is laid on top; at most 12 are on screen, and the oldest leaves when a 13th arrives. Each item's position and tilt are derived from its id, so a refresh lays it out the same way. With fewer than 12 items, it shows those it has and keeps cycling them to the top.
8. `film`: a horizontal strip of thumbnails moves from right to left. When a thumbnail leaves on the left, the next item enters on the right, in the same order as `single`: new arrivals first, then cycling through all items. So over time every item is shown, not just the first screen. At most 12 images are in the strip. With fewer items than the strip has slots, items repeat. The movement is smooth, with no visible jump *(manual)*.
9. `mosaic`: a 4 × 3 grid of thumbnails. Every 3 s one tile changes to the next item, taking tiles in turn so each is refreshed before any is reused. With 12 items or fewer, every item shows once and tiles change only when a new item arrives.
10. Every image in the four layouts and the spotlight comes from the item list that the server sent (signed URLs). No layout shows more than 12 images, plus one spotlight image and the QR code.
11. A video shows as its 400 px poster (`thumbUrl`) in `collage`, `film` and `mosaic`, and is never a `<video>` element there. In `single` it plays as today.

New arrivals and the spotlight

12. In `single`, a new item is shown next, as today.
13. In `collage`, `film` and `mosaic`, a new photo or video first appears large in the centre (the **spotlight**) for 5 s, using the display image for photos and the poster for videos. The layout keeps moving, dimmed, behind it.
14. Arrivals are spotlighted one after another, in arrival order. At most 3 can wait; when a 4th arrives, the oldest waiting one skips the spotlight and joins the layout directly.
15. After its spotlight, an item joins the layout as the next one: on top of the collage, the next tile in the mosaic, or the next to enter the film strip.
16. A new wish skips the spotlight. With `rail=1` it goes to the top of the rail; with `rail=0` it is the next item in the layout.
17. An item that is hidden, deleted or still awaiting approval never appears in any layout, the spotlight or the rail. If it becomes hidden while shown, it disappears when the stream message arrives, including from the spotlight and its waiting queue.

Frame, names and wishes

18. `frame=print` draws photos and video posters with a white border and a deeper bottom margin, like a printed photo. With `names=1`, the guest name is written in that margin. Wish cards keep their own card style.
19. `names=0` hides guest names everywhere: captions, the spotlight, print-frame margins, the "by {name}" line under wishes, and the rail.
20. With `rail=0`, wishes take their turn in every layout. In `single` they show as today's full-screen quote. In `collage`, `film` and `mosaic` they show as text cards of the same size as a tile, clamped to 6 lines, with the guest name below when `names=1`.

Side rail

21. `rail=1` adds a panel on the right, about 28% of the screen width, in place of the bottom bar. From top to bottom it shows: the host names, the QR code (at least 240 px, with alt text), the scan text, the short event URL, and the newest visible wishes.
22. The rail lists up to 20 wishes, newest first, each clamped to 4 lines. With none, it shows "No wishes yet". When the list is taller than the rail, it scrolls slowly and loops.
23. With `rail=1`, wishes show only in the rail, not in the layout. If no photos or videos are visible, the main area shows "Waiting for the first photo…" while the rail shows the wishes.
24. With `rail=1` in `single`, the guest-name caption shows at the bottom left of the main area.
25. With `rail=0`, the bottom bar shows as today (host names, caption, scan text, URL and QR code, now with alt text).

Motion, screens and lifetime

26. With `prefers-reduced-motion: reduce`, nothing slides, scrolls or tilts. The film strip steps one place every 4 s without animation, and the rail shows the wishes that fit, then pages to the next set every 8 s. So every item and wish still gets its turn.
27. On 1920 × 1080 and 1280 × 720, every layout fills the screen without scrollbars (the document's `scrollWidth` and `scrollHeight` equal the viewport), and rail text is at least 24 px.
28. The slideshow fetches fresh signed URLs 20 minutes after the page loads and every 20 minutes after that, however often the slides change. The fetch keeps which items are on screen, in the spotlight, waiting and in the rail: it updates their URLs by id, adds items it did not have, and removes ones no longer returned.
29. If the refresh returns 401, 403 or 404 (signed out, removed co-host, deleted event), the slideshow clears every item, closes the stream and shows the empty state.
30. When the stream drops, the slideshow keeps cycling the items it has, and the browser reconnects as today.
31. With no visible items, every layout shows "Waiting for the first memory…". The rail, if on, still shows the QR code.
32. It works in Chrome on a laptop. If a smart-TV browser is available, it is checked there too *(manual)*.

Slideshow stream

33. `GET /api/events/{id}/stream?view=slideshow` sends only visible items, with no link to originals. An item that becomes hidden or pending is sent as a removal. "Closed" is never sent, so the slideshow keeps running when an admin suspends the event, as decided in phase 7.
34. Without `view`, the host stream behaves exactly as today. `view` with any other value is refused with 400 `validation`.

## 3. Data model

No change. No migration.

## 4. API contract

**`GET /api/events/{id}/stream`** (changed, backward compatible)

- Who: host or co-host of the event, as today (`requireEventMemberApi`: 401 without a session, 404 for anyone else).
- Input: optional query `view`, parsed with `streamQuerySchema = z.object({ view: z.enum(["host", "slideshow"]).default("host") })` in `src/lib/schemas/slideshow.ts`. Any other value gives 400 with `{ error: { code: "validation", ... } }`, the shape `handle()` already returns.
- Output: the same SSE stream. With `view=slideshow`, messages pass through a new `toSlideshowMessage` in `src/server/realtime/bus.ts`: "closed" is dropped, and everything else goes through `toGuestMessage`.

**Page `/[locale]/slideshow/[eventId]`** (changed)

- Who: unchanged (`requireEventMember`: host or co-host, otherwise not found).
- Input: the query parameters in §2.1, read from the awaited `searchParams` and parsed with `slideshowOptionsSchema` in `src/lib/schemas/slideshow.ts`. Each field is `z.enum([...]).catch(default)`, so a repeated (array) or unknown value falls back to the default and the parse never throws. The parsed options go to the client component as props, so the client does not import zod.

**`GET /api/events/{id}/slideshow`**: unchanged. It already returns visible items without links to originals (`uploadToItem(u, "guest")`).

## 5. Plans and money

No plan limit is added or changed. Every plan with a gallery has the slideshow, as today. No prices.

## 6. Privacy

- No new data is stored. The options live in the URL.
- With the slideshow stream (§2.33), the TV browser receives only what guests may see: visible, ready items without links to originals. This closes the gap where the host stream sent hidden and pending items to the slideshow and filtered them on screen, against the privacy guard's rule that hidden items never reach the slideshow "including through realtime events".
- The TV shows what it shows today (visible photos, videos and wishes, with guest names), plus the QR code. `names=0` lets the host show no names at all.
- When access ends (signed out, co-host removed, event deleted), the TV clears its items at the next refresh (§2.29).

## 7. Guest experience

- The slideshow is a host-only route, so the 150 KB guest budget does not apply. Guests watch it on the TV, so it still follows the guard: no new client library, motion only through CSS transforms and keyframes, reduced motion respected, no new web font.
- Weight on the TV: at most 12 layout images (400 px thumbnails), one spotlight image and the QR code. No simultaneous video playback.
- New strings, in `messages/ms.json` and `messages/en.json` under `slideshow`:

| Key | ms | en |
| --- | --- | --- |
| `settings` | Tetapan | Settings |
| `close` | Tutup | Close |
| `layout` | Susun atur | Layout |
| `layoutSingle` | Satu demi satu | One at a time |
| `layoutCollage` | Kolaj | Collage |
| `layoutFilm` | Jalur filem | Film strip |
| `layoutMosaic` | Mozek | Mosaic |
| `frame` | Bingkai cetak | Print frame |
| `names` | Tunjuk nama tetamu | Show guest names |
| `rail` | Panel QR & ucapan | QR & wishes panel |
| `wishes` | Ucapan terkini | Latest wishes |
| `railEmpty` | Belum ada ucapan | No wishes yet |
| `emptyMedia` | Menunggu gambar pertama… | Waiting for the first photo… |
| `qrAlt` | Kod QR untuk berkongsi kenangan | QR code to share a memory |

## 8. Env and services

None.

## 9. Alternatives considered

- **Settings stored on the event (columns or JSON, plus a server action).** Survives a new device and could be set on the dashboard before the event. Rejected for now: it needs a migration, a contract and auth on a write path, for a setting used on one TV for one evening. The URL can be bookmarked; moving to stored settings later only changes the page's defaults.
- **A separate slideshow stream route** instead of `?view=slideshow`. Equivalent, but it duplicates the route file and its auth; a query parameter keeps one handler.
- **An animation library (for example Framer Motion).** Smoother sequencing, but it adds tens of KB, and the guard asks for none. CSS covers these layouts.
- **Wishes in both the layout and the rail.** Rejected: the same wish showing twice reads as a glitch on a TV.
- **Film strip as a CSS loop of a duplicated track.** Simpler, but it doubles the images on screen and only ever shows the first 12 items. Rejected for recycling slots (§2.8).

## 10. Rollout

Nothing to do after merging: no migration, no seed, no env variable. The dashboard's Slideshow link opens the default layout, as today.

## Implementation notes for the plan (not requirements)

- Layout state holds item ids only, and items are looked up by id at render time. A refresh then updates URLs without resetting the layout (§2.28).
- Pure, unit-tested helpers next to `order.ts` in `src/components/slideshow/`:
  - `layoutItems(items, rail)`
  - `placement(id)` (collage position and tilt)
  - `stack(previous, nextId, max)` (collage)
  - `filmStep(state)` (slot recycling)
  - `swapTile(state)` (mosaic)
  - `spotlightQueue` (cap of 3)
  - `railWishes(items, max)`
  - `mergeRefresh(state, fresh)`

  `nextSlide` stays the source of "which item comes next".
- The refresh interval runs in an effect that depends only on `eventId`, reading the current state through a ref. Its e2e test uses Playwright's clock (`page.clock.install`, then `fastForward` by 20 minutes) and expects a request to `/api/events/{id}/slideshow`.
- `slideshow.tsx` keeps the stream, refresh and preload logic and renders one of four small layout components from the same folder.
