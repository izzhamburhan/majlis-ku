"use client";
/* eslint-disable @next/next/no-img-element -- signed, short-lived media URLs */

import { useState } from "react";
import type { GalleryItem } from "@/server/gallery/items";
import { Framed, mediaFit, Photo } from "./photo";
import { placement } from "./placement";

type Common = { items: GalleryItem[]; print: boolean; names: boolean; by: string };

const byId = (items: GalleryItem[], ids: string[]) =>
  ids.flatMap((id, index) => {
    const item = items.find((i) => i.id === id);
    return item ? [{ item, index }] : [];
  });

/** One cell of a layout: the thumbnail (a video shows its poster only) or a wish card. It fills its parent. */
function Tile({ item, print, names, by }: { item: GalleryItem; print: boolean; names: boolean; by: string }) {
  if (item.type === "wish") {
    return (
      <div className="flex h-full w-full flex-col justify-center overflow-hidden rounded bg-amber-50 p-3 text-neutral-900 shadow-lg">
        <blockquote className="line-clamp-6 font-serif text-sm leading-snug min-[1600px]:text-xl">“{item.message}”</blockquote>
        {names ? <p className="mt-1 truncate text-xs opacity-70 min-[1600px]:text-base">{by.replace("{name}", item.guestName)}</p> : null}
      </div>
    );
  }
  return (
    <Framed print={print} small name={names ? item.guestName : null}>
      <img src={item.thumbUrl ?? ""} alt="" decoding="async" className="h-full w-full object-cover" />
    </Framed>
  );
}

/** Cards scattered at tilts derived from their ids; the newest is on top and drops in. */
export function CollageLayout({ ids, reduced, ...rest }: Common & { ids: string[]; reduced: boolean }) {
  return (
    <div className="relative h-full w-full">
      {byId(rest.items, ids).map(({ item, index }) => {
        const { x, y, rotate } = placement(item.id);
        return (
          <div
            key={item.id}
            data-item-id={item.id}
            className="absolute aspect-[4/3] w-[22%]"
            style={{ left: `${x}%`, top: `${y}%`, transform: `rotate(${reduced ? 0 : rotate}deg)` }}
          >
            <div className={`h-full w-full ${index === ids.length - 1 ? "collage-drop" : ""}`}>
              <Tile item={item} {...rest} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A 4 x 3 grid. A tile fades when its item changes. */
export function MosaicLayout({ tiles, ...rest }: Common & { tiles: string[] }) {
  return (
    <div className="grid h-full w-full grid-cols-4 grid-rows-3 gap-2">
      {byId(rest.items, tiles).map(({ item, index }) => (
        <div key={`${index}-${item.id}`} data-item-id={item.id} className="tile-fade min-h-0 min-w-0 overflow-hidden">
          <Tile item={item} {...rest} />
        </div>
      ))}
    </div>
  );
}

/** A strip of 12 slots, about 6 visible; the track slides one slot left, then `onStep` moves the list on. */
export function FilmLayout({ ids, onStep, ...rest }: Common & { ids: string[]; onStep: () => void }) {
  const [cycle, setCycle] = useState(0); // alternating the animation name restarts it without remounting the images
  const seen = new Map<string, number>();
  return (
    <div className="flex h-full w-full items-center overflow-hidden">
      <div
        data-testid="film-track"
        className={`film-track-${cycle % 2} flex w-[200%] shrink-0`}
        onAnimationEnd={() => {
          setCycle((c) => c + 1);
          onStep();
        }}
      >
        {byId(rest.items, ids).map(({ item }) => {
          const n = seen.get(item.id) ?? 0; // ids repeat in a short strip: key by occurrence so slots keep their element while sliding
          seen.set(item.id, n + 1);
          return (
            <div key={`${item.id}#${n}`} data-item-id={item.id} className="aspect-[3/4] w-1/12 shrink-0 px-2">
              <Tile item={item} {...rest} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A new photo or video, large in the centre: the display image for a photo, the poster for a video. */
export function Spotlight({ item, print, names, by }: { item: GalleryItem } & Omit<Common, "items">) {
  if (item.type !== "upload") return null;
  const name = names ? item.guestName : null;
  return (
    <div data-testid="spotlight" data-item-id={item.id} className="collage-drop pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center p-6 pt-16 pb-24">
      <div className="flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
        {item.kind === "VIDEO" ? (
          <Framed print={print} name={name}>
            <img src={item.thumbUrl ?? ""} alt="" decoding="async" className={`${mediaFit(print)} object-contain`} />
          </Framed>
        ) : (
          <Photo src={item.displayUrl ?? item.thumbUrl ?? ""} print={print} name={name} />
        )}
      </div>
      {name && !print ? <p className="mt-4 text-3xl drop-shadow">{by.replace("{name}", name)}</p> : null}
    </div>
  );
}
