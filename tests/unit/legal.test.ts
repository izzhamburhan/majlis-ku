import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ms from "../../messages/ms.json";
import { LEGAL } from "@/lib/legal";

describe("legal copy", () => {
  it("keeps the legal placeholders in one place", () => {
    for (const value of Object.values(LEGAL)) expect(value.length).toBeGreaterThan(0);
    for (const messages of [ms, en]) {
      const text = JSON.stringify(messages);
      for (const value of Object.values(LEGAL)) expect(text).not.toContain(value);
    }
  });

  it("has a privacy and terms section for every topic in the spec", () => {
    const privacy = ["controller", "collected", "purpose", "access", "processors", "retention", "deletion", "cookies", "contact"];
    const terms = ["service", "hostDuties", "prohibited", "suspension", "plans", "warranty", "law", "contact"];
    for (const messages of [ms, en]) {
      expect(Object.keys(messages.legal.privacy)).toEqual(expect.arrayContaining(privacy));
      expect(Object.keys(messages.legal.terms)).toEqual(expect.arrayContaining(terms));
    }
  });

  it("formats every privacy and terms string with the variables the pages pass", () => {
    for (const [locale, messages] of Object.entries({ ms, en })) {
      const errors: string[] = [];
      // Keys are dynamic here, so the typed translator is cast to a loose signature.
      const t = createTranslator({ locale, messages, onError: (error) => errors.push(error.message) }) as unknown as (key: string, values: object) => string;
      const walk = (value: unknown, path: string) => {
        if (typeof value === "string") {
          // The retention plan line also gets the plan's name and days (see privacy/page.tsx); the extra values are ignored elsewhere.
          t(path, { ...LEGAL, name: "Plan", days: 30 });
        } else if (value && typeof value === "object") {
          for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
        }
      };
      walk(messages.legal.privacy, "legal.privacy");
      walk(messages.legal.terms, "legal.terms");
      expect(errors, locale).toEqual([]);
    }
  });
});
