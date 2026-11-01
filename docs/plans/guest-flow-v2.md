# Plan: Guest flow v2

Spec: `docs/specs/guest-flow-v2.md`. Branch `feat/guest-flow-v2`. Each slice: write the failing test, make it pass, run `npm test`, `npm run lint`, `npm run typecheck`.

## Slice 1: shot limit rule (server)

1. Test `tests/unit/shots.test.ts`: `checkShotAllowed(limit, used)` → ok when limit null; ok when used < limit; `shots_used_up` when used ≥ limit; `shotsLeft(limit, used)` never negative.
2. Implement `src/server/uploads/shots.ts` (pure).
3. Migration `add_shots_per_guest` (`Event.shotsPerGuest Int?`), `npx prisma migrate dev`.
4. Test (service-level, existing pattern in `tests/unit`): `startUpload` for PHOTO with a used-up guest throws `ApiError("shots_used_up", 409)`; VIDEO is not counted. Implement `guestShotsUsed(eventId, guestId)` and the check in `startUpload`.
5. Add `shots_used_up` to the guest client's known errors and both message files.

## Slice 2: host setting

1. Test `tests/unit/event-schema.test.ts` (extend): `shotsPerGuest` "" → null, "24" → 24, "0"/"101"/"abc" rejected.
2. Implement in `src/lib/schemas/event.ts`, the settings service update, and `src/components/host/settings-form.tsx` (number field with "Tanpa had" when empty). Strings in both locales.

## Slice 3: guest key and Photobook logic (pure)

1. Test `tests/unit/guest-key.test.ts`: same guest id → same 12-hex key; different ids differ; null → null.
2. Implement `guestKey()` in `src/server/gallery/items.ts`; add `guestKey` to both item variants.
3. Test `tests/unit/photobook.test.ts` with a seeded random: grouping by key (name fallback), spreads only for guests with a photo or wish, frame rules (≥3 → strip or single; 1–2 → single), strip photos distinct, videos excluded, shuffled cycle shows every guest once before repeats, `promote(key)` makes that spread next once.
4. Implement `src/components/slideshow/photobook.ts` (no React, no zod).

## Slice 4: slideshow option and Photobook view

1. Test `tests/unit/slideshow-options.test.ts` (extend): `layout=photobook` parses; unknown still falls back.
2. Add `photobook` to `SlideshowLayout`, `SLIDESHOW_LAYOUTS`, the settings dialog and labels.
3. Build `src/components/slideshow/photobook-view.tsx`: spread, photobooth print and strip, wish page, monogram page, page-turn motion with reduced-motion cross-fade, Songket ground. Wire it in `layouts.tsx`/`slideshow.tsx`; new arrivals call `promote`.
4. Manual check at 1920 × 1080 with the demo event.

## Slice 5: Songket guest page

1. Test `tests/unit/songket-colour.test.ts`: `deepGround(themeColor)` keeps hue, clamps lightness so ivory text contrast ≥ 4.5:1 for light, dark and saturated inputs; invalid colour falls back to the default.
2. Implement `src/lib/songket.ts` (pure colour helpers) and the Songket CSS (band, weave, arch) in `globals.css`; fonts via `next/font` in the guest page only.
3. Rebuild `src/app/[locale]/[slug]/page.tsx` (hero, counts, shots) and split `guest-actions.tsx` into smaller pieces (name card, action deck, consent sheet, my-photos strip, thanks). Hydration-gated forms with `method="post"`.
4. Update e2e `tests/e2e/guestbook.spec.ts`, `media.spec.ts`, `helpers.ts` for the new labels; add an e2e step: tapping submit before hydration leaves no `displayName` in the URL; a shot-limited event refuses the extra photo.

## Slice 6: verification

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (read guest first-load JS), `npm run test:e2e`, then screenshots at 390 × 844 and 1920 × 1080 into `.impeccable/review/`, and a fresh reviewer pass.
