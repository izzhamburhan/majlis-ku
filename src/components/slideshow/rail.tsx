"use client";
/* eslint-disable @next/next/no-img-element -- the QR code is a same-origin SVG */
import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import type { GalleryItem } from "@/server/gallery/items";

const PAGE_MS = 8000;

type RailLabels = {
  scan: string;
  wishes: string;
  railEmpty: string;
  qrAlt: string;
  by: string;
};

/** The side panel: host names, the upload QR code and the newest wishes. */
export function Rail({
  hostNames,
  qrSrc,
  shareUrl,
  wishes,
  names,
  reducedMotion,
  labels,
}: {
  hostNames: string;
  qrSrc: string;
  shareUrl: string;
  wishes: GalleryItem[];
  names: boolean;
  reducedMotion: boolean;
  labels: RailLabels;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [overflow, setOverflow] = useState<number | null>(null); // list height in px when it is taller than the viewport
  const measure = useRef<HTMLUListElement>(null); // an invisible copy of the whole list, to find how many wishes fit
  const [page, setPage] = useState(0);
  const [starts, setStarts] = useState([0]); // index of the first wish of each page, with reduced motion
  const pages = starts.length;

  // Taller than the rail: scroll it slowly and loop (the list is shown twice). Reduced motion pages instead.
  useEffect(() => {
    const check = () => {
      const tall = (list.current?.offsetHeight ?? 0) > (viewport.current?.clientHeight ?? 0);
      setOverflow(tall ? (list.current?.offsetHeight ?? 0) : null);
    };
    check();
    const observer = new ResizeObserver(check);
    if (viewport.current) observer.observe(viewport.current);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, [wishes, names, reducedMotion]);

  // Reduced motion: fill each page with the wishes that fit the list area (at least one), and again whenever the area or the text changes.
  useEffect(() => {
    if (!reducedMotion) return;
    const fit = () => {
      const room = viewport.current?.clientHeight ?? 0;
      const next = [0];
      let top = 0;
      [...(measure.current?.children ?? [])].forEach((li, i) => {
        const { offsetTop, offsetHeight } = li as HTMLElement;
        if (i > next.at(-1)! && offsetTop + offsetHeight - top > room) {
          next.push(i);
          top = offsetTop;
        }
      });
      setStarts((prev) => (prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (viewport.current) observer.observe(viewport.current);
    if (measure.current) observer.observe(measure.current);
    return () => observer.disconnect();
  }, [wishes, names, reducedMotion]);

  useEffect(() => {
    if (!reducedMotion || pages < 2) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, pages]);

  const at = page % pages;
  const shown = reducedMotion ? wishes.slice(starts[at], starts[at + 1]) : wishes;
  const scrolling = overflow !== null && !reducedMotion;
  const entries = (list: GalleryItem[], ref?: Ref<HTMLUListElement>, hidden?: boolean, className = "space-y-4 pb-4") => (
    <ul ref={ref} aria-hidden={hidden} className={className}>
      {list.map((wish) =>
        wish.type !== "wish" ? null : (
          <li key={wish.id}>
            <p className="line-clamp-4 font-serif">“{wish.message}”</p>
            {names ? <p className="opacity-70">{labels.by.replace("{name}", wish.guestName)}</p> : null}
          </li>
        ),
      )}
    </ul>
  );

  return (
    <aside data-testid="slideshow-rail" className="flex h-full w-[28%] shrink-0 flex-col gap-3 overflow-hidden bg-neutral-900 p-6 text-2xl">
      <p className="truncate font-serif text-3xl">{hostNames}</p>
      <img src={qrSrc} alt={labels.qrAlt} className="size-60 shrink-0 self-center rounded-lg bg-white p-2" />
      <p className="leading-tight">{labels.scan}</p>
      <p className="break-all opacity-70">{shareUrl.replace(/^https?:\/\//, "")}</p>
      <h2 className="mt-1 border-t border-white/20 pt-3 font-semibold">{labels.wishes}</h2>
      {wishes.length === 0 ? (
        <p className="opacity-70">{labels.railEmpty}</p>
      ) : (
        <div ref={viewport} data-testid="rail-viewport" className="relative min-h-0 flex-1 overflow-hidden">
          <div className={scrolling ? "rail-scroll" : undefined} style={scrolling ? ({ "--rail-seconds": `${Math.max(20, overflow / 30)}s` } as CSSProperties) : undefined}>
            {entries(shown, list)}
            {scrolling ? entries(shown, undefined, true) : null}
          </div>
          {reducedMotion ? entries(wishes, measure, true, "invisible absolute inset-x-0 top-0 space-y-4 pointer-events-none") : null}
        </div>
      )}
    </aside>
  );
}
