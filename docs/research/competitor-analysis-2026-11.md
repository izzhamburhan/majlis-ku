# QR Guest Photobook: Malaysian Competitor Research

Date: 2026-11-01. Researched by browsing each site in a real browser (Playwright, 390 × 844 phone viewport) and opening every public demo that was offered. Screenshots are in [screenshots/](screenshots/).

## How to read this

| Mark | Meaning |
| --- | --- |
| ✅ | Seen working in a live demo during this research |
| 📄 | Claimed on the site's own marketing or pricing page, not seen working |
| ➖ | Not seen anywhere on the public site (the feature may still exist behind a login) |
| ❓ | Unclear; the page mentions something related but the details were not visible |
| 🧩 | Found in the site's shipped code by the REA bundle analysis (a route or API exists), not seen working and not marketed |

The technical side (stack, camera, filters, uploads, realtime, trackers) is in [technical-teardown-2026-11.md](technical-teardown-2026-11.md).

No feature was assumed. No guest uploads were made to competitor sites. Camera permission prompts were not exercised (headless browser), so "camera" means the site shows a button that opens the camera.

Prices are the published one-time prices on 2026-11-01, in MYR. Struck-through "was" prices are shown as `(was RMx)`.

## 1. The ten competitors at a glance

| # | Platform | Positioning | Language | Demo | How you buy |
| --- | --- | --- | --- | --- | --- |
| 1 | [Sedetik](https://sedetik.com) | Digital guestbook (photo, voice, video, wish) + e-invite; free tier | EN + BM | ✅ `/test` guest page | Self-serve checkout, promo codes |
| 2 | [Kenang](https://kenang.my) | "Every guest is your photographer": disposable film camera + film filters | BM + EN | ✅ guest camera `/e/demo`, ✅ host dashboard `/demo-dashboard` | Self-serve, FPX or DuitNow QR |
| 3 | [Memora](https://memora.com.my) | Premium private album, reveal moment, Branding Studio | EN | ✅ host workspace `/demo` | Stripe checkout, 1-day free trial |
| 4 | [momenspace](https://momenspace.my) | Wedding QR gallery with optional Live Wall | BM + EN | ➖ (guest demo button not opened) | Self-serve at app.momenspace.my |
| 5 | [Gathrly](https://www.gathrly.my) | Event gallery; host uses an iOS app | EN + BM | ➖ | iOS app + web |
| 6 | [Arkib Janji](https://arkibjanji.com) | Filters, voice, "Memory Journey"; highest prices | EN | ❌ demo link returned "Event not found or no longer active" | WhatsApp only |
| 7 | [Kalipix](https://kali-pix.com) | Live gallery + AI moderation; Pro: AI selfie face finder | EN | ✅ live event page (camera only) | WhatsApp + bank transfer / TnG |
| 8 | [Kenangan](https://kenanganmajlis.com) | Cheapest "3 in 1": gallery + e-Kad + RSVP | BM + EN | ✅ guest gallery `/g/meowmi-meowie` | Self-serve, CHIP gateway |
| 9 | [AlbumKahwin](https://albumkahwin.com) | "Digital disposable camera", morning-after reveal, keepsake website | EN + BM | ✅ `demo.albumkahwin.com` | Self-serve, capacity slider |
| 10 | [Fotto](https://www.fotto.my/albums) | Photographer marketplace; private albums with selfie search | EN | ➖ | Self-serve packs |
| – | **Majlis Ku (us)** | Guestbook (photo, video, voice, wish) + live TV slideshow + e-card + RSVP | BM + EN | ✅ local (`/demo-aisyah-daniel`) | Payments deferred |

## 2. Feature-by-feature comparison

Columns: SE Sedetik · KE Kenang · ME Memora · MO momenspace · GA Gathrly · AJ Arkib Janji · KP Kalipix · KM Kenangan · AK AlbumKahwin · FO Fotto · **MK Majlis Ku**

| Feature | SE | KE | ME | MO | GA | AJ | KP | KM | AK | FO | **MK** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| QR code + share link | 📄 + free printable QR templates | ✅ QR card per table | ✅ QR card download | 📄 | 📄 QR PDF (Basic+) | 📄 | 📄 | 📄 | 📄 | 📄 table QR | ✅ QR + stand PDF |
| In-browser camera button | ✅ Take a photo | ✅ camera opens in browser | 📄 | ➖ (picker) | 📄 take or upload | 📄 | ✅ Open Camera | 📄 take or pick | ✅ disposable camera | ➖ | ➖ file picker only (OS offers camera) |
| Photo upload | ✅ | ✅ | ✅ | 📄 | 📄 | 📄 | ✅ | ✅ | ✅ | 📄 host + guests | ✅ client compression, retry, offline pause |
| Video upload | ✅ Record video | ➖ | 📄 Classic+ | 📄 Lite+ | ➖ | ➖ | ➖ | 📄 +RM10, 15 s/clip | ➖ | ➖ | ✅ H.264 transcode, poster |
| Voice notes | ✅ Record voice | ✅ Suara | ➖ | ➖ | ➖ | 📄 Premium | ➖ | ➖ | ➖ | ➖ | ✅ AAC `.m4a` |
| Written wishes / guestbook | ✅ | ✅ | 📄 | 📄 | 📄 Basic+ | 📄 notes (capped per plan) | ➖ | 📄 message per upload | ✅ Wishes tab | ➖ | ✅ |
| Live gallery | ✅ claimed realtime, name on every item | 📄 | ✅ "Your album is live" | 📄 | 📄 | ❓ | ✅ LIVE NOW | ✅ counters live | ✅ Live moments feed | ❓ | ✅ SSE |
| Live slideshow / TV wall | 📄 Premium: collage, film roll, drifting wall, mosaic; QR + wishes rail | ➖ | ➖ | 📄 Live Wall (watermark on Free; own theme on Momen) | 📄 Standard+ | 📄 "slideshow popup", "replay slideshow" | 📄 | ➖ | 🧩 `/live-wall`, `/wall` routes | ➖ | ✅ 4 layouts, print frame, names, QR + wishes rail |
| Disposable camera (shot limit) | ➖ | ✅ "3 keping filem" in demo; 📄 20 per guest | ➖ | ➖ | ➖ | ➖ | 📄 per-guest limit (any number or unlimited) | ➖ | ✅ shot counter "12 / 24", host sets limit | ➖ | ➖ |
| Photo filters / editing | ➖ | 📄 3 film stocks + orange date stamp, burned in, original kept, switchable after the event | ➖ | ➖ | ➖ (auto WebP only) | 📄 filters (3 or all by plan), boomerang | ➖ | ➖ | ❓ keepsake styles | ➖ | ➖ |
| Guest identification | ✅ name | ✅ name only | ✅ join, no account | 📄 no account | 📄 name | ❓ | ❓ | ✅ name + accept T&C | ✅ name, optional Google/email sign-in | 📄 selfie search, selfie discarded | ✅ name + device cookie |
| Find my photos (face search) | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | 📄 Pro: selfie → AI match | ➖ | ➖ | 📄 selfie search in every pack | ➖ |
| "My album" for a guest | ➖ | ✅ Album Saya | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ❓ | 📄 | ➖ |
| Host dashboard | ❓ | ✅ checklist 2/5, counts (photos, guests, wishes, voice) | ✅ guests, memories x / 1,000, reveal, storage x / 1 GB, schedule | ❓ | 📄 iOS app | 📄 "premium dashboard" | ❓ | ✅ counters (memories, days left, guests) | ✅ guests joined, memories | 📄 manage album | ✅ dashboard + admin panel |
| Analytics | ➖ | ✅ counts | ✅ counts | ➖ | 📄 guest count, photo count, views, **top contributor** (Standard+) | ➖ | ➖ | ✅ counts | ✅ counts | ➖ | ✅ counts |
| Moderation | ➖ | 📄 review before display | ❓ | 📄 review first (Momen only) | 📄 hide, delete, wipe | ➖ | 📄 **AI** flags inappropriate photos | 📄 hide or delete | 📄 hide or remove | 📄 stop guest uploads | ✅ approve, hide, delete, approve all, abuse reports |
| Privacy controls | 📄 link-only, not indexed | ❓ | 📄 private album | 📄 | 📄 | 📄 | ❓ | 📄 host decides guest downloads | ❓ | 📄 optional PIN, never indexed | ✅ private default, PIN, consent gate, retention purge |
| Timed reveal / lock | ➖ | 📄 "Kejutan selepas majlis" | ✅ reveal date, capture open/close schedule | ➖ | ➖ | ➖ | ➖ | ➖ | 📄 morning-after reveal | ➖ | ➖ |
| Bulk download | 📄 ZIP (even on Free) | 📄 ZIP: originals + wishes + voice | 📄 originals; "full memory download" on Signature | 📄 Lite+ | 📄 ZIP + pick favourites | 📄 | 📄 ZIP emailed after event | 📄 | 📄 | 📄 ZIP | ✅ ZIP of originals + wishes PDF/CSV |
| Branding / themes | 📄 e-invite templates, opening animations | 📄 cover photo, film stock, own date-stamp text | 📄 5 themes; Branding Studio (logo, colours, artwork) on Signature | 📄 Live Wall theme (Momen) | 📄 1–5 "luxury" themes | 📄 default theme | ➖ | 📄 13 e-Kad themes | 📄 keepsakes: Film Reel, Wayang Kulit, Scrapbook; dark mode | ➖ | ✅ theme colour, 3 e-card templates |
| E-invite + RSVP | 📄 RM39.90; 🧩 AI card and message generator routes | ➖ | ➖ | ➖ | ➖ | ➖ | 📄 "Wedding Websites" (not opened) | 📄 e-Kad + RSVP split by bride/groom side, CSV | 📄 programme, map | ➖ | ✅ 3 templates, RSVP, CSV + Excel |
| Money gift (DuitNow) | ➖ | 📄 "Salam Kaut" | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Multiple sub-events | 📄 several events in one gallery | 📄 2 events (bride and groom sides) RM148 | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| Keepsake after the event | ➖ | ➖ | ➖ | ➖ | ➖ | 📄 "Memory Journey" | ➖ | ➖ | 📄 keepsake website, RM50/month; 🧩 `/printable`, `/print-kiosk`, `/photobooth`, `/stickers`, `/music` | ➖ | ➖ |
| Partner / affiliate | 📄 affiliate | ➖ | 📄 photobooth partners | ➖ | ➖ | ➖ | 📄 photographer live upload (Pro) | 📄 20% referral | 📄 planners, refer a friend | 📄 agents, photographers | ➖ |

## 3. Pricing comparison (one-time per event, MYR)

| Platform | Free tier | Entry | Main wedding plan | Top plan | Notes |
| --- | --- | --- | --- | --- | --- |
| Sedetik | RM0: unlimited uploads, **only 50 newest visible**, 3-month storage, ZIP | – | RM99.90 (was RM149.90) Premium gallery: all uploads, TV display, 6 months | RM120 (was RM139.80) gallery + e-invite | E-invite alone RM39.90 |
| Kenang | – | – | RM99 (was RM149): unlimited guests, 20 shots each, 3 film stocks, moderation, ZIP, 3 months | RM148 for two events | Launch promo "100 majlis terawal" |
| Memora | – | RM49 Essential: photos + wishes, 14 days | RM69 (was RM99) Classic: + video, 5 themes, reveal, 30 days | RM149 Signature: Branding Studio, 60 days | 1-day Signature trial |
| momenspace | RM0: 50 photos, 1-day upload, 7-day view, Live Wall with watermark | RM39 Lite: 150 items, 14 days | RM99 Momen: unlimited (fair use), moderation, themed Live Wall, 30 days | – | Upload windows of 1, 3 or 7 days |
| Gathrly | RM0: 100 photos, 7 days | RM49 Basic: 1,000 photos, 30 days | RM149 Standard: 5,000 photos, Live Wall, analytics, 60 days | RM299 Pro: 10,000 photos | +RM29 per extra 30 days |
| Arkib Janji | – | RM99 Basic: 50 guests, 500 photos, 7 days | RM299 Standard: 250 guests, 2,500 photos, 3 filters, 60 days | RM399 Premium: unlimited, all filters, voice, 180 days | Caps the number of guests |
| Kalipix | – | – | RM199 Guest Gallery: 5,000 photos, slideshow, 3 months | +RM120 per 5,000 photos | Pro (face finder) price not published |
| Kenangan | – | **RM25** Galeri: unlimited photos, 2 months (+RM10 video) | RM49 (was RM59) gallery + e-Kad + video | RM69 (was RM89) + RSVP | Cheapest in the market |
| AlbumKahwin | RM0: 100 photos | RM99: 500 photos | Slider: RM10 per extra 100 photos (800 photos = RM129) | RM399 cap: unlimited | Keepsake website RM50/month |
| Fotto | – | RM39: 500 photos, 2 months | RM99: 2,000 photos, 3 months | RM199: 5,000 photos, 6 months | Shows cost per photo (4–7.8 sen) |
| **Majlis Ku (seed, unpublished)** | RM0: 100 uploads, 30 days | RM40 e-card only | **RM120 Premium**: unlimited, gallery + e-card, 365 days | – | No gateway yet (phase 6 deferred) |

**What the prices say.** The market clusters at **RM99 for a full wedding**. Kenangan undercuts everyone at RM25–69, and Arkib Janji and Gathrly reach RM299–399. Two pricing models compete: feature tiers (Memora, momenspace, Arkib Janji) and capacity tiers (Gathrly, AlbumKahwin, Fotto). Retention is short everywhere (7 days to 6 months). Majlis Ku's 365 days on Premium is the longest seen, and that is a selling point.

## 4. UI/UX notes per platform

**Sedetik** ([home](screenshots/01-sedetik-home.png), [guest page](screenshots/01-sedetik-gallery.png)). Full-bleed venue photo behind frosted-glass action tiles (Take a photo, Record video, Record voice, Write a message) that scroll sideways, plus a pill button to join the gallery. Polished and modern. The fourth tile is cut off at 390 px, so guests may not notice there are four options. Its feature page explains where to put QR codes, ranked (dining tables first). The closest product to Majlis Ku, including the four TV layouts.

**Kenang** ([home](screenshots/02-kenang-home.png), [guest camera](screenshots/02-kenang-guest-camera.png), [dashboard](screenshots/02-kenang-dashboard.png)). The strongest brand in the set: a dark cinematic hero photo, a serif title, monospace "film" captions and an orange date stamp. The guest screen asks for a name, then shows one big "Jadi Photographer Kami" (be our photographer) button with small tiles below for Album Saya, Suara, Ucapan, Salam Kaut and other guests' albums. The host dashboard opens with a **pre-event checklist (2/5)**: cover photo, camera choice, welcome text, print QR cards, test-scan. Copy is fully BM-first and colloquial ("Tak perlu pasang apa apa").

**Memora** ([home](screenshots/03-memora-home.png), [host demo](screenshots/03-memora-demo.png)). Calm, editorial and premium (off-white, deep green, generous spacing). The host workspace is the best organised in the set: "Your album is live", four stat tiles (Guests, Memories x / 1,000, Reveal, Storage x / 1 GB) and an explicit schedule (capture opens, capture closes, album live from) in Asia/Kuala_Lumpur. Bottom navigation: Event, Album, Studio, Settings. English only.

**momenspace** ([home](screenshots/04-momenspace-home.png)). Clean BM-first page that tells the WhatsApp-group story ("Gambar masa akad tadi ada pada siapa?"). Honest about limits: Live Wall is optional, and it says plainly that guests can upload after the event when the hall signal is weak.

**Gathrly** ([home](screenshots/05-gathrly-home.png)). The host side needs an iOS app (none on Android), which is friction in Malaysia. Strong content marketing (blog guides). The only one advertising a "who snapped the most" stat.

**Arkib Janji** ([home](screenshots/06-arkibjanji-home.png), [broken demo](screenshots/06-arkibjanji-demo.png)). Template-style page with many emoji. The demo was dead, and booking goes through WhatsApp only. The highest prices, and it limits the number of guests, which pushes against "every guest is a photographer".

**Kalipix** ([home](screenshots/07-kalipix-home.png), [live event](screenshots/07-kalipix-demo.png)). Minimal event page: "LIVE NOW" and a single Open Camera button. Public counters show a very early stage (11 events, 719 photos). The AI story (moderation, selfie face finder) is the differentiator. Booking by WhatsApp and bank transfer.

**Kenangan** ([home](screenshots/08-kenanganmajlis-home.png), [guest gallery](screenshots/08-kenanganmajlis-guest.png)). Practical and price-led. The guest gallery header shows live counters (memories, **days left**, guests), and joining needs a name plus a T&C tick. It has 13 e-Kad themes with local names (Songket Emas, Terracotta Senja) and an RSVP list split by bride and groom side.

**AlbumKahwin** ([home](screenshots/09-albumkahwin-home.png), [demo](screenshots/09-albumkahwin-demo.png)). The most app-like guest UI: a bottom tab bar (Home, Gallery, a raised **camera FAB**, Wishes, More), "14 guests joined / 4 memories captured" cards, a host avatar with a hashtag, and dark mode. The shot counter makes every photo feel deliberate. Shows a ~5 s "Opening the celebration…" loader on first load. The keepsake styles (Film Reel, **Wayang Kulit**, Scrapbook) are culturally distinctive.

**Fotto** ([albums](screenshots/10-fotto-albums.png)). A photographer-marketplace look. Its strongest privacy statement is "Selfies aren't stored". Showing the cost per photo is a clever pricing device.

**Majlis Ku, local** ([TV collage](screenshots/majlisku-slideshow-collage.png), [TV mosaic](screenshots/majlisku-slideshow-mosaic.png)). The venue display already matches or beats every competitor wall seen: a live collage, the upload QR and a latest-wishes rail with names. The guest page is functional but plain next to Kenang, Sedetik and AlbumKahwin: emoji tiles on a flat background, no hero photo, no counters, no bottom bar, no camera-first action.

## 5. Market gaps

1. **Nobody markets the fun capture (disposable camera and film filters) together with a live TV wall.** Kenang has the camera but no wall; Sedetik and momenspace have the wall but no camera mode. AlbumKahwin's code has `/live-wall` and `/photobooth` routes (REA), so it is the one to watch.
2. **No printed photobook.** Every product ends at a ZIP or a website. Nobody turns the best photos plus the wishes into a print-ready photobook PDF. AlbumKahwin's code has `/printable` and `/print-kiosk` routes (REA), which points to on-site prints, not a photobook.
3. **No auto-generated highlight video.** Nobody makes a 60-second reel of the night, even though several already process video.
4. **The TV wall is passive.** No competitor shows reactions, a "photo of the moment", a wish spotlight, voice-note moments or a thank-you ending on screen.
5. **Voice is rare** (Sedetik, Kenang, Arkib Janji only), and nobody plays voice wishes back on the TV or turns them into a keepsake.
6. **Per-table QR insight.** Several sites tell hosts to put a QR on every table; nobody tags uploads by table ("Meja 7 paling aktif!").
7. **Weak venue signal** is a top FAQ (Kenang, momenspace). Only momenspace answers it, by extending the upload window. Nobody sells an offline queue that sends later.
8. **AI**: moderation and face finding exist only at Kalipix and Fotto, and both are early. A PDPA-careful version (opt-in, selfie discarded, no stored face templates) is open territory.
9. **Malaysian culture**: only Kenang has a money gift (Salam Kaut via DuitNow), only AlbumKahwin has a local keepsake style (Wayang Kulit), and only Kenangan splits by bride and groom side. Nobody covers both sides plus nikah and sanding as linked sub-events in one product.
10. **Trust gaps**: dead demos (Arkib Janji), WhatsApp-only booking (Arkib Janji, Kalipix), host app on iOS only (Gathrly), a 50-item cap on the free view (Sedetik).

## 6. Recommendations for a next-generation Majlis Ku

Ordered by impact over effort. Each item names the competitor it matches or beats. Everything below needs the usual spec → TDD plan → gates before it is built.

### A. Parity: closes the gaps hosts will notice

| # | Feature | Matches | Notes for Majlis Ku |
| --- | --- | --- | --- |
| A1 | **Camera-first guest page**: hero cover photo, one big "Snap" action, live counters (photos, guests, days left) | Kenang, Sedetik, AlbumKahwin, Kenangan | The guest page is the product's face; keep it under the 150 KB JS budget |
| A2 | **Disposable camera mode**: host sets shots per guest (default 24, or unlimited), shot counter on screen | Kenang, AlbumKahwin, Kalipix | Server enforces the per-guest limit (rule 1); shown as `12 / 24` |
| A3 | **Film looks**: 3–4 presets plus a date stamp with the host's own text, applied on the server with `sharp`, original kept, switchable after the event | Kenang | Rendering happens on the server, so switching later just regenerates derivatives |
| A4 | **Capture window and reveal**: capture opens/closes, gallery locked until a set time ("Kejutan pagi esok") | Memora, Kenang, AlbumKahwin | The TV wall can stay live while the guest gallery is locked |
| A5 | **Host pre-event checklist** with a "test scan" step | Kenang | Lowers support load |
| A6 | **My album** for each guest (device cookie) | Kenang | Already possible from the guest token |
| A7 | **Top contributors and per-day stats** | Gathrly | Server-side counts only, no tracking |

### B. Differentiators: the "WoW" nobody has yet

| # | Feature | Why it wins |
| --- | --- | --- |
| B1 | **Interactive TV wall**: hearts and reactions from phones float onto the photo on screen; "Gambar Terkini" spotlight; wish ticker; scheduled moments (akad, cake, first dance) that switch the wall to a countdown; a closing "Terima kasih" montage | Extends the strongest part of Majlis Ku. No competitor has interactive TV |
| B2 | **Per-table QR**: each table card carries `?t=7`, uploads are tagged, and the wall shows a friendly table leaderboard | Turns "QR on every table" (which everyone recommends) into a game |
| B3 | **Auto highlight reel**: a 60-second MP4 of top photos, short clips and voice wishes, made with the `ffmpeg` pipeline already in place | Nobody offers it, and it is easy to share on WhatsApp and TikTok |
| B4 | **Photobook export**: print-ready PDF (A4 or square) with auto layout of the best photos and the wishes; later a print partner | It is the product the brief is named after, and nobody does it |
| B5 | **Voice wall moments**: approved voice wishes play on the TV between photo cycles, with a waveform and the guest's name | Uses a capability only three competitors have |
| B6 | **Linked sub-events**: nikah, sanding, belah lelaki and belah perempuan in one gallery with tabs, on one plan | Sedetik and Kenang charge per event; one product covers the whole wedding |
| B7 | **Offline queue**: photos taken with no signal are kept on the phone and sent when the signal returns ("Akan dihantar bila ada line") | Answers the top FAQ; the client already pauses and retries |
| B8 | **Salam Kaut / duit raya-style money gift** via the DuitNow QR the host uploads (no money passes through Majlis Ku) | Matches Kenang's local hook without payment-gateway risk; needs a `payments-guard` review |
| B9 | **Find my photos (opt-in)**: selfie match done on the server, selfie and face data deleted right after; host must turn it on | Matches Kalipix and Fotto; needs a PDPA (biometric) review and lawyer sign-off before launch |
| B10 | **AI moderation assist**: flag probable NSFW photos into the approval queue | Matches Kalipix; reduces risk when `requireApproval` is off |

### C. Positioning and pricing

- Keep one simple wedding price near the RM99 cluster. Lead with **365-day retention**, **voice + video + TV wall included**, and **one plan for every side and session**.
- A free tier should show **all** uploads but cap the count (unlike Sedetik's 50-newest view). Guests see everything; hosts upgrade for download and TV.
- Publish a self-serve checkout (phase 6) rather than WhatsApp booking. Trust is a gap in this market.
- Keep a live public demo event that never breaks (Arkib Janji's dead demo is a warning) and show it on a TV-sized preview.

## 7. Unverified and to check next

- momenspace and Gathrly guest flows (demo not opened / host app on iOS).
- Arkib Janji: every feature (demo broken).
- Kalipix Pro price; Kalipix "Wedding Websites" product.
- Whether Sedetik, momenspace and Gathrly show guest names on the TV wall.
- Camera behaviour on real devices (iOS Safari, WhatsApp in-app browser): needs a physical phone.