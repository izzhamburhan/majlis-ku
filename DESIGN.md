# Majlis Ku design: Stori

Landing, guest pages, host dashboard and the Photobook TV layout share one visual world, **Stori**: the photo fills the screen and a few controls float over it, the way guests know from phone stories. Admin, sign-in, privacy, terms, the e-card and the other TV layouts keep their own look.

Decided with the developer on 2026-11-08 (`docs/specs/guest-stori.md`). The colours are provisional and will be revisited, so every colour lives in one place. Code: `src/lib/stori.ts`, `src/components/stori-root.tsx`, `src/lib/fonts.ts`, the `.stori` and `.st-*` rules and the "Photobook" block in `src/app/globals.css`.

## How the theme applies

`StoriRoot` wraps a page in `.stori`, sets the variables from `storiVars()` inline, and sets the `html, body` background. Tailwind tokens (`bg-brand`, `text-ink`, `bg-surface`, and so on) are overridden inside that scope only, and their `@theme` defaults keep other pages unchanged. The Photobook applies `.stori` on its own root, so the other TV layouts are not affected.

Inside `.stori`, use the tokens, never `bg-white`, `text-white` or palette colours such as `text-red-700`. `tests/unit/stori-tokens.test.ts` enforces this. A line that must stay literal (a template preview, white text on a photo) carries a `stori-keep` comment. Guest-facing components use solid `text-muted`, not `text-ink/70`: where `color-mix` is missing, Tailwind falls back to the original dark hex, which is unreadable on dusk.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `ground` | `#251D2A` | page field, text on peach |
| `groundDeep` | `#1A1420` | TV surround, deepest areas |
| `surface` | `#352A3D` | panels, sheets, cards |
| `surfaceLift` | `#40344A` | secondary buttons, pressed areas |
| `line` | `#6B5B75` | hairlines, panel borders |
| `ink` | `#FFFFFF` | text |
| `muted` | `#D6CADB` | secondary text |
| `brand` | `#F2D6C4` | peach: primary action, shutter, Photobook wish card |
| `brandDark` | `#E3BFA8` | primary action, hover |
| `onBrand`, `onInk` | `#251D2A` | text on peach and on white |
| `danger` | `#FFB4A8` | errors, delete |
| `success` | `#A8E0B8` | confirmations |

`tests/unit/stori-colour.test.ts` holds these pairs to WCAG AA. `Event.themeColor` no longer tints guest pages or the TV.

## Type

| Role | Face | Where |
| --- | --- | --- |
| Display | Yeseva One | names, headings, prices |
| UI | Albert Sans | everything else |
| Pen | Nanum Pen Script | the wish and date caption on the Photobook only |

All are self-hosted through `next/font`: no request to Google from guest pages.

## Components

- **Hero**: the cover fills the first viewport, server-rendered so plans without the gallery keep it. A scrim holds text at 4.5:1 over any photo. With no cover, or before the PIN, it shows the monogram on dusk.
- **Dock**: fixed pill at the bottom: Galeri, Video, raised shutter, Suara, Ucapan. Menu state only.
- **Consent**: an inline panel above the dock with no dismiss control, then one quiet line that can undo it. Never a modal.
- **Sheets**: PIN, name, video, voice, wish and thanks are dusk panels in normal page flow. No `<dialog>`, no `inert`: the names heading stays in the accessibility tree.
- **Glass** (`.st-glass`): translucent dusk with blur; solid dusk where `backdrop-filter` or `color-mix` is missing.
- **Photobook spread**: open album on dusk with dusk pages and a peach wish card. Spreads, the three mounts (gilded frame, taped polaroid, photobooth strip), page numbers and the page turn are unchanged. Blend modes are not used, so tape and stamps stay visible on dusk.

Icons are drawn in `guest-ui.tsx` (24 px grid, round caps). No emoji as icons.

## Motion

The hero has one entry, cards lift on hover, and the Photobook has its page turn. `prefers-reduced-motion` turns them all off.

## Photography

Landing photos are in `public/landing/`, listed in `docs/landing-photos.md`. They are stock photos of real people: replace them with model-released or commissioned photos before public launch.
