import type { GalleryItem } from "@/server/gallery/items";

// In-process publish/subscribe for live galleries and the slideshow. One server process locally;
// with several instances later, swap this for Postgres LISTEN/NOTIFY or Redis behind the same API.

// "closed" tells guest streams to end because the event was suspended; hosts and the slideshow never get it.
export type BusMessage = { type: "item"; item: GalleryItem } | { type: "remove"; id: string } | { type: "closed" };
type Listener = (message: BusMessage) => void;

export function createBus() {
  const listeners = new Map<string, Set<Listener>>();

  function subscribe(eventId: string, listener: Listener): () => void {
    const set = listeners.get(eventId) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(eventId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(eventId);
    };
  }

  function publish(eventId: string, message: BusMessage): void {
    for (const listener of listeners.get(eventId) ?? []) {
      try {
        listener(message);
      } catch {
        // A closed stream must not stop delivery to the others.
      }
    }
  }

  return { subscribe, publish };
}

const globalForBus = globalThis as unknown as { realtimeBus?: ReturnType<typeof createBus> };

export const bus = (globalForBus.realtimeBus ??= createBus());

/** What a guest stream may receive: visible items without the original link; anything else is a removal. */
export function toGuestMessage(message: BusMessage): BusMessage {
  if (message.type !== "item") return message;
  if (message.item.moderation !== "VISIBLE") return { type: "remove", id: message.item.id };
  return message.item.type === "upload" ? { type: "item", item: { ...message.item, originalUrl: null } } : message;
}

/** The host stream keeps running when an event is suspended, so it never gets "closed" (the slideshow uses `toSlideshowMessage`). */
export function toHostMessage(message: BusMessage): BusMessage | null {
  return message.type === "closed" ? null : message;
}

/** The venue slideshow is public-facing: guest filtering (no originals, hidden items removed) minus "closed". */
export function toSlideshowMessage(message: BusMessage): BusMessage | null {
  return message.type === "closed" ? null : toGuestMessage(message);
}
