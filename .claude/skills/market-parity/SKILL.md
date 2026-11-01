---
name: market-parity
description: Use when a Majlis Ku change adds or reshapes a product feature, plan, price, or guest-facing flow, or when someone asks how Majlis Ku compares with other Malaysian QR guest photo platforms. Places the change against the competitor research so every feature reaches market parity or beats it.
---

# Market Parity

Majlis Ku competes with about ten Malaysian QR guest-photo products. A feature that lands
below what hosts already get elsewhere for RM99 is a wasted phase. This skill keeps every
spec honest about where it stands.

The research lives in `docs/research/competitor-analysis-*.md` (newest file wins), with
screenshots in `docs/research/screenshots/`, and the technical teardown (stack, camera, filters,
uploads, realtime, trackers) in `docs/research/technical-teardown-*.md`. Read them; do not copy
their tables into specs.

## When it applies

- `change-design-spec` for any feature a host or guest sees.
- Any change to plans, limits, retention, or prices (also invoke `payments-guard`).
- A question such as "what do competitors do for X?" or "is this good enough?".

## Steps

1. **Locate the feature** in the research's feature table (section 2) and gap list (sections 5–6). Note which competitors have it and the evidence mark (✅ seen working, 📄 claimed only, ➖ not seen).
2. **Set the bar** in the spec under a heading `Market bar`:
   - *Parity*: the best working version seen (cite platform and screenshot).
   - *Beat it*: one concrete way Majlis Ku goes further (from section 6B, or a new idea).
   - *Not doing*: what the competitor does that we deliberately skip, and why (privacy, budget, rules).
3. **Check positioning**: plan tier and price against section 3. Majlis Ku leads with long retention, voice + video + TV wall included, and one plan for the whole wedding. Flag anything that undercuts those.
4. **Check the guest promise**: no app, no account, name only (CLAUDE.md rule 4). A competitor feature that needs a login, an email, or a phone number from guests is adapted or dropped.
5. **Record gaps**: if a feature is new to the market, add it to the research's gap list in the same change (invoke `doc-drift`).

## Keeping the research fresh

- Research older than 90 days is stale for pricing; say so in the spec and re-check the affected sites.
- Re-check by browsing the real site with the Playwright MCP at a 390 px viewport. Never fill a matrix cell from memory or assumption; mark it ➖ or ❓ when not seen.
- Save new screenshots as `docs/research/screenshots/<nn>-<platform>-<page>.png` and date the new research file.
- Do not create accounts, upload, or pay on competitor sites without the developer's approval.
- For a technical teardown, follow the REA website method (morluto/rea `reverse-engineer-anything`):
  capture the page's own traffic, scan only the JS it shipped, and keep an evidence ledger that separates
  observations, inferences, and unknowns. Passive only: no calls to competitor APIs, no copied code.
  Running the REA CLI or adding its MCP server needs the developer's approval.

## Red flags

| Thought | Reality |
| --- | --- |
| "Competitor X probably has this." | Unverified is ❓, not ✅. Browse or mark it. |
| "We'll match it exactly." | Parity alone loses on price to Kenangan. Name the beat-it step. |
| "Their price is RM99, so ours is too." | Pricing goes through `payments-guard` and the developer. |
| "Face search / AI is just a feature." | Biometric data: `privacy-pdpa-guard` and lawyer review first. |