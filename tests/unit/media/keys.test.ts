import { describe, expect, it } from "vitest";
import { incomingKey, isIncomingKey, uploadKey } from "@/server/media/keys";

describe("incomingKey", () => {
  it("is the staging key next to the original", () => {
    expect(incomingKey("ev1", "up1")).toBe("events/ev1/up1/incoming");
    expect(uploadKey("ev1", "up1", "original")).toBe("events/ev1/up1/original");
  });

  it("refuses ids that would make an unsafe key", () => {
    expect(() => incomingKey("../x", "up1")).toThrow();
  });
});

describe("isIncomingKey", () => {
  it("accepts only events/<event>/<upload>/incoming", () => {
    expect(isIncomingKey("events/ev1/up1/incoming")).toBe(true);
    for (const key of [
      "events/ev1/up1/original",
      "events/ev1/up1/display.jpg",
      "events/ev1/cover/v1.jpg",
      "events/ev1/up1/incoming/extra",
      "events/ev1/incoming",
      "other/ev1/up1/incoming",
      "ecard/ev1/up1/incoming",
    ]) {
      expect(isIncomingKey(key), key).toBe(false);
    }
  });
});
