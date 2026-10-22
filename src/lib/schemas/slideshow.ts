import { z } from "zod";
import { DEFAULT_OPTIONS, type SlideshowOptions } from "@/components/slideshow/options";

export const SLIDESHOW_LAYOUTS = ["single", "collage", "film", "mosaic"] as const;

const flag = (fallback: boolean) =>
  z
    .enum(["1", "0"])
    .transform((v) => v === "1")
    .catch(fallback);

// Query strings are user-editable, so a bad or repeated value falls back to the default instead of failing the page.
export const slideshowOptionsSchema: z.ZodType<SlideshowOptions> = z.object({
  layout: z.enum(SLIDESHOW_LAYOUTS).catch(DEFAULT_OPTIONS.layout),
  frame: z.enum(["none", "print"]).catch(DEFAULT_OPTIONS.frame),
  names: flag(DEFAULT_OPTIONS.names),
  rail: flag(DEFAULT_OPTIONS.rail),
});

export const streamQuerySchema = z.object({ view: z.enum(["host", "slideshow"]).default("host") }).strict();
