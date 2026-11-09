import { describe, expect, it } from "vitest";
import sharp from "@/server/media/sharp";

describe("sharp configuration", () => {
  it("runs with one thread and no cache, so a small instance is not exhausted", () => {
    expect(sharp.concurrency()).toBe(1);
    expect(sharp.cache().memory.max).toBe(0);
    expect(sharp.cache().files.max).toBe(0);
    expect(sharp.cache().items.max).toBe(0);
  });
});
