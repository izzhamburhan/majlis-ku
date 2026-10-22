// Isomorphic on purpose: no zod here, so the guest/TV client bundle stays small.
export type SlideshowLayout = "single" | "collage" | "film" | "mosaic";
export type SlideshowOptions = { layout: SlideshowLayout; frame: "none" | "print"; names: boolean; rail: boolean };

export const DEFAULT_OPTIONS: SlideshowOptions = { layout: "single", frame: "none", names: true, rail: false };

// "" for defaults, else only the non-default params in a fixed order, e.g. "?layout=film&names=0".
export function optionsQuery(options: SlideshowOptions): string {
  const params = new URLSearchParams();
  if (options.layout !== DEFAULT_OPTIONS.layout) params.set("layout", options.layout);
  if (options.frame !== DEFAULT_OPTIONS.frame) params.set("frame", options.frame);
  if (options.names !== DEFAULT_OPTIONS.names) params.set("names", options.names ? "1" : "0");
  if (options.rail !== DEFAULT_OPTIONS.rail) params.set("rail", options.rail ? "1" : "0");
  const query = params.toString();
  return query ? `?${query}` : "";
}
