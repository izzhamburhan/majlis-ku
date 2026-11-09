# Stori redesign

Status: approved by the developer, 2026-11-09.
Branch: `feat/guest-stori`, stacked on `feat/guest-flow-v2` at `311719d`.
Design source: the "C. Stori" boards on the design canvas, in the dusk colours the developer saw before the later colour rounds (`#251D2A` ground, `#F2D6C4` peach). The developer will revisit colours and touch-ups in a later change, so every colour lives in one place.

## 1. Goal and non-goals

Replace the Songket look with Stori on the landing page, guest page, guest gallery, guest report page, host dashboard and event pages, and the venue TV Photobook. The photo fills the phone and a few controls float over it. This is a visual change. The one behaviour change is criterion 10 (a correct PIN refreshes the page).

Non-goals:

- E-card and RSVP (`/i/{slug}`, `components/card/*`): excluded by the developer. The card builder's own chrome goes dusk with the other host pages; its template previews keep their template fonts and colours.
- Admin, sign-in, privacy and terms pages keep the cream look.
- The other four TV layouts (single, collage, film, mosaic) and the slideshow controls and settings dialog keep their current look.
- Features shown on the canvas that need new data or flows: tap-through cover photos (only one `Event.coverKey` exists), the filter-by-guest rail (no such query), the one-at-a-time review queue (the host gallery's pending filter and approve-all stay).
- Schema, migrations, route handlers, server actions, Zod schemas, env variables.

## 2. Acceptance criteria

Theme

1. All Stori colours come from one module, `src/lib/stori.ts`, and one CSS scope, `.stori`. Changing a value there changes every Stori surface. `.stori` sets its own text colour, font family and `color-scheme: dark`.
2. Inside `.stori` the Tailwind tokens are overridden and new tokens added: `surface`, `muted`, `on-brand`, `on-ink` and `danger`. Outside `.stori` the new tokens resolve to today's values, so other pages render the same.
3. A unit test computes contrast from `src/lib/stori.ts`: ink, muted and danger at least 4.5:1 on ground and on surface; `on-brand` at least 4.5:1 on brand; `on-ink` at least 4.5:1 on ink.
4. Inside `.stori`, no hard-coded light-theme pair remains. Every `bg-ink text-white`, `bg-brand text-white`, `bg-white`, `text-red-*` and `bg-red-50` in a component that renders inside `.stori` uses the tokens. Known sites: `host/event-nav.tsx`, `host/members-panel.tsx`, `host/cover-uploader.tsx`, `host/delete-event-form.tsx`, `gallery/gallery-toolbar.tsx`, `gallery/gallery-grid.tsx`, `guest/voice-recorder.tsx`, and the host gallery and RSVP pages. A grep in the plan confirms none are left.
5. Guest-facing Stori components use the solid `muted` token, not an opacity modifier such as `text-ink/75`. Where `color-mix` is missing, Tailwind falls back to the original dark hex, which is unreadable on dusk.
6. Yeseva One (names and headings), Albert Sans (interface) and Nanum Pen Script (TV wishes and date captions only, because `wishSize` is tuned to it) are self-hosted through `next/font`. Guest pages make no request to Google. Marcellus and Hanken Grotesk are removed.
7. `src/lib/songket.ts` is removed, with `tests/unit/songket-colour.test.ts`; `contrastRatio` moves to `src/lib/stori.ts`. No source file references `.sk-*`, `.songket`, `--sk-*`, `--font-sk-*`, `songketVars` or `paperVars`. `Event.themeColor` no longer tints the guest page or the TV; its other uses stay (host form, dashboard colour bar, QR stand PDF, wishes PDF, event export).
8. Admin, sign-in, privacy, terms and the e-card render the same as before this change. Body background is dusk only on Stori pages, including on overscroll.

Guest page (`/{slug}`)

9. The first viewport is server-rendered in `[slug]/page.tsx`, so plans without the gallery keep their cover, names and date, with no dock. The cover fills the viewport edge to edge, with a scrim opaque enough that text over any photo meets criterion 3 at the top of the text block. The `h1` (names), event type, venue and date sit on it. The hero image is not lazy-loaded.
10. With no cover photo, or before the PIN is entered, no signed cover URL is issued, as today, and the hero shows the dusk ground with the monogram. A correct PIN now refreshes the page, so the cover, Galeri, welcome text and counts appear without a manual reload.
11. A floating dock holds Galeri, Video, a raised shutter, Suara and Ucapan, with visible text labels except the shutter. Every target is at least 44 px, and the dock respects the bottom safe area. Galeri appears only when `galleryHref` is set.
12. The shutter's accessible name is "Ambil gambar", and "Filem anda sudah habis" at zero shots, when it is disabled. A visible paragraph shows the same state above the dock.
13. "Hai, {name}!" and the change-name control are visible in the menu state.
14. Consent stays inline, not a modal, with one checkbox labelled "Saya faham dan bersetuju" in both states. Before agreeing: a panel above the dock with the existing text, privacy link and checkbox, with no dismiss control. After agreeing: one quiet line with the checked checkbox and privacy link, so the choice can be undone. Shutter, gallery picker and sheets stay disabled until agreed. A new e2e test asserts this.
15. PIN, name, video, voice, wish and thanks remain the existing views, styled as dusk sheets in normal page flow over the lower hero. They are not `<dialog>` or `inert`, the `h1` stays in the accessibility tree. The dock renders only in the menu state, as the three-item grid does today.
16. When the plan disallows video, the Video item is disabled with the existing premium-only note. Voice is disabled when `features.voice` is false, as today.
17. The shot counter and the gallery picker (`photo-input`) are visible above the dock, as a counter chip and a labelled text button.
18. In the menu state, while uploads are queued, the "Gambar saya" strip with progress and retry is visible above the dock.
19. Welcome text, gallery counts, the report link, `LocaleToggle` and footer legal links stay on the page below the first viewport. Page bottom padding keeps them clear of the dock.
20. At 360 × 740 the page has no horizontal scroll and the dock covers neither names nor controls, in both languages, in these states: consent not agreed, agreed with strip, zero shots.

Guest gallery and report

21. Gallery: dusk ground with rounded tiles. Every item type (photo, video, voice, wish), filter links, search and sort, live updates and "load more" still work. A floating "Tambah kenangan" link returns to the guest page.
22. The report page (`/{slug}/report`) uses the dusk theme.

Landing (`/`)

23. Sections: hero photo with the existing title, body and call to action; a horizontal strip of guest photos; three steps; the venue screen; privacy; pricing; closing call to action.
24. Prices and limits are read from active `Plan` rows on the server, formatted with `formatSen`, in `sortOrder`, using the locale's plan name. A null `uploadLimit` shows as unlimited. No price is written in code or in `messages/`.
25. Only the seven Pexels photos are committed, under `public/landing/`, resized and listed with their source pages in `docs/landing-photos.md`.

Host pages (`/dashboard`, `/dashboard/events/*`)

26. All host pages use the dusk theme, including forms, tables, the gallery and moderation controls. Inputs and error text meet criterion 3.
27. The event layout keeps the names `h1` on every sub-page and shows the event nav as a pill bar. The overview adds a cover photo banner with an "Open venue screen" action and no repeated names. Without a cover, the banner shows the action on a plain panel. The cover is signed from the overview page's own access-checked `event`, as `edit/page.tsx` does. Anyone who already passes that check (host, co-host, admin viewing read-only) sees it.
28. The overview keeps its share URL, copy and WhatsApp, QR with downloads, plan, usage, storage and "kept until".

Venue TV

29. `.stori` is applied to the Photobook root only. The Photobook uses a dusk ground, dusk pages and peach wish card; headings use Yeseva One; the wish stays in Nanum Pen Script.
30. Spread building, the three mounts (gilded frame, taped polaroid, photobooth strip), the monogram page, page numbers, the 9 s spread and 1.4 s turn, and the reduced-motion cross-fade are unchanged. `photobook.ts` and its unit tests do not change. Tape, the corner stamp and pressed marks no longer use `mix-blend-mode: multiply`, so they stay visible on dusk.

Quality

31. Existing e2e tests pass without weakening them. Copy they assert, test ids and heading levels are kept.
32. First-load JS is measured on this worktree before any edit and after, for `/[locale]/[slug]`, `/[locale]/[slug]/gallery` and `/[locale]/slideshow/[eventId]`. Each stays under 150 KB and grows by no more than 2 KB.
33. `prefers-reduced-motion` turns off every Stori animation. Focus is visible on every control.

## 3. Data model

None. No migration.

## 4. API contract

No route handler, server action or Zod schema changes. Read-only additions on the server, called only from Server Components:

- `listPublicPlans()` in `src/server/plans/`: active plans in `sortOrder`, returning `code`, `nameMs`, `nameEn`, `priceSen`, `uploadLimit`, `retentionDays`, `includesGallery`, `includesEcard`. Used by the landing page.
- The event overview page signs `Event.coverKey` through `storage().getDownloadUrl` (criterion 27).

## 5. Plans and money

No plan limit changes; limits stay enforced on the server. The landing page displays `Plan` values from the database (criterion 24).

## 6. Privacy

No new guest data, no change to who can see what. The cover stays unsigned until the PIN passes. Consent text and its gate are unchanged (criterion 14). The landing photos are stock photos of real, identifiable people, approved by the developer for this stage. They are not seed or test data. Pexels' licence does not cover those people's consent to advertising, so model-released or commissioned photos are needed before public launch; this is recorded in `docs/landing-photos.md`.

## 7. Guest experience

- No new client library. The hero is server-rendered; the dock and sheets stay inside the existing `guest-actions.tsx` client component; CSS carries the scrim and blur.
- Glass blur degrades to a solid dusk capsule where `backdrop-filter` is unsupported.
- Upload, retry and offline behaviour are untouched.
- New strings in `messages/ms.json` and `messages/en.json`: the dock's Galeri label (in the `guest` namespace, the only one sent to the client), the landing sections, the gallery "add" link, the host banner action. Existing copy is reused where it exists.

## 8. Env and services

None.

## 9. Alternatives considered

- Swapping the global Tailwind tokens to dusk: rejected. Admin, sign-in and legal share them. `.stori` overrides them in scope instead; a compile check confirmed `bg-brand` and `text-ink/75` follow the override.
- Keeping host colours on the guest page: rejected for now. The developer chose the fixed Stori colours; colours are being revisited anyway.
- A modal consent sheet: rejected. It would lock guests with no way back and break the checkbox the e2e helper relies on.
- Setting TV wishes in Yeseva One: rejected for now. `wishSize` is tuned to the narrow pen font, and long wishes would clamp early.
- `next/image` for landing photos: not used, to match the rest of the repo; plain `img` with width and height, lazy below the hero.

## 10. Rollout

Nothing to run after merging. `DESIGN.md`, `CLAUDE.md` and `AGENTS.md` are updated in this branch. Merge `feat/guest-flow-v2` first, or target this pull request at it.
