import { describe, expect, it } from "vitest";
import { slideshowOptionsSchema, streamQuerySchema } from "@/lib/schemas/slideshow";
import { DEFAULT_OPTIONS, optionsQuery } from "@/components/slideshow/options";

describe("slideshowOptionsSchema", () => {
  it("gives the defaults for an empty query", () => {
    expect(slideshowOptionsSchema.parse({})).toEqual(DEFAULT_OPTIONS);
  });

  it("parses valid values", () => {
    expect(slideshowOptionsSchema.parse({ layout: "mosaic", frame: "print", names: "0", rail: "1" })).toEqual({
      layout: "mosaic",
      frame: "print",
      names: false,
      rail: true,
    });
  });

  it("falls back on invalid and repeated values", () => {
    expect(slideshowOptionsSchema.parse({ layout: "spiral", names: "yes", rail: ["1", "0"], frame: "" })).toEqual(
      DEFAULT_OPTIONS,
    );
  });
});

describe("optionsQuery", () => {
  it("omits defaults", () => {
    expect(optionsQuery(DEFAULT_OPTIONS)).toBe("");
    const options = { ...DEFAULT_OPTIONS, layout: "film" as const, names: false };
    const query = optionsQuery(options);
    expect(query).toBe("?layout=film&names=0");
    expect(slideshowOptionsSchema.parse(Object.fromEntries(new URLSearchParams(query)))).toEqual(options);
  });
});

describe("streamQuerySchema", () => {
  it("defaults to host and refuses unknown views", () => {
    expect(streamQuerySchema.parse({})).toEqual({ view: "host" });
    expect(streamQuerySchema.safeParse({ view: "tv" }).success).toBe(false);
    expect(streamQuerySchema.safeParse({ view: "slideshow" }).success).toBe(true);
  });
});
