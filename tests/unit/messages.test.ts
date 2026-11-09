import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ms from "../../messages/ms.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

describe("messages", () => {
  it("ms.json and en.json have the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(ms).sort());
  });

  it("has no empty strings", () => {
    for (const [name, messages] of Object.entries({ ms, en })) {
      const empty = keys(messages).filter((path) => {
        const value = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages);
        return typeof value === "string" && value.trim() === "";
      });
      expect(empty, name).toEqual([]);
    }
  });

  it("/privacy names Render, Supabase, Google and Singapore as processors in both languages", () => {
    for (const [name, messages] of Object.entries({ ms, en })) {
      const section = messages.legal.privacy.processors;
      const text = [section.title, section.body, ...section.items].join(" ");
      for (const word of ["Render", "Supabase", "Google"]) expect(text, `${name} ${word}`).toContain(word);
      expect(text, name).toMatch(name === "ms" ? /Singapura/ : /Singapore/);
    }
  });
});
