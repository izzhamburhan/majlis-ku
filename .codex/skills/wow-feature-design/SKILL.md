---
name: wow-feature-design
description: Use when designing or building a Majlis Ku "wow" guest feature from the competitor research: disposable camera mode, film looks and date stamps, timed reveal, interactive TV wall (reactions, spotlight, moments, table leaderboard), per-table QR, highlight reel, photobook export, voice wall, sub-events, offline queue, money-gift QR, face finder, or AI moderation. Gives the house rules each one must follow.
---

# Wow Feature Design

These features come from `docs/research/competitor-analysis-*.md` section 6. Run
`market-parity` first to set the bar, then design with the rules below. The normal gates still
apply: spec, TDD plan, implementation gate, verification.

## Rules for every wow feature

- **Server owns the truth.** Shot limits, reveal times, table tags, and reactions are counted and enforced on the server. The client only displays them.
- **Guest page budget.** Under 150 KB first-load JS. Camera, filters, and animation code load only on the screen that needs them. Invoke `guest-experience-guard`.
- **Works without the wow.** If the camera API, `MediaRecorder`, or fullscreen is missing (in-app browsers), fall back to the file picker or a plain layout. Never block an upload.
- **BM first.** Every string in `messages/ms.json` and `messages/en.json`, written in natural Malay ("Jadi photographer kami", not a literal translation).
- **Reduced motion.** TV and guest animations respect `prefers-reduced-motion`.
- **Plan-aware.** Each feature names its plan gate in the spec; limits come from the `Plan` row, never hard-coded.

## Feature notes

**Disposable camera.** `Event.shotsPerGuest` (null = unlimited). The server counts a guest's confirmed photo uploads and refuses the presign when the limit is reached. The counter shows `taken / limit`. Use `getUserMedia` with a capture button where supported; otherwise `<input type="file" accept="image/*" capture="environment">`.

**Film looks and date stamp.** Store the original untouched. Apply the look with `sharp` when making display derivatives, keyed by `Event.filmLook`, so changing the look regenerates derivatives and never touches originals. The stamp text defaults to the event date in `Asia/Kuala_Lumpur`; the host may override it (Zod, max length).

**Capture window and reveal.** `captureOpensAt`, `captureClosesAt`, `revealAt` in UTC. Before `revealAt`, guests see only their own photos ("Album saya") and the wall may still run. Countdown copy on the guest page.

**Interactive TV wall.** Reactions travel phone → server → SSE bus → wall, are rate-limited per device, and never carry free text. Spotlight picks the newest approved photo. Moments are host-scheduled (`akad`, `cake`, custom) and switch the wall layout at a set time. The table leaderboard shows counts by table label only, never guest names ranked against each other.

**Per-table QR.** The QR encodes `?t=<label>`; the label is validated, stored on the `Guest` row at join time, and editable by the host. The stand PDF prints one card per table.

**Highlight reel.** Built by the existing in-process `ffmpeg` job queue from approved items only; capped length; regenerated on request; deleted by the retention purge like any media.

**Photobook export.** A print-ready PDF (A4 portrait or 21 cm square, 3 mm bleed) of approved photos plus wishes, laid out on the server. Same generator family as the wishes PDF.

**Voice wall.** Only approved voice notes play, at most one per cycle, with the guest name and a waveform; the wall is muted until the host taps to unmute (browser autoplay rules).

**Linked sub-events.** One event with `sessions` (Nikah, Sanding, Belah lelaki, Belah perempuan); uploads tagged by session; one plan covers all.

**Offline queue.** Keep pending files in IndexedDB with their guest token; resume when `online` fires; show "Akan dihantar bila ada line". Clear entries once the server confirms the upload.

**Money-gift QR.** The host uploads their own DuitNow QR image; Majlis Ku only displays it. No payment is processed or recorded. Invoke `payments-guard` and state this in the copy.

**Face finder and AI moderation.** Opt-in by the host, off by default. Selfies and face data are processed and deleted at once; nothing biometric is stored. Needs `privacy-pdpa-guard`, an updated privacy page, and the developer's approval of any paid AI service (stack rule).

## Done means

- Unit tests for the server rule (limit, window, tag, or rate limit) written first.
- An e2e or Playwright MCP check on a 360 px phone and a 1920 × 1080 TV viewport.
- Screenshots of the result added next to the competitor ones, so the comparison stays visible.
