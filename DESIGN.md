# Majlis Ku design: Songket

The guest page (`/[slug]`) and the Photobook TV layout (`/slideshow/[eventId]?layout=photobook`) share one visual world, **Songket**: woven cloth in the host's own colour with gold weft. Host and admin screens keep the plain cream app style for now.

Decided with the developer on 2026-11-01 (`docs/specs/guest-flow-v2.md` §7). Code: `src/lib/songket.ts`, `src/lib/fonts.ts`, the "Songket world" and "Photobook" blocks in `src/app/globals.css`.

## Colour

The ground comes from the event's `themeColor`, so every wedding looks like its own cloth. `songketPalette()` keeps the colour's hue in OKLCH and fixes lightness, so ivory text always clears 7:1. Near-grey hosts (white, black, silver) get a quiet warm ground.

| Token | Value | Use |
| --- | --- | --- |
| `--sk-ground` | host hue, L 0.30 | page field |
| `--sk-ground-deep` | host hue, L 0.22 | bands, body behind the page, shadows |
| `--sk-ground-lift` | host hue, L 0.37 | arch fill, the shutter's lens |
| `--sk-ink` | host hue, L 0.27 | handwriting on paper (Photobook wish) |
| `--sk-gold` | `#c9a24a` | weft: bands, rules, shutter ring, primary buttons |
| `--sk-gold-light` | `#ecd394` | highlights, counters, focus ring |
| `--sk-ivory` | `#f6eedc` | text on the ground |
| paper | `#f4ebd8` + fine grain | `.pb-paper`: the kad sheet, Photobook pages |

Gold is weft, not paint: use it for bands, rules, rings and the primary action only. Never gradient text, never gold body copy.

## Type

| Role | Face | Where |
| --- | --- | --- |
| Display | Marcellus (inscriptional) | names, headings, captions on prints (`.sk-display`) |
| UI | Hanken Grotesk | everything else on Songket pages |
| Pen | Nanum Pen Script | the guest's wish on the Photobook page only (`.sk-pen`) |

Self-hosted through `next/font` (no request to Google from guest pages). No label above a heading: the event type sits under the names.

## Motifs

- **Pucuk rebung band** (`.sk-band`, `.sk-band-lg`): gold bamboo-shoot triangles; top and bottom of every Songket page.
- **Woven ground** (`.songket`): two fine thread layers, barely visible.
- **Gerbang arch** (`.sk-arch`): the cover photo's frame, with two gold edges; the couple's monogram when there is no cover.
- **Bunga cengkih** (`Bunga` in `guest-ui.tsx`): the eight-point clove flower; the thanks state.
- **Rule** (`.sk-rule`): gold hairline that fades out at both ends, holding the counters.

Icons are drawn in `guest-ui.tsx` (24 px grid, 1.6 stroke, round caps). No emoji as icons.

## Components

- **Shutter** (`.sk-shutter`): 128 px gold ring around a deep lens with the camera icon; the one primary action. Disabled = desaturated.
- **Kad sheet**: ivory paper panel for consent, wish, video and voice. Inside it, the shared pickers keep their ink styles; `--color-brand` maps to the host's ground.
- **Secondary row**: Video · Suara · Ucapan in three columns between gold hairlines, not cards.
- **Gambar saya**: 64 px thumbnails with a gold progress line; failures listed under the strip with a retry.
- **Photobook spread**: two paper pages on the ground, spine shading, a photobooth print (single, gold photo corners, captioned with names and date) or a three-shot strip; the wish in pen, signed. Pages turn on the spine (1.4 s); reduced motion cross-fades.

## Motion

One entry (`.sk-rise`, 700 ms ease-out from visible) and the page turn. `prefers-reduced-motion` turns both off.

## Browser surfaces

`.songket` themes selection (gold on deep), caret (gold light), focus ring (2 px gold light, 3 px offset) and `accent-color` (gold).
