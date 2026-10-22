import { describe, expect, it } from "vitest";
import type { GalleryItem } from "@/server/gallery/items";
import { createBus, toGuestMessage, toHostMessage, toSlideshowMessage, type BusMessage } from "@/server/realtime/bus";

const photo: GalleryItem = {
  type: "upload",
  id: "u1",
  kind: "PHOTO",
  guestName: "Ali",
  createdAt: new Date("2026-12-12T03:00:00Z"),
  moderation: "VISIBLE",
  width: 10,
  height: 10,
  durationSec: null,
  thumbUrl: "/t",
  displayUrl: "/d",
  originalUrl: "/o",
};

describe("realtime bus", () => {
  it("delivers to subscribers of the same event only", () => {
    const bus = createBus();
    const a: BusMessage[] = [];
    const b: BusMessage[] = [];
    bus.subscribe("e1", (m) => a.push(m));
    bus.subscribe("e2", (m) => b.push(m));
    bus.publish("e1", { type: "item", item: photo });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createBus();
    const got: BusMessage[] = [];
    const unsubscribe = bus.subscribe("e1", (m) => got.push(m));
    unsubscribe();
    bus.publish("e1", { type: "item", item: photo });
    expect(got).toHaveLength(0);
  });

  it("keeps delivering when one subscriber throws", () => {
    const bus = createBus();
    const got: BusMessage[] = [];
    bus.subscribe("e1", () => {
      throw new Error("closed stream");
    });
    bus.subscribe("e1", (m) => got.push(m));
    bus.publish("e1", { type: "item", item: photo });
    expect(got).toHaveLength(1);
  });
});

describe("toGuestMessage", () => {
  it("drops the original link from visible items", () => {
    const message = toGuestMessage({ type: "item", item: photo });
    expect(message).toEqual({ type: "item", item: { ...photo, originalUrl: null } });
  });

  it("turns a hidden or pending item into a removal", () => {
    expect(toGuestMessage({ type: "item", item: { ...photo, moderation: "HIDDEN" } })).toEqual({ type: "remove", id: "u1" });
    expect(toGuestMessage({ type: "item", item: { ...photo, moderation: "PENDING_APPROVAL" } })).toEqual({ type: "remove", id: "u1" });
  });

  it("passes removals through", () => {
    expect(toGuestMessage({ type: "remove", id: "u1" })).toEqual({ type: "remove", id: "u1" });
  });
});

describe("closed message", () => {
  it("passes closed to guests", () => {
    expect(toGuestMessage({ type: "closed" })).toEqual({ type: "closed" });
  });

  it("drops closed for hosts", () => {
    expect(toHostMessage({ type: "closed" })).toBeNull();
    expect(toHostMessage({ type: "remove", id: "u1" })).toEqual({ type: "remove", id: "u1" });
    expect(toHostMessage({ type: "item", item: photo })).toEqual({ type: "item", item: photo });
  });
});

describe("toSlideshowMessage", () => {
  it("drops closed", () => {
    expect(toSlideshowMessage({ type: "closed" })).toBeNull();
  });

  it("strips the original link", () => {
    expect(toSlideshowMessage({ type: "item", item: photo })).toEqual({ type: "item", item: { ...photo, originalUrl: null } });
  });

  it("turns hidden or pending items into removals", () => {
    expect(toSlideshowMessage({ type: "item", item: { ...photo, moderation: "HIDDEN" } })).toEqual({ type: "remove", id: "u1" });
    expect(toSlideshowMessage({ type: "item", item: { ...photo, moderation: "PENDING_APPROVAL" } })).toEqual({ type: "remove", id: "u1" });
  });

  it("passes removals through", () => {
    expect(toSlideshowMessage({ type: "remove", id: "u1" })).toEqual({ type: "remove", id: "u1" });
  });
});
