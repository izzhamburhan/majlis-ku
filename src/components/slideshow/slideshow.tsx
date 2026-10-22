"use client";
/* eslint-disable @next/next/no-img-element -- signed, short-lived media URLs */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { GalleryItem } from "@/server/gallery/items";
import { optionsQuery, type SlideshowOptions } from "./options";
import { CollageLayout, FilmLayout, MosaicLayout, Spotlight } from "./layouts";
import { Framed, mediaFit, Photo } from "./photo";
import { Rail } from "./rail";
import { SettingsDialog, type SettingsLabels } from "./settings-dialog";
import { initShow, mainItems, railWishes, showReducer } from "./state";

const SLIDE_MS = 7000;
const MAX_VIDEO_MS = 20_000;
const REFRESH_MS = 20 * 60 * 1000;
const SPOTLIGHT_MS = 5000;
const FILM_STEP_MS = 4000; // film step with reduced motion
const TICK_MS = { collage: 4000, mosaic: 3000 } as const;

type Labels = SettingsLabels & { scan: string; empty: string; fullscreen: string; by: string; wishes: string; railEmpty: string; emptyMedia: string; qrAlt: string };

export function Slideshow({
  eventId,
  hostNames,
  themeColor,
  initialItems,
  options: initialOptions,
  qrSrc,
  shareUrl,
  labels,
}: {
  eventId: string;
  hostNames: string;
  themeColor: string;
  initialItems: GalleryItem[];
  options: SlideshowOptions;
  qrSrc: string;
  shareUrl: string;
  labels: Labels;
}) {
  const [state, dispatch] = useReducer(showReducer, initialItems, (items) => initShow(items, initialOptions));
  const [options, setOptions] = useState(initialOptions);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const source = useRef<EventSource | null>(null);

  const [reduced, setReduced] = useState(false);

  const main = useMemo(() => mainItems(state), [state.items, state.rail]); // eslint-disable-line react-hooks/exhaustive-deps -- mainItems reads only these two fields
  const single = state.layout === "single";
  const item = single && !state.closed ? (main.find((i) => i.id === state.single) ?? main[0]) : undefined;
  const spotlit = state.spotlight === null ? undefined : state.items.find((i) => i.id === state.spotlight);
  const wishes = useMemo(() => railWishes(state), [state.items, state.rail]); // eslint-disable-line react-hooks/exhaustive-deps -- same: stable array for the rail effects
  // `ticks` re-arms the single-layout timer after every step: with one item a tick leaves `item` as it was, so `item` alone would never re-run the effect.
  const [ticks, setTicks] = useState(0);
  const advance = useCallback(() => {
    dispatch({ type: "tick" });
    setTicks((t) => t + 1);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  // Collage and mosaic tick on an interval; film on its animation's end, or on a timer with reduced motion.
  useEffect(() => {
    if (state.closed || (state.layout !== "collage" && state.layout !== "mosaic")) return;
    const timer = setInterval(advance, TICK_MS[state.layout]);
    return () => clearInterval(timer);
  }, [state.layout, state.closed, advance]);
  useEffect(() => {
    if (state.closed || state.layout !== "film" || !reduced) return;
    const timer = setTimeout(advance, FILM_STEP_MS);
    return () => clearTimeout(timer);
  }, [state.layout, state.closed, state.film, reduced, advance]);

  // The spotlight lasts 5 s, then the item joins the layout and the next waiting one comes up.
  useEffect(() => {
    if (state.spotlight === null) return;
    const timer = setTimeout(() => dispatch({ type: "spotlightDone" }), SPOTLIGHT_MS);
    return () => clearTimeout(timer);
  }, [state.spotlight]);

  // Photos and wishes advance on a timer; videos when they end (or after 20 s).
  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(advance, item.type === "upload" && item.kind === "VIDEO" ? MAX_VIDEO_MS : SLIDE_MS);
    return () => clearTimeout(timer);
  }, [item, ticks, advance]);

  // Live arrivals and removals. The slideshow stream already leaves out what guests may not see.
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const stream = new EventSource(`/api/events/${eventId}/stream?view=slideshow`);
    source.current = stream;
    stream.addEventListener("item", (event) => {
      const { item: incoming } = JSON.parse((event as MessageEvent<string>).data) as { item: GalleryItem };
      dispatch({ type: "arrive", item: incoming });
    });
    stream.addEventListener("remove", (event) => {
      const { id } = JSON.parse((event as MessageEvent<string>).data) as { id: string };
      dispatch({ type: "remove", id });
    });
    return () => stream.close();
  }, [eventId]);

  // Signed URLs expire after an hour: fetch fresh ones every 20 minutes. Depends on the event only, so slide changes never restart it.
  useEffect(() => {
    const timer = setInterval(async () => {
      const response = await fetch(`/api/events/${eventId}/slideshow`, { cache: "no-store" }).catch(() => null);
      if (!response) return;
      if ([401, 403, 404].includes(response.status)) {
        source.current?.close(); // access ended: show the empty state and stop listening
        clearInterval(timer);
        dispatch({ type: "close" });
        return;
      }
      if (!response.ok) return;
      try {
        const { items: fresh } = (await response.json()) as { items: GalleryItem[] };
        dispatch({ type: "refresh", items: fresh });
      } catch {
        // a broken body: keep the current items and try again at the next refresh
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [eventId]);

  // Preload the next photo so the change is instant.
  useEffect(() => {
    if (!single) return;
    const next = main[(main.findIndex((i) => i.id === item?.id) + 1) % Math.max(main.length, 1)];
    if (next?.type === "upload" && next.kind === "PHOTO" && next.displayUrl) {
      const img = new Image();
      img.src = next.displayUrl;
    }
  }, [main, item, single]);

  function change(next: SlideshowOptions) {
    history.replaceState(null, "", location.pathname + optionsQuery(next));
    setOptions(next);
    if (next.layout !== options.layout || next.rail !== options.rail) dispatch({ type: "setOptions", layout: next.layout, rail: next.rail });
  }

  function closeSettings() {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  }

  // A print frame already carries the name in its margin.
  const print = options.frame === "print";
  const showName = options.names && !print && item?.type === "upload" ? labels.by.replace("{name}", item.guestName) : null;
  const buttonClass = "rounded-full bg-white/10 px-4 py-2 text-sm opacity-60 hover:opacity-100";

  return (
    <div
      className={`fixed inset-0 overflow-hidden bg-black text-white ${state.rail ? "flex" : ""}`}
      style={{ cursor: "none" }}
      data-testid="slideshow"
      data-layout={state.layout}
    >
      <div data-testid="slideshow-main" className={state.rail ? "relative min-w-0 flex-1" : "absolute inset-0"}>
        <div
          className={`absolute inset-0 p-6 pt-16 [container-type:size] ${state.rail ? "pb-20" : "pb-28"} ${single || main.length === 0 ? "flex items-center justify-center" : ""} ${
            spotlit ? "opacity-40" : ""
          } transition-opacity duration-500`}
        >
          {main.length === 0 || state.closed ? (
            <p className="text-3xl opacity-70">{state.rail && wishes.length > 0 ? labels.emptyMedia : labels.empty}</p>
          ) : state.layout === "collage" ? (
            <CollageLayout ids={state.collage} reduced={reduced} items={state.items} print={print} names={options.names} by={labels.by} />
          ) : state.layout === "mosaic" ? (
            <MosaicLayout tiles={state.mosaic.tiles} items={state.items} print={print} names={options.names} by={labels.by} />
          ) : state.layout === "film" ? (
            <FilmLayout ids={state.film} onStep={advance} items={state.items} print={print} names={options.names} by={labels.by} />
          ) : !item ? null : item.type === "wish" ? (
            <figure key={item.id} className="max-w-4xl text-center">
              <blockquote className="line-clamp-10 font-serif text-4xl leading-snug md:text-6xl">“{item.message}”</blockquote>
              {options.names ? <figcaption className="mt-8 text-2xl opacity-80">{labels.by.replace("{name}", item.guestName)}</figcaption> : null}
            </figure>
          ) : item.kind === "VIDEO" ? (
            <Framed print={print} name={options.names ? item.guestName : null}>
              <video
                key={item.id}
                src={item.displayUrl ?? undefined}
                poster={item.thumbUrl ?? undefined}
                autoPlay
                muted
                playsInline
                onEnded={advance}
                className={`${mediaFit(print)} object-contain`}
              />
            </Framed>
          ) : (
            <Photo key={item.id} src={item.displayUrl ?? item.thumbUrl ?? ""} print={print} name={options.names ? item.guestName : null} />
          )}
        </div>
        {spotlit ? <Spotlight item={spotlit} print={print} names={options.names} by={labels.by} /> : null}
        {state.rail && showName ? <p className="absolute bottom-6 left-6 text-xl opacity-80">{showName}</p> : null}
      </div>

      {state.rail ? (
        <Rail hostNames={hostNames} qrSrc={qrSrc} shareUrl={shareUrl} wishes={wishes} names={options.names} reducedMotion={reduced} labels={labels} />
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/80 to-transparent p-6">
          <div>
            <p className="font-serif text-3xl" style={{ color: themeColor === "#000000" ? "#fff" : undefined }}>
              {hostNames}
            </p>
            {showName ? <p className="mt-1 text-xl opacity-80">{showName}</p> : null}
          </div>
          <div className="flex items-end gap-3 text-right">
            <div>
              <p className="max-w-56 text-lg leading-tight">{labels.scan}</p>
              <p className="mt-1 text-sm opacity-70">{shareUrl.replace(/^https?:\/\//, "")}</p>
            </div>
            <img src={qrSrc} alt={labels.qrAlt} className="size-28 rounded-lg bg-white p-1" />
          </div>
        </div>
      )}

      <div className={`absolute top-4 z-10 flex gap-2 ${state.rail ? "right-[calc(28%+1rem)]" : "right-4"}`}>
        <button ref={settingsButton} type="button" onClick={() => setSettingsOpen(true)} className={buttonClass} style={{ cursor: "pointer" }}>
          {labels.settings}
        </button>
        <button
          type="button"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
          className={buttonClass}
          style={{ cursor: "pointer" }}
        >
          {labels.fullscreen}
        </button>
      </div>

      {settingsOpen ? <SettingsDialog options={options} labels={labels} onChange={change} onClose={closeSettings} /> : null}
    </div>
  );
}
