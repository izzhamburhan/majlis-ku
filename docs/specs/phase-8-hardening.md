# Phase 8a Spec: Local hardening

Status: approved by the developer on 2026-10-21. Reviewed by the final reviewer on 2026-10-21; its findings are folded in.
Requirement source: `docs/brief.md`, phase 8 "Hardening: rate limits, retention purge job, PDPA pages (privacy policy, terms), e2e tests, Docker, deployment guide", and the brief's privacy line "auto-purge media after retention ends". `docs/HANDOFF.md` adds: the purge must delete media from storage and the event's `AbuseReport` rows (`docs/specs/phase-7-admin.md` §6).

Decisions taken with the developer on 2026-10-21:

1. Phase 8 is split. **8a (this spec) is local hardening**: purge job, shared rate limiter, privacy and terms pages, security headers, health route, more e2e tests. **8b** (Dockerfile, S3/R2 `StorageDriver`, deployment guide, proxy and IP trust, HSTS, PIN guessing across devices) waited until hosting was chosen. **Update 2026-11-09:** hosting is chosen (Render free web service plus Supabase) and 8b's first step is done on branch `feat/infra-render-supabase`: the Docker image, the S3 `StorageDriver`, deployed-mode safety (`DEPLOYED=1`, client IP trust through `TRUSTED_PROXY_HOPS`, HSTS, a per-IP PIN limit that counts wrong PINs only) and the deployment guide. Spec: `docs/specs/deploy-render-supabase.md`; guide: `docs/deploy-render-supabase.md`. The first real deploy is pending the developer. Still open: a shared realtime bus, CSP nonces, e2e in CI.
2. When retention ends the event is **archived, not deleted**: every file and every guest record goes; the event row stays as `ARCHIVED` so the host sees that it expired, and payment and audit rows stay valid.
3. The legal pages name the controller, contact email and address through **clearly marked placeholders**, filled in before launch after a legal review.
4. The rate limiter is **shared through a Postgres table**, behind the same `hit` / `reset` interface, so a later move to Redis is one file.
5. Files written while a purge runs (a video still converting, a photo being confirmed, a host saving a cover) are caught by **re-sweeping every event archived in the last 24 hours** on each run.
6. A host edit **moves `purgeAt` only when the event date changes** (an admin plan change still recomputes it). Fixing a typo no longer extends how long guest data is kept.
7. Guessing an event PIN by clearing cookies (5 tries per device) **stayed open until 8b**, and is now fixed there with a per-IP limit (20 wrong PINs per 10 minutes per event and address; correct PINs do not count) now that IP handling behind the proxy is decided. A per-event cap would let one person lock real guests out at the venue.

## 1. Goal and non-goals

**Goal.** Guest data really disappears when the plan's retention ends; rate limits survive restarts and are shared by every app server; guests and hosts can read a privacy policy and terms in both languages; the app sends basic security headers and has a health check; e2e tests cover these.

**Non-goals (8b or later).**

- Dockerfile, deployment guide, S3/R2 driver, a shared realtime bus, e2e in CI.
- How the client IP is derived behind a proxy (`x-forwarded-for` trust), HSTS, and a per-IP PIN limit: all depend on the host's proxy. `clientIpHash` stays as it is, so IP-keyed limits (`guestJoin`, `report`) can still be dodged by a client that sends its own `x-forwarded-for`, and device-keyed limits by a client that drops its cookie.
- A full Content-Security-Policy with script nonces (needs every page rendered dynamically; revisit with hosting).
- Real legal text. The pages describe what the app does; a lawyer reviews them before launch.
- Fixing `tests/e2e/media.spec.ts:38` (voice; fails on `main` because of the fake microphone in the new Chromium build).
- Emailing the host before or after the purge; purging Auth.js sessions or verification tokens.

## 2. Acceptance criteria

Retention purge (`src/server/retention/purge.ts`, `purgeExpiredEvents(now)`):

1. A run picks every event with `purgeAt <= now` and `archivedAt IS NULL`, whatever its status (`ACTIVE`, `SUSPENDED`, `DRAFT`, or `ARCHIVED` left by a run that failed partway). Events with `purgeAt` null or in the future are untouched.
2. For each picked event, in this order:
   1. **Claim:** `updateMany where { id, purgeAt <= now, archivedAt: null }` sets `status = ARCHIVED`. If it updates 0 rows (a date edit or plan change moved `purgeAt` meanwhile, or another run finished it), the event is skipped. From here guests are cut off (every guest path serves `ACTIVE` events only) and host writes are refused (criterion 9).
   2. Publish `{ type: "closed" }` on the event's bus channel so open guest streams end.
   3. Delete every object under `events/<eventId>/` (originals, display copies, thumbnails, posters, voice, cover, card photos, card music).
   4. In one interactive transaction: delete the event's `Upload`, `Wish`, `Rsvp`, `Guest`, `AbuseReport` and `ECard` rows; then `updateMany where { id, archivedAt: null }` sets `coverKey = null`, `pinHash = null`, `uploadCount = 0`, `storageBytes = 0`, `archivedAt = now`; only if that updated 1 row, write an `AuditLog` row `EVENT_PURGED` (actor null, target the event, metadata `{ uploads, wishes, rsvps, reports }` counts). Two runs at once write one audit row.
3. **Re-sweep:** every run also takes each event with `archivedAt` within the last 24 hours and deletes `events/<eventId>/` from storage again and any `Upload`, `Wish`, `Rsvp`, `Guest`, `AbuseReport` or `ECard` rows that appeared, and sets `coverKey = null`. No audit row. This removes files that in-flight work wrote after step 3 (upload URLs live 15 minutes; video processing and host cover or card saves that passed their checks before the claim).
4. Kept: the `Event` row (title, host names, date, venue, plan, slug), `EventMember`, `Payment` and `AuditLog` rows. The slug stays taken.
5. Safe to repeat: a failure after any step leaves `archivedAt` null and the next run finishes the job; a second run on the same data changes nothing except the re-sweep, which finds nothing.
6. One event failing does not stop the others. It is logged as `[purge] event <id> failed: <error.name>` (no message, no guest data). The run returns `{ archived, failed }`.
7. The same run deletes `RateLimit` rows whose `windowStart` is more than one day old.
8. A host edit recomputes `purgeAt` only when `startsAt` changes (`nextPurgeAt` in `src/server/events/retention.ts`, unit tested); other edits keep the stored value. An admin plan change recomputes it as before.
9. An `ARCHIVED` event is read-only: `canEditEvent(event)` and `canModerate(event)` take `{ memberRole, status }` and return false for `ARCHIVED`, so event edit and settings, cover, card save, card photo and music, moderation and exports are refused (403 or `forbidden`, as each one does today). The owner can still delete the event (`canDeleteEvent`) and manage co-hosts.
10. The host dashboard on an archived event shows a banner. With `archivedAt` set: "Tempoh simpanan tamat. Gambar, video, suara, ucapan dan RSVP tetamu telah dipadam pada {date}." / "Retention ended. Guests' photos, videos, voice messages, wishes and RSVPs were deleted on {date}." With `archivedAt` still null (a run failed partway): "Tempoh simpanan tamat. Data tetamu sedang dipadam." / "Retention ended. Guest data is being deleted." The "kept until" line is hidden on archived events, and the host's event list labels them archived.
11. Admin: the events page already filters by `ARCHIVED`; the audit log shows `EVENT_PURGED` with a label in both languages. Plan change, suspend and unsuspend already refuse `ARCHIVED` (`planChange`, `nextEventStatus`).

Purge triggers:

12. The Node server runs the purge one minute after start and then every hour, from `src/instrumentation-node.ts`. It is not scheduled during `next build` (`NEXT_PHASE === "phase-production-build"`), the timers are `unref()`ed, a `globalThis` guard stops a second schedule after a dev reload, and errors are caught and logged (criterion 6), never an unhandled rejection.
13. One in-flight run per process: the timer and the cron route share one promise, so a cron call during a timer run waits for it and returns its result.
14. `POST /api/cron/purge` runs it for an external scheduler. It needs `Authorization: Bearer <CRON_SECRET>`. Both values are SHA-256 hashed before `timingSafeEqual`. A missing or wrong secret is 401; when `CRON_SECRET` is not set the route is 404. It returns `{ archived, failed }` and is not rate limited (the secret gates it).

Rate limiter:

15. `createRateLimiter({ name, limit, windowMs })` keeps its interface, now async: `hit(key)` resolves `{ ok, retryAfterSec }`, `reset(key)` deletes the row. One SQL upsert per hit against the `RateLimit` table returns `{ count, windowStart }` (a hit after the window ends starts a new window with count 1); a pure function `rateLimitResult({ count, windowStart }, limit, windowMs, now)` turns that into `{ ok, retryAfterSec }` and is unit tested.
16. The six limits and their keys are unchanged: `uploadStart` 120, `wish` 20, `guestJoin` 30, `pinAttempt` 5 with reset on success, `rsvp` 10, `report` 5, all per 10 minutes. Stored keys are `<name>:<key>`, for example `pinAttempt:<eventId>:<deviceHash>` or `report:<salted IP hash>`; never a raw IP or device token.
17. E2E proves the counts live in the database: after 2 wrong PINs a `RateLimit` row for that event and device exists with count 2; a correct PIN deletes it; after 5 wrong PINs the 6th attempt is `locked` 429, even with the right PIN.
18. If the rate-limit query fails (database down), the request fails: the guest API routes return their normal 500 and the report server action shows the error page. It never lets the request through unlimited.

Privacy and terms:

19. `/{locale}/privacy` and `/{locale}/terms` (`ms` and `en`) render without sign-in, with no client JavaScript of their own, readable at 360 px.
20. The privacy policy covers: the controller; what is collected (guest display name, device cookie, photos, videos, voice messages, wishes, RSVP name, optional phone number, pax and message, abuse reports, host email and name, salted hashes for rate limits, no raw IP); why; who can see it (the event's hosts; guests only when the gallery is public; admins for abuse and support); retention (each active plan's name and `retentionDays`, read live from the database, counted from the event date, then the purge); deletion (hosts can delete items or the whole event at any time; a guest asks the host or the contact email); cookies and local storage (`mk_device`, the session cookie, the locale cookie, the consent flag in local storage); and the contact.
21. The terms cover: the service, host responsibilities (rights to content, telling guests, lawful use), prohibited content (the report reasons), suspension and deletion by admins, plans and retention, no warranty, Malaysian law, and the contact.
22. The controller name, contact email and postal address come from one file (`src/lib/legal.ts`) and show as visible placeholders (`[NAMA SYARIKAT]`, `[EMEL]`, `[ALAMAT]`) until filled.
23. A footer with links to both pages appears on the landing page, sign-in, the guest event page, the public e-card, the report page and both legal pages. The guest upload consent text links to the privacy policy. The guest event page stays under 150 KB first-load JS (the footer is a server component).

Security and operations:

24. `next.config.ts` `headers()` sets, on `/:path*` (pages and API routes alike): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(self), geolocation=()`, `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`. Voice recording, Google sign-in, the slideshow, the e-card and its OG image still work.
25. `GET /api/health` returns 200 `{ "status": "ok" }` when the database answers `SELECT 1` within 2 seconds, else 503 `{ "status": "error" }`, with no other detail and `Cache-Control: no-store`.

Tests and docs:

26. E2E, with a Prisma fixture in `tests/e2e/db.ts` and `CRON_SECRET` set in the Playwright `webServer.env`:
    - Purge: an event with a photo, a wish and an RSVP; the fixture sets `purgeAt` in the past; `POST /api/cron/purge`; then the guest page is 404, a media URL issued before no longer serves, the host sees the archived banner, the fixture finds no guest rows and `archivedAt` set, and the admin audit log shows `EVENT_PURGED`. Assertions check this end state, not the returned counts, because the in-process timer may run first.
    - The cron route is 401 with a wrong secret.
    - The PIN checks from criterion 17.
    - Legal pages in both languages, and the footer link from the guest page.
    - The security headers on a page response and on an API response.
    - The health route.
27. Unit tests: `rateLimitResult`, `nextPurgeAt`, `canEditEvent` and `canModerate` with `ARCHIVED`, the cron secret check, and the purge's per-event steps against a fake `db` and `storage` (claim skipped when 0 rows, step order, audit only when the guarded update hit, re-sweep removes a file written after archive, one failure does not stop the next event).
28. `CLAUDE.md`, `AGENTS.md`, `docs/HANDOFF.md` and `.env.example` describe the purge and its triggers, `CRON_SECRET`, the legal placeholders, the open gaps, and the 8b list.

## 3. Data model

One migration, `hardening`:

```prisma
model Event {
  // ...
  archivedAt DateTime? // set when the purge has deleted the event's guest data and files

  @@index([archivedAt])
}

enum AuditAction {
  // ...
  EVENT_PURGED
}

model RateLimit {
  key         String   @id // "<limiter>:<key>", keys are device or salted IP hashes
  windowStart DateTime
  count       Int

  @@index([windowStart])
}
```

Existing rows: `archivedAt` is null for every event, so any event already past `purgeAt` is purged by the first run after the migration (one minute after the server starts). The seed's demo event has a future date, so it is not affected. `RateLimit` starts empty, which matches today's in-memory state after a restart. The existing `@@index([status, purgeAt])` stays.

## 4. API contract

| Route or function | Caller | Input | Output | Errors |
| --- | --- | --- | --- | --- |
| `POST /api/cron/purge` | scheduler | header `Authorization: Bearer <CRON_SECRET>` | `{ archived, failed }` | 404 when `CRON_SECRET` unset, 401 wrong or missing secret, 500 |
| `GET /api/health` | uptime check, load balancer | none | 200 `{ status: "ok" }` | 503 `{ status: "error" }` |
| `purgeExpiredEvents(now?)` | timer, cron route | `now: Date` | `{ archived, failed }` | per-event errors counted and logged, not thrown |
| `limiters.<name>.hit(key)` | the six existing call sites, now awaited | key | `Promise<{ ok, retryAfterSec }>` | rejects on database error |
| `limiters.<name>.reset(key)` | PIN route | key | `Promise<void>` | |
| `canEditEvent(event)`, `canModerate(event)` | every existing call site | `{ memberRole, status }` | boolean | |
| `nextPurgeAt(current, input, retentionDays, now)` | `updateEvent` | stored `startsAt` and `purgeAt`, new `startsAt` | `Date` | |

The cron route accepts no body. The secret check is the only input validation; it is not logged.

## 5. Plans and money

No price or limit changes. Retention keeps coming from `Plan.retentionDays` through `computePurgeAt`. The privacy page reads the active plans' names and retention from the database, so an admin's edit shows there at once. The purge never deletes `Payment` rows.

## 6. Privacy

This phase is mostly privacy work.

- What the purge deletes and keeps is in criteria 2 to 4. The kept event row holds the host's own event details, not guest data.
- Retention now means what the privacy policy says: counted from the event date, moved only when the date or the plan changes (criterion 8).
- `RateLimit` stores only `<name>:<key>` with hashed keys, a time and a count; rows older than a day are deleted.
- The audit row stores counts, not content. The purge logs event ids and error names only.
- Media a viewer already downloaded can stay in their browser cache for up to an hour (`Cache-Control: private, max-age=3600` on `/api/storage/file`), and an open venue slideshow keeps its current items until its next refresh (about 20 minutes). After that nothing is served: the files are gone.
- Was open until 8b, closed there: PIN guessing across devices and IP-keyed limits that trust `x-forwarded-for` (decision 7, non-goals). When deployed, `TRUSTED_PROXY_HOPS` decides which `x-forwarded-for` entry counts.

## 7. Guest experience

- No new client JavaScript on guest pages. The footer and legal pages are server components. The consent text gets a plain link to the privacy page (same tab; the consent flag is already kept in local storage, so the guest comes back to the same state).
- After the purge the guest page, gallery, e-card and report page are 404, the same as a deleted event.
- New strings in both languages: `legal.*` (privacy and terms pages, footer), `eventNav.archivedBanner` and `eventNav.archivingBanner`, the archived label on the host list, `admin.audit.actions.EVENT_PURGED`, the consent link text.
- Check at 360 px: privacy and terms in Malay and English, and the footer on the guest page.

## 8. Env and services

- `CRON_SECRET` (already in `src/lib/env.ts` and `.env.example`) becomes used, with a minimum of 16 characters when set. A shorter value makes the server fail at start with a clear env error, as other invalid variables do. Unset means the cron route is off; the in-process timer still runs.
- No new service. The rate limiter uses the existing PostgreSQL.

## 9. Alternatives considered

- **Delete the whole event at retention end.** Simpler, but events with payments cannot be deleted (`onDelete: Restrict`), and the host loses any trace of what happened.
- **Delete storage before marking archived** (as `deleteEventCompletely` does). Guests could keep uploading between the two steps. Archiving first cuts guests and host writes off before anything is deleted; the re-sweep catches what was already in flight.
- **Make every file writer check the event status before writing.** Touches processing, upload completion, cover and card code, and still races; one re-sweep covers them all.
- **Redis for rate limits.** Faster at very high volume, but a new service to run; Postgres handles this app's scale. Same interface, so a later swap is one file.
- **Only an in-process timer, or only a cron endpoint.** The timer makes it work locally with no setup; the endpoint is what a hosted scheduler calls. Both call one function.
- **Legal text in page components.** Rule 10 puts every user-facing string in `messages/`, which also keeps both languages side by side for the legal reviewer.

## 10. Rollout

After merging: `npx prisma migrate dev` (applies `hardening`). The first start afterwards purges any local event already past its retention. Optional: set `CRON_SECRET` (16 or more characters) to call `/api/cron/purge` from a scheduler. Before launch, fill `src/lib/legal.ts` and have both pages reviewed.

Docs updated in the same branch: `CLAUDE.md` and `AGENTS.md` (status: phase 8a done, 8b next; the purge, the rate-limit table, the legal placeholders), `.env.example` (`CRON_SECRET` comment), `docs/HANDOFF.md` (the 8b list, including PIN guessing and IP trust).
