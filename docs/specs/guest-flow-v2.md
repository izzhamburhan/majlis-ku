# Spec: Guest flow v2 (camera-first, disposable shots, Photobook TV)

Status: draft for developer approval, 2026-11-01.
Branch: `feat/guest-flow-v2` (from `main` at `38cc990`).
Sources: the developer's request of 2026-11-01; `docs/research/competitor-analysis-2026-11.md` §6 (A1, A2) and `docs/research/technical-teardown-2026-11.md` (REA findings). Market bar per the `market-parity` skill is in §8.

Decisions taken with the developer on 2026-11-01:

1. Visual world: **Songket**, shared by the guest page and the new TV layout.
2. Scope: camera-first guest page, disposable shot limit, and a new **Photobook** TV layout: one guest per spread, a photo of theirs in a photobooth frame (one print, or a strip of three) on the left page and their wish on the right, turning like a real album.
3. Not in scope: live reactions on the TV, film looks, the Songket restyle of the other four TV layouts.

## 1. Goal and non-goals

**Goal.** A guest who scans the QR code sees an event page that looks like the wedding, not a form, and can take a photo with one tap. The host can turn the event into a "disposable camera" with a fixed number of shots per guest. The venue TV gains a Photobook layout that shows each guest's photo next to their own wish, page by page.

**Non-goals.**

- A custom in-browser camera (`getUserMedia`). The camera opens through the phone's own camera via `capture="environment"`, which the REA teardown showed is what Kenangan ships and what works in in-app browsers.
- Film filters or date stamps.
- Shot limits on video or voice (photos only).
- Changing upload processing, moderation, PIN, consent wording, or the other TV layouts.
- Saving the TV layout choice on the server (it stays in the URL, as today).

## 2. Acceptance criteria

Criteria marked *(manual)* are checked by eye at 390 × 844 (guest) and 1920 × 1080 (TV); all others get an automated test.

### Guest page

1. The page opens on a Songket hero: a gold woven band at the top, the event's type label (e.g. WALIMATULURUS), host names, date and venue, set on a deep ground derived from the event's `themeColor`.
2. If the event has a cover photo (and the PIN, if any, is passed), it shows inside an arch-shaped frame (gerbang) with a gold edge. Without one, the arch shows the woven motif.
3. Two live counters show under the names: visible photos and videos, and guests who joined, e.g. "128 gambar · 41 tetamu". Counts come from the server at page load; they are not updated live.
4. After the name step, the primary action is one large round button, **Ambil gambar**, that opens the phone camera (`<input type="file" accept="image/*" capture="environment">`). Directly under it, a text button **Pilih dari galeri** opens the normal multi-select picker.
5. Video, Suara and Ucapan sit in one row below as secondary actions, with SVG line icons and text labels. Video stays disabled with "Premium" when the plan has no video, as today.
6. The consent text and checkbox show once, on a paper card above the shutter, until the guest agrees; all four actions stay disabled until then (Impeccable's floor rules out a modal here). After agreeing, one quiet line keeps the ticked box and the privacy link. Once agreed (remembered as today), actions go straight through. The upload stays impossible until consent is given (PDPA rule unchanged).
7. A **Gambar saya** strip shows small thumbnails of the photos this device sent in this visit, with each one's progress or failure and a retry. It survives returning to the menu, not a page reload.
8. The thanks state is a short celebration with the gallery link (when the gallery is visible to guests) and **Kongsi lagi**.
9. **Early-tap fix.** Every guest form (name, PIN, wish) is submitted only by its script: its submit button stays disabled until the component has hydrated, and the form uses `method="post"`. Pressing Enter or tapping before hydration never puts a value in the URL. (Today a quick tap reloads the page with `?displayName=…`.)
10. Every new string is in `messages/ms.json` and `messages/en.json`. Bahasa Melayu is the default.
11. The guest route's first-load JS stays under 150 KB (`npm run build`). The Songket band and weave are CSS and inline SVG, no images. At most two web fonts, self-hosted through `next/font`, with `display: swap`.
12. Tap targets are at least 44 px, text contrast at least 4.5:1 on the derived ground, visible focus, and `prefers-reduced-motion` turns off the entry motion.

### Disposable shot limit

13. `Event.shotsPerGuest` (`Int?`, null = unlimited) is added by a migration. Existing events stay unlimited.
14. The host sets it in event settings: "Had gambar setiap tetamu" with **Tanpa had** or a number from 1 to 100 (Zod-validated on the server). Changing it never deletes photos.
15. When a PHOTO upload starts and again when it completes, the server counts the guest's confirmed photos (READY or PROCESSING) and refuses with `shots_used_up` (409) once the count has reached the limit. Unfinished uploads never count, so an upload that drops on weak signal does not cost a shot. Video and voice are not counted. (Changed after review on 2026-11-01: the first draft counted PENDING uploads for an hour.)
16. With a limit set, the guest sees the shots left under the shutter ("18 / 24 keping lagi"), computed by the server at page load and decreased locally after each confirmed upload. When none are left, the shutter and the gallery picker are disabled and say "Filem anda sudah habis", and Video/Suara/Ucapan still work.
17. Selecting more photos than the shots left uploads only as many as are left; the rest are listed as not sent, with the reason.
18. Known limits, accepted: two uploads completing at the same instant can both pass the check and exceed the limit by one. The limit is per device cookie, so a guest who clears cookies or uses a private window starts a fresh quota.

### Photobook TV layout

19. `layout=photobook` is a fifth value in the slideshow options and the Settings dialog ("Buku kenangan"). Other values and defaults are unchanged.
20. Each spread belongs to one guest. Items are grouped by a `guestKey` added to `GalleryItem`: an opaque 12-character hash of the guest id, never the id itself. Items with no guest (the guest record was removed) are grouped by name.
21. A guest gets a spread when they have at least one visible photo or one visible wish. The left page shows their photo in a photobooth frame; the right page shows their wish in a pen-like hand, signed with their name (the name is hidden when `names=0`).
22. Frame choice per spread: with three or more photos, a strip of three (random distinct photos) or a single print, chosen at random; with one or two photos, a single print of a random one. The print's caption line carries the host names and event date. A guest with a wish but no photo gets a monogram page (their initial on the woven motif) on the left; a guest with photos but no wish gets "Kenangan daripada {name}" on the right.
23. Spreads turn every 9 s with a page-turn motion; with reduced motion they cross-fade. Order: shuffled once per cycle, so every guest appears before anyone repeats.
24. A newly arrived photo or wish moves its guest's spread to be the next one shown (once, not repeatedly for a burst of uploads from one guest).
25. Only `thumbUrl`/`displayUrl` from the server's item list are used; videos are left out of the Photobook (photos only). At most 3 photos are on screen.
26. The spread sits on the Songket ground with the gold band top and bottom. The upload QR always shows in a corner; the QR & wishes rail option has no effect on the Photobook (the wish is already on the page). With `names=0` the monogram page shows the bunga motif and the no-wish page reads "Sebuah kenangan".
27. The grouping, frame choice and order are pure functions with unit tests (seeded random).

## 3. Data model

```prisma
model Event {
  // ...
  shotsPerGuest Int? // disposable mode: photos each guest may take; null = unlimited
}
```

Migration `add_shots_per_guest`: one nullable column, no backfill. Rolls back by dropping the column.

`GalleryItem` (both variants) gains `guestKey: string | null`, computed in `uploadToItem`/`wishToItem` as the first 12 hex characters of SHA-256 of `guestId` with `HASH_SALT`. Sent to every audience; it identifies a guest only within an event's item list.

## 4. API contract

- `POST /api/e/{slug}/uploads` (unchanged shape). New error `shots_used_up`, status 409, when kind is PHOTO and the limit is reached.
- Event settings action (existing host form) accepts `shotsPerGuest`: empty string → null, else integer 1–100 (`src/lib/schemas/event.ts`).
- Server page `/[locale]/[slug]` passes to the client: `counts { photos, guests }`, `shots { limit, used } | null`.
- No new routes.

## 5. Plans and limits impact

Shot limits are per event and free to set on any plan; they never raise the plan's `uploadLimit`. When both apply, whichever runs out first wins, and the error code says which (`limit_reached` or `shots_used_up`). No price change. `payments-guard`: no money path touched.

## 6. Privacy (PDPA)

- No new personal data stored. `guestKey` is a salted hash, so the TV page cannot learn guest ids.
- The Photobook shows a guest's name next to their wish, as the rail already does; `names=0` hides it.
- Consent stays mandatory before any upload or wish; the sheet shows the same text and privacy link.
- No third-party scripts or trackers on guest pages (the teardown found competitors loading Facebook Pixel and session recording; Majlis Ku keeps none). Fonts are self-hosted by `next/font`, so guest pages make no request to Google.

## 7. Design direction contract (Songket)

THESIS: the guest page and the TV are woven cloth in the host's colour, not an app screen; it refuses the category's white-card-with-camera-tab layout.
OWN-WORLD: ground is the event `themeColor` deepened (OKLCH, low lightness, kept hue); a fine crosshatch weave at low contrast; gold weft (two golds: deep and highlight) used only for the bands, the shutter ring, and rules; ivory text. Inscriptional display caps for labels and names; a neutral grotesque for UI text; a pen hand only on the TV wish page.
STORY: the guest recognises their wedding, types their name, and taps one golden shutter; later they see their own photo and wish on the TV as an album page.
FIRST VIEWPORT (390 × 844): gold pucuk rebung band (14 px) at the top; arch with cover photo centred; type label, names, date · venue, counters; below the fold line, the name card or the shutter.
FORM: Songket, first of seven candidates (songket, kad kahwin foil, batik canting, kanopi lights, papan tanda, wau, bunga telur). seed: none (unavailable). The Impeccable launcher is not installed, so no concept roll ran.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## 8. Market bar

- Parity: Kenang's camera-first guest screen and 20-shot limit (✅ seen, screenshot 02); AlbumKahwin's shot counter "12 / 24" (✅, screenshot 09).
- Beat it: shot limit plus a live TV that turns each guest's photo and wish into an album spread. Nobody in the research shows a guest's photo with their own wish (Sedetik's rail and ours show wishes apart from photos). Lighter page than every competitor (REA: 650 KB–2.5 MB of JS against our 150 KB budget).
- Not doing: in-browser filters baked on the phone (Kenang, Kenangan); server-side film looks are a later change.

## 9. Risks

- Fonts on slow 4G: mitigated by `display: swap`, two families, latin subset.
- Derived ground colour from an arbitrary `themeColor` may be too light; the derivation clamps lightness so ivory text keeps 4.5:1 (tested).
- `next/font/google` fetches font files at build time, so builds need network access (CI already has it).
