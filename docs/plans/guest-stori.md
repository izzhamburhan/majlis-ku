# Stori redesign: TDD plan

Spec: `docs/specs/guest-stori.md`, approved 2026-11-09. The developer waived the separate plan approval stop.
Workspace: `.worktrees/feat/guest-stori`, branch `feat/guest-stori`.

Global constraints: prices and limits come from the server; every user-facing string is in both `messages/ms.json` and `messages/en.json`; guest routes stay under the 150 KB JS budget; existing e2e tests are not weakened.

Must not change: `prisma/**`, `src/app/api/**`, `src/server/**` (except the new `src/server/plans/public.ts`), `src/lib/schemas/**`, `src/components/card/**`, `src/app/[locale]/i/**`, `src/components/admin/**`, `src/app/[locale]/admin/**`, `src/components/slideshow/photobook.ts`, the existing e2e and unit tests (except deleting `tests/unit/songket-colour.test.ts` in slice 6).

Scan convention: a line that must keep a literal light colour (a template preview, or white text on a photo) carries the comment `stori-keep`, and the source scans skip it.

## Tokens

`src/lib/stori.ts` is the only source of Stori colours. `storiVars()` returns inline CSS custom properties, the same pattern as `songketVars`.

| Export key | Value | CSS variable |
| --- | --- | --- |
| ground | `#251D2A` | `--color-cream` |
| groundDeep | `#1A1420` | `--st-ground-deep` |
| surface | `#352A3D` | `--color-surface` |
| surfaceLift | `#40344A` | `--st-surface-lift` |
| line | `#6B5B75` | `--st-line` |
| ink | `#FFFFFF` | `--color-ink` |
| muted | `#D6CADB` | `--color-muted` |
| brand | `#F2D6C4` | `--color-brand` |
| brandDark | `#E3BFA8` | `--color-brand-dark` |
| onBrand | `#251D2A` | `--color-on-brand` |
| onInk | `#251D2A` | `--color-on-ink` |
| danger | `#FFB4A8` | `--color-danger` |

`@theme` defaults, so pages outside `.stori` do not change: `--color-surface: #ffffff`, `--color-muted: #5d5247`, `--color-on-brand: #ffffff`, `--color-on-ink: #ffffff`, `--color-danger: #b91c1c`.

`StoriRoot` (`src/components/stori-root.tsx`, a Server Component) renders the inline `<style>` that sets the `html, body` background to ground, and a wrapper with class `stori`, `data-stori` and `storiVars()`.

## Slice 1: theme foundation

- Create: `src/lib/stori.ts`, `src/components/stori-root.tsx`, `tests/unit/stori-colour.test.ts`.
- Modify: `src/lib/fonts.ts` (`display` becomes Yeseva One, `ui` Albert Sans, `pen` stays, CSS variable names become `--font-st-*`), `src/app/globals.css` (new tokens, `.stori`, and `var(--font-sk-*)` references repointed to `--font-st-*`).
- Produces: `STORI`, `storiVars(): CSSProperties`, `contrastRatio(a: string, b: string): number`, `<StoriRoot>`.
- Red: `npx vitest run tests/unit/stori-colour.test.ts` fails because `@/lib/stori` does not exist. Tests: "ink, muted and danger reach 4.5:1 on ground and surface", "on-brand reaches 4.5:1 on brand", "on-ink reaches 4.5:1 on ink", "storiVars sets every token variable".
- Green: the module and CSS. `.stori` sets `color`, `font-family` and `color-scheme: dark`, overrides `--font-serif` to the display font, and turns animations off under reduced motion.
- Validate: the unit test, `npm run typecheck`, `npm run lint`.

## Slice 2: token migration of shared components

- Create: `tests/unit/stori-tokens.test.ts`.
- Modify: `components/host/*` (all light-theme class sites), `components/gallery/*`, `components/guest/video-picker.tsx`, `voice-recorder.tsx`, `components/locale-toggle.tsx`, the host pages under `dashboard/**`, and `[slug]/gallery/page.tsx` and `[slug]/report/page.tsx`.
- Mapping: `bg-white` to `bg-surface`; `text-white` on `bg-brand` to `text-on-brand`; `text-white` on `bg-ink` to `text-on-ink`; `text-red-*` to `text-danger`; `bg-red-50` panels to `bg-surface` with `text-danger` headings. In guest-facing files, `text-ink/NN` to `text-muted`.
- Red: `npx vitest run tests/unit/stori-tokens.test.ts` lists offending lines. Tests: "Stori components use no hard-coded light theme classes", "guest-facing components use no ink opacity modifiers".
- Green: the mapping. Nothing is wrapped in `.stori` yet, so existing pages render as before.
- Validate: the unit test, `npm run typecheck`, `npm test`.

## Slice 3: guest page

- Create: `tests/e2e/stori-guest.spec.ts`.
- Modify: `[slug]/page.tsx` (server-rendered hero, `StoriRoot`), `guest/guest-actions.tsx` (dock, consent panel, sheets, shot chip, strip above the dock, `router.refresh()` after a correct PIN), `guest/guest-ui.tsx` (`Bunga` removed; `MyPhotos` restyled), `messages/*.json` (dock Galeri label in `guest`), `globals.css` (hero, dock and sheet classes prefixed `st-`), and the `guest-actions`/`guest-ui` entries in the scan test.
- Red: `npx playwright test tests/e2e/stori-guest.spec.ts` after a build. Tests: "shutter and gallery picker stay disabled until consent is agreed" (new coverage, may pass against the old markup; the rest must fail), "dock shows Galeri, Video, Suara, Ucapan and the shutter", "dock targets are at least 44 px", "no horizontal scroll at 360 wide", "correct PIN shows Galeri without a reload", "guest page is inside the Stori root".
- Green: spec criteria 9 to 20. Keep every e2e-asserted string, test id and the `h1`. No `<dialog>`, no `inert`.
- Validate: the spec file above, then `guest-flow-v2`, `guestbook`, `media`; read first-load JS from the build.

## Slice 4: gallery and report

- Create: `tests/e2e/stori-gallery.spec.ts`.
- Modify: `[slug]/gallery/page.tsx`, `[slug]/report/page.tsx`, `components/gallery/*`, `messages/*.json`, `globals.css`.
- Red: tests "gallery is inside the Stori root", "Tambah kenangan link returns to the guest page", "report page is inside the Stori root" fail because neither exists.
- Green: `StoriRoot`, rounded tiles, floating link. `gallery-grid`, its `li`, `img`, `video` counts and test ids stay.
- Validate: the spec file, `guestbook`, `moderation`, `media`, `hardening`.

## Slice 5: landing

- Create: `src/server/plans/public.ts` (`listPublicPlans`, pure `planCard(plan, locale)`), `tests/unit/plans/public.test.ts`, `tests/e2e/stori-landing.spec.ts`, `public/landing/*.jpg`, `docs/landing-photos.md`.
- Modify: `[locale]/page.tsx`, `site-header.tsx` and `site-footer.tsx` only if needed for dusk, `messages/*.json`, `globals.css`.
- Red: `npx vitest run tests/unit/plans/public.test.ts`, tests "null uploadLimit reads as unlimited", "uses the plan name for the locale", "formats price with formatSen", fail because the module is missing. E2e "pricing shows prices from the plan table" and "landing is inside the Stori root" fail.
- Green: spec criteria 23 to 25. Existing `h1` text kept.
- Validate: both tests, `smoke`.

## Slice 6: host pages and TV, then remove Songket

Host:

- Create: `tests/e2e/stori-host.spec.ts`.
- Modify: `dashboard/page.tsx`, `dashboard/events/new/page.tsx`, `dashboard/events/[eventId]/layout.tsx` and `page.tsx`, `host/event-nav.tsx`, `host/card-builder.tsx` (previews keep template fonts).
- Red: tests "dashboard is inside the Stori root", "overview shows the venue screen action", "admin stays outside the Stori root".
- Green: spec criteria 26 to 28.

TV:

- Create: `tests/unit/stori-no-songket.test.ts`; add "photobook root is Stori and other layouts are not" to `tests/e2e/stori-host.spec.ts`.
- Modify: `slideshow/photobook-view.tsx`, `slideshow/slideshow.tsx`, `slideshow/[eventId]/page.tsx`, `globals.css` (Photobook block, no `mix-blend-mode: multiply`).
- Delete: `src/lib/songket.ts`, `tests/unit/songket-colour.test.ts`, the Songket CSS block.
- Red: `npx vitest run tests/unit/stori-no-songket.test.ts` lists every reference to `.sk-*`, `.songket`, `--sk-*`, `--font-sk-*`, `songket`, `paperVars`.
- Green: spec criteria 29 and 30. `photobook.ts` and its tests stay untouched.
- Validate: both tests, `slideshow`, `npx vitest run tests/unit/slideshow`.

## Slice 7: docs

- Modify: `DESIGN.md` (rewritten for Stori), `CLAUDE.md` and `AGENTS.md` (status, layout).
- Validate: `node scripts/skills.mjs check`.

## Final verification (orchestrator)

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (first-load JS against the baseline), `npm run test:e2e`, `node scripts/skills.mjs check`, and a 360 px look at the guest page in both languages.