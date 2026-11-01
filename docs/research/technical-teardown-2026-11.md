# Competitor Technical Teardown (REA method)

Date: 2026-11-01. Companion to [competitor-analysis-2026-11.md](competitor-analysis-2026-11.md).

## Method

This follows the website workflow of REA's `reverse-engineer-anything` skill ([morluto/rea](https://github.com/morluto/rea)):

1. Capture a browser scenario.
2. Inspect the network capture.
3. Statically scan the shipped JavaScript.
4. Report observations, inferences and unknowns separately, with an evidence ID for each.

Two passes were made. First, a Playwright MCP pass using `.data/rea-teardown.js` (local, not committed); its results are in the evidence ledger below. Second, the REA CLI itself (`rea-agents` 6.8.0, `analyze-web-bundle`, run through `npx` against a headless Chrome on loopback CDP, 4 s observation, complete detail); its results are in [REA CLI results](#rea-cli-results). For each public page the Playwright script:

- loaded the page once at 390 × 844 and waited 7 s;
- recorded the request hosts and API paths the page made itself, plus any WebSocket connections;
- read the main document's response headers;
- re-read the page's own script files and counted keyword hits (for example `getUserMedia`, `supabase`, `sepia`).

Boundaries:

- Passive only. No logins, no uploads, no calls to competitor APIs beyond what the page made itself, and no code copied.
- **Static keyword hits are not proof of runtime behaviour.** A single hit can come from a bundled library. Counts of 1–2 are low confidence.
- JS sizes are **uncompressed** totals of the scripts present after 7 s. They are not comparable with Next.js "First Load JS", which is gzip; divide by roughly 3–4 to estimate the transfer size.
- Only the page listed was captured. Camera, upload and live-wall screens behind a name prompt or login were not exercised.

## Evidence ledger

| ID | Target | Observation (direct) |
| --- | --- | --- |
| E1 | sedetik.com/test | Cloudflare; Vite build (`/assets/index-*.js`); 3 scripts, 670 KB. Browser calls `*.supabase.co/rest/v1/weddings` and `/rest/v1/analytics_events`. GA + Cloudflare analytics. Hits: `heic` 5, `image/webp` 7, `sentry` 4, `zip` 3. No `getUserMedia`/`MediaRecorder` in the loaded scripts. |
| E2 | kenang.my/e/demo | Cloudflare; `X-Powered-By: Next.js`, Turbopack chunks; 14 scripts, 681 KB. Own API `/api/foto/scan`, `/api/kiriman`. Facebook Pixel loaded on the **guest** page. Hits: `getUserMedia` 2, `facingMode` 1, `MediaRecorder` 5, `toBlob` 4, `sepia` 23, `grain` 7, `vignette` 8, `indexedDB` 1, `navigator.share` 1, `heic` 1. |
| E3 | kenang.my/demo-dashboard | Same stack; 799 KB. Hits: `zip` 14, `sepia` 23, `grain` 7, `vignette` 8. |
| E4 | memora.com.my/demo | Cloudflare + `Via: 1.1 Caddy`; strict CSP (`default-src 'self'`, `media-src` blob + one storage host). Vite build, 2 scripts, 242 KB. Own API `/api/public/events/:slug`, `/api/public/albums/:id`, `/api/demo/events`. No WebSocket seen. |
| E5 | momenspace.my | Cloudflare; `X-Powered-By: PHP/8.4.27`; Vite `build/assets/marketing-*.js`, 38 KB. App lives on app.momenspace.my (not captured). |
| E6 | gathrly.my/en/demo | `Server: Vercel` (sin1); Next.js (webpack); strict CSP; 14 scripts, 913 KB; Sentry tunnel `/monitoring`. Hits: `ably` 2, `EventSource` 1, `cloudinary` 1, `sepia` 6. |
| E7 | arkibjanji.com | `Server: LiteSpeed`; 0 scripts, static HTML. Demo app at `app.arkibjanji.com/index.php?wedding=` returned "Event not found" (see main report). |
| E8 | kali-pix.com/event/:id | Vercel (sin1), `X-Powered-By: Next.js`, Turbopack; **25 scripts, 2,939 KB**. API `/api/public/cameras/:id`, `/api/public/session/current`. GA. Hits: `supabase` 74, `amazonaws` 8, `presigned` 7, `X-Amz-Signature` 1, `multipart` 1, `zip` 47, `toBlob` 1. |
| E9 | kenanganmajlis.com/g/:slug | Cloudflare; CSP `frame-ancestors 'none'`; Next.js Turbopack; 14 scripts, 849 KB. File input `accept="image/*" multiple`; code has `capture:"environment"` ×2. API `/api/events/:slug/access`. Hits: `sepia` 73, `grain` 19, `vignette` 10, `toBlob` 1. |
| E10 | demo.albumkahwin.com | Cloudflare; Vite SPA, 7 scripts, 844 KB; `version.json` poll. Separate API host `api.albumkahwin.com/api/v1/events/:slug/{photos,albums,stats,website,music}` and `/api/auth/get-session`. **PostHog with session recorder, surveys, dead-click capture** loaded on the guest page. Hits: `grain` 11, `vignette` 9, `stripe` 2, `heic` 1. |
| E11 | fotto.my/albums | Vercel (sin1), Next.js Turbopack; 17 scripts, 1,312 KB; Sentry `/monitoring`. Hits: `supabase` 81, `ably` 2, `EventSource` 1. |

## Findings

| # | Finding | Type | Evidence | Confidence |
| --- | --- | --- | --- | --- |
| F1 | Kenang builds its own in-browser camera (`getUserMedia` + `facingMode`) and draws film looks on a canvas (sepia, grain, vignette → `toBlob`) **on the phone**, before upload | Inference | E2 | High (many hits on the guest route that matches the marketed feature) |
| F2 | Kenang records voice with `MediaRecorder` and may keep pending shots in IndexedDB | Inference | E2 | Medium for voice, low for IndexedDB (1 hit) |
| F3 | Kenangan also renders film-style effects on the client and uses the file picker with `capture="environment"`, not a custom camera | Inference | E9 | Medium (no `getUserMedia` hit) |
| F4 | Sedetik's browser talks straight to Supabase (PostgREST) for event data and its own analytics table | Observation | E1 | High |
| F5 | Kalipix uses Supabase plus presigned S3 uploads (direct browser → S3), the same model Majlis Ku plans for 8b | Inference | E8 | High (presigned, X-Amz-Signature, amazonaws) |
| F6 | Gathrly and Fotto likely use **Ably** (managed realtime) for live updates; Fotto also uses Supabase | Inference | E6, E11 | Low–medium (2 hits each, plus EventSource) |
| F7 | Memora is a small self-hosted SPA (Caddy) with a strict CSP; the lightest app shell measured (242 KB) | Observation | E4 | High |
| F8 | momenspace is PHP 8.4 with Vite assets (probably Laravel) | Inference | E5 | Medium |
| F9 | Arkib Janji is a static page on shared LiteSpeed hosting with a separate PHP app | Observation | E7 | High |
| F10 | AlbumKahwin is a Vite SPA plus a separate API with endpoints for photos, albums, stats, keepsake website and **background music**; its session endpoint suggests a JS auth library (Better Auth pattern) | Observation (endpoints), inference (auth library) | E10 | High / low |
| F11 | **Guest tracking**: Kenang loads Facebook Pixel and AlbumKahwin loads PostHog session recording on the pages guests open from the QR code | Observation | E2, E10 | High |
| F12 | Guest pages are heavy: 670 KB – 2.9 MB of uncompressed JS. Kalipix's 2.9 MB is the worst for low-end Android on hall 4G | Observation | E1, E2, E6, E8–E11 | High (static size) |
| F13 | No competitor guest page registered a service worker; all but two ship a PWA manifest | Observation | all | High for the pages captured |
| F14 | No face-recognition library (`face-api`, `mediapipe`, `tensorflow`, `rekognition`) was found on any captured page, Kalipix and Fotto included | Observation | E8, E11 | Medium: face matching is probably server-side or on pages not captured |

## What this means for Majlis Ku

1. **Film looks.** Kenang and Kenangan bake the look into the image **on the phone**. Majlis Ku's plan (apply on the server with `sharp`, keep the original, switchable later) is better for quality and for changing the look after the event. A cheap CSS preview on the camera screen can match their feel without shipping a canvas pipeline. → `wow-feature-design`, film looks.
2. **Camera.** Only Kenang has a true custom camera. Kenangan proves `capture="environment"` on a file input is enough for most guests. Start with that (tiny JS) and add `getUserMedia` only for disposable mode.
3. **Weight is our edge.** Every competitor guest page ships far more JS than Majlis Ku's 150 KB gzip budget. Keep the budget and say so in marketing ("laju walaupun line dewan lemah", fast even on weak hall signal).
4. **Realtime.** Competitors use Supabase or Ably for live updates. Majlis Ku's SSE bus has no vendor cost; 8b needs a shared bus (Postgres `LISTEN/NOTIFY` or Redis) before running more than one server, as `CLAUDE.md` already says.
5. **Privacy as a selling point.** Two competitors track guests (Facebook Pixel, session recording) on pages reached from a QR code. Majlis Ku loads no third-party trackers on guest pages; keep it that way and say so on `/privacy`. → `privacy-pdpa-guard`.
6. **Uploads.** Kalipix already does presigned S3. Phase 8b's R2/S3 driver puts Majlis Ku on the same footing; add HEIC handling (Sedetik and Kenang both reference it) to the 8b scope. iPhones send HEIC by default.
7. **Background music on the keepsake** (AlbumKahwin `/music`) is a small, cheap wow for the highlight reel and photobook site.

## REA CLI results

`rea analyze-web-bundle` statically parses every script the page loaded (it never runs them) and reports vendor fingerprints, client routes, endpoint candidates, and unknowns. Coverage was **partial** on 8 of 10 sites: on each, one or two large scripts hit REA's 30 s per-script deadline, so findings from those scripts are unknown. Evidence bundles are kept locally (not committed). The IDs below are the start of each `evidence_id`.

| Site | Evidence | Scripts (all loaded) | Vendors (REA) | What REA found |
| --- | --- | --- | --- | --- |
| Sedetik | `ev_124b9099582c` | 30, 2,322 KB | – | 55 client routes: guest `/:slug/{join,upload,gallery,live}`; host `/dashboard/:weddingId/{launch,print,upgrade,photos,guests,settings}`; cards `/dashboard/cards/new/ai`, `/generate-message`, `/generate-card` (**AI invite generator**); `/affiliate`, `/admin/payouts`, `/admin/flags`; `/troubleshoot` |
| Kenang | `ev_6f9160e31f62` | 13, 653 KB | Next.js (high), React | Endpoints: `/api/foto`, `/api/foto/scan`, `/api/kiriman`, `/api/ucapan` (wishes), `/api/avatar`, `/api/lapor` (report), `/api/jejak` (tracking) |
| Memora | `ev_14a84dc201b5` | 19, 315 KB | – | Routes `/join/:slug`, `/album-preview`, `/schedule`, `/settings` |
| momenspace | `ev_a3d3f264fd8a` | 2, 8 KB | – | Marketing page only; endpoint `/demo.json` (the guest demo data). Complete coverage |
| Gathrly | `ev_b0f4cf2118df` | 51, 864 KB | Next.js (high), React | Route `/[locale]/demo`; nothing else anchored |
| Arkib Janji | `ev_34a1ad34c48c` | 1, 1 KB | – | Static page. Complete coverage |
| Kalipix | `ev_609b3c99c6ca` | 30, 2,361 KB | Next.js (high), React | Endpoints `/api/public/session/start`, `/api/public/session/name`: a guest session is opened, then named |
| Kenangan | `ev_cc7def8bc619` | 12, 689 KB | Next.js (high), React | Endpoints `/api/events`, `/api/events/email-check`, `/api/coupons/validate` (**coupon codes**) |
| AlbumKahwin | `ev_d127c0b12757` | 33, 2,525 KB | React | 54 client routes: `/live-wall`, `/wall`, `/photobooth`, `/print-kiosk`, `/qr-poster`, `/stickers`, `/printable`, `/music`, `/moderate`, `/reveal`, `/camera`, `/keepsakes`, `/website`, `/addons`, `/team`, `/partner-dashboard`, `/referral` |
| Fotto | `ev_f56973d726db` | 40, 1,249 KB | Next.js (high), React | 18 routes: `/albums/new`, `/find-my-order`, `/for-photographers`, `/agents`, `/dashboard/purchases`, public `/events/:slug` (sports and running events, not only weddings) |

What REA adds to the findings above:

- **F15 (observation).** AlbumKahwin's code has a live wall, a photobooth mode, an on-site print kiosk, stickers and background music, none of which its marketing shows. It is building the widest feature set. The `wall`, `photobooth` and `print-kiosk` cells are 🧩 in the main report.
- **F16 (observation).** Sedetik generates invite cards and WhatsApp invite messages with AI (`/dashboard/cards/new/ai`, `/generate-message`). Majlis Ku's e-card builder has no AI help.
- **F17 (observation).** Kenang has a `/api/jejak` ("track") endpoint next to Facebook Pixel on the guest page (F11). Its purpose is unknown.
- **F18 (observation).** Loaded JS, counted by REA including lazy chunks, is larger than the first pass measured: Sedetik 2.3 MB, Kalipix 2.4 MB, AlbumKahwin 2.5 MB (uncompressed). F12 stands.
- REA found **no** face-recognition, WebMCP, or source-map exposure on any captured page.

## Unknowns (unresolved)

- Live wall transport for Sedetik, momenspace and Kalipix (the wall pages need a login).
- Where Kalipix and Fotto run face matching; what they store.
- Whether Kenang's IndexedDB use is an offline upload queue.
- Real sizes of each guest route after gzip, and Majlis Ku's own guest route measured the same way (needs `npm run build`; the dev server is not comparable).
- Everything behind app.momenspace.my and app.arkibjanji.com.

## Checklist

| Question | Status |
| --- | --- |
| What stack does each platform run? | Answered (10/10 marketing or guest pages) |
| How do they capture photos (camera vs picker)? | Partially answered (Kenang, Kenangan, AlbumKahwin, Sedetik) |
| How are filters applied? | Answered for Kenang and Kenangan (client canvas); unknown elsewhere |
| How do uploads reach storage? | Partially answered (Kalipix presigned S3; others unknown) |
| How does the live wall update? | Partially answered (Ably/EventSource hints for Gathrly, Fotto); unresolved for the rest |
| What third parties see guest traffic? | Answered for captured pages |