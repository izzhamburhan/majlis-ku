/* eslint-disable @next/next/no-img-element -- media uses signed, short-lived URLs that next/image must not cache */
import type { ReactNode } from "react";
import { formatDuration } from "@/lib/format";
import type { GalleryItem } from "@/server/gallery/items";

export type GalleryLabels = { by: string; pending: string; hidden: string; original: string; voiceNote: string; empty: string };

/** One grid for photos, videos, voice notes and wishes. `actions` adds host controls (phase 4). */
export function GalleryGrid({
  items,
  labels,
  showStatus,
  actions,
}: {
  items: GalleryItem[];
  labels: GalleryLabels;
  showStatus: boolean;
  actions?: (item: GalleryItem) => ReactNode;
}) {
  if (items.length === 0) return <p className="rounded-2xl bg-surface p-8 text-center text-muted">{labels.empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="gallery-grid">
      {items.map((item) => (
        <li key={`${item.type}-${item.id}`} className="relative overflow-hidden rounded-3xl bg-surface shadow-sm">
          {item.type === "wish" ? (
            <div className="flex aspect-square flex-col justify-between p-4">
              <p className="line-clamp-6 font-serif text-lg leading-snug">“{item.message}”</p>
              <p className="text-sm text-muted">{labels.by.replace("{name}", item.guestName)}</p>
            </div>
          ) : (
            <UploadTile item={item} labels={labels} />
          )}
          {showStatus && item.moderation !== "VISIBLE" ? (
            <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white" /* stori-keep: over a photo */>
              {item.moderation === "HIDDEN" ? labels.hidden : labels.pending}
            </span>
          ) : null}
          {actions ? <div className="border-t border-ink/10 p-2">{actions(item)}</div> : null}
        </li>
      ))}
    </ul>
  );
}

function UploadTile({ item, labels }: { item: Extract<GalleryItem, { type: "upload" }>; labels: GalleryLabels }) {
  const caption = (
    <p className="truncate px-3 py-2 text-sm text-muted">
      {labels.by.replace("{name}", item.guestName)}
      {item.originalUrl ? (
        <>
          {" · "}
          <a href={item.originalUrl} className="underline">
            {labels.original}
          </a>
        </>
      ) : null}
    </p>
  );
  if (item.kind === "VOICE") {
    return (
      <div className="flex aspect-square flex-col justify-between">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-3">
          <span aria-hidden className="text-4xl">
            🎙️
          </span>
          <span className="text-sm text-muted">
            {labels.voiceNote}
            {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ""}
          </span>
          {item.displayUrl ? <audio controls preload="none" src={item.displayUrl} className="w-full" /> : null}
        </div>
        {caption}
      </div>
    );
  }
  if (item.kind === "VIDEO") {
    return (
      <div>
        <video
          controls
          preload="none"
          playsInline
          poster={item.thumbUrl ?? undefined}
          src={item.displayUrl ?? undefined}
          className="aspect-square w-full bg-ink object-cover"
        />
        {caption}
      </div>
    );
  }
  return (
    <div>
      <a href={item.displayUrl ?? "#"} target="_blank" rel="noreferrer">
        <img src={item.thumbUrl ?? ""} alt={labels.by.replace("{name}", item.guestName)} loading="lazy" className="aspect-square w-full object-cover" />
      </a>
      {caption}
    </div>
  );
}