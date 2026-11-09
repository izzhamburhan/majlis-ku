import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles(SRC)
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => relative(process.cwd(), file).split(sep).join("/"))
    .sort();
}

describe("storage boundary", () => {
  it("only the local driver and its /api/storage routes touch disk paths or file read streams", () => {
    expect(filesMatching(/\b(pathFor|createReadStream)\b/)).toEqual([
      "src/app/api/storage/file/route.ts",
      "src/app/api/storage/upload/route.ts",
      "src/server/media/local-storage.ts",
    ]);
  });

  it("sharp is imported only by the module that limits its memory use", () => {
    expect(filesMatching(/from\s+["']sharp["']/)).toEqual(["src/server/media/sharp.ts"]);
  });
});
