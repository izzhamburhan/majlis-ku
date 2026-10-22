# Handoff: where to continue

Last updated: 2026-10-22. Read `CLAUDE.md` (or `AGENTS.md`) and `playbook.md` first, then start with the `majlis-workflow` skill.

## State

Phases 0 to 5, 7 and 8a are done. 8a adds the retention purge (hourly in-process and `POST /api/cron/purge`), the Postgres `RateLimit` table, `/privacy` and `/terms`, security headers and `/api/health`; see `docs/specs/phase-8-hardening.md`. Checks on 2026-10-21: 205 unit tests and 26 e2e tests all passing. The legal pages still show placeholders in `src/lib/legal.ts` (`[NAMA SYARIKAT]`, `[EMEL]`, `[ALAMAT]`): fill them and get a legal review before launch.

## Sedetik-inspired changes (decided 2026-10-22)

The developer took ideas from sedetik.com, a Malaysian competitor, as six separate changes, low-risk first. Each gets its own spec, plan and branch. Borrow ideas, not their copy or design.

| Change | Branch | State |
| --- | --- | --- |
| A Slideshow layouts (collage, film strip, mosaic), print frame, guest-name toggle, QR & wishes panel, filtered slideshow stream, signed-URL refresh fix | `feat/media-slideshow-layouts` | implemented; see `docs/specs/slideshow-layouts.md` and `docs/plans/slideshow-layouts.md` |
| B More printable QR designs (table card, guest card, doorgift sticker) and a QR placement guide; move the stand PDF's hard-coded copy into `messages/` | — | next |
| C E-card: opening animation, parking and places to stay, RSVP wish carousel (needs RSVP moderation: migration and privacy review) | — | not started |
| D Free plan accepts unlimited uploads but shows the host only the latest N until upgrade (plan-contract change; `payments-guard`) | — | not started |
| E Sub-events (Nikah, Sanding, Bertandang) under one gallery, with tabs (migration across uploads, wishes, gallery, stream) | — | not started |
| F Marketing site: landing, features, pricing from the `Plan` table, public example card and gallery, FAQ, privacy and terms (overlaps phase 8) | — | not started |

Change A notes:

- The venue slideshow reads `layout` (`single`, `collage`, `film`, `mosaic`), `frame`, `names` and `rail` from its URL, and the Settings dialog rewrites them with `history.replaceState`. Nothing is stored on the server, so the dashboard link always opens the defaults.
- The slideshow listens on `/api/events/{id}/stream?view=slideshow`, which filters like the guest stream (visible items only, no original links) but never sends "closed".
- Fixed a bug that was on `main`: the 20-minute signed-URL refresh never ran, because its effect restarted on every slide change, so media broke after an hour. An e2e test with Playwright's clock covers it.
- All slideshow behaviour is a pure reducer in `src/components/slideshow/state.ts`, unit-tested; the components only render it and run the timers.
- Not checked by eye yet: the smoothness of the film strip and rail scrolling, and a smart-TV browser.

| Phase | State |
| --- | --- |
| 0 Collaboration scaffolding | done |
| 1 Setup (schema, auth, i18n, layout) | done |
| 2 Guestbook MVP | done |
| 3 Media+ (video, voice, live gallery, slideshow) | done |
| 4 Moderation and export, co-hosts, delete event | done |
| 5 E-card and RSVP | done |
| 6 Payments and plans | deferred by the developer (no gateway yet) |
| 7 Admin panel | done |
| 8a Local hardening (purge, shared rate limiter, privacy and terms, headers, health) | done |
| 8b Deployment hardening | **next** |

## Run it locally

```bash
npm install
cp .env.example .env     # set AUTH_SECRET (npx auth secret) and HASH_SALT (any long random string)
npm run db:start         # own terminal; embedded PostgreSQL on the DATABASE_URL port (5433 by default)
npx prisma migrate dev && npx prisma db seed
npm run dev              # http://localhost:3000, demo guest page /demo-aisyah-daniel
npm run build && npm run test:e2e
```

Sign in: any email on `/signin`; the magic link is printed in the server log and written to `.data/dev-mail.log`. `admin@majlisku.test` is an admin (`ADMIN_EMAILS`, checked on every request) and uses `/admin`. `demo.host@majlisku.test` owns the Premium demo event.

## What to build next

1. **Phase 8b: deployment hardening.** Needs the hosting choice first. Dockerfile and deployment guide; S3/R2 `StorageDriver`; how the client IP is derived behind the proxy (`x-forwarded-for` trust: `guestJoin` and `report` limits are keyed by IP and can be dodged by a client that sends its own header); HSTS; **PIN guessing across devices** (the PIN limit is 5 tries per device, so clearing cookies resets it; add a per-IP limit once IP trust is decided, not a per-event cap, which would lock real guests out at the venue). Also open: a shared realtime bus for more than one server, e2e in CI, a full Content-Security-Policy with nonces.
2. **Phase 6: Payments**, only when the developer asks. Use a `PaymentProvider` interface; read `.claude/skills/payments-guard`.

## Gotchas (learned the hard way)

- **Editor injection bug:** in this VS Code setup, files written or edited under `[bracket]` folders (`src/app/[locale]/...`, `src/app/api/e/[slug]/...`) can get `git log` text pasted into them. After writing such files, grep for `^commit [0-9a-f]{40}` in `src` and `tests` and delete the junk. Writing to a folder outside the repo and copying in does not always avoid it.
- Do not run `next dev` and `next build` at the same time (shared `.next/`). Stop old `next start` processes before `npm run test:e2e`, or Playwright reuses a stale server.
- An installed PostgreSQL on port 5432 is fine; the embedded one uses 5433. If 5433 is taken (on the 2026-10-21 machine it was another project's Docker container), set another port in `DATABASE_URL` in `.env`, for example 5434.
- Your npm version decides the lockfile shape: npm 10 drops the `libc` fields that npm 11 writes into `package-lock.json`. Do not commit that churn; `git checkout package-lock.json` after `npm install`.
- `tests/e2e/media.spec.ts` (voice message) was flaky on a fresh Playwright Chromium download (`chromium_headless_shell-1248`): "Merakam…" never appeared after "Mula rakam", also on `main` at 33b2ab1, so it is the fake microphone in that browser build, not app code. It passed on 2026-10-21 in the 8a worktree and on every run on `feat/media-slideshow-layouts`; if it fails again, suspect the browser build first.
- A fresh worktree needs `npm install` (not `npm ci`, with npm 10), then `git checkout package-lock.json`. Run `npx prisma generate` if typecheck says the Prisma client is stale.
- The first start after migrating `hardening` purges any local event already past its `purgeAt` (files and guest rows deleted, event kept as `ARCHIVED`).
- E2E setup: `tests/e2e/db.ts` is a Prisma fixture (reads `.env`), and `playwright.config.ts` sets `CRON_SECRET` for the test server. A stale `next start` on port 3100 started without `CRON_SECRET` makes the cron e2e return 404.
- **One local database for every branch:** every worktree's `.env` points at the same `DATABASE_URL`. A branch with a newer migration changes the shared database for everyone. Before e2e on a branch with different migrations, give the worktree its own database name in `DATABASE_URL` (then `npx prisma migrate dev` and `npx prisma db seed`). Never reset the shared one without asking.
- Admins are read-only on host dashboards (they can view, not change or export); every admin change goes through `/admin` and is in the audit log.
- npm 11 blocks install scripts: new packages with install scripts need `npm approve-scripts <pkg>` (stored in `allowScripts` in `package.json`).
- Read `NEXT_PUBLIC_APP_URL` through `env()` in server code, never `process.env.NEXT_PUBLIC_*` (frozen at build time).
- Bash heredocs on this machine can eat backslashes; write code containing them with a file tool.

## Process reminders

Specs and plans per phase are in `docs/specs/` and `docs/plans/`. Tests first. Both languages for every string (`messages/ms.json`, `messages/en.json`; a unit test checks the keys match). Guest pages stay under 150 KB first-load JS (currently about 126 KB). Role agents live in `.claude/agents/`; edit the Claude copy and run `node scripts/skills.mjs sync`. Do not commit or push without the developer's say-so.
