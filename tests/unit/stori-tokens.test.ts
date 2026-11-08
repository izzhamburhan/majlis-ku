import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Source scan: components that render inside the Stori (dusk) theme must use the colour tokens
// (surface, muted, on-brand, on-ink, danger), not light-theme classes. A line that must keep a
// literal colour (a template preview, white text on a photo, a brand-coloured button) carries the
// comment `stori-keep` and is skipped.

const root = process.cwd();

// Stori components and pages, as a list of directories (scanned recursively) and files.
const STORI_SOURCES = [
  "src/components/host",
  "src/components/gallery",
  "src/components/guest/video-picker.tsx",
  "src/components/guest/voice-recorder.tsx",
  "src/components/locale-toggle.tsx",
  "src/app/[locale]/dashboard",
  "src/app/[locale]/[slug]/gallery/page.tsx",
  "src/app/[locale]/[slug]/report/page.tsx",
];

// Guest-facing subset: text there uses the solid muted token, not an ink opacity modifier.
const GUEST_SOURCES = [
  "src/components/gallery",
  "src/components/guest/video-picker.tsx",
  "src/components/guest/voice-recorder.tsx",
  "src/app/[locale]/[slug]/gallery/page.tsx",
  "src/app/[locale]/[slug]/report/page.tsx",
];

function filesIn(path: string): string[] {
  const full = join(root, path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const child = join(full, entry.name);
    if (entry.isDirectory()) return filesIn(relative(root, child));
    return /\.(tsx?|css)$/.test(entry.name) ? [child] : [];
  });
}

function offending(sources: string[], pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const file of sources.flatMap(filesIn)) {
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (line.includes("stori-keep")) return;
        const match = line.match(pattern);
        if (match) hits.push(`${relative(root, file).replaceAll("\\", "/")}:${index + 1}: ${match[0]}`);
      });
  }
  return hits;
}

describe("Stori source scan", () => {
  it("finds the files it is meant to scan", () => {
    expect(STORI_SOURCES.flatMap(filesIn).length).toBeGreaterThan(20);
    expect(GUEST_SOURCES.flatMap(filesIn).length).toBeGreaterThan(5);
  });

  it("Stori components use no hard-coded light theme classes", () => {
    const light = /\b(?:bg-white|text-white|(?:text|bg|border|ring|divide)-red-\d{2,3})\b/;
    expect(offending(STORI_SOURCES, light)).toEqual([]);
  });

  it("guest-facing components use no ink opacity modifiers", () => {
    expect(offending(GUEST_SOURCES, /\btext-ink\/\d+/)).toEqual([]);
  });
});