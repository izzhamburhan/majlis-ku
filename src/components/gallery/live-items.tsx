"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GalleryItem } from "@/server/gallery/items";
import { GalleryGrid, type GalleryLabels } from "./gallery-grid";

type Filter = "all" | "photo" | "video" | "voice" | "wish";

function matches(item: GalleryItem, filter: Filter, q: string): boolean {
  if (q && !item.guestName.toLowerCase().includes(q.toLowerCase())) return false;
  if (filter === "all") return true;
  if (filter === "wish") return item.type === "wish";
  return item.type === "upload" && item.kind.toLowerCase() === filter;
}

/**
 * New items arriving over Server-Sent Events, shown above the server-rendered page.
 * A removal (hidden, deleted) refreshes the page so the server list updates too.
 */
export function LiveItems({
  streamUrl,
  filter,
  q,
  labels,
  liveLabel,
  newLabel,
  showStatus,
}: {
  streamUrl: string;
  filter: Filter;
  q: string;
  labels: GalleryLabels;
  liveLabel: string;
  /** The word after the count, e.g. "baharu" in "3 baharu". */
  newLabel: string;
  showStatus: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(streamUrl);
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("error", () => setConnected(false));
    source.addEventListener("item", (event) => {
      const { item } = JSON.parse((event as MessageEvent<string>).data) as { item: GalleryItem };
      if (!matches(item, filter, q)) return;
      setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
    });
    source.addEventListener("remove", (event) => {
      const { id } = JSON.parse((event as MessageEvent<string>).data) as { id: string };
      setItems((current) => current.filter((existing) => existing.id !== id));
      router.refresh();
    });
    return () => source.close();
  }, [streamUrl, filter, q, router]);

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm text-muted" data-testid="live-status" data-connected={connected}>
        <span aria-hidden className={`inline-block size-2 rounded-full ${connected ? "bg-green-500" : "bg-ink/30"}`} />
        {liveLabel}
        {items.length > 0 ? <span className="font-medium text-ink">· {items.length} {newLabel}</span> : null}
      </p>
      {items.length > 0 ? (
        <div data-testid="live-items">
          <GalleryGrid items={items} labels={labels} showStatus={showStatus} />
        </div>
      ) : null}
    </div>
  );
}