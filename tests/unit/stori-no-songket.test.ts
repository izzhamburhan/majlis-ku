import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The Songket look is gone: no module, test, class, CSS variable or font variable of it may remain.
// Scanned: everything under src (code and CSS). The e-card's own `Songket` motif component (capital S, a template
// ornament) and the template id `classic-songket` are not the Songket theme and do not match these patterns.

const root = process.cwd();

function filesIn(path: string): string[] {
  const full = join(root, path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const child = join(full, entry.name);
    if (entry.isDirectory()) return filesIn(relative(root, child));
    return /\.(tsx?|css)$/.test(entry.name) ? [child] : [];
  });
}

function hits(pattern: RegExp, only?: string): string[] {
  const found: string[] = [];
  for (const file of filesIn("src")) {
    const name = relative(root, file).replaceAll("\\", "/");
    if (only && !name.endsWith(only)) continue;
    // The e-card is outside the redesign: its template motif is called Songket and a comment says "songket-like".
    if (name.startsWith("src/components/card/")) continue;
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        const match = line.match(pattern);
        if (match) found.push(`${name}:${index + 1}: ${match[0]}`);
      });
  }
  return found;
}

describe("Songket is removed", () => {
  it("the module and its test are deleted", () => {
    expect(existsSync(join(root, "src/lib/songket.ts"))).toBe(false);
    expect(existsSync(join(root, "tests/unit/songket-colour.test.ts"))).toBe(false);
  });

  it("no .sk-* class, --sk-* or --font-sk-* variable remains", () => {
    expect(hits(/(?<![\w-])sk-[a-z]|--sk-|--font-sk-/)).toEqual([]);
  });

  it("no .songket class, songketVars, paperVars or songket import remains", () => {
    // The class: `songket` as a whole word (not `Songket` the e-card motif, not `classic-songket`).
    expect(hits(/(?<![\w-])songket(?![\w-])|songketVars|paperVars|lib\/songket/)).toEqual([]);
  });

  it("the Photobook no longer blends with multiply, which vanishes on a dusk page", () => {
    expect(hits(/mix-blend-mode:\s*multiply/, "src/app/globals.css")).toEqual([]);
  });
});